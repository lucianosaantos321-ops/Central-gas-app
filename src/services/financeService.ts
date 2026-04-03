import type {
  DelivererFinancialState,
  FinanceHistoryItem,
  Pedido,
} from "../types";
import { adminRulesService } from "./adminRulesService";

type FinanceDb = {
  byDeliverer: Record<string, DelivererFinancialState>;
};

export const COMISSAO_APP_POR_ENTREGA = 10;

const STORAGE_KEY = "cg_finance_state_v2";

function now() {
  return new Date().toISOString();
}

function normalizeId(id: string) {
  return String(id || "").trim();
}

function round2(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

function safeRead(): FinanceDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byDeliverer: {} };

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { byDeliverer: {} };

    const byDeliverer =
      parsed.byDeliverer && typeof parsed.byDeliverer === "object"
        ? parsed.byDeliverer
        : {};

    return { byDeliverer };
  } catch {
    return { byDeliverer: {} };
  }
}

function safeWrite(db: FinanceDb) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore
  }
}

function createEmptyState(entregadorId: string): DelivererFinancialState {
  const rules = adminRulesService.getRules();

  return {
    entregadorId,
    saldoDevedor: 0,
    limiteBloqueio: Number(rules.limiteBloqueioSaldo || 300),
    bloqueado: false,
    updatedAt: now(),
    historico: [],
  };
}

function recalcState(base: DelivererFinancialState): DelivererFinancialState {
  const rules = adminRulesService.getRules();

  const saldo = round2(
    (Array.isArray(base.historico) ? base.historico : []).reduce((acc, item) => {
      if (item.tipo === "pagamento") {
        return acc - Math.abs(Number(item.valor || 0));
      }

      return acc + Number(item.valor || 0);
    }, 0)
  );

  const limiteBloqueio = Number(rules.limiteBloqueioSaldo || 300);

  return {
    ...base,
    saldoDevedor: saldo,
    limiteBloqueio,
    bloqueado: saldo >= limiteBloqueio,
    updatedAt: now(),
    historico: [...(base.historico || [])].sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
    ),
  };
}

function ensureDeliverer(db: FinanceDb, entregadorId: string) {
  const id = normalizeId(entregadorId);
  if (!id) return null;

  if (!db.byDeliverer[id]) {
    db.byDeliverer[id] = createEmptyState(id);
  }

  db.byDeliverer[id] = recalcState(db.byDeliverer[id]);
  return db.byDeliverer[id];
}

function historyHasCommissionForPedido(
  historico: FinanceHistoryItem[],
  pedidoId: string
) {
  return (historico || []).some(
    (item) =>
      item.tipo === "comissao" &&
      String(item.pedidoId || "") === String(pedidoId || "")
  );
}

export const financeService = {
  getDelivererState(entregadorId: string): DelivererFinancialState {
    const id = normalizeId(entregadorId);
    if (!id) return createEmptyState("");

    const db = safeRead();
    const state = ensureDeliverer(db, id) || createEmptyState(id);
    safeWrite(db);
    return state;
  },

  getAllDelivererStates(): DelivererFinancialState[] {
    const db = safeRead();
    const ids = Object.keys(db.byDeliverer || {});

    const states = ids
      .map((id) => ensureDeliverer(db, id))
      .filter(Boolean) as DelivererFinancialState[];

    safeWrite(db);

    return states.sort(
      (a, b) => Number(b.saldoDevedor || 0) - Number(a.saldoDevedor || 0)
    );
  },

  isBloqueado(entregadorId: string): boolean {
    const state = this.getDelivererState(entregadorId);
    return Boolean(state.bloqueado);
  },

  getHistorico(entregadorId: string) {
    const state = this.getDelivererState(entregadorId);
    return Array.isArray(state.historico) ? state.historico : [];
  },

  addAjuste(entregadorId: string, valor: number, observacao?: string | null) {
    const id = normalizeId(entregadorId);
    if (!id) return null;

    const amount = round2(Number(valor || 0));
    if (!Number.isFinite(amount) || amount === 0) return null;

    const db = safeRead();
    const state = ensureDeliverer(db, id);
    if (!state) return null;

    state.historico.unshift({
      tipo: "ajuste",
      valor: amount,
      observacao: observacao?.trim() || "Ajuste manual",
      data: now(),
    });

    db.byDeliverer[id] = recalcState(state);
    safeWrite(db);
    return db.byDeliverer[id];
  },

  registerPagamento(entregadorId: string, valor: number, observacao?: string | null) {
    const id = normalizeId(entregadorId);
    if (!id) return null;

    const amount = Math.abs(round2(Number(valor || 0)));
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const db = safeRead();
    const state = ensureDeliverer(db, id);
    if (!state) return null;

    state.historico.unshift({
      tipo: "pagamento",
      valor: amount,
      observacao: observacao?.trim() || "Pagamento registrado pelo ADM",
      data: now(),
    });

    db.byDeliverer[id] = recalcState(state);
    safeWrite(db);
    return db.byDeliverer[id];
  },

  addComissao(entregadorId: string, pedidoId: string, valor?: number) {
    const id = normalizeId(entregadorId);
    const pedidoNormalizado = String(pedidoId || "").trim();

    if (!id || !pedidoNormalizado) return null;

    const db = safeRead();
    const state = ensureDeliverer(db, id);
    if (!state) return null;

    if (historyHasCommissionForPedido(state.historico || [], pedidoNormalizado)) {
      return db.byDeliverer[id];
    }

    const rules = adminRulesService.getRules();
    const valorComissao = round2(
      Number(
        valor != null
          ? valor
          : rules.comissaoPorEntrega || COMISSAO_APP_POR_ENTREGA
      )
    );

    state.historico.unshift({
      tipo: "comissao",
      valor: valorComissao,
      pedidoId: pedidoNormalizado,
      observacao: `Comissão da entrega ${pedidoNormalizado.slice(0, 6)}`,
      data: now(),
    });

    db.byDeliverer[id] = recalcState(state);
    safeWrite(db);
    return db.byDeliverer[id];
  },

  syncDeliveredOrders(pedidos: Pedido[]) {
    const db = safeRead();
    const rules = adminRulesService.getRules();
    const commissionDefault = Number(
      rules.comissaoPorEntrega || COMISSAO_APP_POR_ENTREGA
    );

    const delivered = (Array.isArray(pedidos) ? pedidos : []).filter(
      (pedido) =>
        pedido &&
        pedido.status === "entregue" &&
        normalizeId(String(pedido.entregadorId || ""))
    );

    let changed = false;

    delivered.forEach((pedido) => {
      const entregadorId = normalizeId(String(pedido.entregadorId || ""));
      if (!entregadorId) return;

      const state = ensureDeliverer(db, entregadorId);
      if (!state) return;

      if (historyHasCommissionForPedido(state.historico, pedido.id)) {
        return;
      }

      const valorComissao = round2(
        Number(
          pedido.comissaoApp != null ? pedido.comissaoApp : commissionDefault
        )
      );

      state.historico.unshift({
        tipo: "comissao",
        valor: valorComissao,
        pedidoId: pedido.id,
        observacao: `Comissão da entrega ${String(pedido.id).slice(0, 6)}`,
        data: pedido.updatedAt || pedido.createdAt || now(),
      });

      db.byDeliverer[entregadorId] = recalcState(state);
      changed = true;
    });

    if (changed) {
      safeWrite(db);
    }

    return this.getAllDelivererStates();
  },

  getGlobalSummary(pedidos: Pedido[]) {
    const synced = this.syncDeliveredOrders(pedidos);
    const states = Array.isArray(synced) ? synced : this.getAllDelivererStates();

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