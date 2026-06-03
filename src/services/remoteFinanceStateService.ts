import { supabase } from "./supabase";
import { appLogger } from "./appLogger";
import {
  extractManualFinanceEvents,
  financeDbFromManualEvents,
  mergeManualFinanceEvents,
  normalizeManualFinanceEvent,
  readFinanceDb,
  type ManualFinanceEvent,
  type ManualFinanceEventType,
  writeFinanceDb,
} from "./financeStorage";
import { useRemoteSyncStore } from "../store/useRemoteSyncStore";

type FinanceEventRow = {
  id: string;
  entregador_id: string;
  tipo: ManualFinanceEventType;
  valor: number | string;
  observacao?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const REMOTE_FINANCE_TIMEOUT_MS = 7000;

let adminHydrationPromise: Promise<void> | null = null;
let delivererHydrationPromise: Promise<void> | null = null;
let saveQueue: Promise<void> = Promise.resolve();

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

function rowToManualEvent(row: FinanceEventRow): ManualFinanceEvent | null {
  return normalizeManualFinanceEvent({
    entregadorId: row.entregador_id,
    tipo: row.tipo,
    valor: Number(row.valor || 0),
    observacao: row.observacao ?? null,
    data: row.created_at || row.updated_at || new Date().toISOString(),
    remoteId: row.id,
  });
}

async function fetchFinanceRows() {
  const { data, error } = await withTimeout(
    supabase.rpc("list_visible_deliverer_finance_events"),
    REMOTE_FINANCE_TIMEOUT_MS,
    "REMOTE_FINANCE_FETCH_TIMEOUT"
  );

  if (error) {
    appLogger.error("remote_finance", "fetch_rows_failed", error, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return [] as FinanceEventRow[];
  }

  return Array.isArray(data) ? (data as FinanceEventRow[]) : [];
}

function syncLocalFinance(rows: FinanceEventRow[]) {
  const remoteEvents = rows
    .map(rowToManualEvent)
    .filter(Boolean) as ManualFinanceEvent[];
  const localEvents = extractManualFinanceEvents(readFinanceDb());
  const merged = mergeManualFinanceEvents(localEvents, remoteEvents);

  writeFinanceDb(financeDbFromManualEvents(merged));
  useRemoteSyncStore.getState().bump("finance");

  return { localEvents, remoteEvents, merged };
}

async function insertFinanceEvents(events: ManualFinanceEvent[]) {
  if (!events.length) return;

  const payload = events.map((item) => ({
    entregador_id: item.entregadorId,
    tipo: item.tipo,
    valor: item.valor,
    observacao: item.observacao ?? null,
    created_at: item.data,
  }));

  const { error } = await withTimeout(
    supabase.from("deliverer_finance_events").insert(payload),
    REMOTE_FINANCE_TIMEOUT_MS,
    "REMOTE_FINANCE_INSERT_TIMEOUT"
  );

  if (error) {
    appLogger.error("remote_finance", "insert_events_failed", error, {
      count: events.length,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }
}

async function hydrateFinance(syncBack: boolean) {
  useRemoteSyncStore.getState().setHydrating("finance", true);

  try {
    const rows = await fetchFinanceRows();
    const { localEvents, remoteEvents } = syncLocalFinance(rows);

    if (syncBack) {
      const remoteKeys = new Set(
        remoteEvents.map((item) =>
          `${item.entregadorId}|${item.tipo}|${item.valor}|${item.data}|${String(
            item.observacao || ""
          ).trim().toLowerCase()}`
        )
      );

      const missingLocal = localEvents.filter(
        (item) =>
          !item.remoteId &&
          !remoteKeys.has(
            `${item.entregadorId}|${item.tipo}|${item.valor}|${item.data}|${String(
              item.observacao || ""
            ).trim().toLowerCase()}`
          )
      );

      if (missingLocal.length) {
        await insertFinanceEvents(missingLocal);
        const freshRows = await fetchFinanceRows();
        syncLocalFinance(freshRows);
      }
    }

    useRemoteSyncStore.getState().setReady("finance", true);
  } finally {
    useRemoteSyncStore.getState().setHydrating("finance", false);
  }
}

export async function hydrateAdminFinanceState() {
  if (!adminHydrationPromise) {
    adminHydrationPromise = hydrateFinance(true).finally(() => {
      adminHydrationPromise = null;
    });
  }

  return adminHydrationPromise;
}

export async function hydrateDelivererFinanceState() {
  if (!delivererHydrationPromise) {
    delivererHydrationPromise = hydrateFinance(false).finally(() => {
      delivererHydrationPromise = null;
    });
  }

  return delivererHydrationPromise;
}

export function queueRemoteFinanceEventSave(input: {
  entregadorId: string;
  tipo: ManualFinanceEventType;
  valor: number;
  observacao?: string | null;
  data?: string;
}) {
  const event = normalizeManualFinanceEvent({
    entregadorId: input.entregadorId,
    tipo: input.tipo,
    valor: input.valor,
    observacao: input.observacao ?? null,
    data: input.data,
  });

  if (!event) return;

  saveQueue = saveQueue
    .catch(() => null)
    .then(() =>
      insertFinanceEvents([
        {
          ...event,
          remoteId: null,
        },
      ])
    )
    .then(() => hydrateAdminFinanceState())
    .catch((error) => {
      appLogger.error("remote_finance", "queue_save_failed", error, {
        entregadorId: input.entregadorId,
        tipo: input.tipo,
      });
    });
}
