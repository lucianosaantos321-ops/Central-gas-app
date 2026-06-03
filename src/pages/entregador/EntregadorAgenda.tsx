import { useMemo, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import EntregadorLayout from "../../layouts/EntregadorLayout";
import PageHeader from "../../components/PageHeader";
import { usePedidoStore } from "../../store/usePedidoStore";
import { useEffectiveEntregadorId } from "../../hooks/useEffectiveEntregadorId";
import { money } from "../../utils/delivererHelpers";
import { sectionCardStyle, ui } from "../../styles/ui";

function getScheduledOrders(pedidos: any[], entregadorId: string) {
  return [...(Array.isArray(pedidos) ? pedidos : [])]
    .filter((pedido) => {
      const isMine = String(pedido?.entregadorId || "") === String(entregadorId || "");
      const isScheduled = String(pedido?.tipo || "") === "agendado";
      const active = !["entregue", "cancelado"].includes(String(pedido?.status || ""));
      return isMine && isScheduled && active;
    })
    .sort((a, b) => {
      const ta = new Date(a?.horarioAgendado ?? a?.createdAt ?? 0).getTime();
      const tb = new Date(b?.horarioAgendado ?? b?.createdAt ?? 0).getTime();
      return ta - tb;
    });
}

function scheduleStatusLabel(status?: string) {
  switch (String(status || "")) {
    case "confirmado":
      return "Confirmado";
    case "preparando":
      return "Preparando";
    case "saiu_para_entrega":
      return "Em rota";
    default:
      return "Agendado";
  }
}

export default function EntregadorAgenda() {
  const navigate = useNavigate();
  const pedidos = usePedidoStore((s) => s.pedidos);
  const entregadorId = useEffectiveEntregadorId();

  const rows = useMemo(
    () => getScheduledOrders(Array.isArray(pedidos) ? pedidos : [], entregadorId),
    [pedidos, entregadorId]
  );

  return (
    <EntregadorLayout>
      <div style={{ display: "grid", gap: 14 }}>
        <PageHeader
          title="Agenda"
          subtitle="Pedidos marcados para outro horário"
        />

        <div style={heroCard}>
          <div style={heroTitle}>Agendados confirmados</div>
          <div style={heroValue}>{rows.length}</div>
          <div style={heroText}>
            Aqui ficam os pedidos com horário marcado para facilitar sua organização.
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Pedidos agendados</div>
          {rows.length === 0 ? (
            <div style={emptyText}>Nenhum agendamento aguardando atendimento neste momento.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {rows.map((pedido) => {
                const scheduledAt = new Date(pedido.horarioAgendado ?? pedido.createdAt);

                return (
                <button
                  key={pedido.id}
                  onClick={() => navigate(`/entregador/pedido/${pedido.id}`)}
                  type="button"
                  style={agendaCard}
                >
                  <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                    <div style={agendaTopRow}>
                      <div style={agendaTitle}>Pedido #{String(pedido.id).slice(0, 6)}</div>
                      <span style={agendaStatusBadge}>{scheduleStatusLabel(pedido?.status)}</span>
                    </div>
                    <div style={agendaMeta}>
                      {String((pedido as any)?.clienteNome || "Cliente")} •{" "}
                      {scheduledAt.toLocaleDateString("pt-BR")}
                    </div>
                    <div style={agendaMeta}>
                      {Array.isArray(pedido?.itens)
                        ? pedido.itens.map((item: any) => `${item.quantidade}x ${item.nome}`).join(", ")
                        : "Sem itens"}
                    </div>
                  </div>
                  <div style={agendaSide}>
                    <div style={agendaTimePill}>
                      {scheduledAt.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div style={agendaMoney}>{money(Number(pedido?.total ?? 0))}</div>
                    <div style={agendaHint}>Abrir</div>
                  </div>
                </button>
              )})}
            </div>
          )}
        </div>
      </div>
    </EntregadorLayout>
  );
}

const heroCard: CSSProperties = {
  background: "linear-gradient(180deg,#FFF7ED 0%, #FFFFFF 100%)",
  borderRadius: ui.radius.hero,
  padding: 18,
  border: "1px solid rgba(228,79,42,0.12)",
  boxShadow: ui.shadow.orange,
};

const heroTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
};

const heroValue: CSSProperties = {
  marginTop: 8,
  fontSize: 32,
  fontWeight: 950,
  color: "#111827",
};

const heroText: CSSProperties = {
  marginTop: 8,
  color: "#64748B",
  lineHeight: 1.5,
};

const sectionCard: CSSProperties = { ...sectionCardStyle() };
const sectionTitle: CSSProperties = { fontSize: 16, fontWeight: 950, color: "#111827" };
const emptyText: CSSProperties = { marginTop: 12, color: "#475569", lineHeight: 1.55 };

const agendaCard: CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#fff",
  cursor: "pointer",
};

const agendaTopRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const agendaTitle: CSSProperties = { fontSize: 16, fontWeight: 950, color: "#111827" };
const agendaStatusBadge: CSSProperties = {
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(249,115,22,0.10)",
  color: "#C2410C",
  fontSize: 11.5,
  fontWeight: 900,
};
const agendaMeta: CSSProperties = { marginTop: 6, color: "#64748B", fontSize: 13, lineHeight: 1.45 };
const agendaSide: CSSProperties = { minWidth: 86, textAlign: "right" };
const agendaTimePill: CSSProperties = {
  minHeight: 30,
  padding: "0 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(15,23,42,0.06)",
  color: "#111827",
  fontSize: 12,
  fontWeight: 900,
};
const agendaMoney: CSSProperties = { fontSize: 16, fontWeight: 950, color: "#111827" };
const agendaHint: CSSProperties = { marginTop: 8, fontSize: 12, color: "#64748B", fontWeight: 800 };
