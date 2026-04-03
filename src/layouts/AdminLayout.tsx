import type { CSSProperties, ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

function isActive(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(path + "/");
}

function NavItem(props: {
  to: string;
  label: string;
  active: boolean;
}) {
  const { to, label, active } = props;

  return (
    <Link
      to={to}
      style={{
        ...navItem,
        background: active
          ? "linear-gradient(90deg,#E44F2A,#F59E0B)"
          : "rgba(255,255,255,0.88)",
        color: active ? "#fff" : "#111827",
        border: active
          ? "1px solid rgba(228,79,42,0.18)"
          : "1px solid rgba(15,23,42,0.08)",
        boxShadow: active
          ? "0 14px 28px rgba(228,79,42,0.18)"
          : "0 8px 18px rgba(15,23,42,0.04)",
      }}
    >
      {label}
    </Link>
  );
}

export default function AdminLayout(props: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { title, subtitle, children } = props;
  const location = useLocation();

  const dashboardActive =
    isActive(location.pathname, "/admin") &&
    !isActive(location.pathname, "/admin/pedidos") &&
    !isActive(location.pathname, "/admin/entregadores") &&
    !isActive(location.pathname, "/admin/clientes") &&
    !isActive(location.pathname, "/admin/campanhas") &&
    !isActive(location.pathname, "/admin/produtos") &&
    !isActive(location.pathname, "/admin/financeiro") &&
    !isActive(location.pathname, "/admin/auditoria");

  return (
    <div style={page}>
      <div style={bgGlowTop} />
      <div style={bgGlowBottom} />

      <div style={shell}>
        <div style={heroCard}>
          <div style={heroTopRow}>
            <div style={{ minWidth: 0 }}>
              <div style={heroEyebrow}>Central Gás • Super ADM</div>
              <div style={heroTitle}>{title}</div>
              {subtitle ? <div style={heroSub}>{subtitle}</div> : null}
            </div>

            <div style={heroBadge}>Controle total</div>
          </div>
        </div>

        <div style={navWrap}>
          <div style={navGrid}>
            <NavItem to="/admin" label="Dashboard" active={dashboardActive} />
            <NavItem
              to="/admin/pedidos"
              label="Pedidos"
              active={isActive(location.pathname, "/admin/pedidos")}
            />
            <NavItem
              to="/admin/entregadores"
              label="Entregadores"
              active={isActive(location.pathname, "/admin/entregadores")}
            />
            <NavItem
              to="/admin/clientes"
              label="Clientes"
              active={isActive(location.pathname, "/admin/clientes")}
            />
            <NavItem
              to="/admin/campanhas"
              label="Campanhas"
              active={isActive(location.pathname, "/admin/campanhas")}
            />
            <NavItem
              to="/admin/produtos"
              label="Produtos"
              active={isActive(location.pathname, "/admin/produtos")}
            />
            <NavItem
              to="/admin/financeiro"
              label="Financeiro"
              active={isActive(location.pathname, "/admin/financeiro")}
            />
            <NavItem
              to="/admin/auditoria"
              label="Auditoria"
              active={isActive(location.pathname, "/admin/auditoria")}
            />
          </div>
        </div>

        <div style={contentWrap}>{children}</div>
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(228,79,42,0.08), transparent 26%), radial-gradient(circle at bottom right, rgba(245,158,11,0.08), transparent 22%), #F6F7FB",
  position: "relative",
  overflow: "hidden",
};

const bgGlowTop: CSSProperties = {
  position: "absolute",
  top: -120,
  left: -100,
  width: 320,
  height: 320,
  borderRadius: "50%",
  background: "rgba(228,79,42,0.08)",
  filter: "blur(40px)",
  pointerEvents: "none",
};

const bgGlowBottom: CSSProperties = {
  position: "absolute",
  bottom: -120,
  right: -120,
  width: 340,
  height: 340,
  borderRadius: "50%",
  background: "rgba(245,158,11,0.08)",
  filter: "blur(44px)",
  pointerEvents: "none",
};

const shell: CSSProperties = {
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
  padding: 16,
  boxSizing: "border-box",
  position: "relative",
  zIndex: 2,
};

const heroCard: CSSProperties = {
  background: "linear-gradient(135deg,#0F172A 0%, #111827 48%, #1F2937 100%)",
  borderRadius: 28,
  padding: 22,
  color: "#fff",
  boxShadow: "0 22px 54px rgba(15,23,42,0.22)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const heroTopRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  flexWrap: "wrap",
};

const heroEyebrow: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.72)",
  letterSpacing: 0.5,
};

const heroTitle: CSSProperties = {
  marginTop: 8,
  fontSize: 30,
  fontWeight: 950,
  letterSpacing: -0.6,
  lineHeight: 1.05,
};

const heroSub: CSSProperties = {
  marginTop: 10,
  fontSize: 13.5,
  color: "rgba(255,255,255,0.84)",
  lineHeight: 1.55,
  maxWidth: 760,
};

const heroBadge: CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.10)",
  border: "1px solid rgba(255,255,255,0.12)",
  fontWeight: 900,
  color: "#fff",
  whiteSpace: "nowrap",
};

const navWrap: CSSProperties = {
  marginTop: 14,
  background: "rgba(255,255,255,0.60)",
  backdropFilter: "blur(10px)",
  borderRadius: 24,
  padding: 10,
  border: "1px solid rgba(15,23,42,0.06)",
  boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
};

const navGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
  gap: 10,
};

const navItem: CSSProperties = {
  textDecoration: "none",
  minHeight: 46,
  borderRadius: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 950,
  fontSize: 14,
  transition: "0.2s ease",
};

const contentWrap: CSSProperties = {
  marginTop: 14,
};