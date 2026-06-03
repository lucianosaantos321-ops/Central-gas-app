import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { appLogger } from "../services/appLogger";
import { hydrateAdminFinanceState } from "../services/remoteFinanceStateService";
import { hydrateAdminAppState } from "../services/remoteAppStateService";
import {
  delivererAccessService,
  type DelivererApplication,
} from "../services/delivererAccessService";
import { emitToast } from "../services/realtimeBus";
import { useAuthStore } from "../store/useAuthStore";
import { usePedidoStore } from "../store/usePedidoStore";

type AdminNoticeKind = "pedido" | "entregador" | "sistema";

type AdminNotice = {
  id: string;
  kind: AdminNoticeKind;
  title: string;
  message: string;
  createdAt: number;
  href?: string;
  read: boolean;
};

function isActive(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(path + "/");
}

function statusPedidosOperacionais(pedido: any) {
  const status = String(pedido?.status || "").trim();
  return (
    status === "criado" ||
    status === "confirmado" ||
    status === "buscando_entregador"
  );
}

function playAdminPlim() {
  if (typeof window === "undefined") return;

  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor) return;

  try {
    const context = new AudioContextCtor();
    const now = context.currentTime;

    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    master.connect(context.destination);

    const base = context.createOscillator();
    base.type = "sine";
    base.frequency.setValueAtTime(1380, now);
    base.frequency.exponentialRampToValueAtTime(1720, now + 0.16);
    base.connect(master);
    base.start(now);
    base.stop(now + 0.24);

    const sparkle = context.createOscillator();
    sparkle.type = "triangle";
    sparkle.frequency.setValueAtTime(2240, now + 0.02);
    sparkle.frequency.exponentialRampToValueAtTime(2640, now + 0.16);
    sparkle.connect(master);
    sparkle.start(now + 0.02);
    sparkle.stop(now + 0.2);

    window.setTimeout(() => {
      void context.close().catch(() => null);
    }, 420);
  } catch {
    // ignore sound failures
  }
}

function formatNoticeTime(createdAt: number) {
  try {
    return new Date(createdAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function noticeBadgeLabel(kind: AdminNoticeKind) {
  if (kind === "pedido") return "pedido";
  if (kind === "entregador") return "cadastro";
  return "sistema";
}

function noticeBadgeTone(kind: AdminNoticeKind) {
  if (kind === "pedido") {
    return {
      background: "rgba(249,115,22,0.10)",
      border: "1px solid rgba(249,115,22,0.20)",
      color: "#C2410C",
    };
  }

  if (kind === "entregador") {
    return {
      background: "rgba(59,130,246,0.10)",
      border: "1px solid rgba(59,130,246,0.20)",
      color: "#1D4ED8",
    };
  }

  return {
    background: "rgba(15,23,42,0.06)",
    border: "1px solid rgba(15,23,42,0.10)",
    color: "#334155",
  };
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
          : "rgba(255,255,255,0.92)",
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
  const navigate = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);
  const pedidos = usePedidoStore((s) => s.pedidos);
  const pedidosCount = usePedidoStore((s) => s.pedidos.length);
  const remoteReady = usePedidoStore((s) => s.remoteReady);
  const loadingRemote = usePedidoStore((s) => s.loadingRemote);
  const refetchPedidos = usePedidoStore((s) => s.refetchPedidos);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [applications, setApplications] = useState<DelivererApplication[]>([]);
  const [notifications, setNotifications] = useState<AdminNotice[]>([]);

  const initializedOrdersRef = useRef(false);
  const initializedApplicationsRef = useRef(false);
  const previousOrderIdsRef = useRef<string[]>([]);
  const previousPendingApplicationIdsRef = useRef<string[]>([]);

  const dashboardActive =
    isActive(location.pathname, "/admin") &&
    !isActive(location.pathname, "/admin/pedidos") &&
    !isActive(location.pathname, "/admin/entregadores") &&
    !isActive(location.pathname, "/admin/clientes") &&
    !isActive(location.pathname, "/admin/campanhas") &&
    !isActive(location.pathname, "/admin/disparos") &&
    !isActive(location.pathname, "/admin/produtos") &&
    !isActive(location.pathname, "/admin/financeiro") &&
    !isActive(location.pathname, "/admin/auditoria");

  const operationalOrders = useMemo(
    () =>
      (Array.isArray(pedidos) ? pedidos : []).filter((pedido) =>
        statusPedidosOperacionais(pedido)
      ),
    [pedidos]
  );

  const pendingApplications = useMemo(
    () => applications.filter((item) => item.status === "pending"),
    [applications]
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  const latestNotifications = useMemo(
    () =>
      [...notifications]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 12),
    [notifications]
  );

  async function sairAdmin() {
    await signOut();
    navigate("/admin/login", { replace: true });
  }

  function pushAdminNotice(
    notice: Omit<AdminNotice, "id" | "createdAt" | "read">,
    options?: { silent?: boolean }
  ) {
    const nextNotice: AdminNotice = {
      ...notice,
      id: `${notice.kind}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      createdAt: Date.now(),
      read: false,
    };

    setNotifications((current) => [nextNotice, ...current].slice(0, 20));

    if (!options?.silent) {
      playAdminPlim();
      emitToast(notice.title, notice.message, "info");
    }
  }

  function markNotificationsAsRead() {
    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        read: true,
      }))
    );
  }

  useEffect(() => {
    if (loadingRemote) return;
    if (remoteReady && pedidosCount > 0) return;

    void refetchPedidos();
  }, [loadingRemote, pedidosCount, refetchPedidos, remoteReady]);

  useEffect(() => {
    void hydrateAdminAppState().catch((error) => {
      appLogger.error("admin_layout", "hydrate_admin_app_state_failed", error);
    });

    void hydrateAdminFinanceState().catch((error) => {
      appLogger.error("admin_layout", "hydrate_admin_finance_failed", error);
    });
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | null = null;

    async function loadApplications() {
      try {
        const nextApplications = await delivererAccessService.listApplications();
        if (!active) return;
        setApplications(nextApplications);
      } catch (error) {
        appLogger.error(
          "admin_layout",
          "load_deliverer_applications_failed",
          error
        );
      } finally {
        if (active) {
          timer = window.setTimeout(loadApplications, 20000);
        }
      }
    }

    void loadApplications();

    return () => {
      active = false;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    const nextIds = operationalOrders.map((pedido: any) => String(pedido?.id || ""));
    const previousIds = previousOrderIdsRef.current;

    if (!initializedOrdersRef.current) {
      previousOrderIdsRef.current = nextIds;
      initializedOrdersRef.current = true;
      return;
    }

    const newIds = nextIds.filter((id) => id && !previousIds.includes(id));
    if (newIds.length > 0) {
      newIds.forEach((id) => {
        const pedido = operationalOrders.find((item: any) => String(item?.id || "") === id);
        pushAdminNotice({
          kind: "pedido",
          title: "Novo pedido na operacao",
          message: pedido?.clienteNome
            ? `${pedido.clienteNome} entrou na fila e precisa de acompanhamento.`
            : `Pedido ${id.slice(0, 6)} entrou na fila operacional.`,
          href: "/admin/pedidos",
        });
      });
    }

    previousOrderIdsRef.current = nextIds;
  }, [operationalOrders]);

  useEffect(() => {
    const nextIds = pendingApplications.map((item) => item.id);
    const previousIds = previousPendingApplicationIdsRef.current;

    if (!initializedApplicationsRef.current) {
      previousPendingApplicationIdsRef.current = nextIds;
      initializedApplicationsRef.current = true;
      return;
    }

    const newIds = nextIds.filter((id) => id && !previousIds.includes(id));
    if (newIds.length > 0) {
      newIds.forEach((id) => {
        const application = pendingApplications.find((item) => item.id === id);
        pushAdminNotice({
          kind: "entregador",
          title: "Novo entregador pendente",
          message: application
            ? `${application.fullName} enviou cadastro para aprovacao.`
            : "Chegou um novo entregador pendente de aprovacao.",
          href: "/admin/entregadores",
        });
      });
    }

    previousPendingApplicationIdsRef.current = nextIds;
  }, [pendingApplications]);

  useEffect(() => {
    if (!drawerOpen) return;
    markNotificationsAsRead();
  }, [drawerOpen]);

  return (
    <div style={page}>
      <div style={bgGlowTop} />
      <div style={bgGlowBottom} />

      <button
        onClick={() => setDrawerOpen((value) => !value)}
        type="button"
        style={floatingBellBtn}
        aria-label="Abrir alertas do painel"
      >
        <span style={bellIcon}>🔔</span>
        {unreadCount > 0 ? <span style={floatingBellBadge}>{unreadCount}</span> : null}
      </button>

      {drawerOpen ? (
        <div style={notificationDrawer}>
          <div style={drawerHeader}>
            <div>
              <div style={drawerEyebrow}>Alertas operacionais</div>
              <div style={drawerTitle}>Central do painel</div>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              type="button"
              style={drawerCloseBtn}
            >
              Fechar
            </button>
          </div>

          <div style={drawerStats}>
            <div style={drawerStatCard}>
              <div style={drawerStatLabel}>Pedidos novos</div>
              <div style={drawerStatValue}>{operationalOrders.length}</div>
            </div>
            <div style={drawerStatCard}>
              <div style={drawerStatLabel}>Entregadores pendentes</div>
              <div style={drawerStatValue}>{pendingApplications.length}</div>
            </div>
          </div>

          <div style={drawerList}>
            {latestNotifications.length === 0 ? (
              <div style={drawerEmpty}>
                Nenhum alerta novo por enquanto. O painel vai avisar aqui quando
                entrar pedido novo, cadastro pendente ou evento importante.
              </div>
            ) : (
              latestNotifications.map((item) => {
                const tone = noticeBadgeTone(item.kind);
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setDrawerOpen(false);
                      if (item.href) {
                        navigate(item.href);
                      }
                    }}
                    type="button"
                    style={drawerItem}
                  >
                    <div style={drawerItemTop}>
                      <span
                        style={{
                          ...drawerBadge,
                          background: tone.background,
                          border: tone.border,
                          color: tone.color,
                        }}
                      >
                        {noticeBadgeLabel(item.kind)}
                      </span>
                      <span style={drawerTime}>{formatNoticeTime(item.createdAt)}</span>
                    </div>
                    <div style={drawerItemTitle}>{item.title}</div>
                    <div style={drawerItemMessage}>{item.message}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      <div style={shell}>
        <div style={heroCard}>
          <div style={heroTopRow}>
            <div style={{ minWidth: 0 }}>
              <div style={heroEyebrow}>Central Gas | Painel ADM</div>
              <div style={heroTitle}>{title}</div>
              {subtitle ? <div style={heroSub}>{subtitle}</div> : null}
              <div style={heroSync}>
                Operacao: {remoteReady ? "tempo real" : "aguardando conexao"}
                {loadingRemote ? " | sincronizando pedidos..." : ""}
              </div>
            </div>

            <div style={heroActions}>
              <div style={heroBadge}>Pedidos {operationalOrders.length}</div>
              <div style={heroBadgeSecondary}>
                Cadastros pendentes {pendingApplications.length}
              </div>
              <button onClick={sairAdmin} type="button" style={heroLogoutBtn}>
                Sair
              </button>
            </div>
          </div>
        </div>

        <div style={navWrap}>
          <div style={navGrid}>
            <NavItem to="/admin" label="Resumo" active={dashboardActive} />
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
              to="/admin/disparos"
              label="Disparos"
              active={isActive(location.pathname, "/admin/disparos")}
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

const heroSync: CSSProperties = {
  marginTop: 10,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(255,255,255,0.74)",
  lineHeight: 1.45,
};

const heroBadge: CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(249,115,22,0.18)",
  border: "1px solid rgba(249,115,22,0.24)",
  fontWeight: 900,
  color: "#fff",
  whiteSpace: "nowrap",
};

const heroBadgeSecondary: CSSProperties = {
  ...heroBadge,
  background: "rgba(59,130,246,0.18)",
  border: "1px solid rgba(59,130,246,0.24)",
};

const heroActions: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const heroLogoutBtn: CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.10)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
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

const floatingBellBtn: CSSProperties = {
  position: "fixed",
  top: 18,
  right: 18,
  width: 58,
  height: 58,
  borderRadius: "50%",
  border: "1px solid rgba(15,23,42,0.10)",
  background: "rgba(255,255,255,0.92)",
  boxShadow: "0 18px 36px rgba(15,23,42,0.18)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  zIndex: 30,
};

const bellIcon: CSSProperties = {
  fontSize: 20,
};

const floatingBellBadge: CSSProperties = {
  position: "absolute",
  top: 4,
  right: 2,
  minWidth: 22,
  height: 22,
  padding: "0 6px",
  borderRadius: 999,
  background: "#E44F2A",
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 950,
  boxShadow: "0 10px 20px rgba(228,79,42,0.28)",
};

const notificationDrawer: CSSProperties = {
  position: "fixed",
  top: 86,
  right: 18,
  width: "min(92vw, 360px)",
  maxHeight: "calc(100vh - 110px)",
  overflow: "auto",
  borderRadius: 24,
  background: "rgba(255,255,255,0.96)",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 28px 54px rgba(15,23,42,0.20)",
  padding: 16,
  zIndex: 29,
};

const drawerHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const drawerEyebrow: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#E44F2A",
};

const drawerTitle: CSSProperties = {
  marginTop: 6,
  fontSize: 20,
  fontWeight: 950,
  color: "#111827",
};

const drawerCloseBtn: CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const drawerStats: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const drawerStatCard: CSSProperties = {
  borderRadius: 18,
  background: "linear-gradient(135deg,#F8FAFC 0%, #FFFFFF 100%)",
  border: "1px solid rgba(15,23,42,0.06)",
  padding: 12,
};

const drawerStatLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const drawerStatValue: CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 950,
  color: "#111827",
};

const drawerList: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 10,
};

const drawerEmpty: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(15,23,42,0.06)",
  background: "#F8FAFC",
  padding: 14,
  color: "#64748B",
  lineHeight: 1.6,
  fontWeight: 700,
};

const drawerItem: CSSProperties = {
  width: "100%",
  textAlign: "left",
  borderRadius: 20,
  border: "1px solid rgba(15,23,42,0.06)",
  background: "#fff",
  padding: 14,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(15,23,42,0.05)",
};

const drawerItemTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const drawerBadge: CSSProperties = {
  height: 28,
  padding: "0 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  fontSize: 11.5,
  textTransform: "uppercase",
};

const drawerTime: CSSProperties = {
  color: "#64748B",
  fontSize: 12,
  fontWeight: 800,
};

const drawerItemTitle: CSSProperties = {
  marginTop: 10,
  fontWeight: 950,
  fontSize: 15,
  color: "#111827",
};

const drawerItemMessage: CSSProperties = {
  marginTop: 8,
  color: "#475569",
  lineHeight: 1.55,
  fontWeight: 700,
  fontSize: 13,
};
