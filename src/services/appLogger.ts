import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

export type AppLogLevel = "debug" | "info" | "warn" | "error";

type SerializableDetails = Record<string, unknown>;

type AppLogEntry = {
  level: AppLogLevel;
  category: string;
  event: string;
  message: string;
  route: string;
  app_variant: string;
  platform: string;
  deliverer_id: string;
  installation_id: string;
  details: SerializableDetails;
};

type AppLoggerOptions = {
  persist?: boolean;
};

const DEBUG_LOGS_ENABLED =
  import.meta.env.DEV ||
  String(import.meta.env.VITE_ENABLE_DEBUG_LOGS || "").trim() === "1";
const REMOTE_LOGS_ENABLED =
  String(import.meta.env.VITE_ENABLE_REMOTE_LOGS || "1").trim() !== "0";
const REMOTE_BATCH_SIZE = 20;
const REMOTE_FLUSH_DELAY_MS = 1500;
const REMOTE_QUEUE_LIMIT = 100;
const REMOTE_PERSIST_LEVELS = new Set<AppLogLevel>(["warn", "error"]);

let flushTimer: number | null = null;
let flushPromise: Promise<void> | null = null;
let globalListenersBound = false;
const remoteQueue: AppLogEntry[] = [];

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

function normalizeDetails(details?: unknown): SerializableDetails {
  if (details instanceof Error) {
    return {
      message: details.message,
      stack: details.stack ?? null,
      name: details.name,
    };
  }

  if (details == null) return {};

  if (typeof details === "object") {
    try {
      return JSON.parse(
        JSON.stringify(details, (_key, value) => {
          if (value instanceof Error) {
            return {
              message: value.message,
              stack: value.stack ?? null,
              name: value.name,
            };
          }
          return value;
        })
      ) as SerializableDetails;
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

function buildEntry(
  level: AppLogLevel,
  category: string,
  event: string,
  message: string,
  details?: unknown
): AppLogEntry {
  return {
    level,
    category: safeText(category) || "app",
    event: safeText(event) || "event",
    message: safeText(message),
    route: currentRoute(),
    app_variant: currentAppVariant(),
    platform: currentPlatform(),
    deliverer_id: safeStorageGet("cg_deliverer_id"),
    installation_id: safeStorageGet("cg_push_installation_id"),
    details: normalizeDetails(details),
  };
}

function writeConsole(entry: AppLogEntry) {
  if (entry.level === "debug" && !DEBUG_LOGS_ENABLED) return;
  if (entry.level === "info" && !DEBUG_LOGS_ENABLED) return;

  const prefix = `[cg-log:${entry.category}:${entry.event}]`;
  const hasDetails = Object.keys(entry.details).length > 0;

  if (entry.level === "error") {
    if (hasDetails) {
      console.error(prefix, entry.message, entry.details);
      return;
    }
    console.error(prefix, entry.message);
    return;
  }

  if (entry.level === "warn") {
    if (hasDetails) {
      console.warn(prefix, entry.message, entry.details);
      return;
    }
    console.warn(prefix, entry.message);
    return;
  }

  if (hasDetails) {
    console.log(prefix, entry.message, entry.details);
    return;
  }

  console.log(prefix, entry.message);
}

function scheduleFlush(delay = REMOTE_FLUSH_DELAY_MS) {
  if (!REMOTE_LOGS_ENABLED || typeof window === "undefined") return;

  if (flushTimer) {
    window.clearTimeout(flushTimer);
  }

  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushRemoteLogs();
  }, delay);
}

function enqueueRemote(entry: AppLogEntry) {
  if (!REMOTE_LOGS_ENABLED) return;

  remoteQueue.push(entry);

  if (remoteQueue.length > REMOTE_QUEUE_LIMIT) {
    remoteQueue.splice(0, remoteQueue.length - REMOTE_QUEUE_LIMIT);
  }

  if (remoteQueue.length >= REMOTE_BATCH_SIZE) {
    void flushRemoteLogs();
    return;
  }

  scheduleFlush();
}

export async function flushRemoteLogs() {
  if (!REMOTE_LOGS_ENABLED || flushPromise || remoteQueue.length === 0) {
    return flushPromise ?? Promise.resolve();
  }

  const batch = remoteQueue.splice(0, REMOTE_BATCH_SIZE);

  flushPromise = (async () => {
    try {
      const { error } = await supabase.rpc("ingest_operational_logs", {
        p_entries: batch,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      remoteQueue.unshift(...batch);
      if (remoteQueue.length > REMOTE_QUEUE_LIMIT) {
        remoteQueue.splice(REMOTE_QUEUE_LIMIT);
      }

      if (DEBUG_LOGS_ENABLED) {
        console.warn("[cg-log] remote flush failed", error);
      }
    } finally {
      flushPromise = null;
      if (remoteQueue.length > 0) {
        scheduleFlush(3000);
      }
    }
  })();

  return flushPromise;
}

function log(
  level: AppLogLevel,
  category: string,
  event: string,
  message: string,
  details?: unknown,
  options: AppLoggerOptions = {}
) {
  const entry = buildEntry(level, category, event, message, details);
  writeConsole(entry);

  if (options.persist || REMOTE_PERSIST_LEVELS.has(level)) {
    enqueueRemote(entry);
  }
}

function errorMessageFromUnknown(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected error";
}

export const appLogger = {
  debug(category: string, event: string, details?: unknown) {
    log("debug", category, event, "", details);
  },
  info(
    category: string,
    event: string,
    message: string,
    details?: unknown,
    options: AppLoggerOptions = {}
  ) {
    log("info", category, event, message, details, options);
  },
  warn(
    category: string,
    event: string,
    message: string,
    details?: unknown,
    options: AppLoggerOptions = {}
  ) {
    log("warn", category, event, message, details, {
      persist: true,
      ...options,
    });
  },
  error(
    category: string,
    event: string,
    error: unknown,
    details?: unknown,
    options: AppLoggerOptions = {}
  ) {
    log("error", category, event, errorMessageFromUnknown(error), {
      error: normalizeDetails(error),
      context: normalizeDetails(details),
    }, {
      persist: true,
      ...options,
    });
  },
  audit(
    category: string,
    event: string,
    message: string,
    details?: unknown
  ) {
    log("info", category, event, message, details, {
      persist: true,
    });
  },
};

export function setupGlobalErrorLogging() {
  if (globalListenersBound || typeof window === "undefined") return;
  globalListenersBound = true;

  window.addEventListener("error", (event) => {
    appLogger.error("runtime", "window_error", event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    appLogger.error("runtime", "unhandled_rejection", event.reason, {});
  });
}
