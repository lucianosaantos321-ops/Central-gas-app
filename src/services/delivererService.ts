import type { RealtimeChannel } from "@supabase/supabase-js";
import { appLogger } from "./appLogger";
import { supabase } from "./supabase";

export type DelivererPresence = {
  id: string;
  nome: string | null;
  telefone: string | null;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type DelivererIdentityPatch = {
  nome?: string | null;
  telefone?: string | null;
};

const DEBUG_DELIVERER_ONLINE =
  import.meta.env.DEV ||
  String(import.meta.env.VITE_ENABLE_DELIVERER_DEBUG || "").trim() === "1";
const DELIVERER_PRESENCE_READ_TIMEOUT_MS = 8000;
const DELIVERER_PRESENCE_WRITE_TIMEOUT_MS = 12000;
const DELIVERER_PRESENCE_CACHE_MS = 2500;

type PresenceCacheEntry = {
  value: DelivererPresence | null;
  expiresAt: number;
};

const delivererPresenceCache = new Map<string, PresenceCacheEntry>();
const delivererPresenceInflight = new Map<
  string,
  Promise<DelivererPresence | null | undefined>
>();

function debugOnline(message: string, extra?: Record<string, unknown>) {
  if (!DEBUG_DELIVERER_ONLINE) return;
  appLogger.debug("deliverer_presence", message, extra);
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  errorCode: string
): Promise<T> {
  let timer: number | null = null;

  return await Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    }),
    new Promise<T>((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error(errorCode));
      }, ms);
    }),
  ]);
}

function normalizePresence(row: any): DelivererPresence {
  return {
    id: String(row?.id ?? "").trim(),
    nome:
      typeof row?.nome === "string" && row.nome.trim() ? row.nome.trim() : null,
    telefone:
      typeof row?.telefone === "string" && row.telefone.trim()
        ? row.telefone.trim()
        : null,
    online: Boolean(row?.online),
    lastSeenAt:
      typeof row?.lastSeenAt === "string"
        ? row.lastSeenAt
        : typeof row?.last_seen_at === "string"
        ? row.last_seen_at
        : null,
    createdAt:
      typeof row?.createdAt === "string"
        ? row.createdAt
        : typeof row?.created_at === "string"
        ? row.created_at
        : null,
    updatedAt:
      typeof row?.updatedAt === "string"
        ? row.updatedAt
        : typeof row?.updated_at === "string"
        ? row.updated_at
        : null,
  };
}

function normalizePayload(data: unknown) {
  if (Array.isArray(data)) {
    return data[0] ? normalizePresence(data[0]) : null;
  }

  if (data && typeof data === "object") {
    return normalizePresence(data);
  }

  return null;
}

function readPresenceCache(entregadorId: string) {
  const entry = delivererPresenceCache.get(entregadorId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) return undefined;
  return entry.value;
}

function rememberPresenceCache(
  entregadorId: string,
  presence: DelivererPresence | null
) {
  delivererPresenceCache.set(entregadorId, {
    value: presence,
    expiresAt: Date.now() + DELIVERER_PRESENCE_CACHE_MS,
  });
}

function invalidatePresenceCache(entregadorId?: string) {
  if (entregadorId) {
    delivererPresenceCache.delete(entregadorId);
    delivererPresenceInflight.delete(entregadorId);
    return;
  }

  delivererPresenceCache.clear();
  delivererPresenceInflight.clear();
}

async function fetchDelivererPresence(
  entregadorId: string,
  force = false
): Promise<DelivererPresence | null | undefined> {
  const cached = !force ? readPresenceCache(entregadorId) : undefined;
  if (cached !== undefined) return cached;

  if (!force) {
    const inflight = delivererPresenceInflight.get(entregadorId);
    if (inflight) return inflight;
  }

  debugOnline("buscando presence remoto", { entregadorId });
  const request = (async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("get_visible_deliverer_presence", {
          p_entregador_id: entregadorId,
        }),
        DELIVERER_PRESENCE_READ_TIMEOUT_MS,
        "DELIVERER_PRESENCE_READ_TIMEOUT"
      );

      if (error) {
        appLogger.error("deliverer_presence", "fetch_presence_failed", error, {
          entregadorId,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return undefined;
      }

      const normalized = normalizePayload(data);
      rememberPresenceCache(entregadorId, normalized);
      return normalized;
    } catch (error) {
      appLogger.error("deliverer_presence", "fetch_presence_exception", error, {
        entregadorId,
      });
      return undefined;
    } finally {
      delivererPresenceInflight.delete(entregadorId);
    }
  })();

  delivererPresenceInflight.set(entregadorId, request);
  return request;
}

export const delivererService = {
  async ensureDelivererPresence(
    entregadorId: string,
    online: boolean,
    identity?: DelivererIdentityPatch
  ) {
    const id = String(entregadorId || "").trim();
    if (!id) return null;

    const existing = await fetchDelivererPresence(id);
    if (existing) return existing;

    return this.setOnlineStatus(id, online, identity);
  },

  async getDelivererPresence(entregadorId: string) {
    const id = String(entregadorId || "").trim();
    if (!id) return null;

    const row = await fetchDelivererPresence(id);
    if (row === undefined) return null;
    return row;
  },

  async getOnlineStatus(entregadorId: string) {
    const row = await this.getDelivererPresence(entregadorId);
    return row?.online ?? null;
  },

  async setOnlineStatus(
    entregadorId: string,
    online: boolean,
    _identity?: DelivererIdentityPatch
  ) {
    const id = String(entregadorId || "").trim();
    if (!id) return null;

    debugOnline("gravando status no banco", { entregadorId: id, online });
    invalidatePresenceCache(id);

    const { data, error } = await withTimeout(
      supabase.rpc("set_deliverer_online_status", {
        p_entregador_id: id,
        p_online: online,
      }),
      DELIVERER_PRESENCE_WRITE_TIMEOUT_MS,
      "DELIVERER_PRESENCE_WRITE_TIMEOUT"
    );

    if (error) {
      appLogger.error("deliverer_presence", "set_online_status_failed", error, {
        entregadorId: id,
        online,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error("Nao foi possivel sincronizar o status do entregador.");
    }

    const normalized = normalizePayload(data);
    if (normalized) {
      rememberPresenceCache(id, normalized);
      debugOnline("rpc retornou status do banco", {
        entregadorId: id,
        online: normalized.online,
        updatedAt: normalized.updatedAt,
      });
      return normalized;
    }

    const fetched = await fetchDelivererPresence(id);
    if (fetched) return fetched;

    return null;
  },

  subscribeOnlineStatus(
    entregadorId: string,
    callback: (presence: DelivererPresence | null) => void
  ) {
    const id = String(entregadorId || "").trim();
    if (!id) {
      callback(null);
      return () => undefined;
    }

    let channel: RealtimeChannel | null = null;

    try {
      channel = supabase
        .channel(`entregadores-presence-${id}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "entregadores",
            filter: `id=eq.${id}`,
          },
        (payload) => {
          const row = (payload.new as any) ?? null;
          if (row?.id) {
            rememberPresenceCache(String(row.id).trim(), normalizePresence(row));
          } else {
            invalidatePresenceCache(id);
          }
          debugOnline("evento realtime recebido", {
            entregadorId: id,
            event: payload.eventType,
            online: row?.online,
            updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
          });
          callback(row ? normalizePresence(row) : null);
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const current = await fetchDelivererPresence(id);
          debugOnline("subscribe inicial carregou snapshot remoto", {
            entregadorId: id,
            online: current?.online ?? null,
            updatedAt: current?.updatedAt ?? null,
          });
          callback(current ?? null);
        }
      });
    } catch (error) {
      appLogger.error("deliverer_presence", "subscribe_presence_failed", error, {
        entregadorId: id,
      });
    }

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  },
};
