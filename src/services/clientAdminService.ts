type ClientAdminStatus = "normal" | "atencao" | "bloqueado";

type ClientAdminRecord = {
  clientKey: string;
  status: ClientAdminStatus;
  notes: string | null;
  updatedAt: string;
};

type ClientAdminDb = {
  byClientKey: Record<string, ClientAdminRecord>;
};

const STORAGE_KEY = "cg_admin_client_control_v1";

function now() {
  return new Date().toISOString();
}

function safeRead(): ClientAdminDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byClientKey: {} };

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { byClientKey: {} };

    return {
      byClientKey:
        parsed.byClientKey && typeof parsed.byClientKey === "object"
          ? parsed.byClientKey
          : {},
    };
  } catch {
    return { byClientKey: {} };
  }
}

function safeWrite(db: ClientAdminDb) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore
  }
}

function normalizeClientKey(clientKey: string) {
  return String(clientKey || "").trim();
}

export const clientAdminService = {
  get(clientKey: string) {
    const key = normalizeClientKey(clientKey);
    const db = safeRead();
    const item = db.byClientKey[key];

    return {
      clientKey: key,
      status: (item?.status || "normal") as ClientAdminStatus,
      notes: item?.notes ?? null,
      updatedAt: item?.updatedAt ?? null,
    };
  },

  setStatus(clientKey: string, status: ClientAdminStatus) {
    const key = normalizeClientKey(clientKey);
    if (!key) return null;

    const db = safeRead();
    const current = db.byClientKey[key];

    db.byClientKey[key] = {
      clientKey: key,
      status,
      notes: current?.notes ?? null,
      updatedAt: now(),
    };

    safeWrite(db);
    return db.byClientKey[key];
  },

  setNotes(clientKey: string, notes: string | null) {
    const key = normalizeClientKey(clientKey);
    if (!key) return null;

    const db = safeRead();
    const current = db.byClientKey[key];

    db.byClientKey[key] = {
      clientKey: key,
      status: (current?.status || "normal") as ClientAdminStatus,
      notes: notes?.trim() || null,
      updatedAt: now(),
    };

    safeWrite(db);
    return db.byClientKey[key];
  },

  getAll() {
    const db = safeRead();
    return Object.values(db.byClientKey || {}).sort(
      (a, b) =>
        new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );
  },
};