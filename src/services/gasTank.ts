import { queueRemoteCurrentUserDocumentSave } from "./remoteUserStateService";
import { schedulePushDispatch } from "./remotePushDispatchService";
import { readLocalUserDocumentPayload } from "./userStateSchemas";

export type GasTankState = {
  current_level: number;
  estimated_days: number;
  start_date: string;
  finish_date: string;
  last_updated: string;
  last_alert_level: "none" | "low" | "critical";
  last_delivery_order_id?: string | null;
};

export type GasEstimateSetup = {
  configured: boolean;
  average_duration_days: number;
  days_since_last_exchange: number;
  last_exchange_date: string;
  updated_at: string;
};

const STORAGE_KEY = "cg_gastank_v1";
const SETUP_KEY = "cg_gastank_setup_v1";

const DEFAULTS = {
  average_duration_days: 30,
  days_since_last_exchange: 0,
};

function now() {
  return new Date();
}

function nowIso() {
  return now().toISOString();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round(n: number, decimals = 0) {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function safeReadState(): GasTankState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GasTankState>;
    if (typeof parsed.current_level !== "number") return null;
    return {
      current_level: clamp(Number(parsed.current_level ?? 100), 0, 100),
      estimated_days: Math.max(0, Number(parsed.estimated_days ?? 0)),
      start_date: String(parsed.start_date ?? nowIso()),
      finish_date: String(parsed.finish_date ?? nowIso()),
      last_updated: String(parsed.last_updated ?? nowIso()),
      last_alert_level:
        parsed.last_alert_level === "low" || parsed.last_alert_level === "critical"
          ? parsed.last_alert_level
          : "none",
      last_delivery_order_id: String(parsed.last_delivery_order_id ?? "") || null,
    };
  } catch {
    return null;
  }
}

function safeReadSetup(): GasEstimateSetup | null {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GasEstimateSetup>;
    const averageDuration = Math.max(
      1,
      Number(parsed.average_duration_days ?? DEFAULTS.average_duration_days)
    );
    const daysSince = clamp(
      Number(parsed.days_since_last_exchange ?? DEFAULTS.days_since_last_exchange),
      0,
      averageDuration
    );

    return {
      configured: Boolean(parsed.configured),
      average_duration_days: averageDuration,
      days_since_last_exchange: daysSince,
      last_exchange_date:
        String(parsed.last_exchange_date ?? "") || computeLastExchangeDate(daysSince),
      updated_at: String(parsed.updated_at ?? nowIso()),
    };
  } catch {
    return null;
  }
}

function safeWriteState(state: GasTankState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }

  const current = readLocalUserDocumentPayload("client_gas_tank") as {
    setup?: GasEstimateSetup;
  };
  queueRemoteCurrentUserDocumentSave("client_gas_tank", {
    state,
    setup: current?.setup ?? getGasEstimateSetup(),
    updatedAt: String(state.last_updated || nowIso()),
  });
}

function safeWriteSetup(setup: GasEstimateSetup) {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    // ignore
  }

  const current = readLocalUserDocumentPayload("client_gas_tank") as {
    state?: GasTankState;
  };
  queueRemoteCurrentUserDocumentSave("client_gas_tank", {
    state: current?.state ?? getGasTank(),
    setup,
    updatedAt: String(setup.updated_at || nowIso()),
  });
}

function computeLastExchangeDate(daysSinceLastExchange: number) {
  const ref = now();
  ref.setHours(0, 0, 0, 0);
  ref.setDate(ref.getDate() - Math.max(0, Math.round(daysSinceLastExchange)));
  return ref.toISOString();
}

function computeFinishDate(lastExchangeDate: string, averageDurationDays: number) {
  const ref = new Date(lastExchangeDate);
  if (!Number.isFinite(ref.getTime())) {
    return nowIso();
  }
  ref.setDate(ref.getDate() + Math.max(1, Math.round(averageDurationDays)));
  return ref.toISOString();
}

function computeLevel(averageDurationDays: number, daysSinceLastExchange: number) {
  const duration = Math.max(1, averageDurationDays);
  const elapsed = clamp(daysSinceLastExchange, 0, duration);
  const remainingFraction = 1 - elapsed / duration;
  return clamp(round(remainingFraction * 100, 1), 0, 100);
}

function computeRemainingDays(
  averageDurationDays: number,
  daysSinceLastExchange: number
) {
  return Math.max(
    0,
    Math.ceil(Math.max(1, averageDurationDays) - clamp(daysSinceLastExchange, 0, averageDurationDays))
  );
}

function computeAlertLevel(level: number): GasTankState["last_alert_level"] {
  if (level <= 8) return "critical";
  if (level <= 20) return "low";
  return "none";
}

function buildStateFromSetup(
  setup: GasEstimateSetup,
  orderId?: string | null
): GasTankState {
  const preservedOrderId =
    orderId === undefined
      ? safeReadState()?.last_delivery_order_id ?? null
      : orderId;
  const currentLevel = computeLevel(
    setup.average_duration_days,
    setup.days_since_last_exchange
  );
  const estimatedDays = computeRemainingDays(
    setup.average_duration_days,
    setup.days_since_last_exchange
  );
  return {
    current_level: currentLevel,
    estimated_days: estimatedDays,
    start_date: setup.last_exchange_date,
    finish_date: computeFinishDate(
      setup.last_exchange_date,
      setup.average_duration_days
    ),
    last_updated: nowIso(),
    last_alert_level: computeAlertLevel(currentLevel),
    last_delivery_order_id: preservedOrderId ? String(preservedOrderId) : null,
  };
}

function createInitialSetup(): GasEstimateSetup {
  return {
    configured: false,
    average_duration_days: DEFAULTS.average_duration_days,
    days_since_last_exchange: DEFAULTS.days_since_last_exchange,
    last_exchange_date: computeLastExchangeDate(DEFAULTS.days_since_last_exchange),
    updated_at: nowIso(),
  };
}

function ensureSetup(persist = false): GasEstimateSetup {
  const existing = safeReadSetup();
  if (existing) return existing;

  const initial = createInitialSetup();
  if (persist) {
    safeWriteSetup(initial);
  }
  return initial;
}

function ensureState(persist = false): GasTankState {
  const existing = safeReadState();
  if (existing) return existing;
  const initial = buildStateFromSetup(ensureSetup(false));
  if (persist) {
    safeWriteState(initial);
  }
  return initial;
}

export function getGasEstimateSetup(): GasEstimateSetup {
  return ensureSetup(false);
}

export function hasGasEstimateSetup() {
  return ensureSetup(false).configured;
}

export function setGasUsageProfile(input: {
  averageDurationDays: number;
  daysSinceLastExchange: number;
}): GasTankState {
  const existingState = safeReadState();
  const averageDurationDays = Math.max(1, Math.round(input.averageDurationDays));
  const daysSinceLastExchange = clamp(
    Math.round(input.daysSinceLastExchange),
    0,
    averageDurationDays
  );

  const setup: GasEstimateSetup = {
    configured: true,
    average_duration_days: averageDurationDays,
    days_since_last_exchange: daysSinceLastExchange,
    last_exchange_date: computeLastExchangeDate(daysSinceLastExchange),
    updated_at: nowIso(),
  };

  safeWriteSetup(setup);
  const state = buildStateFromSetup(
    setup,
    existingState?.last_delivery_order_id ?? null
  );
  safeWriteState(state);
  schedulePushDispatch({
    reason: "client_gas_level_changed",
    limit: 10,
    scheduleReminders: true,
  });
  return state;
}

export function updateLastExchangeByDays(daysSinceLastExchange: number) {
  const setup = ensureSetup();
  return setGasUsageProfile({
    averageDurationDays: setup.average_duration_days,
    daysSinceLastExchange,
  });
}

export function setGasLevel(level: number): GasTankState {
  const setup = ensureSetup();
  const nextLevel = clamp(level, 0, 100);
  const consumedFraction = 1 - nextLevel / 100;
  const daysSince = clamp(
    round(setup.average_duration_days * consumedFraction),
    0,
    setup.average_duration_days
  );
  return setGasUsageProfile({
    averageDurationDays: setup.average_duration_days,
    daysSinceLastExchange: daysSince,
  });
}

export function syncGasTank(): GasTankState {
  const setup = ensureSetup(true);
  const lastExchange = new Date(setup.last_exchange_date);
  const elapsedDays = Number.isFinite(lastExchange.getTime())
    ? Math.max(
        0,
        (now().getTime() - lastExchange.getTime()) / (1000 * 60 * 60 * 24)
      )
    : setup.days_since_last_exchange;

  const nextSetup: GasEstimateSetup = {
    ...setup,
    days_since_last_exchange: clamp(
      round(elapsedDays),
      0,
      setup.average_duration_days
    ),
    updated_at: nowIso(),
  };

  safeWriteSetup(nextSetup);
  const nextState = buildStateFromSetup(
    nextSetup,
    ensureState(false).last_delivery_order_id ?? null
  );
  safeWriteState(nextState);
  return nextState;
}

export function resetAfterDelivery(): GasTankState {
  return resetAfterDeliveryForOrder(null);
}

export function resetAfterDeliveryForOrder(orderId?: string | null): GasTankState {
  const setup: GasEstimateSetup = {
    ...ensureSetup(true),
    configured: true,
    days_since_last_exchange: 0,
    last_exchange_date: computeLastExchangeDate(0),
    updated_at: nowIso(),
  };
  safeWriteSetup(setup);
  const state = buildStateFromSetup(setup, orderId);
  safeWriteState(state);
  return state;
}

export function syncGasTankFromDeliveredOrders(
  pedidos: Array<{ id: string; status?: string; updatedAt?: string; createdAt?: string }>
): GasTankState {
  const state = ensureState(false);
  const delivered = [...(Array.isArray(pedidos) ? pedidos : [])]
    .filter((pedido) => String(pedido?.status ?? "") === "entregue")
    .sort((a, b) => {
      const ta = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const tb = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return tb - ta;
    })[0];

  if (
    delivered?.id &&
    String(delivered.id) !== String(state.last_delivery_order_id ?? "")
  ) {
    return resetAfterDeliveryForOrder(delivered.id);
  }

  return syncGasTank();
}

export function getGasTank(): GasTankState {
  return ensureState(false);
}

export function getGasTankConfig() {
  const setup = ensureSetup(false);
  return {
    average_duration_days: setup.average_duration_days,
    days_since_last_exchange: setup.days_since_last_exchange,
  };
}

export function describeGasForecast() {
  const setup = ensureSetup(false);
  const state = ensureState(false);
  return {
    level: state.current_level,
    daysRemaining: state.estimated_days,
    finishDate: state.finish_date,
    averageDurationDays: setup.average_duration_days,
    daysSinceLastExchange: setup.days_since_last_exchange,
  };
}
