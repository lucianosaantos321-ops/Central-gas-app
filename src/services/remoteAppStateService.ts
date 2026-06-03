import { supabase } from "./supabase";
import { appLogger } from "./appLogger";
import {
  APP_DOCUMENT_CONFIGS,
  type AppDocumentNamespace,
  getAppDocumentNamespaces,
  mergeDocumentPayload,
  payloadEquals,
  readLocalDocumentPayload,
  writeLocalDocumentPayload,
} from "./persistenceSchemas";
import { useRemoteSyncStore } from "../store/useRemoteSyncStore";

type AppStateRow = {
  namespace: AppDocumentNamespace;
  payload: unknown;
  updated_at?: string | null;
};

const REMOTE_APP_STATE_TIMEOUT_MS = 7000;

let publicHydrationPromise: Promise<void> | null = null;
let adminHydrationPromise: Promise<void> | null = null;
const saveQueue = new Map<AppDocumentNamespace, Promise<void>>();

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

function bumpScope(namespace: AppDocumentNamespace) {
  const config = APP_DOCUMENT_CONFIGS.find((item) => item.namespace === namespace);
  if (!config) return;

  useRemoteSyncStore.getState().bump(config.scope);
}

async function fetchRows(namespaces: AppDocumentNamespace[]) {
  const { data, error } = await withTimeout(
    supabase
      .from("app_state_documents")
      .select("namespace,payload,updated_at")
      .in("namespace", namespaces),
    REMOTE_APP_STATE_TIMEOUT_MS,
    "REMOTE_APP_STATE_FETCH_TIMEOUT"
  );

  if (error) {
    appLogger.error("remote_app_state", "fetch_rows_failed", error, {
      namespaces,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return [] as AppStateRow[];
  }

  return Array.isArray(data) ? (data as AppStateRow[]) : [];
}

async function upsertRow(namespace: AppDocumentNamespace, payload: unknown) {
  const { error } = await withTimeout(
    supabase
      .from("app_state_documents")
      .upsert(
        {
          namespace,
          payload,
        },
        {
          onConflict: "namespace",
        }
      ),
    REMOTE_APP_STATE_TIMEOUT_MS,
    "REMOTE_APP_STATE_UPSERT_TIMEOUT"
  );

  if (error) {
    appLogger.error("remote_app_state", "upsert_row_failed", error, {
      namespace,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }
}

async function hydrateByScopes(args: {
  namespaces: AppDocumentNamespace[];
  syncBack: boolean;
  scope: "public" | "admin";
}) {
  const { namespaces, syncBack, scope } = args;
  const syncStore = useRemoteSyncStore.getState();

  syncStore.setHydrating(scope, true);

  try {
    const rows = await fetchRows(namespaces);
    const remoteByNamespace = new Map<AppDocumentNamespace, AppStateRow>();

    for (const row of rows) {
      remoteByNamespace.set(row.namespace, row);
    }

    for (const namespace of namespaces) {
      const localValue = readLocalDocumentPayload(namespace);
      const remoteValue = remoteByNamespace.get(namespace)?.payload;
      const merged =
        remoteValue === undefined
          ? localValue
          : mergeDocumentPayload(namespace, localValue, remoteValue);

      writeLocalDocumentPayload(namespace, merged);
      bumpScope(namespace);

      if (syncBack && !payloadEquals(merged, remoteValue)) {
        await upsertRow(namespace, merged);
      }
    }

    syncStore.setReady(scope, true);
  } finally {
    useRemoteSyncStore.getState().setHydrating(scope, false);
  }
}

export async function hydratePublicAppState() {
  if (!publicHydrationPromise) {
    publicHydrationPromise = hydrateByScopes({
      namespaces: getAppDocumentNamespaces(["public"]),
      syncBack: false,
      scope: "public",
    }).finally(() => {
      publicHydrationPromise = null;
    });
  }

  return publicHydrationPromise;
}

export async function hydrateAdminAppState() {
  if (!adminHydrationPromise) {
    adminHydrationPromise = (async () => {
      await hydrateByScopes({
        namespaces: getAppDocumentNamespaces(["public", "admin"]),
        syncBack: true,
        scope: "admin",
      });
      useRemoteSyncStore.getState().setReady("public", true);
    })().finally(() => {
      adminHydrationPromise = null;
    });
  }

  return adminHydrationPromise;
}

export function queueRemoteDocumentSave(
  namespace: AppDocumentNamespace,
  payload: unknown
) {
  writeLocalDocumentPayload(namespace, payload);
  bumpScope(namespace);

  const previous = saveQueue.get(namespace) ?? Promise.resolve();
  const next = previous
    .catch(() => null)
    .then(() => upsertRow(namespace, payload))
    .catch((error) => {
      appLogger.error("remote_app_state", "queue_save_failed", error, {
        namespace,
      });
    });

  saveQueue.set(namespace, next);
}
