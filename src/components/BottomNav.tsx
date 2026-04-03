import { NavLink } from "react-router-dom";

const linkBase: React.CSSProperties = {
  flex: 1,
  textAlign: "center",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 700,
  padding: "10px 6px",
  borderRadius: 12,
  margin: "0 6px",
};

export default function BottomNav() {
  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#fff",
        borderTop: "1px solid #eee",
        padding: "10px 10px 14px",
        boxShadow: "0 -6px 16px rgba(0,0,0,0.06)",
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <NavLink
          to="/"
          end
          style={({ isActive }) => ({
            ...linkBase,
            color: isActive ? "#FF4500" : "#666",
            background: isActive ? "rgba(255,69,0,0.10)" : "transparent",
          })}
        >
          Início
        </NavLink>

        <NavLink
          to="/loja"
          style={({ isActive }) => ({
            ...linkBase,
            color: isActive ? "#FF4500" : "#666",
            background: isActive ? "rgba(255,69,0,0.10)" : "transparent",
          })}
        >
          Loja
        </NavLink>

        <NavLink
          to="/monitorar"
          style={({ isActive }) => ({
            ...linkBase,
            color: isActive ? "#FF4500" : "#666",
            background: isActive ? "rgba(255,69,0,0.10)" : "transparent",
          })}
        >
          Monitorar
        </NavLink>

        <NavLink
          to="/orders"
          style={({ isActive }) => ({
            ...linkBase,
            color: isActive ? "#FF4500" : "#666",
            background: isActive ? "rgba(255,69,0,0.10)" : "transparent",
          })}
        >
          Pedidos
        </NavLink>

        <NavLink
          to="/conta"
          style={({ isActive }) => ({
            ...linkBase,
            color: isActive ? "#FF4500" : "#666",
            background: isActive ? "rgba(255,69,0,0.10)" : "transparent",
          })}
        >
          Conta
        </NavLink>
      </div>
    </nav>
  );
}