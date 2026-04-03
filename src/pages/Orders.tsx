import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../layout";
import PageHeader from "../components/PageHeader";
import { usePedidoStore } from "../store/usePedidoStore";
import { pedidoService } from "../services/pedidoService";
import type { Pedido } from "../types";

type PedidoLike = Pedido & {
  descontoAplicado?: number;
  cupomCodigo?: string | null;
};

function statusColor(status: string) {
  switch (status) {
    case "criado":
      return "#999";
    case "confirmado":
      return "#1E88E5";
    case "buscando_entregador":
      return "#6D4C41";
    case "preparando":
      return "#FB8C00";
    case "saiu_para_entrega":
      return "#8E24AA";
    case "entregue":
      return "#43A047";
    case "cancelado":
      return "#B91C1C";
    default:
      return "#999";
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
      return "Seu pedido foi criado";
    case "confirmado":
      return "Pedido confirmado pela loja";
    case "buscando_entregador":
      return "Buscando entregador disponível";
    case "preparando":
      return "Entregador encontrado • preparando para sair";
    case "saiu_para_entrega":
      return "O entregador está a caminho";
    case "entregue":
      return "Pedido finalizado";
    case "cancelado":
      return "Pedido cancelado";
    default:
      return "Aguardando atualização";
  }
}

function money(v: number) {
  const n = Number(v || 0);
  return n.toFixed(2).replace(".", ",");
}

function safeGet(key: string, fallback = "") {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v : fallback;
  } catch {
    return fallback;
  }
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

    const existingTime = new Date(
      existing.updatedAt ?? existing.createdAt ?? 0
    ).getTime();
    const incomingTime = new Date(
      pedido.updatedAt ?? pedido.createdAt ?? 0
    ).getTime();

    map.set(id, incomingTime >= existingTime ? pedido : existing);
  }

  return Array.from(map.values());
}

export default function Orders() {
  const navigate = useNavigate();
  const pedidos = usePedidoStore((s) => s.pedidos);
  const replacePedidos = usePedidoStore((s) => s.replacePedidos);

  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);

  const clienteTelefone = useMemo(() => safeGet("cg_cliente_telefone", ""), []);
  const clienteNome = useMemo(() => safeGet("cg_cliente_nome", ""), []);

  const refreshPedidos = useCallback(async () => {
    try {
      setLoadingRemote(true);
      const data = await pedidoService.listarPedidosRemotos();
      if (Array.isArray(data)) {
        replacePedidos(normalizePedidos(data as PedidoLike[]));
        setRemoteReady(true);
      }
    } catch (error) {
      console.error("Orders refreshPedidos error:", error);
    } finally {
      setLoadingRemote(false);
    }
  }, [replacePedidos]);

  useEffect(() => {
    void refreshPedidos();
    const timer = window.setInterval(() => {
      void refreshPedidos();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [refreshPedidos]);

  const pedidosFiltrados = useMemo(() => {
    const base = Array.isArray(pedidos) ? normalizePedidos(pedidos as PedidoLike[]) : [];
    if (base.length === 0) return [];

    const phoneDigits = String(clienteTelefone || "").replace(/\D/g, "");
    const nameLower = String(clienteNome || "").trim().toLowerCase();

    const matched = base.filter((p: any) => {
      const pedidoPhoneDigits = String(p?.clienteTelefone || "").replace(/\D/g, "");
      const pedidoNome = String(p?.clienteNome || "").trim().toLowerCase();

      if (phoneDigits && pedidoPhoneDigits && pedidoPhoneDigits === phoneDigits) {
        return true;
      }

      if (nameLower && pedidoNome && pedidoNome === nameLower) {
        return true;
      }

      return false;
    });

    if (matched.length > 0) return matched;
    return base;
  }, [pedidos, clienteTelefone, clienteNome]);

  const { active, history } = useMemo(() => {
    const ordered = [...pedidosFiltrados].sort(
      (a: any, b: any) =>
        new Date(b?.updatedAt ?? b?.createdAt ?? 0).getTime() -
        new Date(a?.updatedAt ?? a?.createdAt ?? 0).getTime()
    );

    const a = ordered.filter(
      (p: any) => p.status !== "entregue" && p.status !== "cancelado"
    );
    const h = ordered.filter(
      (p: any) => p.status === "entregue" || p.status === "cancelado"
    );

    return { active: a, history: h };
  }, [pedidosFiltrados]);

  function renderEndereco(p: any) {
    const e = p?.enderecoSnapshot;
    if (!e) return null;

    const rua = e.street ?? e.rua ?? "";
    const numero = e.number ?? e.numero ?? "";
    const bairro = e.neighborhood ?? e.bairro ?? "";
    const cidade = e.city ?? e.cidade ?? "";

    return (
      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          opacity: 0.9,
          lineHeight: 1.5,
        }}
      >
        <strong>Endereço</strong>
        <div style={{ marginTop: 6 }}>
          {rua}
          {rua && numero ? ", " : ""}
          {numero}
          <br />
          {bairro}
          {bairro && cidade ? "/" : ""}
          {cidade}
        </div>
      </div>
    );
  }

  function renderItens(p: any) {
    const itens = Array.isArray(p?.itens) ? p.itens : [];
    if (itens.length === 0) {
      return <div style={{ opacity: 0.7 }}>Itens não disponíveis</div>;
    }

    return (
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            fontWeight: 900,
            marginBottom: 6,
            color: "#111827",
          }}
        >
          Itens
        </div>

        {itens.map((i: any, index: number) => (
          <div
            key={`${i.produtoId ?? i.nome ?? "item"}-${index}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 6,
              fontSize: 14,
            }}
          >
            <span>
              {i.quantidade}x {i.nome}
            </span>
            <span style={{ fontWeight: 800 }}>
              R$ {money((i.precoUnitario || 0) * (i.quantidade || 0))}
            </span>
          </div>
        ))}
      </div>
    );
  }

  function PedidoCard({ order, highlighted }: { order: any; highlighted?: boolean }) {
    const color = statusColor(order?.status);
    const label = statusLabel(order?.status);

    return (
      <div
        onClick={() => navigate(`/orders/${order.id}`)}
        style={{
          background: "#fff",
          padding: 18,
          borderRadius: 24,
          marginTop: 12,
          boxShadow: "0 10px 24px rgba(0,0,0,.05)",
          cursor: "pointer",
          border: highlighted
            ? "2px solid #E44F2A"
            : order?.status === "cancelado"
            ? "2px solid rgba(185,28,28,0.18)"
            : "1px solid #eee",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 950,
                fontSize: 16,
                color: "#111827",
              }}
            >
              Pedido #{String(order.id).slice(0, 6)}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
              {statusSubtitle(order?.status)}
            </div>
          </div>

          <span
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: `${color}22`,
              color,
              fontWeight: 900,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
        </div>

        {order?.deliveryPin &&
        order?.status !== "entregue" &&
        order?.status !== "cancelado" ? (
          <div style={pinPill}>PIN: {order.deliveryPin}</div>
        ) : null}

        {order?.cupomCodigo ? (
          <div style={couponPill}>
            Cupom: {order.cupomCodigo}
            {order?.descontoAplicado
              ? ` • Desconto: R$ ${money(order.descontoAplicado)}`
              : ""}
          </div>
        ) : null}

        {order?.tipo === "agendado" && order?.horarioAgendado ? (
          <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5 }}>
            <strong>Agendado para</strong>
            <div style={{ marginTop: 6 }}>
              {new Date(order.horarioAgendado).toLocaleString("pt-BR")}
            </div>
          </div>
        ) : null}

        {renderItens(order)}

        <div
          style={{
            borderTop: "1px dashed #eee",
            marginTop: 14,
            paddingTop: 12,
            fontSize: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Subtotal</span>
            <strong>R$ {money(order?.subtotal)}</strong>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 6,
            }}
          >
            <span>Entrega</span>
            <strong>R$ {money(order?.taxaEntrega)}</strong>
          </div>

          {Number(order?.descontoAplicado || 0) > 0 ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 6,
              }}
            >
              <span>Desconto</span>
              <strong style={{ color: "#16A34A" }}>
                - R$ {money(order?.descontoAplicado)}
              </strong>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 10,
              fontSize: 15,
            }}
          >
            <strong>Total</strong>
            <strong style={{ color: "#E44F2A" }}>
              R$ {money(order?.total)}
            </strong>
          </div>
        </div>

        {renderEndereco(order)}

        {order?.status === "cancelado" ? (
          <div style={cancelBox}>
            <strong>Motivo:</strong> {order?.motivoCancelamento || "Sem motivo informado"}
            {order?.observacaoCancelamento ? (
              <div style={{ marginTop: 6 }}>
                <strong>Obs:</strong> {order.observacaoCancelamento}
              </div>
            ) : null}
          </div>
        ) : null}

        {order?.observacao && order?.status !== "cancelado" ? (
          <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
            <strong>Obs:</strong> {order.observacao}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Layout>
      <div style={{ paddingBottom: 96 }}>
        <PageHeader
          title="Pedidos"
          subtitle="Acompanhe seus pedidos em andamento e o histórico"
        />

        <div style={syncLine}>
          Fonte atual: {remoteReady ? "Supabase" : "Aguardando sync"}
          {loadingRemote ? " • sincronizando..." : ""}
        </div>

        {pedidosFiltrados.length === 0 && (
          <div style={emptyCard}>
            <h3 style={{ marginTop: 0 }}>Nenhum pedido ainda</h3>
            <p
              style={{
                opacity: 0.82,
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              Quando você fizer um pedido, ele aparece aqui com o status, o PIN e os detalhes.
            </p>

            <button
              onClick={() => navigate("/loja")}
              style={primaryBtn}
              type="button"
            >
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

const emptyCard: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 24,
  marginTop: 16,
  boxShadow: "0 10px 24px rgba(0,0,0,.05)",
};

const primaryBtn: React.CSSProperties = {
  marginTop: 12,
  background: "#E44F2A",
  border: "none",
  color: "#fff",
  fontWeight: 900,
  width: "100%",
  padding: 14,
  borderRadius: 18,
  cursor: "pointer",
};

const sectionTitle: React.CSSProperties = {
  marginBottom: 8,
  color: "#111827",
};

const pinPill: React.CSSProperties = {
  marginTop: 12,
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.06)",
  border: "1px solid rgba(17,24,39,0.12)",
  color: "#111827",
  fontWeight: 950,
  fontSize: 13,
};

const couponPill: React.CSSProperties = {
  marginTop: 10,
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(22,163,74,0.10)",
  border: "1px solid rgba(22,163,74,0.16)",
  color: "#166534",
  fontWeight: 900,
  fontSize: 12.5,
};

const cancelBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  background: "rgba(185,28,28,0.06)",
  border: "1px solid rgba(185,28,28,0.14)",
  color: "#7F1D1D",
  fontSize: 13,
  lineHeight: 1.5,
};

const syncLine: React.CSSProperties = {
  marginTop: 12,
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};