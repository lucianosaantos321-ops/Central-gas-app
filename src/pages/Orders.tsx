import { useCallback, useEffect, useMemo, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../layout";
import PageHeader from "../components/PageHeader";
import { appLogger } from "../services/appLogger";
import { usePedidoStore } from "../store/usePedidoStore";
import { pedidoService } from "../services/pedidoService";
import { useRemoteSyncStore } from "../store/useRemoteSyncStore";
import type { Pedido } from "../types";
import {
  primaryButtonStyle,
  sectionCardStyle,
  ui,
} from "../styles/ui";
import {
  readLocalUserDocumentPayload,
  type ClientProfileDocument,
} from "../services/userStateSchemas";

type PedidoLike = Pedido & {
  descontoAplicado?: number;
  cupomCodigo?: string | null;
};

function statusColor(status: string) {
  switch (status) {
    case "criado":
      return "#6B7280";
    case "confirmado":
      return "#2563EB";
    case "buscando_entregador":
      return "#92400E";
    case "preparando":
      return "#EA580C";
    case "saiu_para_entrega":
      return "#7C3AED";
    case "entregue":
      return "#16A34A";
    case "cancelado":
      return "#B91C1C";
    default:
      return "#6B7280";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "criado":
      return "Criado";
    case "confirmado":
      return "Confirmado";
    case "buscando_entregador":
      return "Buscando entregador";
    case "preparando":
      return "Preparando";
    case "saiu_para_entrega":
      return "Saiu para entrega";
    case "entregue":
      return "Entregue";
    case "cancelado":
      return "Cancelado";
    default:
      return status;
  }
}

function statusSubtitle(status: string) {
  switch (status) {
    case "criado":
      return "Pedido criado no sistema";
    case "confirmado":
      return "Loja confirmou seu pedido";
    case "buscando_entregador":
      return "Buscando entregador proximo";
    case "preparando":
      return "Pedido em preparacao";
    case "saiu_para_entrega":
      return "Entregador a caminho";
    case "entregue":
      return "Pedido finalizado";
    case "cancelado":
      return "Pedido encerrado";
    default:
      return "Aguardando atualizacao";
  }
}

function statusEta(status: string) {
  switch (status) {
    case "criado":
      return "Tempo estimado: ate 45 min";
    case "confirmado":
      return "Tempo estimado: 20 a 35 min";
    case "buscando_entregador":
      return "Tempo estimado: 5 a 10 min";
    case "preparando":
      return "Tempo estimado: 10 a 20 min";
    case "saiu_para_entrega":
      return "Tempo estimado: chegando em breve";
    case "entregue":
      return "Entrega concluida";
    case "cancelado":
      return "Fluxo encerrado";
    default:
      return "Aguardando atualizacao";
  }
}

function money(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizePedidos(list: PedidoLike[]) {
  const map = new Map<string, PedidoLike>();

  for (const pedido of list) {
    const id = String(pedido?.id ?? "").trim();
    if (!id) continue;

    const existing = map.get(id);
    if (!existing) {
      map.set(id, pedido);
      continue;
    }

    const existingTime = new Date(existing.updatedAt ?? existing.createdAt ?? 0).getTime();
    const incomingTime = new Date(pedido.updatedAt ?? pedido.createdAt ?? 0).getTime();

    map.set(id, incomingTime >= existingTime ? pedido : existing);
  }

  return Array.from(map.values());
}

function compactRegion(order: any) {
  return (
    order?.enderecoSnapshot?.bairro ??
    order?.enderecoSnapshot?.neighborhood ??
    order?.enderecoSnapshot?.cidade ??
    order?.enderecoSnapshot?.city ??
    "Nao informada"
  );
}

export default function Orders() {
  const navigate = useNavigate();
  const pedidos = usePedidoStore((s) => s.pedidos);
  const loadingRemote = usePedidoStore((s) => s.loadingRemote);
  const remoteReady = usePedidoStore((s) => s.remoteReady);
  const refetchPedidos = usePedidoStore((s) => s.refetchPedidos);
  const publicVersion = useRemoteSyncStore((s) => s.publicVersion);
  const clientProfile = useMemo(
    () =>
      readLocalUserDocumentPayload("client_profile") as ClientProfileDocument,
    [publicVersion]
  );

  const clienteTelefone = useMemo(() => clientProfile.telefone || "", [clientProfile.telefone]);
  const clienteNome = useMemo(() => clientProfile.nome || "", [clientProfile.nome]);

  const refreshPedidos = useCallback(async () => {
    try {
      await refetchPedidos();
    } catch (error) {
      appLogger.error("orders", "refresh_pedidos_failed", error);
    }
  }, [refetchPedidos]);

  useEffect(() => {
    void refreshPedidos();
    const stopRealtime = pedidoService.subscribePedidosRealtime(() => {
      void refreshPedidos();
    });
    const timer = window.setInterval(() => {
      void refreshPedidos();
    }, 8000);
    return () => {
      stopRealtime();
      window.clearInterval(timer);
    };
  }, [refreshPedidos]);

  const pedidosFiltrados = useMemo(() => {
    const base = Array.isArray(pedidos) ? normalizePedidos(pedidos as PedidoLike[]) : [];
    if (base.length === 0) return [];

    const phoneDigits = String(clienteTelefone || "").replace(/\D/g, "");
    const nameLower = String(clienteNome || "").trim().toLowerCase();

    const matched = base.filter((p: any) => {
      const pedidoPhoneDigits = String(p?.clienteTelefone || "").replace(/\D/g, "");
      const pedidoNome = String(p?.clienteNome || "").trim().toLowerCase();

      if (phoneDigits && pedidoPhoneDigits && pedidoPhoneDigits === phoneDigits) return true;
      if (nameLower && pedidoNome && pedidoNome === nameLower) return true;
      return false;
    });

    return matched.length > 0 ? matched : base;
  }, [pedidos, clienteTelefone, clienteNome]);

  const { active, history } = useMemo(() => {
    const ordered = [...pedidosFiltrados].sort(
      (a: any, b: any) =>
        new Date(b?.updatedAt ?? b?.createdAt ?? 0).getTime() -
        new Date(a?.updatedAt ?? a?.createdAt ?? 0).getTime()
    );

    return {
      active: ordered.filter((p: any) => p.status !== "entregue" && p.status !== "cancelado"),
      history: ordered.filter((p: any) => p.status === "entregue" || p.status === "cancelado"),
    };
  }, [pedidosFiltrados]);

  function PedidoCard({ order, highlighted }: { order: any; highlighted?: boolean }) {
    const color = statusColor(order?.status);
    const itens = Array.isArray(order?.itens) ? order.itens : [];
    const resumoItens = itens.length > 0 ? itens.map((item: any) => `${item.quantidade}x ${item.nome}`).join(", ") : "Itens indisponiveis";

    return (
      <button
        onClick={() => navigate(`/orders/${order.id}`)}
        type="button"
        style={{
          ...card,
          border: highlighted
            ? "2px solid rgba(228,79,42,0.38)"
            : order?.status === "cancelado"
            ? "1px solid rgba(185,28,28,0.16)"
            : "1px solid rgba(15,23,42,0.08)",
        }}
      >
        <div style={cardTop}>
            <div style={{ minWidth: 0 }}>
              <div style={cardTitle}>Pedido #{String(order.id).slice(0, 6)}</div>
              <div style={cardSubtitle}>{statusSubtitle(order?.status)}</div>
              <div style={etaBadge}>{statusEta(order?.status)}</div>
            </div>

          <span
            style={{
              ...statusPill,
              background: `${color}18`,
              color,
              border: `1px solid ${color}22`,
            }}
          >
            {statusLabel(order?.status)}
          </span>
        </div>

        {order?.tipo === "agendado" && order?.horarioAgendado ? (
          <div style={scheduledBox}>
            Agendado para {new Date(order.horarioAgendado).toLocaleString("pt-BR")}
          </div>
        ) : null}

        {order?.deliveryPin && order?.status !== "entregue" && order?.status !== "cancelado" ? (
          <div style={pinPill}>PIN: {order.deliveryPin}</div>
        ) : null}

        <div style={compactInfoGrid}>
          <div style={compactInfoBox}>
            <div style={compactLabel}>Itens</div>
            <div style={compactValueText}>{resumoItens}</div>
          </div>

          <div style={compactInfoBox}>
            <div style={compactLabel}>Data</div>
            <div style={compactValueText}>
              {new Date(order?.updatedAt ?? order?.createdAt ?? Date.now()).toLocaleString("pt-BR")}
            </div>
          </div>

          <div style={compactInfoBox}>
            <div style={compactLabel}>Valor</div>
            <div style={compactValueMoney}>{money(order?.total)}</div>
          </div>

          <div style={compactInfoBox}>
            <div style={compactLabel}>Regiao</div>
            <div style={compactValueText}>{compactRegion(order)}</div>
          </div>
        </div>

        {order?.cupomCodigo ? (
          <div style={couponPill}>
            Cupom: {order.cupomCodigo}
            {order?.descontoAplicado ? ` • Desconto: ${money(order.descontoAplicado)}` : ""}
          </div>
        ) : null}

        {order?.status === "cancelado" ? (
          <div style={cancelBox}>
            <strong>Motivo:</strong> {order?.motivoCancelamento || "Sem motivo informado"}
          </div>
        ) : null}

        <div style={tapHint}>Toque para ver detalhes completos</div>
      </button>
    );
  }

  return (
    <Layout>
      <div style={{ paddingBottom: 96 }}>
        <PageHeader title="Pedidos" subtitle="Acompanhe seus pedidos em andamento e o histórico" />

        <div style={syncLine}>
          Atualização: {remoteReady ? "ao vivo" : "reconectando"}
          {loadingRemote ? " • atualizando..." : ""}
        </div>

        {pedidosFiltrados.length === 0 && (
          <div style={emptyCard}>
            <h3 style={{ marginTop: 0 }}>Nenhum pedido ainda</h3>
            <p style={{ opacity: 0.82, marginTop: 6, lineHeight: 1.5 }}>
              Quando voce fizer um pedido, ele aparece aqui com status e resumo rapido.
            </p>
            <button onClick={() => navigate("/loja")} style={primaryBtn} type="button">
              Pedir agora
            </button>
          </div>
        )}

        {active.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={sectionTitle}>Em andamento</h3>
            {active.map((order: any) => (
              <PedidoCard key={order.id} order={order} highlighted />
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <h3 style={sectionTitle}>Histórico</h3>
            {history.map((order: any) => (
              <PedidoCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

const emptyCard: CSSProperties = {
  ...sectionCardStyle({
    padding: 20,
  marginTop: 16,
  }),
};

const primaryBtn: CSSProperties = {
  ...primaryButtonStyle({
    marginTop: 12,
    width: "100%",
    padding: 14,
  }),
};

const sectionTitle: CSSProperties = {
  marginBottom: 8,
  color: "#111827",
};

const card: CSSProperties = {
  width: "100%",
  marginTop: 12,
  ...sectionCardStyle({
    padding: 16,
  }),
  cursor: "pointer",
  textAlign: "left",
};

const cardTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const cardTitle: CSSProperties = {
  fontWeight: 950,
  fontSize: 16,
  color: "#111827",
};

const cardSubtitle: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.45,
};

const etaBadge: CSSProperties = {
  marginTop: 8,
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.05)",
  color: ui.color.textSoft,
  fontSize: 12,
  fontWeight: 800,
};

const statusPill: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const pinPill: CSSProperties = {
  marginTop: 10,
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.06)",
  border: "1px solid rgba(17,24,39,0.12)",
  color: "#111827",
  fontWeight: 950,
  fontSize: 13,
};

const scheduledBox: CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 16,
  background: "rgba(228,79,42,0.08)",
  border: "1px solid rgba(228,79,42,0.14)",
  color: "#9A3412",
  fontWeight: 800,
  fontSize: 13,
};

const compactInfoGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const compactInfoBox: CSSProperties = {
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
  borderRadius: 16,
  padding: 12,
};

const compactLabel: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
  color: "#64748B",
};

const compactValueText: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#111827",
  lineHeight: 1.45,
};

const compactValueMoney: CSSProperties = {
  marginTop: 6,
  fontSize: 15,
  fontWeight: 950,
  color: "#E44F2A",
};

const couponPill: CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(22,163,74,0.08)",
  color: "#166534",
  border: "1px solid rgba(22,163,74,0.16)",
  fontWeight: 800,
  fontSize: 12.5,
};

const cancelBox: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  background: "rgba(185,28,28,0.06)",
  color: "#7F1D1D",
  border: "1px solid rgba(185,28,28,0.14)",
  lineHeight: 1.5,
  fontSize: 13,
};

const tapHint: CSSProperties = {
  marginTop: 12,
  fontSize: 12.5,
  color: "#64748B",
  fontWeight: 700,
};

const syncLine: CSSProperties = {
  marginTop: 12,
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};


