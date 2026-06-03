import type {
  DelivererFinancialState,
  FinanceHistoryItem,
  Pedido,
} from "../types";
import { adminRulesService } from "./adminRulesService";
import {
  appendManualFinanceEvent,
  extractManualFinanceEvents,
  readFinanceDb,
  writeFinanceDb,
} from "./financeStorage";
import { queueRemoteFinanceEventSave } from "./remoteFinanceStateService";

export const COMISSAO_APP_POR_ENTREGA = 10;

let deliveredPedidosCache: Pedido[] = [];
const recentMutationGuards = new Map<string, number>();

function now() {
  return new Date().toISOString();
}

function normalizeId(id: string) {
  return String(id || "").trim();
}

function round2(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

function cleanupMutationGuards(referenceTime: number) {
  for (const [key, value] of recentMutationGuards.entries()) {
    if (referenceTime - value > 8000) {
      recentMutationGuards.delete(key);
    }
  }
}

function isRecentDuplicateMutation(parts: Array<string | number>) {
  const nowMs = Date.now();
  cleanupMutationGuards(nowMs);

  const key = parts.map((item) => String(item ?? "").trim().toLowerCase()).join("|");
  const previous = recentMutationGuards.get(key) ?? 0;
  recentMutationGuards.set(key, nowMs);
  return previous > 0 && nowMs - previous < 4000;
}

function getPedidoTime(pedido: Pedido) {
  const parsed = new Date(pedido.updatedAt ?? pedido.createdAt ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortHistory(items: FinanceHistoryItem[]) {
  return [...items].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  );
}

function composeSaldo(historico: FinanceHistoryItem[]) {
  return round2(
    (historico || []).reduce((acc, item) => {
      if (item.tipo === "pagamento") {
        return acc - Math.abs(Number(item.valor || 0));
      }

      return acc + Number(item.valor || 0);
    }, 0)
  );
}

function getManualHistory(entregadorId: string) {
  return extractManualFinanceEvents(readFinanceDb())
    .filter((item) => normalizeId(item.entregadorId) === normalizeId(entregadorId))
    .map((item) => ({
      tipo: item.tipo,
      valor: Number(item.valor || 0),
      observacao: item.observacao ?? null,
      data: item.data,
      pedidoId: item.pedidoId,
    }));
}

function getCommissionHistory(entregadorId: string) {
  const rules = adminRulesService.getRules();
  const commissionDefault = Number(
    rules.comissaoPorEntrega || COMISSAO_APP_POR_ENTREGA
  );

  const delivered = deliveredPedidosCache
    .filter(
      (pedido) =>
        normalizeId(String(pedido.entregadorId || "")) === normalizeId(entregadorId) &&
        pedido.status === "entregue"
    )
    .sort((a, b) => getPedidoTime(b) - getPedidoTime(a));

  const byPedidoId = new Map<string, FinanceHistoryItem>();

  for (const pedido of delivered) {
    const pedidoId = normalizeId(String(pedido.id || ""));
    if (!pedidoId || byPedidoId.has(pedidoId)) continue;

    const valor = round2(
      Number(
        pedido.comissaoApp != null ? pedido.comissaoApp : commissionDefault
      )
    );

    byPedidoId.set(pedidoId, {
      tipo: "comissao",
      valor,
      pedidoId,
      observacao: `Comissao da entrega ${pedidoId.slice(0, 6)}`,
      data: pedido.updatedAt || pedido.createdAt || now(),
    });
  }

  return Array.from(byPedidoId.values());
}

function buildState(entregadorId: string): DelivererFinancialState {
  const id = normalizeId(entregadorId);
  const rules = adminRulesService.getRules();
  const historico = sortHistory([
    ...getManualHistory(id),
    ...getCommissionHistory(id),
  ]);
  const saldoDevedor = composeSaldo(historico);
  const limiteBloqueio = Number(rules.limiteBloqueioSaldo || 300);

  return {
    entregadorId: id,
    saldoDevedor,
    limiteBloqueio,
    bloqueado: saldoDevedor >= limiteBloqueio,
    updatedAt: now(),
    historico,
  };
}

function collectDelivererIds() {
  const manualIds = extractManualFinanceEvents(readFinanceDb()).map((item) =>
    normalizeId(item.entregadorId)
  );
  const orderIds = deliveredPedidosCache.map((pedido) =>
    normalizeId(String(pedido.entregadorId || ""))
  );

  return Array.from(new Set([...manualIds, ...orderIds].filter(Boolean)));
}

export const financeService = {
  getDelivererState(entregadorId: string): DelivererFinancialState {
    const id = normalizeId(entregadorId);
    if (!id) return buildState("");
    return buildState(id);
  },

  getAllDelivererStates(): DelivererFinancialState[] {
    return collectDelivererIds()
      .map((entregadorId) => this.getDelivererState(entregadorId))
      .sort(
        (a, b) => Number(b.saldoDevedor || 0) - Number(a.saldoDevedor || 0)
      );
  },

  isBloqueado(entregadorId: string): boolean {
    return Boolean(this.getDelivererState(entregadorId).bloqueado);
  },

  getHistorico(entregadorId: string) {
    return Array.isArray(this.getDelivererState(entregadorId).historico)
      ? this.getDelivererState(entregadorId).historico
      : [];
  },

  addAjuste(entregadorId: string, valor: number, observacao?: string | null) {
    const id = normalizeId(entregadorId);
    const amount = round2(Number(valor || 0));
    if (!id || !Number.isFinite(amount) || amount === 0) return null;
    if (
      isRecentDuplicateMutation([
        "ajuste",
        id,
        amount,
        observacao?.trim() || "Ajuste manual",
      ])
    ) {
      return this.getDelivererState(id);
    }

    const db = readFinanceDb();
    const event = appendManualFinanceEvent(db, {
      entregadorId: id,
      tipo: "ajuste",
      valor: amount,
      observacao: observacao?.trim() || "Ajuste manual",
    });
    if (!event) return null;

    writeFinanceDb(db);
    queueRemoteFinanceEventSave({
      entregadorId: id,
      tipo: "ajuste",
      valor: amount,
      observacao: event.observacao ?? null,
      data: event.data,
    });

    return this.getDelivererState(id);
  },

  registerPagamento(entregadorId: string, valor: number, observacao?: string | null) {
    const id = normalizeId(entregadorId);
    const amount = Math.abs(round2(Number(valor || 0)));
    if (!id || !Number.isFinite(amount) || amount <= 0) return null;
    if (
      isRecentDuplicateMutation([
        "pagamento",
        id,
        amount,
        observacao?.trim() || "Pagamento registrado pelo ADM",
      ])
    ) {
      return this.getDelivererState(id);
    }

    const db = readFinanceDb();
    const event = appendManualFinanceEvent(db, {
      entregadorId: id,
      tipo: "pagamento",
      valor: amount,
      observacao: observacao?.trim() || "Pagamento registrado pelo ADM",
    });
    if (!event) return null;

    writeFinanceDb(db);
    queueRemoteFinanceEventSave({
      entregadorId: id,
      tipo: "pagamento",
      valor: amount,
      observacao: event.observacao ?? null,
      data: event.data,
    });

    return this.getDelivererState(id);
  },

  addComissao(entregadorId: string, _pedidoId: string, _valor?: number) {
    const id = normalizeId(entregadorId);
    if (!id) return null;
    return this.getDelivererState(id);
  },

  syncDeliveredOrders(pedidos: Pedido[]) {
    const latest = new Map<string, Pedido>();

    for (const pedido of Array.isArray(pedidos) ? pedidos : []) {
      if (!pedido || pedido.status !== "entregue") continue;
      const id = normalizeId(String(pedido.id || ""));
      if (!id) continue;

      const existing = latest.get(id);
      if (!existing || getPedidoTime(pedido) >= getPedidoTime(existing)) {
        latest.set(id, pedido);
      }
    }

    deliveredPedidosCache = Array.from(latest.values()).sort(
      (a, b) => getPedidoTime(b) - getPedidoTime(a)
    );

    return this.getAllDelivererStates();
  },

  getGlobalSummary(pedidos: Pedido[]) {
    const states = Array.isArray(pedidos)
      ? this.syncDeliveredOrders(pedidos)
      : this.getAllDelivererStates();

    const historico = states.flatMap((item) => item.historico || []);

    const totalComissao = round2(
      historico
        .filter((item) => item.tipo === "comissao")
        .reduce((acc, item) => acc + Number(item.valor || 0), 0)
    );

    const totalPagamentos = round2(
      historico
        .filter((item) => item.tipo === "pagamento")
        .reduce((acc, item) => acc + Math.abs(Number(item.valor || 0)), 0)
    );

    const totalAjustes = round2(
      historico
        .filter((item) => item.tipo === "ajuste")
        .reduce((acc, item) => acc + Number(item.valor || 0), 0)
    );

    const saldoEmAberto = round2(
      states.reduce((acc, item) => acc + Number(item.saldoDevedor || 0), 0)
    );

    const bloqueados = states.filter((item) => item.bloqueado).length;

    return {
      totalEntregadores: states.length,
      bloqueados,
      totalComissao,
      totalPagamentos,
      totalAjustes,
      saldoEmAberto,
      states,
    };
  },
};
