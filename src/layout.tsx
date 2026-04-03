import { useMemo } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePedidoStore } from "./store/usePedidoStore";

type Props = {
  children: ReactNode;
};

const NAV_HEIGHT = 72;
const SAFE_TOP = "max(env(safe-area-inset-top), 10px)";
const SAFE_BOTTOM = "max(env(safe-area-inset-bottom), 12px)";
const NAV_TOTAL_HEIGHT = `calc(${NAV_HEIGHT}px + ${SAFE_BOTTOM})`;
const FLOATING_BOTTOM = `calc(${NAV_HEIGHT}px + ${SAFE_BOTTOM} + 14px)`;
const MAIN_BOTTOM_WITH_NAV = `calc(${NAV_HEIGHT}px + ${SAFE_BOTTOM} + 18px)`;
const MAIN_BOTTOM_WITH_FLOATING = `calc(${NAV_HEIGHT}px + ${SAFE_BOTTOM} + 104px)`;

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Icon({
  name,
  active,
}: {
  name: "home" | "store" | "gas" | "orders" | "user";
  active: boolean;
}) {
  const color = active ? "#E44F2A" : "rgba(0,0,0,0.55)";

  switch (name) {
    case "home":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "store":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M4 10l1.2-5h13.6L20 10" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          <path d="M5 10v10h14V10" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 20v-6h6v6" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "gas":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M9 7a3 3 0 1 1 6 0v2H9V7Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 9h8v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          <path d="M7 12h10" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "orders":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M7 4h10a2 2 0 0 1 2 2v14l-4-2-3 2-3-2-4 2V6a2 2 0 0 1 2-2Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M9 8h6M9 12h6" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "user":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M20 21a8 8 0 1 0-16 0" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <path d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
  }
}

export default function Layout({ children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  const isEntregadorRoute = location.pathname.startsWith("/entregador");
  const carrinhoState = usePedidoStore((s) => s.carrinho);
  const carrinho = Array.isArray(carrinhoState) ? carrinhoState : [];

  const { qtdItens, subtotal } = useMemo(() => {
    const qtd = carrinho.reduce((acc, i) => acc + i.quantidade, 0);
    const sub = carrinho.reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0);
    return { qtdItens: qtd, subtotal: sub };
  }, [carrinho]);

  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + "/");
  }

  const hideNav =
    isEntregadorRoute ||
    location.pathname.startsWith("/checkout") ||
    /^\/orders\/[^/]+/.test(location.pathname);

  const showFloatingCart = !hideNav && qtdItens > 0;

  function navItem(path: string, label: string, icon: ReactNode) {
    const active = isActive(path);

    return (
      <Link
        to={path}
        style={{
          flex: 1,
          textDecoration: "none",
          color: active ? "#E44F2A" : "rgba(0,0,0,0.60)",
          userSelect: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: active ? 900 : 700,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 44,
            height: 32,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: active ? "rgba(228,79,42,0.12)" : "transparent",
            border: active ? "1px solid rgba(228,79,42,0.25)" : "1px solid transparent",
          }}
        >
          {icon}
        </div>
        {label}
      </Link>
    );
  }

  const mainPaddingBottom = hideNav
    ? `calc(${SAFE_BOTTOM} + 16px)`
    : showFloatingCart
    ? MAIN_BOTTOM_WITH_FLOATING
    : MAIN_BOTTOM_WITH_NAV;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F5F5F5",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {!isEntregadorRoute && (
        <header
          style={{
            background: "linear-gradient(135deg,#FF4500,#FF7A18)",
            color: "#fff",
            paddingTop: `calc(${SAFE_TOP} + 10px)`,
            paddingRight: 16,
            paddingBottom: 14,
            paddingLeft: 16,
            fontWeight: 900,
            letterSpacing: 0.2,
            boxShadow: "0 10px 28px rgba(255,69,0,0.20)",
          }}
        >
          Central Gás Guará
        </header>
      )}

      <main
        style={{
          flex: 1,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
          paddingTop: 16,
          paddingRight: 14,
          paddingBottom: mainPaddingBottom,
          paddingLeft: 14,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          {children}
        </div>
      </main>

      {showFloatingCart && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: FLOATING_BOTTOM,
            zIndex: 9998,
            pointerEvents: "none",
            padding: "0 12px",
            boxSizing: "border-box",
          }}
        >
          <button
            onClick={() => navigate("/checkout")}
            style={{
              width: "100%",
              height: 56,
              borderRadius: 20,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "linear-gradient(90deg,#E44F2A,#F7A212)",
              color: "#fff",
              fontWeight: 900,
              fontSize: 15,
              cursor: "pointer",
              boxShadow: "0 14px 34px rgba(228,79,42,0.30)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              pointerEvents: "auto",
            }}
            type="button"
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  minWidth: 34,
                  height: 28,
                  padding: "0 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.18)",
                  border: "1px solid rgba(255,255,255,0.28)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                }}
              >
                {qtdItens}
              </span>
              <span>Ver carrinho</span>
            </span>

            <span style={{ fontWeight: 900 }}>{money(subtotal)}</span>
          </button>
        </div>
      )}

      {!hideNav && (
        <nav
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(255,255,255,0.94)",
            backdropFilter: "blur(10px)",
            borderTop: "1px solid rgba(0,0,0,0.08)",
            minHeight: NAV_TOTAL_HEIGHT,
            paddingBottom: SAFE_BOTTOM,
            display: "flex",
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              padding: "10px 6px",
              boxSizing: "border-box",
            }}
          >
            {navItem("/", "Início", <Icon name="home" active={isActive("/")} />)}
            {navItem("/loja", "Loja", <Icon name="store" active={isActive("/loja")} />)}
            {navItem("/monitorar", "Monitorar", <Icon name="gas" active={isActive("/monitorar")} />)}
            {navItem("/orders", "Pedidos", <Icon name="orders" active={isActive("/orders")} />)}
            {navItem("/conta", "Conta", <Icon name="user" active={isActive("/conta")} />)}
          </div>
        </nav>
      )}
    </div>
  );
}