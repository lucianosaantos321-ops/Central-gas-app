import type { DelivererFinancialState, FinanceHistoryItem } from "../types";

export type ManualFinanceEventType = "pagamento" | "ajuste";

export type ManualFinanceEvent = FinanceHistoryItem & {
  entregadorId: string;
  tipo: ManualFinanceEventType;
  remoteId?: string | null;
};

export type StoredFinanceHistoryItem = FinanceHistoryItem & {
  remoteId?: string | null;
};

export type FinanceDb = {
  byDeliverer: Record<
    string,
    DelivererFinancialState & {
      historico: StoredFinanceHistoryItem[];
    }
  >;
};

export const FINANCE_STORAGE_KEY = "cg_finance_state_v2";

function now() {
  return new Date().toISOString();
}

function normalizeId(value: unknown) {
  return String(value ?? "").trim();
}

function round2(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeTimeKey(value: unknown) {
  const date = new Date(String(value || "").trim());
  if (!Number.isFinite(date.getTime())) return "";

  date.setMilliseconds(0);
  return date.toISOString();
}

export function readFinanceDb(): FinanceDb {
  try {
    const raw = localStorage.getItem(FINANCE_STORAGE_KEY);
    if (!raw) return { byDeliverer: {} };

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { byDeliverer: {} };

    return {
      byDeliverer:
        parsed.byDeliverer && typeof parsed.byDeliverer === "object"
          ? parsed.byDeliverer
          : {},
    };
  } catch {
    return { byDeliverer: {} };
  }
}

export function writeFinanceDb(db: FinanceDb) {
  try {
    localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore
  }
}

export function createEmptyFinanceState(
  entregadorId: string
): DelivererFinancialState & {
  historico: StoredFinanceHistoryItem[];
} {
  return {
    entregadorId,
    saldoDevedor: 0,
    limiteBloqueio: 300,
    bloqueado: false,
    updatedAt: now(),
    historico: [],
  };
}

export function ensureFinanceDeliverer(db: FinanceDb, entregadorId: string) {
  const id = normalizeId(entregadorId);
  if (!id) return null;

  if (!db.byDeliverer[id]) {
    db.byDeliverer[id] = createEmptyFinanceState(id);
  }

  return db.byDeliverer[id];
}

export function normalizeManualFinanceEvent(
  input: Partial<ManualFinanceEvent> & { entregadorId: string }
): ManualFinanceEvent | null {
  const entregadorId = normalizeId(input.entregadorId);
  if (!entregadorId) return null;

  const tipo = input.tipo === "pagamento" ? "pagamento" : input.tipo === "ajuste" ? "ajuste" : null;
  if (!tipo) return null;

  const valorBase = Number(input.valor || 0);
  if (!Number.isFinite(valorBase) || valorBase === 0) return null;

  const valor =
    tipo === "pagamento" ? Math.abs(round2(valorBase)) : round2(valorBase);

  return {
    entregadorId,
    tipo,
    valor,
    observacao: String(input.observacao || "").trim() || null,
    data: String(input.data || now()),
    remoteId: normalizeId(input.remoteId || "") || null,
  };
}

function manualEventKey(event: ManualFinanceEvent) {
  return [
    normalizeId(event.entregadorId),
    event.tipo,
    round2(Number(event.valor || 0)),
    normalizeTimeKey(event.data),
    String(event.observacao || "").trim().toLowerCase(),
  ].join("|");
}

export function mergeManualFinanceEvents(
  localEvents: ManualFinanceEvent[],
  remoteEvents: ManualFinanceEvent[]
) {
  const map = new Map<string, ManualFinanceEvent>();

  const apply = (items: ManualFinanceEvent[]) => {
    for (const item of items) {
      const normalized = normalizeManualFinanceEvent(item);
      if (!normalized) continue;

      const key = manualEventKey(normalized);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, normalized);
        continue;
      }

      const existingTime = Date.parse(existing.data);
      const incomingTime = Date.parse(normalized.data);
      if (normalized.remoteId && !existing.remoteId) {
        map.set(key, normalized);
        continue;
      }

      if (normalized.remoteId && existing.remoteId) {
        if (Number.isFinite(incomingTime) && incomingTime >= existingTime) {
          map.set(key, normalized);
        }
        continue;
      }

      if (Number.isFinite(incomingTime) && incomingTime >= existingTime) {
        map.set(key, normalized);
      }
    }
  };

  apply(localEvents);
  apply(remoteEvents);

  return Array.from(map.values()).sort(
    (a, b) => Date.parse(b.data) - Date.parse(a.data)
  );
}

export function extractManualFinanceEvents(db: FinanceDb) {
  const items: ManualFinanceEvent[] = [];

  for (const [entregadorId, state] of Object.entries(db.byDeliverer || {})) {
    const historico = Array.isArray(state?.historico) ? state.historico : [];
    for (const entry of historico) {
      if (entry?.tipo !== "pagamento" && entry?.tipo !== "ajuste") continue;

      const normalized = normalizeManualFinanceEvent({
        entregadorId,
        tipo: entry.tipo,
        valor: Number(entry.valor || 0),
        observacao: entry.observacao ?? null,
        data: entry.data,
        remoteId: (entry as any)?.remoteId ?? null,
      });

      if (normalized) {
        items.push(normalized);
      }
    }
  }

  return mergeManualFinanceEvents(items, []);
}

export function financeDbFromManualEvents(events: ManualFinanceEvent[]) {
  const db: FinanceDb = { byDeliverer: {} };

  for (const item of events) {
    const normalized = normalizeManualFinanceEvent(item);
    if (!normalized) continue;

    const state =
      ensureFinanceDeliverer(db, normalized.entregadorId) ??
      createEmptyFinanceState(normalized.entregadorId);

    state.historico.unshift({
      tipo: normalized.tipo,
      valor: normalized.valor,
      observacao: normalized.observacao,
      data: normalized.data,
      remoteId: normalized.remoteId ?? null,
    });

    db.byDeliverer[normalized.entregadorId] = {
      ...state,
      historico: [...state.historico].sort(
        (a, b) => Date.parse(b.data) - Date.parse(a.data)
      ),
      updatedAt: state.updatedAt || now(),
    };
  }

  return db;
}

export function appendManualFinanceEvent(
  db: FinanceDb,
  input: Partial<ManualFinanceEvent> & { entregadorId: string }
) {
  const normalized = normalizeManualFinanceEvent(input);
  if (!normalized) return null;

  const state = ensureFinanceDeliverer(db, normalized.entregadorId);
  if (!state) return null;

  state.historico.unshift({
    tipo: normalized.tipo,
    valor: normalized.valor,
    observacao: normalized.observacao,
    data: normalized.data,
    remoteId: normalized.remoteId ?? null,
  });
  state.updatedAt = now();

  db.byDeliverer[normalized.entregadorId] = {
    ...state,
    historico: [...state.historico].sort(
      (a, b) => Date.parse(b.data) - Date.parse(a.data)
    ),
  };

  return normalized;
}
