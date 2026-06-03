// src/services/realtimeBus.ts

import type { NativeToastOptions } from "./nativeNotifications";

export type ToastVariant = "info" | "success" | "warning" | "error";

export type ToastPayload = {
  type: "toast";
  title: string;
  message: string;
  variant: ToastVariant;
};

export type PedidoUpdatePayload = {
  type: "pedido_update";
  pedidoId?: string;
};

export type PedidoLockPayload = {
  type: "pedido_lock";
  pedidoId: string;
  delivererId: string;
};

export type PedidoUnlockPayload = {
  type: "pedido_unlock";
  pedidoId: string;
};

export type RealtimeEvent =
  | ToastPayload
  | PedidoUpdatePayload
  | PedidoLockPayload
  | PedidoUnlockPayload;

type Listener = (event: RealtimeEvent) => void;

const CHANNEL_NAME = "cg_realtime_channel";

let channel: BroadcastChannel | null = null;
const listeners = new Set<Listener>();
const RECENT_TOAST_WINDOW_MS = 2200;
const recentToastSignatures = new Map<string, number>();

function notify(event: RealtimeEvent) {
  listeners.forEach((listener) => {
    listener(event);
  });
}

if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (event: MessageEvent<RealtimeEvent>) => {
    if (!event?.data) return;
    notify(event.data);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== CHANNEL_NAME || !event.newValue) return;

    try {
      const parsed = JSON.parse(event.newValue) as RealtimeEvent;
      notify(parsed);
    } catch {
      // ignore
    }
  });
}

function emit(event: RealtimeEvent) {
  if (channel) {
    channel.postMessage(event);
  }

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(CHANNEL_NAME, JSON.stringify(event));
      localStorage.removeItem(CHANNEL_NAME);
    } catch {
      // ignore
    }
  }

  notify(event);
}

function shouldSkipDuplicateToast(signature: string) {
  const now = Date.now();

  for (const [key, timestamp] of recentToastSignatures.entries()) {
    if (now - timestamp > RECENT_TOAST_WINDOW_MS) {
      recentToastSignatures.delete(key);
    }
  }

  const lastTimestamp = recentToastSignatures.get(signature);
  recentToastSignatures.set(signature, now);
  return typeof lastTimestamp === "number" && now - lastTimestamp < RECENT_TOAST_WINDOW_MS;
}

export function emitToast(
  title: string,
  message: string,
  variant: ToastVariant = "info",
  options: NativeToastOptions = {}
) {
  const safeTitle = String(title || "").trim();
  const safeMessage = String(message || "").trim();
  const route = String(options.route || "").trim();

  if (!safeTitle || !safeMessage) return;

  const signature = [safeTitle, safeMessage, variant, route].join("|");
  if (shouldSkipDuplicateToast(signature)) return;

  emit({
    type: "toast",
    title: safeTitle,
    message: safeMessage,
    variant,
  });
}

export function emitPedidoUpdate(pedidoId?: string) {
  emit({
    type: "pedido_update",
    pedidoId,
  });
}

export function emitPedidoLock(pedidoId: string, delivererId: string) {
  emit({
    type: "pedido_lock",
    pedidoId,
    delivererId,
  });
}

export function emitPedidoUnlock(pedidoId: string) {
  emit({
    type: "pedido_unlock",
    pedidoId,
  });
}

export function subscribeRealtime(listener: Listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
