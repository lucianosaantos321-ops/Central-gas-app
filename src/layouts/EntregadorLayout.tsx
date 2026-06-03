import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { clearDelivererAccessSession } from "../services/delivererAccessService";
import { appLogger } from "../services/appLogger";
import { hydrateDelivererFinanceState } from "../services/remoteFinanceStateService";
import { useAuthStore } from "../store/useAuthStore";
import { clearEntregadorMode, getCachedNativeAppId } from "../utils/appMode";

const SHELL_MAX_WIDTH = 760;
const SAFE_TOP = "max(var(--app-safe-top), 24px)";
const SAFE_LEFT = "var(--app-safe-left)";
const SAFE_RIGHT = "var(--app-safe-right)";
const SHELL_GUTTER = 12;
const TOP_OFFSET = 8;
const HEADER_GAP = 16;
const NAV_GAP = 18;
const HEADER_FALLBACK_HEIGHT = 80;
const NAV_FALLBACK_HEIGHT = 84;
const NAV_MIN_HEIGHT = 62;
const NAV_BOTTOM_PADDING = "10px";

function NavIcon({
  name,
  active,
}: {
  name: "home" | "calendar" | "history" | "wallet" | "user";
  active: boolean;
}) {
  const color = active ? "#FFFFFF" : "rgba(255,255,255,0.76)";

  switch (name) {
    case "home":
      return (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "history":
      return (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 8v5l3 2"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 12a8 8 0 1 1-2.34-5.66"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 4v4h-4"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "calendar":
      return (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path d="M7 3v3M17 3v3" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <path d="M4 9h16" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <rect x="4" y="5" width="16" height="15" rx="2" stroke={color} strokeWidth="2" />
        </svg>
      );

    case "wallet":
      return (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M16 13h4" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case "user":
      return (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 21a8 8 0 1 0-16 0"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

function isActive(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(path + "/");
}

function NavItem(props: {
  to: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  const { to, label, icon, active } = props;

  return (
    <Link
      to={to}
      style={{
        flex: 1,
        textDecoration: "none",
        color: active ? "#FFFFFF" : "rgba(255,255,255,0.78)",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: active ? 900 : 700,
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 40,
          height: 30,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: active
            ? "linear-gradient(90deg,#F59E0B,#E44F2A)"
            : "transparent",
          border: active
            ? "1px solid rgba(228,79,42,0.18)"
            : "1px solid transparent",
          boxShadow: active ? "0 8px 18px rgba(228,79,42,0.18)" : "none",
        }}
      >
        {icon}
      </div>

      <span
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {label}
      </span>
    </Link>
  );
}

export default function EntregadorLayout(props: { children: ReactNode }) {
  const { children } = props;
  const location = useLocation();
  const signOut = useAuthStore((s) => s.signOut);
  const headerRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(HEADER_FALLBACK_HEIGHT);
  const [navHeight, setNavHeight] = useState(NAV_FALLBACK_HEIGHT);

  const homeActive =
    isActive(location.pathname, "/entregador") &&
    !isActive(location.pathname, "/entregador/pedidos") &&
    !isActive(location.pathname, "/entregador/agenda") &&
    !isActive(location.pathname, "/entregador/historico") &&
    !isActive(location.pathname, "/entregador/ganhos") &&
    !isActive(location.pathname, "/entregador/conta");

  async function sairModoEntregador() {
    clearDelivererAccessSession();
    try {
      await signOut();
    } catch {
      // ignore logout race here and continue local cleanup
    }

    const nativeAppId = getCachedNativeAppId();
    if (nativeAppId.includes(".entregador")) {
      window.location.href = "/entregador";
      return;
    }

    clearEntregadorMode();
    window.location.href = "/";
  }

  useEffect(() => {
    void hydrateDelivererFinanceState().catch((error) => {
      appLogger.error("deliverer_layout", "hydrate_finance_failed", error);
    });
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const measure = () => {
      const nextHeader = Math.ceil(
        headerRef.current?.getBoundingClientRect().height ?? HEADER_FALLBACK_HEIGHT
      );
      const nextNav = Math.ceil(
        navRef.current?.getBoundingClientRect().height ?? NAV_FALLBACK_HEIGHT
      );

      setHeaderHeight((current) => (current === nextHeader ? current : nextHeader));
      setNavHeight((current) => (current === nextNav ? current : nextNav));
    };

    measure();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;

    if (headerRef.current) resizeObserver?.observe(headerRef.current);
    if (navRef.current) resizeObserver?.observe(navRef.current);

    const viewport = window.visualViewport;
    window.addEventListener("resize", measure);
    viewport?.addEventListener("resize", measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div style={page}>
      <header ref={headerRef} style={headerWrap}>
        <div style={headerShell}>
          <div style={headerCard}>
            <div style={{ minWidth: 0 }}>
              <div style={title}>Central Gás | Entregador</div>
              <div style={subtitle}>Operação e fila de entregas</div>
            </div>

            <button onClick={sairModoEntregador} type="button" style={exitBtn}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main
        style={{
          ...content,
          paddingTop: headerHeight + HEADER_GAP,
          paddingBottom: navHeight + NAV_GAP,
        }}
      >
        <div style={contentShell}>{children}</div>
      </main>

      <nav ref={navRef} style={navWrap}>
        <div style={navShell}>
          <div style={bottomNavCard}>
            <div style={bottomNavInner}>
              <NavItem
                to="/entregador"
                label="Pedidos"
                active={homeActive}
                icon={<NavIcon name="home" active={homeActive} />}
              />

              <NavItem
                to="/entregador/agenda"
                label="Agenda"
                active={isActive(location.pathname, "/entregador/agenda")}
                icon={
                  <NavIcon
                    name="calendar"
                    active={isActive(location.pathname, "/entregador/agenda")}
                  />
                }
              />

              <NavItem
                to="/entregador/historico"
                label="Histórico"
                active={isActive(location.pathname, "/entregador/historico")}
                icon={
                  <NavIcon
                    name="history"
                    active={isActive(location.pathname, "/entregador/historico")}
                  />
                }
              />

              <NavItem
                to="/entregador/conta"
                label="Conta"
                active={isActive(location.pathname, "/entregador/conta")}
                icon={
                  <NavIcon
                    name="user"
                    active={isActive(location.pathname, "/entregador/conta")}
                  />
                }
              />
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh",
  background: "#F6F7FB",
  boxSizing: "border-box",
};

const headerWrap: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 9998,
  paddingTop: SAFE_TOP,
  paddingLeft: SAFE_LEFT,
  paddingRight: SAFE_RIGHT,
  background: "#FFFFFF",
  borderBottom: "1px solid rgba(15,23,42,0.08)",
  boxSizing: "border-box",
  pointerEvents: "none",
};

const headerShell: CSSProperties = {
  width: "100%",
  maxWidth: SHELL_MAX_WIDTH,
  margin: "0 auto",
  boxSizing: "border-box",
  paddingTop: TOP_OFFSET,
  paddingLeft: SHELL_GUTTER,
  paddingRight: SHELL_GUTTER,
  minWidth: 0,
};

const headerCard: CSSProperties = {
  background: "#FFFFFF",
  border: "none",
  borderRadius: 0,
  padding: "10px 0 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  boxShadow: "none",
  pointerEvents: "auto",
};

const title: CSSProperties = {
  fontWeight: 950,
  letterSpacing: -0.2,
  color: "#111827",
  fontSize: 14,
  lineHeight: 1.1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const subtitle: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
};

const exitBtn: CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const content: CSSProperties = {
  width: "100%",
  paddingLeft: SAFE_LEFT,
  paddingRight: SAFE_RIGHT,
  boxSizing: "border-box",
  minWidth: 0,
};

const contentShell: CSSProperties = {
  width: "100%",
  maxWidth: SHELL_MAX_WIDTH,
  margin: "0 auto",
  boxSizing: "border-box",
  paddingLeft: SHELL_GUTTER,
  paddingRight: SHELL_GUTTER,
  minWidth: 0,
};

const navWrap: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 9999,
  paddingBottom: 0,
  paddingLeft: SAFE_LEFT,
  paddingRight: SAFE_RIGHT,
  background: "#0F172A",
  borderTop: "1px solid rgba(255,255,255,0.08)",
  boxSizing: "border-box",
  pointerEvents: "none",
};

const navShell: CSSProperties = {
  width: "100%",
  maxWidth: SHELL_MAX_WIDTH,
  margin: "0 auto",
  paddingLeft: 0,
  paddingRight: 0,
  boxSizing: "border-box",
};

const bottomNavCard: CSSProperties = {
  minHeight: `calc(${NAV_MIN_HEIGHT}px + ${NAV_BOTTOM_PADDING})`,
  padding: `8px 12px calc(${NAV_BOTTOM_PADDING} + 2px)`,
  borderRadius: 0,
  background: "#0F172A",
  border: "none",
  boxShadow: "none",
  pointerEvents: "auto",
};

const bottomNavInner: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 2,
  padding: "2px 2px 0",
  boxSizing: "border-box",
};
