import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { lazy, Suspense, useEffect, useState, type ReactElement } from "react";
import { App } from "@capacitor/app";
import Home from "./pages/Home";

import { getCachedNativeAppId, isEntregadorMode } from "./utils/appMode";
import { useAuthStore, type AppRole } from "./store/useAuthStore";
import { delivererAccessService, getDelivererAccessSession } from "./services/delivererAccessService";
import {
  clearClientAccessSession,
  getClientAccessSession,
} from "./services/clientAccessService";

const Loja = lazy(() => import("./pages/Loja"));
const Monitorar = lazy(() => import("./pages/Monitorar"));
const Conta = lazy(() => import("./pages/Conta"));
const Checkout = lazy(() => import("./pages/Checkout"));
const MyAddresses = lazy(() => import("./pages/MyAddresses"));
const AddAddress = lazy(() => import("./pages/AddAddress"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Notifications = lazy(() => import("./pages/Notifications"));

const EntregadorAcesso = lazy(() => import("./pages/entregador/EntregadorAcesso"));
const EntregadorHome = lazy(() => import("./pages/entregador/EntregadorHome"));
const EntregadorPedidos = lazy(() => import("./pages/entregador/EntregadorPedidos"));
const EntregadorPedidoDetail = lazy(
  () => import("./pages/entregador/EntregadorPedidoDetail")
);
const EntregadorHistorico = lazy(
  () => import("./pages/entregador/EntregadorHistorico")
);
const EntregadorAgenda = lazy(() => import("./pages/entregador/EntregadorAgenda"));
const EntregadorGanhos = lazy(() => import("./pages/entregador/EntregadorGanhos"));
const EntregadorConta = lazy(() => import("./pages/entregador/EntregadorConta"));

const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminPedidos = lazy(() => import("./pages/admin/AdminPedidos"));
const AdminClientes = lazy(() => import("./pages/admin/AdminClientes"));
const AdminEntregadores = lazy(() => import("./pages/admin/AdminEntregadores"));
const AdminFinanceiro = lazy(() => import("./pages/admin/AdminFinanceiro"));
const AdminProdutos = lazy(() => import("./pages/admin/AdminProdutos"));
const AdminDisparos = lazy(() => import("./pages/admin/AdminDisparos"));
const AdminClientesCampanhas = lazy(
  () => import("./pages/admin/AdminClientesCampanhas")
);
const AdminAuditoria = lazy(() => import("./pages/admin/AdminAuditoria"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));

const ACCESS_TIMEOUT_MS = 35000;
function RouteSuspense({
  children,
  label = "Carregando interface...",
}: {
  children: ReactElement;
  label?: string;
}) {
  return <Suspense fallback={<AccessLoading label={label} />}>{children}</Suspense>;
}

function RootRoute() {
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const storedClientAccess = getClientAccessSession();
  const [resolved, setResolved] = useState(() => {
    const cached = getCachedNativeAppId();
    if (cached.includes(".entregador")) return "entregador";
    return isEntregadorMode() ? "entregador" : "cliente";
  });
  const [checkedNative, setCheckedNative] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolveNativeMode() {
      try {
        const info = await App.getInfo();
        const appId = String(info?.id ?? "").toLowerCase();

        if (!active) return;

        if (appId.includes(".entregador")) {
          setResolved("entregador");
        } else {
          setResolved("cliente");
        }
      } catch {
        if (active) {
          setResolved(isEntregadorMode() ? "entregador" : "cliente");
        }
      } finally {
        if (active) {
          setCheckedNative(true);
        }
      }
    }

    void resolveNativeMode();

    return () => {
      active = false;
    };
  }, []);

  if (!checkedNative && resolved === "entregador") {
    return <Navigate to="/entregador" replace />;
  }

  if (profile?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (resolved === "entregador") {
    return <Navigate to="/entregador" replace />;
  }

  const hasKnownClientAccess = Boolean(
    storedClientAccess ||
      profile?.role === "cliente" ||
      (session?.user && !session.user.is_anonymous)
  );

  if (!hasKnownClientAccess) {
    return <Navigate to="/conta" replace state={{ returnTo: "/" }} />;
  }

  return (
    <RoleRoute role="cliente">
      <Home />
    </RoleRoute>
  );
}

function AccessLoading({ label: _label }: { label: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "linear-gradient(180deg, #E44F2A 0%, #F7A212 100%)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "min(100%, 360px)",
          padding: "32px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 30,
            fontWeight: 950,
            color: "#fff",
            letterSpacing: 0.2,
          }}
        >
          Central Gás
        </div>
        <div
          style={{
            marginTop: 8,
            color: "rgba(255,255,255,0.92)",
            lineHeight: 1.55,
            fontWeight: 800,
            fontSize: 15,
          }}
        >
          Carregando...
        </div>
        <div
          aria-hidden="true"
          style={{
            margin: "18px auto 0",
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "4px solid rgba(255,255,255,0.28)",
            borderTopColor: "#fff",
            animation: "cg-spin 0.9s linear infinite",
          }}
        />
      </div>
    </div>
  );
}

function AccessError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "#F6F7FB",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "min(100%, 440px)",
          background: "#fff",
          borderRadius: 24,
          padding: 20,
          border: "1px solid rgba(185,28,28,0.12)",
          boxShadow: "0 16px 34px rgba(15,23,42,0.08)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 950, color: "#111827" }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 10,
            color: "#7F1D1D",
            lineHeight: 1.6,
            fontWeight: 700,
            whiteSpace: "pre-line",
          }}
        >
          {message}
        </div>
        <button
          onClick={onRetry}
          type="button"
          style={{
            marginTop: 16,
            width: "100%",
            height: 46,
            borderRadius: 16,
            border: "none",
            background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
            color: "#fff",
            fontWeight: 950,
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

function buildTimeoutMessage(stage: string) {
  const base = "A sessao demorou mais do que o esperado para ser validada. Tente novamente.";
  if (!stage) return base;
  return `${base}\n\nEtapa atual: ${stage}.`;
}

function buildAuthFailureMessage(error: string, stage: string) {
  if (error) return error;
  if (stage) return `Nao foi possivel preparar a sessao do app.\n\nEtapa atual: ${stage}.`;
  return "Nao foi possivel preparar a sessao do app.";
}

function RoleRoute({
  role,
  children,
  requireEntregadorMode = false,
}: {
  role: AppRole;
  children: ReactElement;
  requireEntregadorMode?: boolean;
}) {
  const location = useLocation();
  const ensureRole = useAuthStore((s) => s.ensureRole);
  const loading = useAuthStore((s) => s.loading);
  const profile = useAuthStore((s) => s.profile);
  const error = useAuthStore((s) => s.error);
  const stage = useAuthStore((s) => s.stage);
  const [checked, setChecked] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    const timeoutId = window.setTimeout(() => {
      if (active) {
        setTimedOut(true);
        setChecked(true);
      }
    }, ACCESS_TIMEOUT_MS);

    setChecked(false);
    setTimedOut(false);

    void ensureRole(role)
      .catch(() => null)
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (active) {
          setChecked(true);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [ensureRole, role, retryKey]);

  useEffect(() => {
    if (role !== "cliente") return;
    if (!timedOut && (!checked || loading || profile?.role === role)) return;
    clearClientAccessSession();
  }, [checked, loading, profile?.role, role, timedOut]);

  if (requireEntregadorMode && !isEntregadorMode()) {
    return <Navigate to="/" replace />;
  }

  if (role !== "admin" && profile?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (timedOut) {
    if (role === "cliente") {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      return <Navigate to="/conta" replace state={{ returnTo }} />;
    }

    return (
      <AccessError
        title="Validacao demorada"
        message={buildTimeoutMessage(stage)}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    );
  }

  if (!checked || loading) {
    return (
      <AccessLoading
        label={
          stage ||
          (role === "admin"
            ? "Conferindo autenticacao administrativa."
            : role === "entregador"
            ? "Inicializando sessao segura do entregador."
            : "Inicializando sessao segura do cliente.")
        }
      />
    );
  }

  if (role === "admin") {
    if (profile?.role !== "admin") {
      return <Navigate to="/admin/login" replace />;
    }
    return children;
  }

  if (profile?.role !== role) {
    if (role === "cliente") {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      return <Navigate to="/conta" replace state={{ returnTo }} />;
    }

    return (
      <AccessError
        title="Falha de autenticacao"
        message={buildAuthFailureMessage(error, stage)}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    );
  }

  return children;
}

function EntregadorRoute({ children }: { children: ReactElement }) {
  const [approved, setApproved] = useState(() => {
    const session = getDelivererAccessSession();
    return session?.status === "approved";
  });

  useEffect(() => {
    let active = true;

    void delivererAccessService.activateSession().then((item) => {
      if (!active) return;
      setApproved(item?.status === "approved");
    });

    return () => {
      active = false;
    };
  }, []);

  if (!approved) {
    return (
      <RouteSuspense label="Preparando acesso do entregador.">
        <EntregadorAcesso onApproved={() => setApproved(true)} />
      </RouteSuspense>
    );
  }

  return (
    <RoleRoute role="entregador" requireEntregadorMode>
      {children}
    </RoleRoute>
  );
}

function ClienteRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const storedClientAccess = getClientAccessSession();

  if (profile?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  const hasKnownClientAccess = Boolean(
    storedClientAccess ||
      profile?.role === "cliente" ||
      (session?.user && !session.user.is_anonymous)
  );

  if (!hasKnownClientAccess) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/conta" replace state={{ returnTo }} />;
  }

  return <RoleRoute role="cliente">{children}</RoleRoute>;
}

function AdminRoute({ children }: { children: ReactElement }) {
  return <RoleRoute role="admin">{children}</RoleRoute>;
}

function LegacyEntregadorPedidoRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/entregador/pedido/${id}` : "/entregador/historico"} replace />;
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* CLIENTE */}
        <Route path="/" element={<RootRoute />} />
        <Route
          path="/loja"
          element={
            <ClienteRoute>
              <RouteSuspense label="Carregando loja.">
                <Loja />
              </RouteSuspense>
            </ClienteRoute>
          }
        />
        <Route
          path="/monitorar"
          element={
            <ClienteRoute>
              <RouteSuspense label="Carregando monitoramento.">
                <Monitorar />
              </RouteSuspense>
            </ClienteRoute>
          }
        />
        <Route
          path="/conta"
          element={
            <RouteSuspense label="Carregando conta.">
              <Conta />
            </RouteSuspense>
          }
        />
        <Route
          path="/checkout"
          element={
            <ClienteRoute>
              <RouteSuspense label="Carregando checkout.">
                <Checkout />
              </RouteSuspense>
            </ClienteRoute>
          }
        />
        <Route
          path="/my-addresses"
          element={
            <ClienteRoute>
              <RouteSuspense label="Carregando enderecos.">
                <MyAddresses />
              </RouteSuspense>
            </ClienteRoute>
          }
        />
        <Route
          path="/add-address"
          element={
            <ClienteRoute>
              <RouteSuspense label="Carregando formulario de endereco.">
                <AddAddress />
              </RouteSuspense>
            </ClienteRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ClienteRoute>
              <RouteSuspense label="Carregando pedidos.">
                <Orders />
              </RouteSuspense>
            </ClienteRoute>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <ClienteRoute>
              <RouteSuspense label="Carregando detalhe do pedido.">
                <OrderDetail />
              </RouteSuspense>
            </ClienteRoute>
          }
        />
        <Route
          path="/notificacoes"
          element={
            <ClienteRoute>
              <RouteSuspense label="Carregando notificacoes.">
                <Notifications />
              </RouteSuspense>
            </ClienteRoute>
          }
        />

        {/* ENTREGADOR */}
        <Route
          path="/entregador"
          element={
            <EntregadorRoute>
              <RouteSuspense label="Carregando operacao do entregador.">
                <EntregadorHome />
              </RouteSuspense>
            </EntregadorRoute>
          }
        />
        <Route
          path="/entregador/agenda"
          element={
            <EntregadorRoute>
              <RouteSuspense label="Carregando agenda do entregador.">
                <EntregadorAgenda />
              </RouteSuspense>
            </EntregadorRoute>
          }
        />
        <Route
          path="/entregador/historico"
          element={
            <EntregadorRoute>
              <RouteSuspense label="Carregando historico do entregador.">
                <EntregadorHistorico />
              </RouteSuspense>
            </EntregadorRoute>
          }
        />
        <Route
          path="/entregador/pedido/:id"
          element={
            <EntregadorRoute>
              <RouteSuspense label="Carregando detalhe da entrega.">
                <EntregadorPedidoDetail />
              </RouteSuspense>
            </EntregadorRoute>
          }
        />
        <Route
          path="/entregador/ganhos"
          element={
            <EntregadorRoute>
              <RouteSuspense label="Carregando ganhos do entregador.">
                <EntregadorGanhos />
              </RouteSuspense>
            </EntregadorRoute>
          }
        />
        <Route
          path="/entregador/conta"
          element={
            <EntregadorRoute>
              <RouteSuspense label="Carregando conta do entregador.">
                <EntregadorConta />
              </RouteSuspense>
            </EntregadorRoute>
          }
        />

        {/* LEGADO ENTREGADOR */}
        <Route
          path="/entregador/pedidos"
          element={
            <EntregadorRoute>
              <RouteSuspense label="Carregando ofertas do entregador.">
                <EntregadorPedidos />
              </RouteSuspense>
            </EntregadorRoute>
          }
        />
        <Route path="/entregador/pedidos/:id" element={<LegacyEntregadorPedidoRedirect />} />

        {/* ADMIN */}
        <Route
          path="/admin/login"
          element={
            <RouteSuspense label="Carregando login administrativo.">
              <AdminLogin />
            </RouteSuspense>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <RouteSuspense label="Carregando dashboard administrativo.">
                <AdminDashboard />
              </RouteSuspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/pedidos"
          element={
            <AdminRoute>
              <RouteSuspense label="Carregando pedidos do ADM.">
                <AdminPedidos />
              </RouteSuspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/clientes"
          element={
            <AdminRoute>
              <RouteSuspense label="Carregando clientes do ADM.">
                <AdminClientes />
              </RouteSuspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/entregadores"
          element={
            <AdminRoute>
              <RouteSuspense label="Carregando entregadores do ADM.">
                <AdminEntregadores />
              </RouteSuspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/financeiro"
          element={
            <AdminRoute>
              <RouteSuspense label="Carregando financeiro do ADM.">
                <AdminFinanceiro />
              </RouteSuspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/produtos"
          element={
            <AdminRoute>
              <RouteSuspense label="Carregando produtos do ADM.">
                <AdminProdutos />
              </RouteSuspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/disparos"
          element={
            <AdminRoute>
              <RouteSuspense label="Carregando disparos do ADM.">
                <AdminDisparos />
              </RouteSuspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/campanhas"
          element={
            <AdminRoute>
              <RouteSuspense label="Carregando campanhas do ADM.">
                <AdminClientesCampanhas />
              </RouteSuspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/auditoria"
          element={
            <AdminRoute>
              <RouteSuspense label="Carregando auditoria do ADM.">
                <AdminAuditoria />
              </RouteSuspense>
            </AdminRoute>
          }
        />

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;
