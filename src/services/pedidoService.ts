import type { Pedido, StatusPedido } from "../types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { appLogger } from "./appLogger";
import { emitPedidoUpdate } from "./realtimeBus";
import { COMISSAO_APP_POR_ENTREGA } from "./financeService";
import { delivererService } from "./delivererService";
import { schedulePushDispatch } from "./remotePushDispatchService";
import { supabase } from "./supabase";
import {
  readLocalUserDocumentPayload,
  type ClientProfileDocument,
} from "./userStateSchemas";

const PEDIDO_READ_TIMEOUT_MS = 8000;
const PEDIDO_WRITE_TIMEOUT_MS = 15000;
const PEDIDO_LIST_CACHE_MS = 2500;
const PEDIDO_ITEM_CACHE_MS = 1500;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type PedidoRealtimeCallback = (pedidoId?: string) => void;

let pedidosListCache: CacheEntry<Pedido[]> | null = null;
let pedidosListInflight: Promise<Pedido[] | null> | null = null;
const pedidoByIdCache = new Map<string, CacheEntry<Pedido | null>>();
const pedidoByIdInflight = new Map<string, Promise<Pedido | null | undefined>>();
const pedidoRealtimeListeners = new Set<PedidoRealtimeCallback>();
let pedidoRealtimeChannel: RealtimeChannel | null = null;

function gerarId() {
  return crypto.randomUUID();
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  errorCode: string
): Promise<T> {
  let timer: number | null = null;

  return await Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    }),
    new Promise<T>((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error(errorCode));
      }, ms);
    }),
  ]);
}

function agora() {
  return new Date().toISOString();
}

function safeGet(key: string, fallback = "") {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v : fallback;
  } catch {
    return fallback;
  }
}

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function isValidUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function toNullableUuid(value: unknown) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return isValidUuid(normalized) ? normalized : null;
}

function toNullableText(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function generateDeliveryPin(_pedidoId: string, clienteTelefone?: string | null) {
  const digits = onlyDigits(clienteTelefone || "");
  const phoneTail = digits.slice(-2) || "00";
  const randomPart = String(Math.floor(10 + Math.random() * 90));
  return `${randomPart}${phoneTail}`.slice(0, 4);
}

function normalizeHistorico(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      status: String((item as any)?.status || "criado") as StatusPedido,
      data: String((item as any)?.data || agora()),
    }))
    .filter((item) => item.status && item.data);
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizePayloadPedido(data: unknown) {
  if (Array.isArray(data)) {
    return data[0] ? normalizeRemotePedido(data[0]) : null;
  }

  if (data && typeof data === "object") {
    return normalizeRemotePedido(data);
  }

  return null;
}

function readCacheEntry<T>(entry: CacheEntry<T> | null) {
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) return undefined;
  return entry.value;
}

function rememberPedidoCache(pedido: Pedido | null) {
  const id = String(pedido?.id ?? "").trim();
  if (!id) return;

  pedidoByIdCache.set(id, {
    value: pedido,
    expiresAt: Date.now() + PEDIDO_ITEM_CACHE_MS,
  });
}

function rememberPedidoListCache(pedidos: Pedido[]) {
  pedidosListCache = {
    value: pedidos,
    expiresAt: Date.now() + PEDIDO_LIST_CACHE_MS,
  };

  for (const pedido of pedidos) {
    rememberPedidoCache(pedido);
  }
}

function invalidatePedidoCaches(pedidoId?: string) {
  pedidosListCache = null;
  pedidosListInflight = null;

  if (pedidoId) {
    pedidoByIdCache.delete(String(pedidoId).trim());
    pedidoByIdInflight.delete(String(pedidoId).trim());
    return;
  }

  pedidoByIdCache.clear();
  pedidoByIdInflight.clear();
}

function buildPedidoPayload(pedido: Pedido) {
  return {
    id: pedido.id,
    cliente_id: toNullableUuid((pedido as any).clienteId),
    entregador_id: toNullableText((pedido as any).entregadorId),
    status: pedido.status,
    tipo: (pedido as any).tipo ?? "imediato",
    horario_agendado: (pedido as any).horarioAgendado ?? null,
    cliente_nome: (pedido as any).clienteNome ?? null,
    cliente_telefone: (pedido as any).clienteTelefone ?? null,
    endereco_id: toNullableText((pedido as any).enderecoId),
    endereco_snapshot: (pedido as any).enderecoSnapshot ?? null,
    observacao: (pedido as any).observacao ?? null,
    itens: ensureArray((pedido as any).itens),
    subtotal: Number((pedido as any).subtotal || 0),
    taxa_entrega: Number((pedido as any).taxaEntrega || 0),
    desconto_aplicado: Number((pedido as any).descontoAplicado || 0),
    total: Number((pedido as any).total || 0),
    forma_pagamento: (pedido as any).formaPagamento ?? null,
    delivery_pin: (pedido as any).deliveryPin ?? null,
    pin_verified: Boolean((pedido as any).pinVerified),
    pin_verified_at: (pedido as any).pinVerifiedAt ?? null,
    delivery_confirmation_method:
      (pedido as any).deliveryConfirmationMethod ?? "none",
    cancelado_por: (pedido as any).canceladoPor ?? null,
    motivo_cancelamento: (pedido as any).motivoCancelamento ?? null,
    observacao_cancelamento: (pedido as any).observacaoCancelamento ?? null,
    cancelado_em: (pedido as any).canceladoEm ?? null,
    cancelamento_auditavel: Boolean((pedido as any).cancelamentoAuditavel),
    cancelamento_suspeito: Boolean((pedido as any).cancelamentoSuspeito),
    cancelamento_lat: (pedido as any).cancelamentoLat ?? null,
    cancelamento_lng: (pedido as any).cancelamentoLng ?? null,
    comissao_app:
      (pedido as any).comissaoApp != null
        ? Number((pedido as any).comissaoApp)
        : null,
    comissao_gerada: Boolean((pedido as any).comissaoGerada),
    comissao_gerada_em: (pedido as any).comissaoGeradaEm ?? null,
    cupom_id: (pedido as any).cupomId ?? null,
    cupom_codigo: (pedido as any).cupomCodigo ?? null,
    cupom_titulo: (pedido as any).cupomTitulo ?? null,
    cupom_tipo: (pedido as any).cupomTipo ?? null,
    historico: normalizeHistorico((pedido as any).historico),
    created_at: (pedido as any).createdAt ?? agora(),
    updated_at: (pedido as any).updatedAt ?? agora(),
  };
}

function ensureRpcPedido(payload: Pedido | null, message: string) {
  if (!payload) {
    throw new Error(message);
  }

  invalidatePedidoCaches(payload.id);
  rememberPedidoCache(payload);
  emitPedidoUpdate(payload.id);
  return payload;
}

function ensureRpcPedidoWithPushDispatch(
  payload: Pedido | null,
  message: string,
  reason = "pedido_mutation"
) {
  const pedido = ensureRpcPedido(payload, message);

  schedulePushDispatch({
    reason,
    limit: 30,
  });

  return pedido;
}

export function normalizeRemotePedido(row: any): Pedido {
  return {
    id: String(row?.id ?? ""),
    clienteId: String(row?.clienteId ?? row?.cliente_id ?? ""),
    entregadorId: row?.entregadorId ?? row?.entregador_id ?? null,
    status: (row?.status ?? "criado") as StatusPedido,
    historico: normalizeHistorico(row?.historico),
    tipo: row?.tipo ?? "imediato",
    horarioAgendado: row?.horarioAgendado ?? row?.horario_agendado ?? null,
    clienteNome: row?.clienteNome ?? row?.cliente_nome ?? null,
    clienteTelefone: row?.clienteTelefone ?? row?.cliente_telefone ?? null,
    itens: ensureArray(row?.itens),
    subtotal: Number(row?.subtotal ?? 0),
    taxaEntrega: Number(row?.taxaEntrega ?? row?.taxa_entrega ?? 0),
    descontoAplicado: Number(
      row?.descontoAplicado ?? row?.desconto_aplicado ?? 0
    ),
    total: Number(row?.total ?? 0),
    formaPagamento:
      row?.formaPagamento ?? row?.forma_pagamento ?? "dinheiro",
    cupomId: row?.cupomId ?? row?.cupom_id ?? null,
    cupomCodigo: row?.cupomCodigo ?? row?.cupom_codigo ?? null,
    cupomTitulo: row?.cupomTitulo ?? row?.cupom_titulo ?? null,
    cupomTipo: row?.cupomTipo ?? row?.cupom_tipo ?? null,
    enderecoId: row?.enderecoId ?? row?.endereco_id ?? null,
    enderecoSnapshot:
      row?.enderecoSnapshot ?? row?.endereco_snapshot ?? null,
    observacao: row?.observacao ?? null,
    createdAt: row?.createdAt ?? row?.created_at ?? agora(),
    updatedAt: row?.updatedAt ?? row?.updated_at ?? agora(),
    deliveryPin: row?.deliveryPin ?? row?.delivery_pin ?? null,
    pinVerified: Boolean(row?.pinVerified ?? row?.pin_verified),
    pinVerifiedAt: row?.pinVerifiedAt ?? row?.pin_verified_at ?? null,
    deliveryConfirmationMethod:
      row?.deliveryConfirmationMethod ??
      row?.delivery_confirmation_method ??
      "none",
    canceladoPor: row?.canceladoPor ?? row?.cancelado_por ?? null,
    motivoCancelamento:
      row?.motivoCancelamento ?? row?.motivo_cancelamento ?? null,
    observacaoCancelamento:
      row?.observacaoCancelamento ??
      row?.observacao_cancelamento ??
      null,
    canceladoEm: row?.canceladoEm ?? row?.cancelado_em ?? null,
    cancelamentoAuditavel: Boolean(
      row?.cancelamentoAuditavel ?? row?.cancelamento_auditavel
    ),
    cancelamentoSuspeito: Boolean(
      row?.cancelamentoSuspeito ?? row?.cancelamento_suspeito
    ),
    cancelamentoLat:
      row?.cancelamentoLat ?? row?.cancelamento_lat ?? null,
    cancelamentoLng:
      row?.cancelamentoLng ?? row?.cancelamento_lng ?? null,
    comissaoApp:
      row?.comissaoApp != null
        ? Number(row.comissaoApp)
        : row?.comissao_app != null
        ? Number(row.comissao_app)
        : null,
    comissaoGerada: Boolean(row?.comissaoGerada ?? row?.comissao_gerada),
    comissaoGeradaEm:
      row?.comissaoGeradaEm ?? row?.comissao_gerada_em ?? null,
  } as Pedido;
}

async function listarPedidosSupabase(
  force = false
): Promise<Pedido[] | null> {
  const cached = !force ? readCacheEntry(pedidosListCache) : undefined;
  if (cached !== undefined) return cached;

  if (!force && pedidosListInflight) {
    return pedidosListInflight;
  }

  pedidosListInflight = (async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("list_visible_delivery_orders"),
        PEDIDO_READ_TIMEOUT_MS,
        "PEDIDOS_LIST_TIMEOUT"
      );

      if (error) {
        appLogger.error("pedido_service", "list_visible_orders_failed", error, {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return null;
      }

      const normalized = Array.isArray(data) ? data.map(normalizeRemotePedido) : [];
      rememberPedidoListCache(normalized);
      return normalized;
    } catch (error) {
      appLogger.error("pedido_service", "list_visible_orders_exception", error);
      return null;
    } finally {
      pedidosListInflight = null;
    }
  })();

  return pedidosListInflight;
}

async function buscarPedidoSupabase(
  pedidoId: string,
  force = false
): Promise<Pedido | null | undefined> {
  const normalizedId = String(pedidoId || "").trim();
  if (!normalizedId) return null;

  const cached = !force ? readCacheEntry(pedidoByIdCache.get(normalizedId) ?? null) : undefined;
  if (cached !== undefined) return cached;

  const listCached = !force ? readCacheEntry(pedidosListCache) : undefined;
  if (listCached !== undefined) {
    const fromList = listCached.find((pedido) => String(pedido.id) === normalizedId) ?? null;
    if (fromList) {
      rememberPedidoCache(fromList);
    } else {
      pedidoByIdCache.set(normalizedId, {
        value: null,
        expiresAt: Date.now() + PEDIDO_ITEM_CACHE_MS,
      });
    }
    return fromList;
  }

  if (!force) {
    const inflight = pedidoByIdInflight.get(normalizedId);
    if (inflight) return inflight;
  }

  const request = (async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("get_visible_delivery_order", {
          p_pedido_id: normalizedId,
        }),
        PEDIDO_READ_TIMEOUT_MS,
        "PEDIDO_FETCH_TIMEOUT"
      );

      if (error) {
        appLogger.error("pedido_service", "get_visible_order_failed", error, {
          pedidoId: normalizedId,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return undefined;
      }

      const normalized = normalizePayloadPedido(data);
      if (normalized === null) {
        pedidoByIdCache.set(normalizedId, {
          value: null,
          expiresAt: Date.now() + PEDIDO_ITEM_CACHE_MS,
        });
      } else {
        rememberPedidoCache(normalized);
      }
      return normalized;
    } catch (error) {
      appLogger.error("pedido_service", "get_visible_order_exception", error, {
        pedidoId: normalizedId,
      });
      return undefined;
    } finally {
      pedidoByIdInflight.delete(normalizedId);
    }
  })();

  pedidoByIdInflight.set(normalizedId, request);
  return request;
}

function notifyPedidoRealtime(changedId?: string) {
  invalidatePedidoCaches(changedId);

  for (const listener of pedidoRealtimeListeners) {
    try {
      listener(changedId);
    } catch (error) {
      appLogger.error("pedido_service", "realtime_listener_failed", error, {
        pedidoId: changedId ?? null,
      });
    }
  }

  emitPedidoUpdate(changedId);
}

function ensurePedidosRealtimeChannel() {
  if (pedidoRealtimeChannel) return;

  try {
    pedidoRealtimeChannel = supabase
      .channel("pedidos-operacao-shared")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pedidos",
        },
        (payload) => {
          const changedId = String(
            (payload.new as any)?.id ?? (payload.old as any)?.id ?? ""
          ).trim();

          notifyPedidoRealtime(changedId || undefined);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          notifyPedidoRealtime();
        }
      });
  } catch (error) {
    appLogger.error("pedido_service", "subscribe_realtime_failed", error);
  }
}

function subscribePedidosRealtime(callback: PedidoRealtimeCallback) {
  pedidoRealtimeListeners.add(callback);
  ensurePedidosRealtimeChannel();
  window.setTimeout(() => callback(), 0);

  return () => {
    pedidoRealtimeListeners.delete(callback);

    if (!pedidoRealtimeListeners.size && pedidoRealtimeChannel) {
      void supabase.removeChannel(pedidoRealtimeChannel);
      pedidoRealtimeChannel = null;
    }
  };
}

export const pedidoService = {
  criarPedido(
    dados: Omit<
      Pedido,
      | "id"
      | "createdAt"
      | "updatedAt"
      | "historico"
      | "status"
      | "deliveryPin"
      | "pinVerified"
      | "pinVerifiedAt"
      | "deliveryConfirmationMethod"
      | "canceladoPor"
      | "motivoCancelamento"
      | "observacaoCancelamento"
      | "canceladoEm"
      | "cancelamentoAuditavel"
      | "cancelamentoSuspeito"
      | "cancelamentoLat"
      | "cancelamentoLng"
      | "comissaoApp"
      | "comissaoGerada"
      | "comissaoGeradaEm"
    >
  ): Pedido {
    const clientProfile = readLocalUserDocumentPayload(
      "client_profile"
    ) as ClientProfileDocument;
    const clienteNome =
      (dados as any).clienteNome ||
      clientProfile.nome ||
      safeGet("cg_cliente_nome", "Cliente");
    const clienteTelefone =
      (dados as any).clienteTelefone ||
      onlyDigits(clientProfile.telefone) ||
      safeGet("cg_cliente_telefone", "");
    const createdAt = agora();
    const id = gerarId();

    return {
      ...dados,
      clienteNome,
      clienteTelefone,
      id,
      status: "criado",
      historico: [{ status: "criado", data: createdAt }],
      createdAt,
      updatedAt: createdAt,
      deliveryPin: generateDeliveryPin(id, clienteTelefone),
      pinVerified: false,
      pinVerifiedAt: null,
      deliveryConfirmationMethod: "none",
      canceladoPor: null,
      motivoCancelamento: null,
      observacaoCancelamento: null,
      canceladoEm: null,
      cancelamentoAuditavel: false,
      cancelamentoSuspeito: false,
      cancelamentoLat: null,
      cancelamentoLng: null,
      comissaoApp: COMISSAO_APP_POR_ENTREGA,
      comissaoGerada: false,
      comissaoGeradaEm: null,
    } as Pedido;
  },

  atualizarStatus(pedido: Pedido, novoStatus: StatusPedido): Pedido {
    const historicoBase = Array.isArray(pedido.historico)
      ? pedido.historico
      : [];
    const ultimoStatus = historicoBase[historicoBase.length - 1]?.status;
    const updatedAt = agora();

    return {
      ...pedido,
      status: novoStatus,
      historico:
        ultimoStatus === novoStatus
          ? historicoBase
          : [...historicoBase, { status: novoStatus, data: updatedAt }],
      updatedAt,
    };
  },

  syncPedido(_pedido: Pedido) {
    appLogger.warn(
      "pedido_service",
      "sync_pedido_disabled",
      "pedidoService.syncPedido foi desativado. Use RPCs seguras."
    );
  },

  async salvarPedidoRemoto(pedido: Pedido): Promise<Pedido | null> {
    try {
      const payload = {
        ...buildPedidoPayload(pedido),
        status: null,
        historico: null,
        created_at: null,
        updated_at: null,
      };
      const { data, error } = await withTimeout(
        supabase.rpc("create_delivery_order", {
          p_payload: payload,
        }),
        PEDIDO_WRITE_TIMEOUT_MS,
        "CREATE_DELIVERY_ORDER_TIMEOUT"
      );

      if (error) {
        error.message = JSON.stringify({
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        if (error.message) {
          throw new Error(error.message);
        }
        appLogger.error("pedido_service", "create_delivery_order_failed", error, {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        throw new Error("Não foi possível criar o pedido.");
      }

      return ensureRpcPedidoWithPushDispatch(
        normalizePayloadPedido(data),
        "Não foi possível criar o pedido."
      );
    } catch (error) {
      appLogger.error("pedido_service", "create_delivery_order_exception", error);
      throw error;
    }
  },

  async atualizarStatusRemoto(
    pedidoId: string,
    novoStatus: StatusPedido
  ): Promise<Pedido | null> {
    const id = String(pedidoId || "").trim();
    if (!id) return null;

    const { data, error } = await withTimeout(
      supabase.rpc("update_delivery_order_status", {
        p_pedido_id: id,
        p_status: novoStatus,
      }),
      PEDIDO_WRITE_TIMEOUT_MS,
      "UPDATE_DELIVERY_ORDER_STATUS_TIMEOUT"
    );

    if (error) {
      appLogger.error("pedido_service", "update_delivery_order_status_failed", error, {
        pedidoId: id,
        nextStatus: novoStatus,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error("Não foi possível atualizar o status do pedido.");
    }

    return ensureRpcPedidoWithPushDispatch(
      normalizePayloadPedido(data),
      "Não foi possível atualizar o status do pedido."
    );
  },

  async atribuirEntregadorRemoto(
    pedidoId: string,
    entregadorId: string
  ): Promise<Pedido | null> {
    const id = String(pedidoId || "").trim();
    const entregador = String(entregadorId || "").trim();

    if (!id || !entregador) return null;

    const delivererOnline = await delivererService.getOnlineStatus(entregador);
    if (delivererOnline === false) {
      throw new Error("Entregador offline nao pode aceitar pedidos.");
    }

    const { data, error } = await withTimeout(
      supabase.rpc("assign_delivery_order", {
        p_pedido_id: id,
        p_entregador_id: entregador,
      }),
      PEDIDO_WRITE_TIMEOUT_MS,
      "ASSIGN_DELIVERY_ORDER_TIMEOUT"
    );

    if (error) {
      appLogger.error("pedido_service", "assign_delivery_order_failed", error, {
        pedidoId: id,
        entregadorId: entregador,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error(
        "Pedido ja foi aceito por outro entregador ou nao esta mais disponivel."
      );
    }

    return ensureRpcPedidoWithPushDispatch(
      normalizePayloadPedido(data),
      "Pedido ja foi aceito por outro entregador ou nao esta mais disponivel."
    );
  },

  async cancelarPedidoRemoto(input: {
    pedidoId: string;
    canceladoPor: string;
    motivoCancelamento: string;
    observacaoCancelamento?: string | null;
    lat?: number | null;
    lng?: number | null;
  }): Promise<Pedido | null> {
    const id = String(input.pedidoId || "").trim();
    if (!id) return null;

    const { data, error } = await withTimeout(
      supabase.rpc("cancel_delivery_order", {
        p_pedido_id: id,
        p_cancelado_por: String(input.canceladoPor || "").trim(),
        p_motivo_cancelamento: String(input.motivoCancelamento || "").trim(),
        p_observacao_cancelamento: input.observacaoCancelamento ?? null,
        p_cancelamento_lat:
          Number.isFinite(Number(input.lat)) ? Number(input.lat) : null,
        p_cancelamento_lng:
          Number.isFinite(Number(input.lng)) ? Number(input.lng) : null,
      }),
      PEDIDO_WRITE_TIMEOUT_MS,
      "CANCEL_DELIVERY_ORDER_TIMEOUT"
    );

    if (error) {
      appLogger.error("pedido_service", "cancel_delivery_order_failed", error, {
        pedidoId: id,
        canceladoPor: input.canceladoPor,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error("Não foi possível cancelar o pedido.");
    }

    return ensureRpcPedidoWithPushDispatch(
      normalizePayloadPedido(data),
      "Não foi possível cancelar o pedido."
    );
  },

  async confirmarEntregaRemota(
    pedidoId: string,
    pin: string
  ): Promise<Pedido | null> {
    const id = String(pedidoId || "").trim();
    const normalizedPin = String(pin || "").replace(/\D/g, "").slice(0, 4);
    if (!id || !normalizedPin) return null;

    const { data, error } = await withTimeout(
      supabase.rpc("confirm_delivery_order", {
        p_pedido_id: id,
        p_pin: normalizedPin,
        p_method: "pin",
      }),
      PEDIDO_WRITE_TIMEOUT_MS,
      "CONFIRM_DELIVERY_ORDER_TIMEOUT"
    );

    if (error) {
      appLogger.error("pedido_service", "confirm_delivery_order_failed", error, {
        pedidoId: id,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error("PIN inválido ou pedido não disponível para confirmação.");
    }

    return ensureRpcPedidoWithPushDispatch(
      normalizePayloadPedido(data),
      "Não foi possível confirmar a entrega."
    );
  },

  async confirmarEntregaManualRemota(
    pedidoId: string
  ): Promise<Pedido | null> {
    const id = String(pedidoId || "").trim();
    if (!id) return null;

    const { data, error } = await withTimeout(
      supabase.rpc("confirm_delivery_order", {
        p_pedido_id: id,
        p_pin: null,
        p_method: "manual",
      }),
      PEDIDO_WRITE_TIMEOUT_MS,
      "CONFIRM_DELIVERY_ORDER_MANUAL_TIMEOUT"
    );

    if (error) {
      appLogger.error("pedido_service", "confirm_delivery_order_manual_failed", error, {
        pedidoId: id,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error("Não foi possível registrar a entrega manual.");
    }

    return ensureRpcPedidoWithPushDispatch(
      normalizePayloadPedido(data),
      "Não foi possível registrar a entrega manual."
    );
  },

  async atualizarCamposRemotos(
    _pedidoId: string,
    _patch: Partial<Pedido>
  ): Promise<Pedido | null> {
    throw new Error("Atualização direta desativada. Use RPC específica.");
  },

  normalizeRemotePedido,

  async listarPedidosRemotos(): Promise<Pedido[]> {
    const remote = await listarPedidosSupabase();
    return remote ?? [];
  },

  async listarPedidosPrimarios(): Promise<Pedido[] | null> {
    return listarPedidosSupabase();
  },

  async buscarPedidoRemotoPorId(pedidoId: string): Promise<Pedido | null> {
    const id = String(pedidoId || "").trim();
    if (!id) return null;

    const remote = await buscarPedidoSupabase(id);
    if (remote === undefined) return null;
    return remote;
  },

  async buscarPedidoPrimarioPorId(
    pedidoId: string
  ): Promise<Pedido | null | undefined> {
    const id = String(pedidoId || "").trim();
    if (!id) return null;
    return buscarPedidoSupabase(id);
  },

  subscribePedidosRealtime,
};
