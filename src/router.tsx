import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

// Cliente
import Home from "./pages/Home";
import Loja from "./pages/Loja";
import Monitorar from "./pages/Monitorar";
import Conta from "./pages/Conta";
import Checkout from "./pages/Checkout";
import MyAddresses from "./pages/MyAddresses";
import AddAddress from "./pages/AddAddress";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";

// Entregador
import EntregadorHome from "./pages/entregador/EntregadorHome";
import EntregadorPedidos from "./pages/entregador/EntregadorPedidos";
import EntregadorPedidoDetail from "./pages/entregador/EntregadorPedidoDetail";
import EntregadorHistorico from "./pages/entregador/EntregadorHistorico";
import EntregadorGanhos from "./pages/entregador/EntregadorGanhos";
import EntregadorConta from "./pages/entregador/EntregadorConta";
import { isEntregadorMode } from "./utils/appMode";

// ADMIN
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminPedidos from "./pages/admin/AdminPedidos";
import AdminClientes from "./pages/admin/AdminClientes";
import AdminEntregadores from "./pages/admin/AdminEntregadores";
import AdminFinanceiro from "./pages/admin/AdminFinanceiro";
import AdminProdutos from "./pages/admin/AdminProdutos";
import AdminClientesCampanhas from "./pages/admin/AdminClientesCampanhas";
import AdminAuditoria from "./pages/admin/AdminAuditoria";

function EntregadorRoute({ children }: { children: React.ReactElement }) {
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setAllowed(isEntregadorMode());
    setChecked(true);
  }, []);

  if (!checked) return null;
  if (!allowed) return <Navigate to="/" replace />;

  return children;
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
        <Route path="/" element={<Home />} />
        <Route path="/loja" element={<Loja />} />
        <Route path="/monitorar" element={<Monitorar />} />
        <Route path="/conta" element={<Conta />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/my-addresses" element={<MyAddresses />} />
        <Route path="/add-address" element={<AddAddress />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />

        {/* ENTREGADOR */}
        <Route
          path="/entregador"
          element={
            <EntregadorRoute>
              <EntregadorHome />
            </EntregadorRoute>
          }
        />
        <Route
          path="/entregador/historico"
          element={
            <EntregadorRoute>
              <EntregadorHistorico />
            </EntregadorRoute>
          }
        />
        <Route
          path="/entregador/pedido/:id"
          element={
            <EntregadorRoute>
              <EntregadorPedidoDetail />
            </EntregadorRoute>
          }
        />
        <Route
          path="/entregador/ganhos"
          element={
            <EntregadorRoute>
              <EntregadorGanhos />
            </EntregadorRoute>
          }
        />
        <Route
          path="/entregador/conta"
          element={
            <EntregadorRoute>
              <EntregadorConta />
            </EntregadorRoute>
          }
        />

        {/* LEGADO ENTREGADOR */}
        <Route
          path="/entregador/pedidos"
          element={
            <EntregadorRoute>
              <EntregadorPedidos />
            </EntregadorRoute>
          }
        />
        <Route path="/entregador/pedidos/:id" element={<LegacyEntregadorPedidoRedirect />} />

        {/* ADMIN */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/pedidos" element={<AdminPedidos />} />
        <Route path="/admin/clientes" element={<AdminClientes />} />
        <Route path="/admin/entregadores" element={<AdminEntregadores />} />
        <Route path="/admin/financeiro" element={<AdminFinanceiro />} />
        <Route path="/admin/produtos" element={<AdminProdutos />} />
        <Route path="/admin/campanhas" element={<AdminClientesCampanhas />} />
        <Route path="/admin/auditoria" element={<AdminAuditoria />} />

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;