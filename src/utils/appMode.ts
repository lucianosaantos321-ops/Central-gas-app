import { App } from "@capacitor/app";

const APP_MODE_KEY = "cg_app_mode";
const ENTREGADOR_FLAG_KEY = "cg_is_entregador";
const FORCE_ENTREGADOR_APK_KEY = "cg_force_entregador_apk";
const NATIVE_APP_ID_KEY = "cg_native_app_id";

export type AppMode = "cliente" | "entregador";

export function isBrowserEnvironment() {
  return typeof window !== "undefined";
}

export function isAndroidLikeEnvironment() {
  if (!isBrowserEnvironment()) return false;

  const ua = window.navigator.userAgent.toLowerCase();
  const isAndroidUa = ua.includes("android");
  const isCapacitorLike =
    (window as any).Capacitor !== undefined ||
    document.body?.classList.contains("capacitor") ||
    !!document.querySelector("capacitor-app") ||
    window.location.protocol === "capacitor:";

  return isAndroidUa || isCapacitorLike;
}

export function setAppMode(mode: AppMode) {
  if (!isBrowserEnvironment()) return;

  try {
    localStorage.setItem(APP_MODE_KEY, mode);
    localStorage.setItem(ENTREGADOR_FLAG_KEY, mode === "entregador" ? "1" : "0");
  } catch {
    // ignore
  }
}

export function forceEntregadorApkMode() {
  if (!isBrowserEnvironment()) return;

  try {
    localStorage.setItem(ENTREGADOR_FLAG_KEY, "1");
    localStorage.setItem(APP_MODE_KEY, "entregador");
    localStorage.setItem(FORCE_ENTREGADOR_APK_KEY, "1");
  } catch {
    // ignore
  }
}

export function forceClienteApkMode() {
  if (!isBrowserEnvironment()) return;

  try {
    localStorage.setItem(ENTREGADOR_FLAG_KEY, "0");
    localStorage.setItem(APP_MODE_KEY, "cliente");
    localStorage.removeItem(FORCE_ENTREGADOR_APK_KEY);
  } catch {
    // ignore
  }
}

export function getCachedNativeAppId() {
  if (!isBrowserEnvironment()) return "";

  try {
    return String(localStorage.getItem(NATIVE_APP_ID_KEY) ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function cacheNativeAppId(appId: string) {
  if (!isBrowserEnvironment()) return;

  try {
    const normalized = String(appId || "").trim().toLowerCase();

    if (normalized) {
      localStorage.setItem(NATIVE_APP_ID_KEY, normalized);
    } else {
      localStorage.removeItem(NATIVE_APP_ID_KEY);
    }
  } catch {
    // ignore
  }
}

export function clearEntregadorMode() {
  if (!isBrowserEnvironment()) return;

  try {
    localStorage.removeItem(ENTREGADOR_FLAG_KEY);
    localStorage.removeItem(APP_MODE_KEY);
    localStorage.removeItem(FORCE_ENTREGADOR_APK_KEY);
  } catch {
    // ignore
  }
}

export function isEntregadorMode() {
  if (!isBrowserEnvironment()) return false;

  try {
    const nativeAppId = getCachedNativeAppId();

    return (
      nativeAppId.includes(".entregador") ||
      localStorage.getItem(ENTREGADOR_FLAG_KEY) === "1" ||
      localStorage.getItem(APP_MODE_KEY) === "entregador" ||
      localStorage.getItem(FORCE_ENTREGADOR_APK_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function setupEntregadorAppModeForAndroidApk() {
  if (!isAndroidLikeEnvironment()) return;
  forceEntregadorApkMode();
}

export function applyInitialRouteMode() {
  if (!isBrowserEnvironment()) return;

  const currentPath = window.location.pathname;

  if (
    isEntregadorMode() &&
    (currentPath === "/" || currentPath === "/home" || currentPath === "/index.html")
  ) {
    window.history.replaceState({}, "", "/entregador");
    return;
  }

  if (
    !isEntregadorMode() &&
    (currentPath.startsWith("/entregador") || currentPath === "/home" || currentPath === "/index.html")
  ) {
    window.history.replaceState({}, "", "/");
  }
}

export function enableEntregadorMode() {
  setAppMode("entregador");
}

export async function syncNativeAppMode() {
  if (!isBrowserEnvironment()) return;

  try {
    const info = await App.getInfo();
    const appId = String(info?.id ?? "").toLowerCase();
    cacheNativeAppId(appId);

    if (appId.includes(".entregador")) {
      forceEntregadorApkMode();
      applyInitialRouteMode();
      return;
    }

    if (appId.includes(".cliente")) {
      forceClienteApkMode();
      applyInitialRouteMode();
    }
  } catch {
    // ignore
  }
}
