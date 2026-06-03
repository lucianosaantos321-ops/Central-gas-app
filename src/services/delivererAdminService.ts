import { queueRemoteDocumentSave } from "./remoteAppStateService";

type ManualDelivererAdminState = {
  byDeliverer: Record<
    string,
    {
      manualBlocked: boolean;
      manualBlockReason: string | null;
      updatedAt: string;
    }
  >;
};

const STORAGE_KEY = "cg_admin_deliverer_control_v1";

function now() {
  return new Date().toISOString();
}

function normalizeId(id: string) {
  return String(id || "").trim();
}

function safeRead(): ManualDelivererAdminState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byDeliverer: {} };

    const parsed = JSON.parse(raw);
    return {
      byDeliverer:
        parsed && typeof parsed === "object" && parsed.byDeliverer && typeof parsed.byDeliverer === "object"
          ? parsed.byDeliverer
          : {},
    };
  } catch {
    return { byDeliverer: {} };
  }
}

function safeWrite(value: ManualDelivererAdminState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export const delivererAdminService = {
  getState(entregadorId: string) {
    const id = normalizeId(entregadorId);
    const db = safeRead();
    const item = db.byDeliverer[id];

    return {
      entregadorId: id,
      manualBlocked: Boolean(item?.manualBlocked),
      manualBlockReason: item?.manualBlockReason ?? null,
      updatedAt: item?.updatedAt ?? null,
    };
  },

  setManualBlock(entregadorId: string, reason?: string | null) {
    const id = normalizeId(entregadorId);
    if (!id) return;

    const db = safeRead();
    db.byDeliverer[id] = {
      manualBlocked: true,
      manualBlockReason: reason?.trim() || "Bloqueio manual do ADM",
      updatedAt: now(),
    };
    safeWrite(db);
    queueRemoteDocumentSave("deliverer_admin_controls", db);
  },

  clearManualBlock(entregadorId: string) {
    const id = normalizeId(entregadorId);
    if (!id) return;

    const db = safeRead();
    db.byDeliverer[id] = {
      manualBlocked: false,
      manualBlockReason: null,
      updatedAt: now(),
    };
    safeWrite(db);
    queueRemoteDocumentSave("deliverer_admin_controls", db);
  },

  getAll() {
    const db = safeRead();

    return Object.entries(db.byDeliverer).map(([entregadorId, item]) => ({
      entregadorId,
      manualBlocked: Boolean(item?.manualBlocked),
      manualBlockReason: item?.manualBlockReason ?? null,
      updatedAt: item?.updatedAt ?? null,
    }));
  },
};
