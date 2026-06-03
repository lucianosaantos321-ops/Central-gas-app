import { create } from "zustand";
import { appLogger } from "../services/appLogger";
import { trackMetric } from "../services/appMetrics";
import {
  delivererService,
  type DelivererPresence,
} from "../services/delivererService";

type PedidosTab = "ofertas" | "andamento" | "manuais" | "historico";

type EntregadorState = {
  entregadorId: string;
  online: boolean;
  isOnline: boolean;
  onlineSyncing: boolean;
  onlineHydrating: boolean;
  onlineHydrated: boolean;
  onlineSyncError: string;
  onlineToggleTarget: boolean | null;
  lastSeenAt: string;
  routingPedidoId: string;
  currentPedidoId: string;
  lastPedidosTab: PedidosTab;

  setOnline: (online: boolean) => void;
  setOnlineLocal: (online: boolean) => void;
  setOnlineRemote: (online: boolean) => Promise<boolean>;
  hydrateOnlineStatus: () => Promise<boolean>;
  ensureEntregadorId: () => string;
  setEntregadorId: (entregadorId: string) => void;

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
const DEBUG_DELIVERER_ONLINE =
  import.meta.env.DEV ||
  String(import.meta.env.VITE_ENABLE_DELIVERER_DEBUG || "").trim() === "1";

let stopOnlineRealtime: (() => void) | null = null;
let onlineRealtimeId = "";
let pendingOnlineTarget: boolean | null = null;
let pendingOnlineRequestAt = 0;
let lastAppliedPresenceAt = 0;
let hydratePromise: Promise<boolean> | null = null;

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

function readDelivererIdentity() {
  return {
    nome: safeGet("cg_deliverer_name", "Entregador"),
    telefone: safeGet("cg_deliverer_phone", "61"),
  };
}

function persistOnline(online: boolean) {
  safeSet(ONLINE_KEY, online ? "1" : "0");
}

function persistEntregadorId(id: string) {
  safeSet(ID_KEY, id);
}

function debugOnline(message: string, extra?: Record<string, unknown>) {
  if (!DEBUG_DELIVERER_ONLINE) return;
  appLogger.debug("deliverer_store", message, extra);
}

function normalizeSyncError(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "";

  if (!raw) return "Nao foi possivel sincronizar seu status agora.";

  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalized.includes("network") ||
    normalized.includes("fetch") ||
    normalized.includes("offline")
  ) {
    return "Falha de conexao ao sincronizar seu status.";
  }

  if (normalized.includes("timeout") || normalized.includes("demorou")) {
    return "O servidor demorou demais para sincronizar seu status.";
  }

  return "Nao foi possivel sincronizar seu status agora.";
}

function getPresenceTimestamp(presence: DelivererPresence) {
  const parsed = Date.parse(
    String(presence.updatedAt ?? presence.lastSeenAt ?? "").trim()
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldApplyPresence(
  state: EntregadorState,
  presence: DelivererPresence
) {
  const incomingAt = getPresenceTimestamp(presence);

  if (
    pendingOnlineTarget !== null &&
    state.onlineSyncing &&
    presence.online !== pendingOnlineTarget
  ) {
    debugOnline("ignorado presence remoto por conflitar com toggle pendente", {
      incomingOnline: presence.online,
      pendingOnlineTarget,
      incomingAt,
      pendingOnlineRequestAt,
    });
    return false;
  }

  if (
    incomingAt > 0 &&
    lastAppliedPresenceAt > 0 &&
    incomingAt < lastAppliedPresenceAt &&
    presence.online !== state.isOnline
  ) {
    debugOnline("ignorado presence remoto mais antigo que o ultimo aplicado", {
      incomingOnline: presence.online,
      currentOnline: state.isOnline,
      incomingAt,
      lastAppliedPresenceAt,
    });
    return false;
  }

  return true;
}

function applyPresenceToState(
  get: () => EntregadorState,
  set: (
    partial:
      | Partial<EntregadorState>
      | ((state: EntregadorState) => Partial<EntregadorState>)
  ) => void,
  presence: DelivererPresence
) {
  const state = get();
  if (!shouldApplyPresence(state, presence)) return;

  const incomingAt = getPresenceTimestamp(presence);
  if (incomingAt > 0) {
    lastAppliedPresenceAt = Math.max(lastAppliedPresenceAt, incomingAt);
  }

  debugOnline("store aplicando presence remoto", {
    online: presence.online,
    updatedAt: presence.updatedAt,
    lastSeenAt: presence.lastSeenAt,
  });
  persistOnline(presence.online);
  set({
    online: presence.online,
    isOnline: presence.online,
    onlineHydrated: true,
    onlineSyncError: "",
    lastSeenAt: presence.lastSeenAt ?? "",
  });
}

function attachRealtime(
  entregadorId: string,
  get: () => EntregadorState,
  set: (
    partial:
      | Partial<EntregadorState>
      | ((state: EntregadorState) => Partial<EntregadorState>)
  ) => void
) {
  const id = String(entregadorId || "").trim();
  if (!id || onlineRealtimeId === id) return;

  if (stopOnlineRealtime) {
    stopOnlineRealtime();
    stopOnlineRealtime = null;
  }

  onlineRealtimeId = id;
  stopOnlineRealtime = delivererService.subscribeOnlineStatus(id, (presence) => {
    if (!presence) return;
    applyPresenceToState(get, set, presence);
  });
}

export const useEntregadorStore = create<EntregadorState>((set, get) => ({
  entregadorId: readOrCreateId(),
  online: readOnline(),
  isOnline: readOnline(),
  onlineSyncing: false,
  onlineHydrating: false,
  onlineHydrated: false,
  onlineSyncError: "",
  onlineToggleTarget: null,
  lastSeenAt: "",
  routingPedidoId: readRoutingId(),
  currentPedidoId: readCurrentPedidoId(),
  lastPedidosTab: readLastTab(),

  setOnline: (online) => {
    get().setOnlineLocal(online);
  },

  setOnlineLocal: (online) => {
    debugOnline("store alterando online local", { online });
    persistOnline(online);
    set({
      online,
      isOnline: online,
      onlineSyncError: "",
    });
  },

  setOnlineRemote: async (online) => {
    const id = get().ensureEntregadorId();
    if (!id) return get().isOnline;
    if (get().onlineSyncing) return get().isOnline;

    const previous = get().isOnline;
    pendingOnlineTarget = online;
    pendingOnlineRequestAt = Date.now();
    debugOnline("usuario solicitou toggle remoto", {
      previous,
      next: online,
      pendingOnlineRequestAt,
    });
    get().setOnlineLocal(online);
    set({
      onlineSyncing: true,
      onlineToggleTarget: online,
      onlineSyncError: "",
    });

    attachRealtime(id, get, set);

    try {
      const presence = await delivererService.setOnlineStatus(
        id,
        online,
        readDelivererIdentity()
      );

      if (presence) {
        debugOnline("rpc respondeu status remoto", {
          online: presence.online,
          updatedAt: presence.updatedAt,
        });
        applyPresenceToState(get, set, presence);
      } else {
        persistOnline(online);
        set({
          online,
          isOnline: online,
          onlineHydrated: true,
        });
      }

      pendingOnlineTarget = null;
      pendingOnlineRequestAt = 0;
      set({
        onlineSyncing: false,
        onlineToggleTarget: null,
      });
      trackMetric(
        online ? "deliverer_online_enabled" : "deliverer_online_disabled",
        {
          entregadorId: id,
        }
      );
      return get().isOnline;
    } catch (error) {
      debugOnline("falha no toggle remoto, restaurando estado anterior", {
        previous,
        next: online,
      });
      pendingOnlineTarget = null;
      pendingOnlineRequestAt = 0;
      persistOnline(previous);
      set({
        online: previous,
        isOnline: previous,
        onlineSyncing: false,
        onlineToggleTarget: null,
        onlineHydrated: true,
        onlineSyncError: normalizeSyncError(error),
      });
      throw error;
    }
  },

  hydrateOnlineStatus: async () => {
    const id = get().ensureEntregadorId();
    if (!id) return get().isOnline;

    if (get().onlineHydrated && onlineRealtimeId === id && !get().onlineSyncing) {
      debugOnline("hydrate ignorado porque estado remoto ja esta ativo", {
        currentOnline: get().isOnline,
      });
      return get().isOnline;
    }

    if (hydratePromise) {
      debugOnline("hydrate reutilizando promise em andamento");
      return hydratePromise;
    }

    attachRealtime(id, get, set);
    set({
      onlineHydrating: true,
      onlineSyncError: "",
    });

    const fallbackOnline = get().isOnline;
    debugOnline("hydrate iniciado", { fallbackOnline });

    hydratePromise = (async () => {
      try {
        let presence = await delivererService.getDelivererPresence(id);

        if (!presence) {
          debugOnline("hydrate sem registro remoto, criando presence inicial", {
            fallbackOnline,
          });
          presence = await delivererService.ensureDelivererPresence(
            id,
            fallbackOnline,
            readDelivererIdentity()
          );
        }

        if (presence) {
          applyPresenceToState(get, set, presence);
        } else {
          persistOnline(fallbackOnline);
          set({
            online: fallbackOnline,
            isOnline: fallbackOnline,
            onlineHydrated: true,
          });
        }

        set({ onlineHydrating: false });
        return get().isOnline;
      } catch (error) {
        persistOnline(fallbackOnline);
        set({
          online: fallbackOnline,
          isOnline: fallbackOnline,
          onlineHydrating: false,
          onlineHydrated: true,
          onlineSyncError: normalizeSyncError(error),
        });
        return fallbackOnline;
      } finally {
        hydratePromise = null;
      }
    })();

    return hydratePromise;
  },

  ensureEntregadorId: () => {
    const cur = get().entregadorId;
    if (cur) return cur;

    const id = readOrCreateId();
    set({ entregadorId: id });
    return id;
  },

  setEntregadorId: (entregadorId) => {
    const id = String(entregadorId || "").trim();
    if (!id) return;

    persistEntregadorId(id);
    set({ entregadorId: id });
    attachRealtime(id, get, set);
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
