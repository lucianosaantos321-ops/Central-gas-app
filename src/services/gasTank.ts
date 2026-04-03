export type GasTankState = {
  current_level: number; // 0..100
  estimated_days: number; // estimativa simples (placeholder premium)
  start_date: string; // ISO
  last_updated: string; // ISO
  last_alert_level: "none" | "low" | "critical";
};

const STORAGE_KEY = "cg_gastank_v1";

/**
 * Regras (local-first, previsível):
 * - Nível começa em 100% quando reseta.
 * - Consumo diário simples: padrão 6% ao dia (ajustável).
 * - estimated_days: baseado no consumo diário.
 * - Alertas sem spam: só muda quando cruza limiares.
 */
const DEFAULTS = {
  initial_level: 72,
  daily_consumption_percent: 6, // 6%/dia => ~16 dias de 100% a 0%
  low_threshold: 15,
  critical_threshold: 8,
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function nowIso() {
  return new Date().toISOString();
}

function safeRead(): GasTankState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GasTankState>;
    if (typeof parsed.current_level !== "number") return null;

    const state: GasTankState = {
      current_level: clamp(parsed.current_level ?? DEFAULTS.initial_level, 0, 100),
      estimated_days: Math.max(0, Number(parsed.estimated_days ?? 0)),
      start_date: String(parsed.start_date ?? nowIso()),
      last_updated: String(parsed.last_updated ?? nowIso()),
      last_alert_level: (parsed.last_alert_level as any) || "none",
    };
    return state;
  } catch {
    return null;
  }
}

function safeWrite(state: GasTankState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function daysBetween(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const diff = b - a;
  return Math.max(0, diff / (1000 * 60 * 60 * 24));
}

function computeEstimatedDays(level: number) {
  const daily = DEFAULTS.daily_consumption_percent;
  if (daily <= 0) return 999;
  return Math.max(0, Math.round(level / daily));
}

function computeAlertLevel(level: number): GasTankState["last_alert_level"] {
  if (level <= DEFAULTS.critical_threshold) return "critical";
  if (level <= DEFAULTS.low_threshold) return "low";
  return "none";
}

function ensureState(): GasTankState {
  const existing = safeRead();
  if (existing) return existing;

  const initial: GasTankState = {
    current_level: clamp(DEFAULTS.initial_level, 0, 100),
    estimated_days: computeEstimatedDays(DEFAULTS.initial_level),
    start_date: nowIso(),
    last_updated: nowIso(),
    last_alert_level: computeAlertLevel(DEFAULTS.initial_level),
  };
  safeWrite(initial);
  return initial;
}

/**
 * Atualiza o estado aplicando consumo diário desde last_updated até agora.
 * Chame isso no carregamento de Home/Monitorar para manter o nível coerente.
 */
export function syncGasTank(): GasTankState {
  const state = ensureState();

  const now = nowIso();
  const elapsedDays = daysBetween(state.last_updated, now);

  if (elapsedDays <= 0) {
    // nada a fazer, mas garante estimativa atual
    const refreshed: GasTankState = {
      ...state,
      estimated_days: computeEstimatedDays(state.current_level),
    };
    safeWrite(refreshed);
    return refreshed;
  }

  const daily = DEFAULTS.daily_consumption_percent;
  const consumed = elapsedDays * daily;

  const nextLevel = clamp(state.current_level - consumed, 0, 100);
  const nextAlert = computeAlertLevel(nextLevel);

  // evita spam: só "registra" mudança de nível de alerta quando muda
  const updated: GasTankState = {
    ...state,
    current_level: Number(nextLevel.toFixed(1)),
    estimated_days: computeEstimatedDays(nextLevel),
    last_updated: now,
    last_alert_level: nextAlert,
  };

  safeWrite(updated);
  return updated;
}

/**
 * Permite ajuste manual (ex: usuário diz "troquei o botijão", ou calibrar).
 */
export function setGasLevel(level: number): GasTankState {
  const state = ensureState();
  const nextLevel = clamp(level, 0, 100);
  const updated: GasTankState = {
    ...state,
    current_level: nextLevel,
    estimated_days: computeEstimatedDays(nextLevel),
    last_updated: nowIso(),
    last_alert_level: computeAlertLevel(nextLevel),
  };
  safeWrite(updated);
  return updated;
}

/**
 * Reset premium: quando pedido é entregue (completed/entregue),
 * normalmente significa botijão novo => volta para 100%.
 */
export function resetAfterDelivery(): GasTankState {
  const updated: GasTankState = {
    current_level: 100,
    estimated_days: computeEstimatedDays(100),
    start_date: nowIso(),
    last_updated: nowIso(),
    last_alert_level: "none",
  };
  safeWrite(updated);
  return updated;
}

/**
 * Apenas leitura (sem sync). Use syncGasTank() em telas para atualizar.
 */
export function getGasTank(): GasTankState {
  return ensureState();
}

/**
 * Limiar / config (por enquanto fixo). Futuro: Admin controla via Supabase.
 */
export function getGasTankConfig() {
  return { ...DEFAULTS };
}