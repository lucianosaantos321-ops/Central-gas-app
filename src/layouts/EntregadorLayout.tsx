import type { ReactNode, CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { clearEntregadorMode } from "../utils/appMode";

const SAFE_TOP = "max(env(safe-area-inset-top), 8px)";
const SAFE_BOTTOM = "max(env(safe-area-inset-bottom), 8px)";
const NAV_HEIGHT = 62;

function NavIcon({
  name,
  active,
}: {
  name: "home" | "history" | "wallet" | "user";
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
          <path d="M20 21a8 8 0 1 0-16 0" stroke={color} strokeWidth="2" strokeLinecap="round" />
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
          width: 38,
          height: 28,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: active ? "linear-gradient(90deg,#F59E0B,#E44F2A)" : "transparent",
          border: active ? "1px solid rgba(228,79,42,0.18)" : "1px solid transparent",
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

  const homeActive =
    isActive(location.pathname, "/entregador") &&
    !isActive(location.pathname, "/entregador/pedidos") &&
    !isActive(location.pathname, "/entregador/historico") &&
    !isActive(location.pathname, "/entregador/ganhos") &&
    !isActive(location.pathname, "/entregador/conta");

  function sairModoEntregador() {
    clearEntregadorMode();
    window.location.href = "/";
  }

  return (
    <div style={page}>
      <div style={shell}>
        <header style={header}>
          <div style={{ minWidth: 0 }}>
            <div style={title}>Central Gás • Entregador</div>
            <div style={subtitle}>Operação e fila de entregas</div>
          </div>

          <button onClick={sairModoEntregador} type="button" style={exitBtn}>
            Sair
          </button>
        </header>

        <main style={content}>{children}</main>
      </div>

      <nav style={bottomNav}>
        <div style={bottomNavInner}>
          <NavItem
            to="/entregador"
            label="Início"
            active={homeActive}
            icon={<NavIcon name="home" active={homeActive} />}
          />

          <NavItem
            to="/entregador/historico"
            label="Histórico"
            active={isActive(location.pathname, "/entregador/historico") || isActive(location.pathname, "/entregador/pedidos")}
            icon={<NavIcon name="history" active={isActive(location.pathname, "/entregador/historico") || isActive(location.pathname, "/entregador/pedidos")} />}
          />

          <NavItem
            to="/entregador/ganhos"
            label="Ganhos"
            active={isActive(location.pathname, "/entregador/ganhos")}
            icon={<NavIcon name="wallet" active={isActive(location.pathname, "/entregador/ganhos")} />}
          />

          <NavItem
            to="/entregador/conta"
            label="Conta"
            active={isActive(location.pathname, "/entregador/conta")}
            icon={<NavIcon name="user" active={isActive(location.pathname, "/entregador/conta")} />}
          />
        </div>
      </nav>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  background: "#F6F7FB",
};

const shell: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  margin: "0 auto",
  boxSizing: "border-box",
  paddingTop: SAFE_TOP,
  paddingRight: 12,
  paddingBottom: `calc(${SAFE_BOTTOM} + ${NAV_HEIGHT}px + 6px)`,
  paddingLeft: 12,
};

const header: CSSProperties = {
  position: "sticky",
  top: `calc(${SAFE_TOP} - 2px)`,
  zIndex: 20,
  background: "rgba(246,247,251,0.92)",
  backdropFilter: "blur(10px)",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 18,
  padding: "10px 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
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
  height: 36,
  padding: "0 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const content: CSSProperties = {
  paddingTop: 12,
};

const bottomNav: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  background: "rgba(15,23,42,0.96)",
  backdropFilter: "blur(10px)",
  borderTop: "1px solid rgba(255,255,255,0.08)",
  minHeight: `calc(${NAV_HEIGHT}px + ${SAFE_BOTTOM})`,
  paddingBottom: SAFE_BOTTOM,
  display: "flex",
  alignItems: "center",
  zIndex: 9999,
  boxShadow: "0 -8px 24px rgba(15,23,42,0.18)",
};

const bottomNavInner: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  padding: "6px 6px",
  boxSizing: "border-box",
};