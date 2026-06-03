import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Pedido,
  ItemPedido,
  EnderecoSnapshot,
  StatusPedido,
  CanceladoPor,
} from "../types";
import { pedidoService } from "../services/pedidoService";
import {
  resetAfterDeliveryForOrder,
  syncGasTankFromDeliveredOrders,
} from "../services/gasTank";
import { emitToast } from "../services/realtimeBus";
import { clientNotificationCenter } from "../services/clientNotificationCenter";
import { iniciarFluxoEntrega } from "../services/entregadorEngine";
import { financeService } from "../services/financeService";
import { adminRulesService } from "../services/adminRulesService";
import { couponAdminService } from "../services/couponAdminService";
import { appLogger } from "../services/appLogger";
import { trackMetric } from "../services/appMetrics";
import {
  readLocalUserDocumentPayload,
  type ClientProfileDocument,
} from "../services/userStateSchemas";

const CLIENT_STATUS_NOTICE_KEY = "cg_client_status_notice_v1";
const CLIENT_SCHEDULED_NOTICE_KEY = "cg_client_scheduled_notice_v1";
const ONE_HOUR_MS = 60 * 60 * 1000;
const scheduledReminderTimers = new Map<string, number>();

interface CancelarPedidoInput {
  pedidoId: string;
  canceladoPor: CanceladoPor;
  motivoCancelamento: string;
  observacaoCancelamento?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface ConfirmarEntregaInput {
  pedidoId: string;
  pin: string;
}

interface CriarPedidoInput {
  clienteId: string;
  tipo: "imediato" | "agendado";
  horarioAgendado?: string | null;
  taxaEntrega: number;
  formaPagamento: "dinheiro" | "pix" | "cartao";
  enderecoId?: string | null;
  enderecoSnapshot?: EnderecoSnapshot | null;
  observacao?: string | null;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  descontoAplicado?: number;
  totalFinal?: number;
  taxaEntregaFinal?: number;
  cupomId?: string | null;
  cupomCodigo?: string | null;
  cupomTitulo?: string | null;
  cupomTipo?: "fixo" | "percentual" | "frete" | null;
}

interface PedidoState {
  carrinho: ItemPedido[];
  pedidos: Pedido[];
  pedidoAtual: Pedido | null;
  loadingRemote: boolean;
  remoteReady: boolean;
  adicionarAoCarrinho: (item: ItemPedido) => void;
  aumentarQuantidadeCarrinho: (produtoId: string) => void;
  diminuirQuantidadeCarrinho: (produtoId: string) => void;
  removerDoCarrinho: (produtoId: string) => void;
  limparCarrinho: () => void;
  criarPedido: (dados: CriarPedidoInput) => Promise<Pedido | null>;
  atribuirEntregador: (pedidoId: string, entregadorId: string) => Promise<Pedido | null>;
  atualizarStatus: (pedidoId: string, status: Pedido["status"]) => Promise<Pedido | null>;
  cancelarPedido: (input: CancelarPedidoInput) => Promise<boolean>;
  confirmarEntregaComPin: (input: ConfirmarEntregaInput) => Promise<boolean>;
  marcarEntregaManual: (pedidoId: string) => Promise<boolean>;
  replacePedidos: (pedidos: Pedido[]) => void;
  upsertPedidoLocal: (pedido: Pedido) => void;
  refetchPedidos: () => Promise<void>;
  refetchPedidoById: (pedidoId: string) => Promise<Pedido | null>;
}

function toastByStatus(status: string) {
  switch (status) {
    case "criado":
      return {
        title: "Pedido criado",
        msg: "Aguarde a confirmação da loja.",
        variant: "info" as const,
      };
    case "confirmado":
      return {
        title: "Pedido confirmado ✅",
        msg: "Seu pedido foi recebido com sucesso.",
        variant: "success" as const,
      };
    case "buscando_entregador":
      return {
        title: "Buscando entregador",
        msg: "Estamos localizando um entregador disponível.",
        variant: "info" as const,
      };
    case "preparando":
      return {
        title: "Preparando",
        msg: "Seu pedido foi aceito e está sendo preparado para sair.",
        variant: "info" as const,
      };
    case "saiu_para_entrega":
      return {
        title: "Saiu para entrega 🚚",
        msg: "O entregador está a caminho.",
        variant: "info" as const,
      };
    case "entregue":
      return {
        title: "Pedido entregue ✅",
        msg: "Obrigado! Seu gás foi atualizado para 100%.",
        variant: "success" as const,
      };
    case "cancelado":
      return {
        title: "Pedido cancelado",
        msg: "Esse caso poderá passar por auditoria.",
        variant: "warning" as const,
      };
    default:
      return {
        title: "Status atualizado",
        msg: `Novo status: ${status}`,
        variant: "info" as const,
      };
  }
}

function safeText(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function isClientRuntime() {
  if (typeof window === "undefined") return false;
  const path = String(window.location.pathname || "").trim().toLowerCase();
  return !path.startsWith("/admin") && !path.startsWith("/entregador");
}

function shouldUseLocalNativeClientNotification() {
  if (typeof window === "undefined") return false;

  const hasNativeAndroid =
    typeof navigator !== "undefined" &&
    /android/i.test(String(navigator.userAgent || ""));

  // Em Android nativo, priorizamos o push remoto do sistema e evitamos duplicar
  // com uma segunda notificação local gerada pelo próprio app.
  return !hasNativeAndroid;
}

function buildPedidoRoute(pedidoId: string) {
  const id = safeText(pedidoId);
  if (!id || typeof window === "undefined") return "";

  const path = String(window.location.pathname || "").trim().toLowerCase();

  if (path.startsWith("/entregador")) {
    return `/entregador/pedido/${id}`;
  }

  if (path.startsWith("/admin")) {
    return "/admin/pedidos";
  }

  return `/orders/${id}`;
}

function clientPedidoNotificationsEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const profile = readLocalUserDocumentPayload(
      "client_profile"
    ) as ClientProfileDocument;
    return Boolean(profile.notifsPedido ?? true);
  } catch {
    return true;
  }
}

function readNotificationMap(key: string) {
  if (typeof window === "undefined") return {} as Record<string, string>;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeNotificationMap(key: string, value: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function normalizePin(value: string) {
  return safeText(value).replace(/\D/g, "").slice(0, 4);
}

function shouldAuditCancellation(
  pedido: Pedido,
  canceladoPor: CanceladoPor
) {
  if (canceladoPor === "entregador") {
    return Boolean(
      pedido.entregadorId ||
        pedido.status === "preparando" ||
        pedido.status === "saiu_para_entrega"
    );
  }

  if (canceladoPor === "cliente") {
    return (
      pedido.status === "preparando" ||
      pedido.status === "saiu_para_entrega"
    );
  }

  return false;
}

function computeCancelamentoSuspeito(args: {
  canceladoPor: CanceladoPor;
  statusAnterior: StatusPedido;
  motivoCancelamento: string;
}) {
  const { canceladoPor, statusAnterior, motivoCancelamento } = args;
  const motivo = safeText(motivoCancelamento).toLowerCase();

  if (canceladoPor === "entregador") return true;

  if (
    canceladoPor === "cliente" &&
    (statusAnterior === "saiu_para_entrega" ||
      statusAnterior === "preparando")
  ) {
    return true;
  }

  return (
    motivo.includes("cliente ausente") ||
    motivo.includes("não estava") ||
    motivo.includes("nao estava") ||
    motivo.includes("comprou de outro") ||
    motivo.includes("comprou do concorrente") ||
    motivo.includes("sem contato") ||
    motivo.includes("não atendeu") ||
    motivo.includes("nao atendeu")
  );
}

function patchPedidoFields(pedido: Pedido, patch: Partial<Pedido>): Pedido {
  return {
    ...pedido,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function getPedidoSortTime(pedido: Pedido) {
  const updated = new Date(pedido.updatedAt ?? pedido.createdAt ?? 0).getTime();
  return Number.isFinite(updated) ? updated : 0;
}

function sortPedidos(pedidos: Pedido[]) {
  return [...pedidos].sort(
    (a, b) => getPedidoSortTime(b) - getPedidoSortTime(a)
  );
}

function upsertPedidoInList(list: Pedido[], pedido: Pedido) {
  const exists = list.some(
    (item) => String(item.id) === String(pedido.id)
  );

  if (!exists) {
    return sortPedidos([pedido, ...list]);
  }

  return sortPedidos(
    list.map((item) =>
      String(item.id) === String(pedido.id) ? pedido : item
    )
  );
}

function dedupePedidos(list: Pedido[]) {
  const map = new Map<string, Pedido>();

  for (const pedido of list) {
    const id = String(pedido?.id ?? "").trim();
    if (!id) continue;

    const existing = map.get(id);
    if (!existing) {
      map.set(id, pedido);
      continue;
    }

    const existingTime = getPedidoSortTime(existing);
    const incomingTime = getPedidoSortTime(pedido);
    map.set(id, incomingTime >= existingTime ? pedido : existing);
  }

  return Array.from(map.values());
}

function clearMissingScheduledReminderTimers(activeIds: Set<string>) {
  for (const [pedidoId, timerId] of scheduledReminderTimers.entries()) {
    if (activeIds.has(pedidoId)) continue;
    window.clearTimeout(timerId);
    scheduledReminderTimers.delete(pedidoId);
  }
}

function scheduleClientNotifications(previousPedidos: Pedido[], nextPedidos: Pedido[]) {
  if (!isClientRuntime() || !clientPedidoNotificationsEnabled()) return;
  if (!shouldUseLocalNativeClientNotification()) return;

  const previousById = new Map(
    previousPedidos.map((pedido) => [String(pedido.id), pedido] as const)
  );
  const nextIds = new Set<string>();
  const statusMap = readNotificationMap(CLIENT_STATUS_NOTICE_KEY);
  const scheduledMap = readNotificationMap(CLIENT_SCHEDULED_NOTICE_KEY);
  let statusMapChanged = false;
  let scheduledMapChanged = false;

  for (const pedido of nextPedidos) {
    const pedidoId = String(pedido.id || "").trim();
    if (!pedidoId) continue;
    nextIds.add(pedidoId);

    const previous = previousById.get(pedidoId);
    if (previous && previous.status !== pedido.status) {
      const stamp = `${pedido.status}@${safeText(pedido.updatedAt || pedido.createdAt)}`;
      if (statusMap[pedidoId] !== stamp) {
        const notification = toastByStatus(String(pedido.status));
        emitToast(notification.title, notification.msg, notification.variant, {
          native: shouldUseLocalNativeClientNotification(),
          route: buildPedidoRoute(pedidoId),
        });
        clientNotificationCenter.add({
          title: notification.title,
          message: notification.msg,
          route: buildPedidoRoute(pedidoId),
          kind: "pedido",
          dedupeKey: `pedido_status_${pedidoId}_${pedido.status}`,
        });
        statusMap[pedidoId] = stamp;
        statusMapChanged = true;
      }
    }

    const isScheduled =
      pedido.tipo === "agendado" &&
      pedido.status !== "entregue" &&
      pedido.status !== "cancelado" &&
      safeText(pedido.horarioAgendado);

    if (!isScheduled) {
      const timerId = scheduledReminderTimers.get(pedidoId);
      if (timerId != null) {
        window.clearTimeout(timerId);
        scheduledReminderTimers.delete(pedidoId);
      }
      if (scheduledMap[pedidoId]) {
        delete scheduledMap[pedidoId];
        scheduledMapChanged = true;
      }
      continue;
    }

    const scheduleTime = Date.parse(String(pedido.horarioAgendado));
    if (!Number.isFinite(scheduleTime)) continue;

    const reminderAt = scheduleTime - ONE_HOUR_MS;
    const delay = reminderAt - Date.now();
    const stamp = String(pedido.horarioAgendado);

    if (delay <= 0) {
      if (scheduledMap[pedidoId] !== stamp) {
        emitToast(
          "Pedido agendado se aproximando",
          `Seu pedido #${pedidoId.slice(0, 6)} esta a menos de 1 hora do horario agendado.`,
          "info",
          {
            native: shouldUseLocalNativeClientNotification(),
            route: buildPedidoRoute(pedidoId),
          }
        );
        clientNotificationCenter.add({
          title: "Pedido agendado se aproximando",
          message: `Seu pedido #${pedidoId.slice(0, 6)} esta a menos de 1 hora do horario agendado.`,
          route: buildPedidoRoute(pedidoId),
          kind: "pedido",
          dedupeKey: `pedido_agendado_${pedidoId}_${stamp}`,
        });
        scheduledMap[pedidoId] = stamp;
        scheduledMapChanged = true;
      }
      const timerId = scheduledReminderTimers.get(pedidoId);
      if (timerId != null) {
        window.clearTimeout(timerId);
        scheduledReminderTimers.delete(pedidoId);
      }
      continue;
    }

    if (!scheduledReminderTimers.has(pedidoId)) {
      const timerId = window.setTimeout(() => {
        if (!isClientRuntime() || !clientPedidoNotificationsEnabled()) return;
        const currentMap = readNotificationMap(CLIENT_SCHEDULED_NOTICE_KEY);
        if (currentMap[pedidoId] === stamp) return;
        emitToast(
          "Pedido agendado se aproximando",
          `Seu pedido #${pedidoId.slice(0, 6)} esta a menos de 1 hora do horario agendado.`,
          "info",
          {
            native: shouldUseLocalNativeClientNotification(),
            route: buildPedidoRoute(pedidoId),
          }
        );
        clientNotificationCenter.add({
          title: "Pedido agendado se aproximando",
          message: `Seu pedido #${pedidoId.slice(0, 6)} esta a menos de 1 hora do horario agendado.`,
          route: buildPedidoRoute(pedidoId),
          kind: "pedido",
          dedupeKey: `pedido_agendado_${pedidoId}_${stamp}`,
        });
        currentMap[pedidoId] = stamp;
        writeNotificationMap(CLIENT_SCHEDULED_NOTICE_KEY, currentMap);
      }, delay);
      scheduledReminderTimers.set(pedidoId, timerId);
    }
  }

  clearMissingScheduledReminderTimers(nextIds);

  if (statusMapChanged) {
    writeNotificationMap(CLIENT_STATUS_NOTICE_KEY, statusMap);
  }

  if (scheduledMapChanged) {
    writeNotificationMap(CLIENT_SCHEDULED_NOTICE_KEY, scheduledMap);
  }
}

function syncFinanceSnapshot(pedidos: Pedido[]) {
  try {
    financeService.syncDeliveredOrders(pedidos);
  } catch (error) {
    appLogger.error("pedido_store", "sync_finance_snapshot_failed", error, {
      pedidosCount: pedidos.length,
    });
  }
}

function applyPedidoMutation(
  set: (
    partial:
      | Partial<PedidoState>
      | ((state: PedidoState) => Partial<PedidoState>)
  ) => void,
  pedido: Pedido
) {
  set((state) => {
    const pedidos = upsertPedidoInList(state.pedidos, pedido);
    scheduleClientNotifications(state.pedidos, pedidos);
    syncFinanceSnapshot(pedidos);
    syncGasTankFromDeliveredOrders(pedidos);

    return {
      pedidos,
      pedidoAtual:
        state.pedidoAtual?.id === pedido.id
          ? pedido
          : state.pedidoAtual ?? pedido,
      remoteReady: true,
    };
  });
}

function pickPedidoAtual(
  pedidos: Pedido[],
  previousPedidoAtual: Pedido | null
): Pedido | null {
  if (!Array.isArray(pedidos) || pedidos.length === 0) return null;

  if (previousPedidoAtual?.id) {
    const found = pedidos.find(
      (item) => String(item.id) === String(previousPedidoAtual.id)
    );
    if (found) return found;
  }

  return pedidos[0] ?? null;
}

export const usePedidoStore = create<PedidoState>()(
  persist(
    (set, get) => ({
      carrinho: [],
      pedidos: [],
      pedidoAtual: null,
      loadingRemote: false,
      remoteReady: false,

      adicionarAoCarrinho: (item) =>
        set((state) => {
          const existente = state.carrinho.find(
            (i) => i.produtoId === item.produtoId
          );

          if (existente) {
            return {
              carrinho: state.carrinho.map((i) =>
                i.produtoId === item.produtoId
                  ? { ...i, quantidade: i.quantidade + item.quantidade }
                  : i
              ),
            };
          }

          return { carrinho: [...state.carrinho, item] };
        }),

      aumentarQuantidadeCarrinho: (produtoId) =>
        set((state) => ({
          carrinho: state.carrinho.map((i) =>
            i.produtoId === produtoId
              ? { ...i, quantidade: Number(i.quantidade || 0) + 1 }
              : i
          ),
        })),

      diminuirQuantidadeCarrinho: (produtoId) =>
        set((state) => ({
          carrinho: state.carrinho
            .map((i) =>
              i.produtoId === produtoId
                ? { ...i, quantidade: Number(i.quantidade || 0) - 1 }
                : i
            )
            .filter((i) => Number(i.quantidade || 0) > 0),
        })),

      removerDoCarrinho: (produtoId) =>
        set((state) => ({
          carrinho: state.carrinho.filter(
            (i) => i.produtoId !== produtoId
          ),
        })),

      limparCarrinho: () => set({ carrinho: [] }),

      criarPedido: async (dados) => {
        const { carrinho } = get();

        if (carrinho.length === 0) {
          emitToast(
            "Carrinho vazio",
            "Adicione um botijão antes de finalizar.",
            "warning"
          );
          return null;
        }

        const subtotal = carrinho.reduce(
          (acc, item) => acc + item.precoUnitario * item.quantidade,
          0
        );

        const taxaEntregaBase = Number(dados.taxaEntrega || 0);
        const taxaEntregaFinal =
          dados.taxaEntregaFinal !== undefined
            ? Number(dados.taxaEntregaFinal || 0)
            : taxaEntregaBase;
        const descontoAplicado = Number(dados.descontoAplicado || 0);

        const total =
          dados.totalFinal !== undefined
            ? Number(dados.totalFinal || 0)
            : Math.max(0, subtotal + taxaEntregaFinal - descontoAplicado);

        const rules = adminRulesService.getRules();

        const pedidoBase = pedidoService.criarPedido({
          clienteId: dados.clienteId,
          entregadorId: null,
          enderecoId: dados.enderecoId ?? null,
          enderecoSnapshot: dados.enderecoSnapshot ?? null,
          observacao: dados.observacao ?? null,
          tipo: dados.tipo,
          horarioAgendado: dados.horarioAgendado || null,
          itens: carrinho,
          subtotal,
          taxaEntrega: taxaEntregaFinal,
          descontoAplicado,
          total,
          formaPagamento: dados.formaPagamento,
          clienteNome: dados.clienteNome ?? null,
          clienteTelefone: dados.clienteTelefone ?? null,
          cupomId: dados.cupomId ?? null,
          cupomCodigo: dados.cupomCodigo ?? null,
          cupomTitulo: dados.cupomTitulo ?? null,
          cupomTipo: dados.cupomTipo ?? null,
        });

        const pedidoComComissaoBase = patchPedidoFields(pedidoBase, {
          comissaoApp: Number(rules.comissaoPorEntrega || 10),
          comissaoGerada: false,
          comissaoGeradaEm: null,
        });

        const pedidoRemoto = await pedidoService.salvarPedidoRemoto(
          pedidoComComissaoBase
        );

        if (!pedidoRemoto) {
          throw new Error("Nao foi possivel criar o pedido remoto.");
        }

        set({ carrinho: [] });
        applyPedidoMutation(set, pedidoRemoto);
        appLogger.audit("pedido_store", "pedido_criado", "Pedido criado com sucesso.", {
          pedidoId: pedidoRemoto.id,
          status: pedidoRemoto.status,
          tipo: pedidoRemoto.tipo,
          total: pedidoRemoto.total,
        });
        trackMetric("pedido_created", {
          pedidoId: pedidoRemoto.id,
          status: pedidoRemoto.status,
          tipo: pedidoRemoto.tipo,
          total: pedidoRemoto.total,
        });

        if (dados.cupomId) {
          couponAdminService.registerUse(dados.cupomId);
        }

        if (
          pedidoRemoto.status === "buscando_entregador" &&
          !pedidoRemoto.entregadorId
        ) {
          iniciarFluxoEntrega(pedidoRemoto.id);
        }
        emitToast(
          "Pedido enviado ✅",
          dados.tipo === "agendado"
            ? "Seu pedido agendado foi criado e entrara no fluxo no horario escolhido."
            : "Seu pedido foi criado e ja esta entrando no fluxo.",
          "success",
          {
            native: true,
            route: buildPedidoRoute(String(pedidoRemoto.id)),
          }
        );

        void get().refetchPedidoById(pedidoRemoto.id);

        return pedidoRemoto;
      },

      atribuirEntregador: async (pedidoId, entregadorId) => {
        const alvo = get().pedidos.find(
          (p) => String(p.id) === String(pedidoId)
        );

        if (!alvo) return null;

        if (financeService.isBloqueado(entregadorId)) {
          emitToast(
            "Entregador bloqueado",
            "Saldo pendente acima do limite. Regularize o repasse para continuar.",
            "warning"
          );
          return null;
        }

        if (
          alvo.entregadorId &&
          String(alvo.entregadorId) !== String(entregadorId)
        ) {
          emitToast(
            "Indisponível",
            "Outro entregador já aceitou este pedido.",
            "warning"
          );
          return null;
        }

        const pedidoAtualizado = await pedidoService.atribuirEntregadorRemoto(
          pedidoId,
          entregadorId
        );

        if (!pedidoAtualizado) return null;

        applyPedidoMutation(set, pedidoAtualizado);
        appLogger.audit(
          "pedido_store",
          "pedido_atribuido",
          "Pedido atribuido ao entregador.",
          {
            pedidoId: pedidoAtualizado.id,
            entregadorId,
            status: pedidoAtualizado.status,
          }
        );
        trackMetric("pedido_assigned", {
          pedidoId: pedidoAtualizado.id,
          entregadorId,
          status: pedidoAtualizado.status,
        });

        const t = toastByStatus(String(pedidoAtualizado.status));
        emitToast(t.title, t.msg, t.variant);
        void get().refetchPedidoById(String(pedidoId));

        return pedidoAtualizado;
      },

      atualizarStatus: async (pedidoId, status) => {
        const pedidoAtualizado = await pedidoService.atualizarStatusRemoto(
          pedidoId,
          status
        );

        if (!pedidoAtualizado) return null;

        applyPedidoMutation(set, pedidoAtualizado);
        appLogger.audit("pedido_store", "pedido_status_atualizado", "Status do pedido atualizado.", {
          pedidoId: pedidoAtualizado.id,
          status: pedidoAtualizado.status,
        });
        trackMetric("pedido_status_changed", {
          pedidoId: pedidoAtualizado.id,
          status: pedidoAtualizado.status,
        });

        const t = toastByStatus(String(pedidoAtualizado.status));
        emitToast(t.title, t.msg, t.variant);
        void get().refetchPedidoById(String(pedidoId));

        return pedidoAtualizado;
      },

      cancelarPedido: async (input) => {
        const { pedidos } = get();

        const alvo = pedidos.find((p) => p.id === input.pedidoId);

        if (!alvo) {
          emitToast("Erro", "Pedido não encontrado.", "warning");
          return false;
        }

        if (alvo.status === "entregue") {
          emitToast(
            "Bloqueado",
            "Pedido já entregue não pode ser cancelado.",
            "warning"
          );
          return false;
        }

        if (alvo.status === "cancelado") {
          emitToast(
            "Aviso",
            "Esse pedido já está cancelado.",
            "info"
          );
          return false;
        }

        const motivo = safeText(input.motivoCancelamento);
        const obs = safeText(input.observacaoCancelamento);

        const auditavel =
          shouldAuditCancellation(alvo, input.canceladoPor) ||
          input.canceladoPor === "cliente" ||
          input.canceladoPor === "entregador";

        const suspeito = computeCancelamentoSuspeito({
          canceladoPor: input.canceladoPor,
          statusAnterior: alvo.status,
          motivoCancelamento: motivo,
        });

        const updatedPedido = await pedidoService.cancelarPedidoRemoto(
          {
            pedidoId: input.pedidoId,
            canceladoPor: input.canceladoPor,
            motivoCancelamento: motivo || "Sem motivo informado",
            observacaoCancelamento: obs || null,
            lat: Number.isFinite(Number(input.lat))
              ? Number(input.lat)
              : null,
            lng: Number.isFinite(Number(input.lng))
              ? Number(input.lng)
              : null,
          }
        );

        if (!updatedPedido) return false;

        applyPedidoMutation(set, {
          ...updatedPedido,
          cancelamentoAuditavel:
            updatedPedido.cancelamentoAuditavel ?? (auditavel || suspeito),
          cancelamentoSuspeito:
            updatedPedido.cancelamentoSuspeito ?? suspeito,
        });
        appLogger.audit("pedido_store", "pedido_cancelado", "Pedido cancelado.", {
          pedidoId: updatedPedido.id,
          canceladoPor: input.canceladoPor,
          suspeito,
          auditavel,
        });
        trackMetric("pedido_cancelled", {
          pedidoId: updatedPedido.id,
          canceladoPor: input.canceladoPor,
          suspeito,
          auditavel,
        });

        emitToast(
          "Pedido cancelado ⚠️",
          suspeito
            ? "Cancelamento registrado e enviado para auditoria."
            : input.canceladoPor === "entregador"
            ? "Esse cancelamento será auditado e poderemos entrar em contato com o cliente."
            : "Seu pedido foi cancelado.",
          "warning",
          {
            native: true,
            route: buildPedidoRoute(String(input.pedidoId)),
          }
        );

        void get().refetchPedidoById(String(input.pedidoId));

        return true;
      },

      confirmarEntregaComPin: async (input) => {
        const pinInformado = normalizePin(input.pin);

        if (pinInformado.length !== 4) {
          emitToast("PIN inválido", "Informe um PIN de 4 dígitos.", "warning");
          return false;
        }

        const { pedidos } = get();
        const alvo = pedidos.find((p) => p.id === input.pedidoId);

        if (!alvo) {
          emitToast("Erro", "Pedido não encontrado.", "warning");
          return false;
        }

        if (alvo.status !== "saiu_para_entrega") {
          emitToast(
            "Bloqueado",
            "O PIN só pode ser validado quando o pedido estiver em rota.",
            "warning"
          );
          return false;
        }

        const updatedPedido = await pedidoService.confirmarEntregaRemota(
          input.pedidoId,
          pinInformado
        );

        if (!updatedPedido) return false;

        applyPedidoMutation(set, updatedPedido);
        appLogger.audit(
          "pedido_store",
          "pedido_entregue_pin",
          "Entrega confirmada com PIN.",
          {
            pedidoId: updatedPedido.id,
            status: updatedPedido.status,
          }
        );
        trackMetric("pedido_delivered_pin", {
          pedidoId: updatedPedido.id,
          status: updatedPedido.status,
        });

        resetAfterDeliveryForOrder(updatedPedido.id);

        emitToast(
          "Entrega confirmada ✅",
          "PIN validado com sucesso. Comissão do app registrada.",
          "success",
          {
            native: true,
            route: buildPedidoRoute(String(input.pedidoId)),
          }
        );

        void get().refetchPedidoById(String(input.pedidoId));

        return true;
      },

      marcarEntregaManual: async (pedidoId) => {
        const { pedidos } = get();
        const alvo = pedidos.find((p) => p.id === pedidoId);

        if (!alvo) {
          emitToast("Erro", "Pedido não encontrado.", "warning");
          return false;
        }

        if (
          alvo.status !== "saiu_para_entrega" &&
          alvo.status !== "preparando"
        ) {
          emitToast(
            "Bloqueado",
            "Entrega manual só pode ser registrada em pedido ativo.",
            "warning"
          );
          return false;
        }

        const updatedPedido = await pedidoService.confirmarEntregaManualRemota(
          pedidoId
        );

        if (!updatedPedido) return false;

        applyPedidoMutation(set, updatedPedido);
        appLogger.audit(
          "pedido_store",
          "pedido_entregue_manual",
          "Entrega manual registrada.",
          {
            pedidoId: updatedPedido.id,
            status: updatedPedido.status,
          }
        );
        trackMetric("pedido_delivered_manual", {
          pedidoId: updatedPedido.id,
          status: updatedPedido.status,
        });

        resetAfterDeliveryForOrder(updatedPedido.id);

        emitToast(
          "Entrega manual",
          "Entrega manual registrada para auditoria.",
          "warning",
          {
            native: true,
            route: buildPedidoRoute(String(pedidoId)),
          }
        );

        void get().refetchPedidoById(String(pedidoId));

        return true;
      },

      replacePedidos: (pedidos) =>
        set((state) => {
          const ordered = sortPedidos(
            dedupePedidos(Array.isArray(pedidos) ? pedidos : [])
          );

          scheduleClientNotifications(state.pedidos, ordered);
          syncFinanceSnapshot(ordered);
          syncGasTankFromDeliveredOrders(ordered);

          return {
            pedidos: ordered,
            pedidoAtual: pickPedidoAtual(ordered, state.pedidoAtual),
            remoteReady: true,
          };
        }),

      upsertPedidoLocal: (pedido) =>
        set((state) => {
          const pedidos = upsertPedidoInList(state.pedidos, pedido);
          scheduleClientNotifications(state.pedidos, pedidos);
          syncFinanceSnapshot(pedidos);
          syncGasTankFromDeliveredOrders(pedidos);

          return {
            pedidos,
            pedidoAtual:
              state.pedidoAtual?.id === pedido.id
                ? pedido
                : state.pedidoAtual ?? pedidos[0] ?? null,
          };
        }),

      refetchPedidos: async () => {
        set({ loadingRemote: true });

        try {
          const remote = await pedidoService.listarPedidosPrimarios();
          if (remote === null) {
            set((state) => ({
              loadingRemote: false,
              remoteReady: state.remoteReady,
            }));
            return;
          }

          const ordered = sortPedidos(
            dedupePedidos(Array.isArray(remote) ? remote : [])
          );

          set((state) => {
            scheduleClientNotifications(state.pedidos, ordered);
            syncFinanceSnapshot(ordered);
            syncGasTankFromDeliveredOrders(ordered);

            return {
              pedidos: ordered,
              pedidoAtual: pickPedidoAtual(ordered, state.pedidoAtual),
              remoteReady: true,
              loadingRemote: false,
            };
          });
        } catch (error) {
          appLogger.error("pedido_store", "refetch_pedidos_failed", error);
          set({ loadingRemote: false });
        }
      },

      refetchPedidoById: async (pedidoId) => {
        const id = safeText(pedidoId);
        if (!id) return null;

        set({ loadingRemote: true });

        try {
          const pedido = await pedidoService.buscarPedidoPrimarioPorId(id);

          if (pedido === undefined) {
            set((state) => ({
              loadingRemote: false,
              remoteReady: state.remoteReady,
            }));
            return null;
          }

          if (!pedido) {
            set({ loadingRemote: false, remoteReady: true });
            return null;
          }

          set((state) => {
            const pedidos = upsertPedidoInList(state.pedidos, pedido);
            scheduleClientNotifications(state.pedidos, pedidos);
            syncFinanceSnapshot(pedidos);
            syncGasTankFromDeliveredOrders(pedidos);

            return {
              pedidos,
              pedidoAtual:
                state.pedidoAtual?.id === pedido.id
                  ? pedido
                  : state.pedidoAtual ?? pedido,
              remoteReady: true,
              loadingRemote: false,
            };
          });

          return pedido;
        } catch (error) {
          appLogger.error("pedido_store", "refetch_pedido_by_id_failed", error, {
            pedidoId: id,
          });
          set({ loadingRemote: false });
          return null;
        }
      },
    }),
    {
      name: "cg_pedido_store_v1",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persistedState: any) => {
        return {
          carrinho: Array.isArray(persistedState?.carrinho)
            ? persistedState.carrinho
            : [],
          pedidos: [],
          pedidoAtual: null,
        };
      },
      partialize: (state) => ({
        carrinho: state.carrinho,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        syncFinanceSnapshot(state.pedidos || []);
      },
    }
  )
);
