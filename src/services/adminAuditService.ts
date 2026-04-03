import type { Pedido } from "../types";

export type AdminAuditRow = {
  pedidoId: string;
  clienteNome: string;
  clienteTelefone: string;
  entregadorId: string;
  status: string;
  motivoCancelamento: string;
  observacaoCancelamento: string;
  canceladoPor: string;
  canceladoEm: string;
  cancelamentoAuditavel: boolean;
  cancelamentoSuspeito: boolean;
  enderecoResumo: string;
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

function safeText(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function formatEndereco(p: Pedido) {
  const e = p?.enderecoSnapshot;
  if (!e) return "Não informado";

  const rua = safeText(e.street ?? e.rua);
  const numero = safeText(e.number ?? e.numero);
  const bairro = safeText(e.neighborhood ?? e.bairro);
  const cidade = safeText(e.city ?? e.cidade);

  return [rua, numero, bairro, cidade].filter(Boolean).join(", ") || "Não informado";
}

export const adminAuditService = {
  getAllCancelamentosAuditaveis(): AdminAuditRow[] {
    const pedidos = readPedidos();

    return pedidos
      .filter((p) => p.status === "cancelado" || p.cancelamentoAuditavel || p.cancelamentoSuspeito)
      .map((p) => ({
        pedidoId: String(p.id),
        clienteNome: safeText(p.clienteNome) || "Cliente",
        clienteTelefone: safeText(p.clienteTelefone) || "Não informado",
        entregadorId: safeText(p.entregadorId) || "Sem entregador",
        status: safeText(p.status),
        motivoCancelamento: safeText(p.motivoCancelamento) || "Sem motivo",
        observacaoCancelamento: safeText(p.observacaoCancelamento) || "Sem observação",
        canceladoPor: safeText(p.canceladoPor) || "Não informado",
        canceladoEm: safeText(p.canceladoEm) || safeText(p.updatedAt) || safeText(p.createdAt),
        cancelamentoAuditavel: Boolean(p.cancelamentoAuditavel),
        cancelamentoSuspeito: Boolean(p.cancelamentoSuspeito),
        enderecoResumo: formatEndereco(p),
      }))
      .sort(
        (a, b) =>
          new Date(b.canceladoEm || 0).getTime() - new Date(a.canceladoEm || 0).getTime()
      );
  },

  getCancelamentosSuspeitos(): AdminAuditRow[] {
    return this.getAllCancelamentosAuditaveis().filter((item) => item.cancelamentoSuspeito);
  },

  getCancelamentosPorEntregador(entregadorId: string): AdminAuditRow[] {
    return this.getAllCancelamentosAuditaveis().filter(
      (item) => item.entregadorId === entregadorId
    );
  },
};