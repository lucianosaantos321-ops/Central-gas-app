import type { Pedido, StatusPedido } from "../types";
import { emitPedidoUpdate } from "./realtimeBus";
import { COMISSAO_APP_POR_ENTREGA } from "./financeService";
import { supabase } from "./supabase";

function gerarId() {
  return crypto.randomUUID();
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

function generateDeliveryPin(pedidoId: string, clienteTelefone?: string | null) {
  const digits = onlyDigits(clienteTelefone || "");
  const phoneTail = digits.slice(-2) || "00";
  const randomPart = String(Math.floor(1000 + Math.random() * 9000));
  const pedidoTail =
    pedidoId.replace(/\D/g, "").slice(-2) ||
    String(pedidoId.length).padStart(2, "0");

  return `${randomPart}${phoneTail}${pedidoTail}`.slice(0, 6);
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

function buildPedidoRow(pedido: Pedido) {
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

export function normalizeRemotePedido(row: any): Pedido {
  return {
    id: String(row?.id ?? ""),
    clienteId: String(
      row?.clienteId ?? row?.cliente_id ?? "cliente_local"
    ),
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

async function syncPedidoToSupabase(pedido: Pedido) {
  try {
    const row = buildPedidoRow(pedido);

    const { error } = await supabase.from("pedidos").upsert([row], {
      onConflict: "id",
    });

    if (error) {
      console.error("Supabase syncPedidoToSupabase error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }
  } catch (error) {
    console.error("Supabase syncPedidoToSupabase exception:", error);
  }
}

async function listarPedidosSupabase(): Promise<Pedido[] | null> {
  try {
    const { data, error } = await supabase
      .from("pedidos")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Supabase listarPedidosRemotos error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return null;
    }

    return Array.isArray(data) ? data.map(normalizeRemotePedido) : [];
  } catch (error) {
    console.error("Supabase listarPedidosRemotos exception:", error);
    return null;
  }
}

async function buscarPedidoSupabase(
  pedidoId: string
): Promise<Pedido | null | undefined> {
  try {
    const { data, error } = await supabase
      .from("pedidos")
      .select("*")
      .eq("id", pedidoId)
      .maybeSingle();

    if (error) {
      console.error("Supabase buscarPedidoRemotoPorId error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return undefined;
    }

    return data ? normalizeRemotePedido(data) : null;
  } catch (error) {
    console.error("Supabase buscarPedidoRemotoPorId exception:", error);
    return undefined;
  }
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
    const clienteNome =
      (dados as any).clienteNome || safeGet("cg_cliente_nome", "Cliente");
    const clienteTelefone =
      (dados as any).clienteTelefone || safeGet("cg_cliente_telefone", "");
    const createdAt = agora();
    const id = gerarId();

    const novo: Pedido = {
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

    void syncPedidoToSupabase(novo);
    emitPedidoUpdate();
    return novo;
  },

  atualizarStatus(pedido: Pedido, novoStatus: StatusPedido): Pedido {
    const historicoBase = Array.isArray(pedido.historico)
      ? pedido.historico
      : [];
    const ultimoStatus = historicoBase[historicoBase.length - 1]?.status;
    const updatedAt = agora();

    const updated: Pedido = {
      ...pedido,
      status: novoStatus,
      historico:
        ultimoStatus === novoStatus
          ? historicoBase
          : [...historicoBase, { status: novoStatus, data: updatedAt }],
      updatedAt,
    };

    void syncPedidoToSupabase(updated);
    emitPedidoUpdate();
    return updated;
  },

  syncPedido(pedido: Pedido) {
    const normalized = normalizeRemotePedido(pedido);
    void syncPedidoToSupabase(normalized);
  },

  normalizeRemotePedido,

  async listarPedidosRemotos(): Promise<Pedido[]> {
    const remote = await listarPedidosSupabase();
    return remote ?? [];
  },

  async buscarPedidoRemotoPorId(pedidoId: string): Promise<Pedido | null> {
    const id = String(pedidoId || "").trim();
    if (!id) return null;

    const remote = await buscarPedidoSupabase(id);
    if (remote === undefined) return null;
    return remote;
  },
};