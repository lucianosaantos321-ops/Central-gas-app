import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

function navigateTo(path: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname === path) return;

  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function isMainClienteTab(pathname: string) {
  return (
    pathname === "/monitorar" ||
    pathname === "/orders" ||
    pathname === "/conta" ||
    pathname === "/loja"
  );
}

function isDeepInternalRoute(pathname: string) {
  return (
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/orders/") ||
    pathname.startsWith("/entregador/pedidos/") ||
    pathname.startsWith("/entregador/pedido/")
  );
}

function handleBackNavigation() {
  if (typeof window === "undefined") return;

  const pathname = window.location.pathname;

  if (isMainClienteTab(pathname)) {
    navigateTo("/");
    return;
  }

  if (pathname === "/entregador/pedidos" || pathname === "/entregador/historico") {
    navigateTo("/entregador");
    return;
  }

  if (isDeepInternalRoute(pathname)) {
    window.history.back();
    return;
  }

  if (pathname === "/entregador" || pathname === "/") {
    return;
  }

  window.history.back();
}

function setupDocumentBackButtonFallback() {
  if (typeof document === "undefined") return () => undefined;

  const handler = (event: Event) => {
    (event as any)?.preventDefault?.();
    handleBackNavigation();
  };

  document.addEventListener("backbutton", handler as EventListener);
  return () => document.removeEventListener("backbutton", handler as EventListener);
}

function setupKeyboardFallback() {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      handleBackNavigation();
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}

function isNativeCapacitorApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function setupNativeApp() {
  const cleanups: Array<() => void> = [];

  cleanups.push(setupDocumentBackButtonFallback());
  cleanups.push(setupKeyboardFallback());

  if (isNativeCapacitorApp()) {
    const listener = await App.addListener("backButton", ({ canGoBack }) => {
      const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

      if (pathname === "/" || pathname === "/entregador") {
        App.minimizeApp();
        return;
      }

      if (canGoBack) {
        handleBackNavigation();
        return;
      }

      handleBackNavigation();
    });

    cleanups.push(() => listener.remove());
  }

  return () => {
    cleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch {
        // ignore
      }
    });
  };
}
