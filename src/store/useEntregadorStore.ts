import { create } from "zustand";

type PedidosTab = "ofertas" | "andamento" | "manuais" | "historico";

type EntregadorState = {
  entregadorId: string;
  online: boolean;
  routingPedidoId: string;
  currentPedidoId: string;
  lastPedidosTab: PedidosTab;

  setOnline: (online: boolean) => void;
  ensureEntregadorId: () => string;

  setRoutingPedidoId: (pedidoId: string) => void;
  clearRoutingPedidoId: () => void;

  setCurrentPedidoId: (pedidoId: string) => void;
  clearCurrentPedidoId: () => void;

  setLastPedidosTab: (tab: PedidosTab) => void;
};

function safeGet(key: string, fallback = "") {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function genDelivererId() {
  return `d_${Math.floor(100000 + Math.random() * 900000)}`;
}

const ID_KEY = "cg_deliverer_id";
const ONLINE_KEY = "cg_deliverer_online";
const ROUTING_KEY = "cg_deliverer_routing_id";
const CURRENT_KEY = "cg_deliverer_current_pedido_id";
const LAST_TAB_KEY = "cg_deliverer_last_tab";

function readOnline(): boolean {
  return safeGet(ONLINE_KEY, "1") !== "0";
}

function readOrCreateId(): string {
  const existing = safeGet(ID_KEY, "");
  if (existing) return existing;

  const id = genDelivererId();
  safeSet(ID_KEY, id);
  return id;
}

function readRoutingId(): string {
  return safeGet(ROUTING_KEY, "");
}

function readCurrentPedidoId(): string {
  return safeGet(CURRENT_KEY, "");
}

function readLastTab(): PedidosTab {
  const raw = safeGet(LAST_TAB_KEY, "ofertas");
  if (
    raw === "ofertas" ||
    raw === "andamento" ||
    raw === "manuais" ||
    raw === "historico"
  ) {
    return raw;
  }
  return "ofertas";
}

export const useEntregadorStore = create<EntregadorState>((set, get) => ({
  entregadorId: readOrCreateId(),
  online: readOnline(),
  routingPedidoId: readRoutingId(),
  currentPedidoId: readCurrentPedidoId(),
  lastPedidosTab: readLastTab(),

  setOnline: (online) => {
    safeSet(ONLINE_KEY, online ? "1" : "0");
    set({ online });
  },

  ensureEntregadorId: () => {
    const cur = get().entregadorId;
    if (cur) return cur;

    const id = readOrCreateId();
    set({ entregadorId: id });
    return id;
  },

  setRoutingPedidoId: (pedidoId) => {
    const value = String(pedidoId || "").trim();
    if (!value) return;

    safeSet(ROUTING_KEY, value);
    set({ routingPedidoId: value });
  },

  clearRoutingPedidoId: () => {
    safeRemove(ROUTING_KEY);
    set({ routingPedidoId: "" });
  },

  setCurrentPedidoId: (pedidoId) => {
    const value = String(pedidoId || "").trim();
    if (!value) return;

    safeSet(CURRENT_KEY, value);
    set({ currentPedidoId: value });
  },

  clearCurrentPedidoId: () => {
    safeRemove(CURRENT_KEY);
    set({ currentPedidoId: "" });
  },

  setLastPedidosTab: (tab) => {
    safeSet(LAST_TAB_KEY, tab);
    set({ lastPedidosTab: tab });
  },
}));