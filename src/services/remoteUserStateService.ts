import { supabase } from "./supabase";
import { appLogger } from "./appLogger";
import { useRemoteSyncStore } from "../store/useRemoteSyncStore";
import {
  applyIdentityToUserDocument,
  getDefaultUserDocumentPayload,
  hasMeaningfulUserDocument,
  mergeUserDocumentPayload,
  payloadEquals,
  readLocalUserDocumentPayload,
  type ClientProfileDocument,
  type DelivererProfileDocument,
  type UserStateNamespace,
  writeLocalUserDocumentPayload,
} from "./userStateSchemas";

type HydratableProfile = {
  authUserId: string;
  role: "cliente" | "entregador" | "admin";
  displayName: string | null;
  phone: string | null;
};

type UserStateRow = {
  namespace: UserStateNamespace;
  payload: unknown;
  updated_at?: string | null;
};

const REMOTE_USER_STATE_TIMEOUT_MS = 7000;
const CURRENT_USER_ID_CACHE_MS = 15000;

const saveQueue = new Map<string, Promise<void>>();
let currentUserIdCache:
  | {
      value: string | null;
      expiresAt: number;
    }
  | null = null;

function now() {
  return new Date().toISOString();
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
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
      timer = window.setTimeout(() => reject(new Error(errorCode)), ms);
    }),
  ]);
}

function bumpUserState() {
  useRemoteSyncStore.getState().bump("public");
}

function getNamespacesForRole(role: HydratableProfile["role"]) {
  if (role === "cliente") {
    return [
      "client_profile",
      "client_addresses",
      "client_gas_tank",
    ] satisfies UserStateNamespace[];
  }

  if (role === "entregador") {
    return ["deliverer_profile"] satisfies UserStateNamespace[];
  }

  return [] satisfies UserStateNamespace[];
}

async function resolveCurrentUserId() {
  if (currentUserIdCache && currentUserIdCache.expiresAt > Date.now()) {
    return currentUserIdCache.value;
  }

  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    REMOTE_USER_STATE_TIMEOUT_MS,
    "REMOTE_USER_STATE_SESSION_TIMEOUT"
  );
  if (error) {
    appLogger.error("remote_user_state", "resolve_current_user_failed", error);
    return null;
  }

  const authUserId = normalizeText(data.session?.user?.id) || null;
  currentUserIdCache = {
    value: authUserId,
    expiresAt: Date.now() + CURRENT_USER_ID_CACHE_MS,
  };
  return authUserId;
}

async function fetchRows(
  authUserId: string,
  namespaces: UserStateNamespace[]
) {
  if (!authUserId || namespaces.length === 0) return [] as UserStateRow[];

  const { data, error } = await withTimeout(
    supabase
      .from("user_state_documents")
      .select("namespace,payload,updated_at")
      .eq("auth_user_id", authUserId)
      .in("namespace", namespaces),
    REMOTE_USER_STATE_TIMEOUT_MS,
    "REMOTE_USER_STATE_FETCH_TIMEOUT"
  );

  if (error) {
    appLogger.error("remote_user_state", "fetch_rows_failed", error, {
      authUserId,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return [] as UserStateRow[];
  }

  return Array.isArray(data) ? (data as UserStateRow[]) : [];
}

async function upsertRow(
  authUserId: string,
  namespace: UserStateNamespace,
  payload: unknown
) {
  const { error } = await withTimeout(
    supabase
      .from("user_state_documents")
      .upsert(
        {
          auth_user_id: authUserId,
          namespace,
          payload,
        },
        {
          onConflict: "auth_user_id,namespace",
        }
      ),
    REMOTE_USER_STATE_TIMEOUT_MS,
    "REMOTE_USER_STATE_UPSERT_TIMEOUT"
  );

  if (error) {
    appLogger.error("remote_user_state", "upsert_row_failed", error, {
      authUserId,
      namespace,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }
}

async function syncIdentityFields(
  authUserId: string,
  identity: { nome?: string | null; telefone?: string | null }
) {
  const patch: Record<string, string | null> = {};

  if ("nome" in identity) {
    patch.display_name = normalizeText(identity.nome) || null;
  }

  if ("telefone" in identity) {
    patch.phone = normalizeText(identity.telefone) || null;
  }

  if (Object.keys(patch).length === 0) return;

  const { error } = await withTimeout(
    supabase
      .from("user_profiles")
      .update({
        ...patch,
        updated_at: now(),
      })
      .eq("auth_user_id", authUserId),
    REMOTE_USER_STATE_TIMEOUT_MS,
    "REMOTE_USER_STATE_PROFILE_SYNC_TIMEOUT"
  );

  if (error) {
    appLogger.error("remote_user_state", "sync_identity_failed", error, {
      authUserId,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }
}

function queueSave(
  authUserId: string,
  namespace: UserStateNamespace,
  work: () => Promise<void>
) {
  const key = `${authUserId}:${namespace}`;
  const previous = saveQueue.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => null)
    .then(work)
    .catch((error) => {
      appLogger.error("remote_user_state", "queue_save_failed", error, {
        authUserId,
        namespace,
      });
    });

  saveQueue.set(key, next);
}

function buildIdentityForNamespace(
  namespace: UserStateNamespace,
  profile: HydratableProfile
) {
  if (namespace === "client_profile" || namespace === "deliverer_profile") {
    return {
      nome: profile.displayName,
      telefone: profile.phone,
    };
  }

  return null;
}

export async function hydrateUserStateForProfile(profile: HydratableProfile | null) {
  if (!profile) return;

  const authUserId = normalizeText(profile.authUserId);
  const namespaces = getNamespacesForRole(profile.role);

  if (!authUserId || namespaces.length === 0) return;

  try {
    const rows = await fetchRows(authUserId, namespaces);
    const remoteByNamespace = new Map<UserStateNamespace, UserStateRow>();

    for (const row of rows) {
      remoteByNamespace.set(row.namespace, row);
    }

    for (const namespace of namespaces) {
      const localValue = readLocalUserDocumentPayload(namespace);
      const remoteValue = remoteByNamespace.get(namespace)?.payload;
      const mergedBase =
        remoteValue === undefined
          ? localValue
          : mergeUserDocumentPayload(namespace, localValue, remoteValue);
      const identity = buildIdentityForNamespace(namespace, profile);
      const merged = identity
        ? applyIdentityToUserDocument(namespace, mergedBase, identity)
        : mergedBase;

      writeLocalUserDocumentPayload(namespace, merged);
      bumpUserState();

      if (hasMeaningfulUserDocument(namespace, merged) && !payloadEquals(merged, remoteValue)) {
        await upsertRow(authUserId, namespace, merged);
      }
    }
  } catch (error) {
    appLogger.error("remote_user_state", "hydrate_profile_failed", error, {
      profile,
    });
  }
}

export function queueRemoteCurrentUserDocumentSave(
  namespace: UserStateNamespace,
  payload?: unknown
) {
  const nextPayload = payload ?? readLocalUserDocumentPayload(namespace);
  writeLocalUserDocumentPayload(namespace, nextPayload);
  bumpUserState();

  void resolveCurrentUserId().then((authUserId) => {
    if (!authUserId) return;

    queueSave(authUserId, namespace, async () => {
      await upsertRow(authUserId, namespace, nextPayload);
    });
  });
}

export function saveClientProfilePatch(
  patch: Partial<ClientProfileDocument>
) {
  const current = readLocalUserDocumentPayload("client_profile") as ClientProfileDocument;
  const next: ClientProfileDocument = {
    ...current,
    ...patch,
    updatedAt: now(),
  };

  writeLocalUserDocumentPayload("client_profile", next);
  bumpUserState();

  void resolveCurrentUserId().then((authUserId) => {
    if (!authUserId) return;

    queueSave(authUserId, "client_profile", async () => {
      await syncIdentityFields(authUserId, {
        nome: next.nome,
        telefone: next.telefone,
      });
      await upsertRow(authUserId, "client_profile", next);
    });
  });

  return next;
}

export function saveDelivererProfilePatch(
  patch: Partial<DelivererProfileDocument>
) {
  const current = readLocalUserDocumentPayload("deliverer_profile") as DelivererProfileDocument;
  const next: DelivererProfileDocument = {
    ...current,
    ...patch,
    updatedAt: now(),
  };

  writeLocalUserDocumentPayload("deliverer_profile", next);
  bumpUserState();

  void resolveCurrentUserId().then((authUserId) => {
    if (!authUserId) return;

    queueSave(authUserId, "deliverer_profile", async () => {
      await syncIdentityFields(authUserId, {
        nome: next.nome,
        telefone: next.telefone,
      });
      await upsertRow(authUserId, "deliverer_profile", next);
    });
  });

  return next;
}

export function ensureUserDocumentLocalDefaults() {
  const namespaces: UserStateNamespace[] = [
    "client_profile",
    "client_addresses",
    "client_gas_tank",
    "deliverer_profile",
  ];

  for (const namespace of namespaces) {
    const current = readLocalUserDocumentPayload(namespace);
    const fallback = getDefaultUserDocumentPayload(namespace);
    const value =
      hasMeaningfulUserDocument(namespace, current) || namespace === "client_gas_tank"
        ? current
        : fallback;
    writeLocalUserDocumentPayload(namespace, value);
  }
}
