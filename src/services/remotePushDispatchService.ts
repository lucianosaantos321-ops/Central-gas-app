import { appLogger } from "./appLogger";
import { trackMetric } from "./appMetrics";
import { supabase } from "./supabase";

type DispatchRequest = {
  reason?: string;
  limit?: number;
  scheduleReminders?: boolean;
};

const DEFAULT_DISPATCH_LIMIT = 25;
const DISPATCH_DEBOUNCE_MS = 700;
const DISPATCH_COOLDOWN_MS = 1500;
const DISPATCH_TIMEOUT_MS = 10000;
const PUSH_DISPATCH_SECRET = String(
  import.meta.env.VITE_PUSH_DISPATCH_SECRET || ""
).trim();

let dispatchTimer: number | null = null;
let dispatchPromise: Promise<boolean> | null = null;
let queuedRequest: DispatchRequest | null = null;
let lastDispatchAt = 0;

function sanitizeLimit(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_DISPATCH_LIMIT;
  return Math.min(Math.max(Math.floor(numeric), 1), 100);
}

function mergeRequests(
  base: DispatchRequest | null,
  next: DispatchRequest | null
): DispatchRequest | null {
  if (!base) return next;
  if (!next) return base;

  const reasons = [base.reason, next.reason]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return {
    reason: reasons.join(",").slice(0, 120) || undefined,
    limit: Math.max(sanitizeLimit(base.limit), sanitizeLimit(next.limit)),
    scheduleReminders:
      Boolean(base.scheduleReminders) || Boolean(next.scheduleReminders),
  };
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  errorCode: string
) {
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

async function invokeDispatch(request: DispatchRequest) {
  const { data, error } = await withTimeout(
    supabase.functions.invoke("push-dispatch", {
      body: {
        limit: sanitizeLimit(request.limit),
        schedule: Boolean(request.scheduleReminders),
      },
      headers: PUSH_DISPATCH_SECRET
        ? {
            "x-dispatch-secret": PUSH_DISPATCH_SECRET,
          }
        : undefined,
    }),
    DISPATCH_TIMEOUT_MS,
    "PUSH_DISPATCH_TIMEOUT"
  );

  if (error) {
    throw new Error(error.message || "PUSH_DISPATCH_INVOKE_FAILED");
  }

  if (data && typeof data === "object" && "ok" in data && data.ok === false) {
    throw new Error(
      String((data as { error?: unknown }).error || "PUSH_DISPATCH_FAILED")
    );
  }

  return data;
}

async function flushDispatchQueue() {
  if (dispatchPromise) return dispatchPromise;

  const request =
    queuedRequest ??
    ({
      limit: DEFAULT_DISPATCH_LIMIT,
      scheduleReminders: false,
    } satisfies DispatchRequest);
  queuedRequest = null;

  const remainingCooldown = Math.max(
    0,
    lastDispatchAt + DISPATCH_COOLDOWN_MS - Date.now()
  );

  dispatchPromise = (async () => {
    try {
      if (remainingCooldown > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingCooldown));
      }

      const response = await invokeDispatch(request);
      lastDispatchAt = Date.now();

      trackMetric("push_dispatch_success", {
        reason: request.reason || "unknown",
        scheduleReminders: Boolean(request.scheduleReminders),
      });

      appLogger.info(
        "push_dispatch",
        "invoke_success",
        "Fila de push remoto disparada com sucesso.",
        {
          reason: request.reason || null,
          response,
        }
      );

      return true;
    } catch (error) {
      lastDispatchAt = Date.now();
      trackMetric("push_dispatch_failed", {
        reason: request.reason || "unknown",
        scheduleReminders: Boolean(request.scheduleReminders),
      });
      appLogger.warn(
        "push_dispatch",
        "invoke_failed",
        "Falha ao disparar a fila remota de push.",
        {
          reason: request.reason || null,
          error,
        }
      );
      return false;
    } finally {
      dispatchPromise = null;

      if (queuedRequest) {
        schedulePushDispatch();
      }
    }
  })();

  return dispatchPromise;
}

export function schedulePushDispatch(request: DispatchRequest = {}) {
  queuedRequest = mergeRequests(queuedRequest, request) ?? request;

  if (dispatchTimer !== null) {
    window.clearTimeout(dispatchTimer);
  }

  dispatchTimer = window.setTimeout(() => {
    dispatchTimer = null;
    void flushDispatchQueue();
  }, DISPATCH_DEBOUNCE_MS);

  trackMetric("push_dispatch_queued", {
    reason: request.reason || "unknown",
    scheduleReminders: Boolean(request.scheduleReminders),
  });
}

export async function flushPushDispatch(request: DispatchRequest = {}) {
  queuedRequest = mergeRequests(queuedRequest, request) ?? request;

  if (dispatchTimer !== null) {
    window.clearTimeout(dispatchTimer);
    dispatchTimer = null;
  }

  return flushDispatchQueue();
}
