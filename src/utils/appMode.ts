const APP_MODE_KEY = "cg_app_mode";
const ENTREGADOR_FLAG_KEY = "cg_is_entregador";
const FORCE_ENTREGADOR_APK_KEY = "cg_force_entregador_apk";

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
    return (
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
  }
}

export function enableEntregadorMode() {
  setAppMode("entregador");
}
