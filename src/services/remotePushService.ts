import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type PushNotificationSchema,
  type Token,
} from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { AuthProfile } from "../store/useAuthStore";
import { appLogger } from "./appLogger";
import { trackMetric } from "./appMetrics";
import { schedulePushDispatch } from "./remotePushDispatchService";
import { emitToast } from "./realtimeBus";
import {
  DEFAULT_PUSH_CHANNEL_ID,
  DELIVERER_OFFER_CHANNEL_ID,
  DELIVERER_OFFER_CHANNEL_SOUND,
} from "./nativeNotifications";
import { notifyDeliverer } from "./delivererNotifier";
import { notifyClientPush } from "../utils/notify";
import { clientNotificationCenter } from "./clientNotificationCenter";
import { supabase } from "./supabase";

const PUSH_INSTALLATION_KEY = "cg_push_installation_id";
const PUSH_LAST_TOKEN_KEY = "cg_push_last_token";

let setupPromise: Promise<boolean> | null = null;
let listenersBound = false;
let activeProfile: AuthProfile | null = null;
let currentToken: string | null = null;
let lastSyncedSignature = "";
let localNotificationsBound = false;

function isNativeAndroidRuntime() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function safeStorageGet(key: string) {
  if (typeof window === "undefined") return "";

  try {
    return String(window.localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function safeStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return;

  try {
    if (value) {
      window.localStorage.setItem(key, value);
      return;
    }

    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function ensureInstallationId() {
  const existing = safeStorageGet(PUSH_INSTALLATION_KEY);
  if (existing) return existing;

  const next =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `push-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  safeStorageSet(PUSH_INSTALLATION_KEY, next);
  return next;
}

function safeRoute(value: unknown) {
  const route = String(value || "").trim();
  return route.startsWith("/") ? route : "";
}

function resolveRoute(notification?: PushNotificationSchema | null) {
  const data = notification?.data as Record<string, unknown> | undefined;
  return (
    safeRoute(data?.route) ||
    safeRoute(notification?.link) ||
    safeRoute(data?.link)
  );
}

function resolveIncomingChannelId(notification?: PushNotificationSchema | null) {
  const data = notification?.data as Record<string, unknown> | undefined;
  const fromData = String(data?.channel_id || data?.channelId || "").trim();
  if (fromData === DELIVERER_OFFER_CHANNEL_ID) return DELIVERER_OFFER_CHANNEL_ID;
  if (fromData === DEFAULT_PUSH_CHANNEL_ID) return DEFAULT_PUSH_CHANNEL_ID;

  const route = resolveRoute(notification);
  if (route.startsWith("/entregador")) return DELIVERER_OFFER_CHANNEL_ID;
  return DEFAULT_PUSH_CHANNEL_ID;
}

function navigateTo(path: string) {
  if (typeof window === "undefined") return;

  const target = safeRoute(path);
  if (!target) return;

  if (window.location.pathname === target) {
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }

  window.history.pushState({}, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function resolveAppVariant(profile: AuthProfile) {
  const envVariant = String(import.meta.env.VITE_APP_VARIANT || "").trim();
  if (envVariant) return envVariant;

  if (profile.role === "entregador") return "entregador";
  if (profile.role === "admin") return "admin";
  return "cliente";
}

function buildSyncSignature(profile: AuthProfile, token: string) {
  return [
    profile.authUserId,
    profile.role,
    profile.delivererId ?? "",
    resolveAppVariant(profile),
    token,
  ].join("|");
}

async function ensurePushPermissions() {
  try {
    let permissions = await PushNotifications.checkPermissions();

    if (permissions.receive === "prompt") {
      permissions = await PushNotifications.requestPermissions();
    }

    const granted = permissions.receive === "granted";
    trackMetric(granted ? "push_permission_granted" : "push_permission_denied");
    return granted;
  } catch (error) {
    appLogger.error("remote_push", "permission_check_failed", error);
    trackMetric("push_permission_error");
    return false;
  }
}

async function ensurePushChannel() {
  try {
    for (const channelId of [
      "cg_operacao",
      "cg_operacao_v2",
      "cg_cliente_operacao_v2",
      "cg_cliente_operacao_v3",
      "cg_cliente_operacao_v4",
      "cg_cliente_operacao_v5",
      "cg_entregador_ofertas",
      "cg_entregador_ofertas_v2",
      "cg_entregador_ofertas_v3",
      "cg_entregador_ofertas_v4",
      "cg_entregador_ofertas_v5",
      "cg_entregador_ofertas_v6",
      DEFAULT_PUSH_CHANNEL_ID,
      DELIVERER_OFFER_CHANNEL_ID,
    ]) {
      try {
        await PushNotifications.deleteChannel({
          id: channelId,
        });
      } catch {
        // ignore legacy channel reset errors
      }
    }

    await PushNotifications.createChannel({
      id: DEFAULT_PUSH_CHANNEL_ID,
      name: "Cliente: pedidos e operação",
      description: "Atualizações importantes do cliente com som padrão do Android.",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  } catch (error) {
    appLogger.warn(
      "remote_push",
      "create_default_channel_warning",
      "Falha ao preparar o canal padrão remoto de push.",
      error
    );
  }

  try {
    await PushNotifications.createChannel({
      id: DELIVERER_OFFER_CHANNEL_ID,
      name: "Novos pedidos para entregador",
      description: "Alertas sonoros premium para novos pedidos do entregador.",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: DELIVERER_OFFER_CHANNEL_SOUND,
    });

    try {
      await LocalNotifications.deleteChannel({
        id: DELIVERER_OFFER_CHANNEL_ID,
      });
    } catch {
      // ignore legacy local channel reset errors
    }

    await LocalNotifications.createChannel({
      id: DELIVERER_OFFER_CHANNEL_ID,
      name: "Novos pedidos para entregador",
      description: "Som alto para novos pedidos do entregador.",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: DELIVERER_OFFER_CHANNEL_SOUND,
    });
  } catch (error) {
    appLogger.warn(
      "remote_push",
      "create_offer_channel_warning",
      "Falha ao preparar o canal remoto de ofertas.",
      error
    );
  }
}

async function registerPushTokenRemote(profile: AuthProfile, token: string) {
  const installationId = ensureInstallationId();
  const normalizedToken = String(token || "").trim();
  if (!installationId || !normalizedToken) return false;

  const signature = buildSyncSignature(profile, normalizedToken);
  if (signature === lastSyncedSignature) return true;

  const { error } = await supabase.rpc("register_push_device", {
    p_installation_id: installationId,
    p_push_token: normalizedToken,
    p_platform: "android",
    p_app_variant: resolveAppVariant(profile),
    p_role: profile.role,
    p_deliverer_id: profile.delivererId ?? null,
  });

  if (error) {
    throw new Error(error.message || "PUSH_DEVICE_REGISTER_FAILED");
  }

  currentToken = normalizedToken;
  safeStorageSet(PUSH_LAST_TOKEN_KEY, normalizedToken);
  lastSyncedSignature = signature;
  schedulePushDispatch({
    reason: "push_device_registered",
    limit: 20,
  });
  trackMetric("push_device_registered", {
    role: profile.role,
    authUserId: profile.authUserId,
    appVariant: resolveAppVariant(profile),
  });
  return true;
}

async function handleTokenRegistration(token: Token) {
  const normalizedToken = String(token?.value || "").trim();
  if (!normalizedToken) return;

  currentToken = normalizedToken;
  safeStorageSet(PUSH_LAST_TOKEN_KEY, normalizedToken);
  lastSyncedSignature = "";

  if (!activeProfile) return;

  try {
    await registerPushTokenRemote(activeProfile, normalizedToken);
  } catch (error) {
    appLogger.error("remote_push", "register_token_remote_failed", error, {
      role: activeProfile.role,
      authUserId: activeProfile.authUserId,
    });
  }
}

async function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;

  await PushNotifications.addListener("registration", (token) => {
    void handleTokenRegistration(token);
  });

  await PushNotifications.addListener("registrationError", (error) => {
    appLogger.error("remote_push", "registration_error", error);
  });

  await PushNotifications.addListener(
    "pushNotificationReceived",
    (notification) => {
      const title = String(notification.title || "Atualização").trim();
      const message = String(
        notification.body || "Nova notificação recebida."
      ).trim();
      const route = resolveRoute(notification);
      const channelId = resolveIncomingChannelId(notification);
      const data = notification.data as Record<string, unknown> | undefined;

      emitToast(title, message, "info", {
        route,
      });

      if (channelId === DELIVERER_OFFER_CHANNEL_ID) {
        notifyDeliverer({
          badgeCount: 1,
          vibrate: false,
          sound: false,
          repeat: 1,
        });
      } else {
        clientNotificationCenter.add({
          title,
          message,
          route,
          kind: String(data?.event_type || data?.campanha || title),
          dedupeKey: String(data?.dedupe_key || data?.event_type || "") || null,
        });
        notifyClientPush();
      }
    }
  );

  await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      const title = String(action.notification.title || "Central Gas").trim();
      const message = String(
        action.notification.body || "Nova notificação recebida."
      ).trim();
      const route = resolveRoute(action.notification);
      const data = action.notification.data as Record<string, unknown> | undefined;
      const channelId = resolveIncomingChannelId(action.notification);
      if (channelId !== DELIVERER_OFFER_CHANNEL_ID) {
        clientNotificationCenter.add({
          title,
          message,
          route,
          kind: String(data?.event_type || data?.campanha || title),
          dedupeKey: String(data?.dedupe_key || data?.event_type || "") || null,
        });
      }
      if (route) {
        navigateTo(route);
      }
    }
  );

  if (!localNotificationsBound) {
    localNotificationsBound = true;
    await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (action) => {
        const extra = action.notification.extra as
          | Record<string, unknown>
          | undefined;
        const route = safeRoute(extra?.route);
        if (route) navigateTo(route);
      }
    );
  }
}

export async function setupRemotePushNotifications() {
  if (!isNativeAndroidRuntime()) return false;

  currentToken = currentToken || safeStorageGet(PUSH_LAST_TOKEN_KEY) || null;

  if (!setupPromise) {
    setupPromise = (async () => {
      await ensurePushChannel();
      await bindListeners();
      await ensurePushPermissions();
      return true;
    })().catch((error) => {
      appLogger.error("remote_push", "setup_failed", error);
      setupPromise = null;
      return false;
    });
  }

  return setupPromise;
}

export async function syncRemotePushForProfile(profile: AuthProfile | null) {
  activeProfile = profile;
  lastSyncedSignature = "";

  if (!profile || !isNativeAndroidRuntime()) {
    return false;
  }

  const ready = await setupRemotePushNotifications();
  if (!ready) return false;

  const granted = await ensurePushPermissions();
  if (!granted) return false;

  const cachedToken = currentToken || safeStorageGet(PUSH_LAST_TOKEN_KEY);
  if (cachedToken) {
    await registerPushTokenRemote(profile, cachedToken);
  }

  await PushNotifications.register();
  schedulePushDispatch({
    reason: "push_profile_sync",
    limit: 15,
  });
  return true;
}

export async function disableRemotePushDevice() {
  activeProfile = null;
  lastSyncedSignature = "";

  if (!isNativeAndroidRuntime()) return false;

  const installationId = ensureInstallationId();
  const token = currentToken || safeStorageGet(PUSH_LAST_TOKEN_KEY);

  if (installationId || token) {
    try {
      const { error } = await supabase.rpc("disable_push_device", {
        p_installation_id: installationId || null,
        p_push_token: token || null,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      appLogger.error("remote_push", "disable_device_rpc_failed", error);
    }
  }

  try {
    await PushNotifications.unregister();
  } catch (error) {
    appLogger.warn(
      "remote_push",
      "unregister_warning",
      "Falha ao desregistrar push local.",
      error
    );
  }

  currentToken = null;
  safeStorageSet(PUSH_LAST_TOKEN_KEY, "");
  return true;
}
