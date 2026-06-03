import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import {
  appLogger,
  flushRemoteLogs,
  setupGlobalErrorLogging,
} from "./services/appLogger";
import {
  setupMetricFlushHooks,
  trackMetricOncePerSession,
} from "./services/appMetrics";
import { subscribeRealtime } from "./services/realtimeBus";
import { setupNativeApp } from "./services/nativeApp";
import { setupRemotePushNotifications } from "./services/remotePushService";
import { hydratePublicAppState } from "./services/remoteAppStateService";
import { usePedidoStore } from "./store/usePedidoStore";
import { syncNativeAppMode } from "./utils/appMode";

declare global {
  interface Window {
    CentralGasSafeArea?: {
      getLeft?: () => number;
      getTop?: () => number;
      getRight?: () => number;
      getBottom?: () => number;
    };
  }
}

function tryRehydratePedidoStore() {
  try {
    const anyStore = usePedidoStore as any;
    anyStore?.persist?.rehydrate?.();
  } catch {
    // ignore
  }
}

let rehydrateTimer: number | null = null;

function scheduleRehydrate() {
  if (rehydrateTimer) {
    window.clearTimeout(rehydrateTimer);
  }

  rehydrateTimer = window.setTimeout(() => {
    tryRehydratePedidoStore();
    rehydrateTimer = null;
  }, 60);
}

function setupCrossTabSync() {
  tryRehydratePedidoStore();

  subscribeRealtime((ev) => {
    if (!ev) return;

    if (ev.type === "pedido_update") {
      scheduleRehydrate();
    }
  });

  window.addEventListener("storage", (e) => {
    if (e.key === "cg_pedido_store_v1") {
      scheduleRehydrate();
    }
  });
}

function setupViewportBase() {
  if (typeof document === "undefined") return;

  document.documentElement.lang = "pt-BR";
  document.documentElement.classList.add("notranslate");
  document.documentElement.setAttribute("translate", "no");
  document.body.classList.add("notranslate");
  document.body.setAttribute("translate", "no");
  document.getElementById("root")?.classList.add("notranslate");
  document.getElementById("root")?.setAttribute("translate", "no");
  document.documentElement.style.background = "#FFFFFF";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.background = "#FFFFFF";
  document.body.style.minHeight = "100vh";
  document.body.style.overscrollBehaviorY = "contain";
}

function applyNativeSafeAreaInsets() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const safeArea = window.CentralGasSafeArea;
  if (!safeArea) return;

  const readInset = (reader?: () => number, fallback = 0) => {
    try {
      const value = Number(reader?.() ?? fallback);
      return Number.isFinite(value) ? Math.max(value, fallback) : fallback;
    } catch {
      return fallback;
    }
  };

  const root = document.documentElement;
  root.style.setProperty("--app-safe-top", `${readInset(safeArea.getTop, 24)}px`);
  root.style.setProperty("--app-safe-bottom", `${readInset(safeArea.getBottom, 24)}px`);
  root.style.setProperty("--app-safe-left", `${readInset(safeArea.getLeft, 0)}px`);
  root.style.setProperty("--app-safe-right", `${readInset(safeArea.getRight, 0)}px`);
}

function setupNativeSafeAreaSync() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const sync = () => applyNativeSafeAreaInsets();
  const delays = [0, 80, 220, 480, 900];

  delays.forEach((delay) => {
    window.setTimeout(sync, delay);
  });

  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", sync);
  window.visualViewport?.addEventListener("resize", sync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sync();
    }
  });
}

function setupPublicAppStateRefresh() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const refresh = () => {
    void hydratePublicAppState().catch((error) => {
      appLogger.error("bootstrap", "hydrate_public_app_state_refresh_failed", error);
    });
  };

  const intervalId = window.setInterval(refresh, 10000);

  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  });

  window.addEventListener("pagehide", () => {
    window.clearInterval(intervalId);
  });
}

function scheduleAfterFirstPaint(work: () => void, delay = 80) {
  if (typeof window === "undefined") return;

  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
      options?: { timeout: number }
    ) => number;
  };

  if (typeof idleWindow.requestIdleCallback === "function") {
    idleWindow.requestIdleCallback(() => work(), { timeout: 1200 });
    return;
  }

  window.setTimeout(work, delay);
}

function setupLogFlushHooks() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  window.addEventListener("pagehide", () => {
    void flushRemoteLogs();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushRemoteLogs();
    }
  });
}

async function bootstrap() {
  if (typeof window !== "undefined") {
    setupGlobalErrorLogging();
    setupLogFlushHooks();
    setupMetricFlushHooks();
    setupViewportBase();
    setupNativeSafeAreaSync();
    applyNativeSafeAreaInsets();
    setupCrossTabSync();
    trackMetricOncePerSession("app_open", {
      pathname: window.location.pathname,
    });
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  if (typeof window !== "undefined") {
    scheduleAfterFirstPaint(() => {
      void syncNativeAppMode().catch((error) => {
        appLogger.error("bootstrap", "sync_native_app_mode_failed", error);
      });
    });

    scheduleAfterFirstPaint(() => {
      void hydratePublicAppState().catch((error) => {
        appLogger.error("bootstrap", "hydrate_public_app_state_failed", error);
      });
    }, 120);

    scheduleAfterFirstPaint(() => {
      setupPublicAppStateRefresh();
    }, 180);

    scheduleAfterFirstPaint(() => {
      void setupNativeApp();
    }, 160);

    scheduleAfterFirstPaint(() => {
      void setupRemotePushNotifications().catch((error) => {
        appLogger.error("bootstrap", "setup_remote_push_failed", error);
      });
    }, 220);
  }
}

void bootstrap();
