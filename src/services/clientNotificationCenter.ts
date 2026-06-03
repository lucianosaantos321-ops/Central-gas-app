export type ClientNotificationKind = "promo" | "pedido" | "aviso" | "sistema";

export type ClientNotificationItem = {
  id: string;
  title: string;
  message: string;
  kind: ClientNotificationKind;
  route?: string | null;
  read: boolean;
  createdAt: string;
};

const STORAGE_KEY = "cg_client_notifications_v1";
const CHANGE_EVENT = "cg_client_notifications_changed";
const MAX_ITEMS = 30;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function safeRead(): ClientNotificationItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: any) => ({
        id: String(item?.id || uid()),
        title: String(item?.title || "Central Gas").trim(),
        message: String(item?.message || "").trim(),
        kind:
          item?.kind === "promo" ||
          item?.kind === "pedido" ||
          item?.kind === "aviso" ||
          item?.kind === "sistema"
            ? item.kind
            : "aviso",
        route: item?.route ? String(item.route) : null,
        read: Boolean(item?.read),
        createdAt: String(item?.createdAt || new Date().toISOString()),
      }))
      .filter((item) => item.title && item.message);
  } catch {
    return [];
  }
}

function safeWrite(items: ClientNotificationItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

function removeExpired(items: ClientNotificationItem[]) {
  const cutoff = Date.now() - MAX_AGE_MS;
  return items.filter((item) => {
    const createdAt = new Date(item.createdAt).getTime();
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
}

function normalizeKind(input?: string | null): ClientNotificationKind {
  const value = String(input || "").toLowerCase();
  if (
    value.includes("cupom") ||
    value.includes("promo") ||
    value.includes("campanha") ||
    value.includes("relampago")
  ) {
    return "promo";
  }
  if (value.includes("pedido") || value.includes("order")) return "pedido";
  return "aviso";
}

export const clientNotificationCenter = {
  subscribe(listener: () => void) {
    window.addEventListener(CHANGE_EVENT, listener);
    window.addEventListener("storage", listener);
    return () => {
      window.removeEventListener(CHANGE_EVENT, listener);
      window.removeEventListener("storage", listener);
    };
  },

  getAll() {
    const stored = safeRead();
    const fresh = removeExpired(stored);
    if (fresh.length !== stored.length) {
      safeWrite(fresh);
    }

    return fresh.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  getUnreadCount() {
    return this.getAll().filter((item) => !item.read).length;
  },

  add(input: {
    title: string;
    message: string;
    route?: string | null;
    kind?: ClientNotificationKind | string | null;
    dedupeKey?: string | null;
  }) {
    const title = String(input.title || "").trim();
    const message = String(input.message || "").trim();
    if (!title || !message) return null;

    const items = this.getAll();
    const dedupeKey = String(input.dedupeKey || "").trim();
    const signature = dedupeKey || [title, message, input.route || ""].join("|");
    const exists = items.some((item) => {
      const itemSignature = [item.title, item.message, item.route || ""].join("|");
      return itemSignature === signature;
    });
    if (exists) return items[0] ?? null;

    const next: ClientNotificationItem = {
      id: uid(),
      title,
      message,
      kind: normalizeKind(String(input.kind || `${title} ${message}`)),
      route: input.route || null,
      read: false,
      createdAt: new Date().toISOString(),
    };

    safeWrite([next, ...items]);
    return next;
  },

  markRead(id: string) {
    safeWrite(
      this.getAll().map((item) =>
        item.id === id ? { ...item, read: true } : item
      )
    );
  },

  markAllRead() {
    safeWrite(this.getAll().map((item) => ({ ...item, read: true })));
  },

  clearAll() {
    safeWrite([]);
  },
};
