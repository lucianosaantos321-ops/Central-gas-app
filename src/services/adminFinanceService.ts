import type { Pedido } from "../types";
import { financeService } from "./financeService";
import { adminRulesService } from "./adminRulesService";

export type AdminFinanceSummary = {
  totalEntregasConcluidas: number;
  totalComissaoPrevista: number;
  totalComissaoGerada: number;
  totalCancelados: number;
  totalPedidos: number;
};

export type AdminDelivererFinanceRow = {
  entregadorId: string;
  entregasConcluidas: number;
  cancelamentos: number;
  comissaoPrevista: number;
  comissaoGerada: number;
  saldoDevedor: number;
  bloqueado: boolean;
};

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizePedidos(input: unknown): Pedido[] {
  return Array.isArray(input) ? (input as Pedido[]) : [];
}

function readPedidos(): Pedido[] {
  const store = safeRead<any>("cg_pedido_store_v1", null);
  if (!store) return [];

  const directPedidos = normalizePedidos(store?.state?.pedidos);
  if (directPedidos.length > 0) return directPedidos;

  const altPedidos = normalizePedidos(store?.pedidos);
  if (altPedidos.length > 0) return altPedidos;

  return [];
}

function uniqueDelivererIds(pedidos: Pedido[]) {
  const idsFromPedidos = pedidos
    .map((p) => String(p?.entregadorId || "").trim())
    .filter(Boolean);

  const idsFromFinance = financeService
    .getAllDelivererStates()
    .map((item) => String(item.entregadorId || "").trim())
    .filter(Boolean);

  return Array.from(new Set([...idsFromPedidos, ...idsFromFinance]));
}

export const adminFinanceService = {
  getAllPedidos(): Pedido[] {
    return readPedidos().sort(
      (a, b) =>
        new Date(b?.updatedAt ?? b?.createdAt ?? 0).getTime() -
        new Date(a?.updatedAt ?? a?.createdAt ?? 0).getTime()
    );
  },

  getSummary(): AdminFinanceSummary {
    const pedidos = this.getAllPedidos();
    const rules = adminRulesService.getRules();

    const totalEntregasConcluidas = pedidos.filter((p) => p.status === "entregue").length;
    const totalCancelados = pedidos.filter((p) => p.status === "cancelado").length;
    const totalPedidos = pedidos.length;

    const totalComissaoPrevista = pedidos
      .filter((p) => p.status === "entregue")
      .reduce(
        (acc, p) => acc + Number(p.comissaoApp ?? rules.comissaoPorEntrega ?? 10),
        0
      );

    const totalComissaoGerada = pedidos
      .filter((p) => p.status === "entregue" && p.comissaoGerada)
      .reduce(
        (acc, p) => acc + Number(p.comissaoApp ?? rules.comissaoPorEntrega ?? 10),
        0
      );

    return {
      totalEntregasConcluidas,
      totalComissaoPrevista,
      totalComissaoGerada,
      totalCancelados,
      totalPedidos,
    };
  },

  getDelivererRows(): AdminDelivererFinanceRow[] {
    const pedidos = this.getAllPedidos();
    const rules = adminRulesService.getRules();
    const ids = uniqueDelivererIds(pedidos);

    return ids.map((entregadorId) => {
      const pedidosDoEntregador = pedidos.filter(
        (p) => String(p?.entregadorId || "") === entregadorId
      );

      const entregasConcluidas = pedidosDoEntregador.filter((p) => p.status === "entregue").length;
      const cancelamentos = pedidosDoEntregador.filter((p) => p.status === "cancelado").length;

      const comissaoPrevista = pedidosDoEntregador
        .filter((p) => p.status === "entregue")
        .reduce(
          (acc, p) => acc + Number(p.comissaoApp ?? rules.comissaoPorEntrega ?? 10),
          0
        );

      const comissaoGerada = pedidosDoEntregador
        .filter((p) => p.status === "entregue" && p.comissaoGerada)
        .reduce(
          (acc, p) => acc + Number(p.comissaoApp ?? rules.comissaoPorEntrega ?? 10),
          0
        );

      const financeState = financeService.getDelivererState(entregadorId);

      return {
        entregadorId,
        entregasConcluidas,
        cancelamentos,
        comissaoPrevista,
        comissaoGerada,
        saldoDevedor: financeState.saldoDevedor,
        bloqueado: financeState.bloqueado,
      };
    });
  },

  getBlockedDeliverers(): AdminDelivererFinanceRow[] {
    return this.getDelivererRows().filter((row) => row.bloqueado);
  },
};