import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

type MetricDetails = Record<string, unknown>;

type MetricEntry = {
  event: string;
  value: number;
  route: string;
  app_variant: string;
  platform: string;
  deliverer_id: string;
  installation_id: string;
  details: MetricDetails;
};

const REMOTE_METRICS_ENABLED =
  String(import.meta.env.VITE_ENABLE_REMOTE_METRICS || "1").trim() !== "0";
const REMOTE_BATCH_SIZE = 20;
const REMOTE_FLUSH_DELAY_MS = 1500;
const REMOTE_QUEUE_LIMIT = 100;
const SESSION_PREFIX = "cg_metric_once:";

let flushTimer: number | null = null;
let flushPromise: Promise<void> | null = null;
let hooksBound = false;
const metricQueue: MetricEntry[] = [];

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeStorageGet(key: string) {
  if (typeof window === "undefined") return "";

  try {
    return safeText(window.localStorage.getItem(key));
  } catch {
    return "";
  }
}

function currentRoute() {
  if (typeof window === "undefined") return "";
  return safeText(window.location.pathname || "");
}

function currentPlatform() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

function currentAppVariant() {
  const envVariant = safeText(import.meta.env.VITE_APP_VARIANT);
  if (envVariant) return envVariant;

  const route = currentRoute().toLowerCase();
  if (route.startsWith("/entregador")) return "entregador";
  if (route.startsWith("/admin")) return "admin";
  return "cliente";
}

function normalizeDetails(details?: unknown): MetricDetails {
  if (details == null) return {};

  if (typeof details === "object") {
    try {
      return JSON.parse(JSON.stringify(details)) as MetricDetails;
    } catch {
      return {
        value: safeText(details),
      };
    }
  }

  return {
    value: details,
  };
}

function buildEntry(event: string, value: number, details?: unknown): MetricEntry {
  return {
    event: safeText(event) || "unknown",
    value: Number.isFinite(value) && value > 0 ? Math.floor(value) : 1,
    route: currentRoute(),
    app_variant: currentAppVariant(),
    platform: currentPlatform(),
    deliverer_id: safeStorageGet("cg_deliverer_id"),
    installation_id: safeStorageGet("cg_push_installation_id"),
    details: normalizeDetails(details),
  };
}

function scheduleFlush(delay = REMOTE_FLUSH_DELAY_MS) {
  if (!REMOTE_METRICS_ENABLED || typeof window === "undefined") return;

  if (flushTimer) {
    window.clearTimeout(flushTimer);
  }

  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushRemoteMetrics();
  }, delay);
}

function enqueue(entry: MetricEntry) {
  if (!REMOTE_METRICS_ENABLED) return;

  metricQueue.push(entry);

  if (metricQueue.length > REMOTE_QUEUE_LIMIT) {
    metricQueue.splice(0, metricQueue.length - REMOTE_QUEUE_LIMIT);
  }

  if (metricQueue.length >= REMOTE_BATCH_SIZE) {
    void flushRemoteMetrics();
    return;
  }

  scheduleFlush();
}

export async function flushRemoteMetrics() {
  if (!REMOTE_METRICS_ENABLED || flushPromise || metricQueue.length === 0) {
    return flushPromise ?? Promise.resolve();
  }

  const batch = metricQueue.splice(0, REMOTE_BATCH_SIZE);

  flushPromise = (async () => {
    try {
      const { error } = await supabase.rpc("ingest_operational_metrics", {
        p_entries: batch,
      });

      if (error) {
        throw error;
      }
    } catch {
      metricQueue.unshift(...batch);
      if (metricQueue.length > REMOTE_QUEUE_LIMIT) {
        metricQueue.splice(REMOTE_QUEUE_LIMIT);
      }
      scheduleFlush(3000);
    } finally {
      flushPromise = null;
      if (metricQueue.length > 0) {
        scheduleFlush(3000);
      }
    }
  })();

  return flushPromise;
}

export function trackMetric(event: string, details?: unknown, value = 1) {
  enqueue(buildEntry(event, value, details));
}

export function trackMetricOncePerSession(event: string, details?: unknown, value = 1) {
  if (typeof window === "undefined") {
    trackMetric(event, details, value);
    return;
  }

  const key = `${SESSION_PREFIX}${safeText(event)}`;

  try {
    if (window.sessionStorage.getItem(key) === "1") {
      return;
    }

    window.sessionStorage.setItem(key, "1");
  } catch {
    // ignore
  }

  trackMetric(event, details, value);
}

export function setupMetricFlushHooks() {
  if (hooksBound || typeof window === "undefined" || typeof document === "undefined") return;
  hooksBound = true;

  window.addEventListener("pagehide", () => {
    void flushRemoteMetrics();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushRemoteMetrics();
    }
  });
}
