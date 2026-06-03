import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../layout";
import {
  clientNotificationCenter,
  type ClientNotificationItem,
} from "../services/clientNotificationCenter";

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function kindLabel(kind: ClientNotificationItem["kind"]) {
  if (kind === "promo") return "Promoção";
  if (kind === "pedido") return "Pedido";
  if (kind === "sistema") return "Sistema";
  return "Aviso";
}

export default function Notifications() {
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return clientNotificationCenter.subscribe(() => setVersion((value) => value + 1));
  }, []);

  const notifications = useMemo(
    () => clientNotificationCenter.getAll(),
    [version]
  );
  const unread = notifications.filter((item) => !item.read).length;

  function openItem(item: ClientNotificationItem) {
    clientNotificationCenter.markRead(item.id);
    if (item.route) {
      navigate(item.route);
    }
  }

  return (
    <Layout>
      <div style={page}>
        <div style={header}>
          <button onClick={() => navigate(-1)} type="button" style={backBtn} aria-label="Voltar">
            ‹
          </button>
          <div style={title}>Notificações</div>
          <button
            onClick={() => clientNotificationCenter.markAllRead()}
            type="button"
            style={markBtn}
            disabled={unread === 0}
          >
            Ler tudo
          </button>
        </div>

        {notifications.length === 0 ? (
          <div style={emptyWrap}>
            <div style={emptyBell}>♡</div>
            <div style={emptyTitle}>Nenhuma novidade por aqui.</div>
            <div style={emptyText}>
              Cupons, promoções e avisos importantes vão aparecer nesta tela.
            </div>
          </div>
        ) : (
          <div style={list}>
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openItem(item)}
                style={{
                  ...row,
                  border: item.read
                    ? "1px solid rgba(15,23,42,0.07)"
                    : "1px solid rgba(228,79,42,0.20)",
                  background: item.read ? "#fff" : "rgba(255,247,237,0.96)",
                }}
              >
                <div style={rowTop}>
                  <span style={badge}>{kindLabel(item.kind)}</span>
                  <span style={time}>{formatTime(item.createdAt)}</span>
                </div>
                <div style={rowTitle}>{item.title}</div>
                <div style={rowMessage}>{item.message}</div>
                {item.route ? <div style={routeHint}>Toque para abrir</div> : null}
                {!item.read ? <span style={unreadDot} /> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

const page: CSSProperties = {
  paddingBottom: 96,
};

const header: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "44px 1fr auto",
  gap: 10,
  alignItems: "center",
  marginBottom: 16,
};

const backBtn: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: "50%",
  border: "none",
  background: "#fff",
  color: "#E44F2A",
  fontSize: 30,
  lineHeight: 1,
  fontWeight: 900,
  cursor: "pointer",
};

const title: CSSProperties = {
  textAlign: "center",
  textTransform: "uppercase",
  letterSpacing: 0,
  fontSize: 20,
  fontWeight: 950,
  color: "#111827",
};

const markBtn: CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const emptyWrap: CSSProperties = {
  minHeight: "58vh",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  textAlign: "center",
  color: "#6B7280",
  padding: 24,
};

const emptyBell: CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "#fff",
  color: "#E44F2A",
  fontSize: 34,
  boxShadow: "0 12px 28px rgba(15,23,42,0.08)",
};

const emptyTitle: CSSProperties = {
  marginTop: 18,
  fontSize: 22,
  lineHeight: 1.2,
  fontWeight: 900,
};

const emptyText: CSSProperties = {
  marginTop: 10,
  fontSize: 14,
  lineHeight: 1.5,
  maxWidth: 320,
};

const list: CSSProperties = {
  display: "grid",
  gap: 12,
};

const row: CSSProperties = {
  position: "relative",
  width: "100%",
  textAlign: "left",
  borderRadius: 20,
  padding: 14,
  boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
  cursor: "pointer",
};

const rowTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const badge: CSSProperties = {
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  background: "rgba(228,79,42,0.10)",
  color: "#E44F2A",
  fontSize: 12,
  fontWeight: 900,
};

const time: CSSProperties = {
  color: "#64748B",
  fontSize: 12,
  fontWeight: 800,
};

const rowTitle: CSSProperties = {
  marginTop: 12,
  color: "#111827",
  fontWeight: 950,
  fontSize: 16,
};

const rowMessage: CSSProperties = {
  marginTop: 6,
  color: "#475569",
  fontSize: 14,
  lineHeight: 1.5,
  fontWeight: 700,
};

const routeHint: CSSProperties = {
  marginTop: 10,
  color: "#E44F2A",
  fontSize: 12,
  fontWeight: 900,
};

const unreadDot: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  width: 10,
  height: 10,
  borderRadius: "50%",
  background: "#E44F2A",
};
