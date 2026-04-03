import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { subscribeRealtime } from "./services/realtimeBus";
import { setupNativeApp } from "./services/nativeApp";
import { usePedidoStore } from "./store/usePedidoStore";

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

  document.documentElement.style.background = "#F5F5F5";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.background = "#F5F5F5";
  document.body.style.minHeight = "100vh";
  document.body.style.overscrollBehaviorY = "contain";
}

if (typeof window !== "undefined") {
  setupViewportBase();
  setupCrossTabSync();
  void setupNativeApp();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);