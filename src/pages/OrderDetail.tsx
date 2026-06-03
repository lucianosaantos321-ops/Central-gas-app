import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../layout";
import { appLogger } from "../services/appLogger";
import { usePedidoStore } from "../store/usePedidoStore";
import { pedidoService } from "../services/pedidoService";
import type { Pedido } from "../types";
import {
  primaryButtonStyle,
  sectionCardStyle,
  secondaryButtonStyle,
  ui,
} from "../styles/ui";
import { CENTRAL_SUPPORT_WHATSAPP } from "../utils/centralSupport";

const etapas = [
  { key: "criado", label: "Pedido criado", short: "Criado" },
  { key: "confirmado", label: "Confirmado", short: "Confirmado" },
  { key: "buscando_entregador", label: "Buscando entregador", short: "Busca" },
  { key: "preparando", label: "Preparando", short: "Preparo" },
  { key: "saiu_para_entrega", label: "Saiu para entrega", short: "Rota" },
  { key: "entregue", label: "Entregue", short: "Entregue" },
] as const;

type EtapaKey = (typeof etapas)[number]["key"];
type PedidoLike = Pedido & {
  descontoAplicado?: number;
  cupomCodigo?: string | null;
};

function statusLabel(status: string) {
  const etapa = etapas.find((item) => item.key === status);
  if (etapa) return etapa.label;
  if (status === "cancelado") return "Cancelado";
  return status;
}

function statusColor(status: string) {
  switch (status) {
    case "criado":
      return "#6B7280";
    case "confirmado":
      return "#2563EB";
    case "buscando_entregador":
      return "#A16207";
    case "preparando":
      return "#EA580C";
    case "saiu_para_entrega":
      return "#16A34A";
    case "entregue":
      return "#15803D";
    case "cancelado":
      return "#B91C1C";
    default:
      return "#6B7280";
  }
}

function money(value: number) {
  if (!Number.isFinite(value)) return "R$ 0,00";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function safeText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function sanitizeObservacao(value: unknown) {
  const text = safeText(value);
  if (!text) return "";

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.toLowerCase().startsWith("pin mapa:") &&
        !line.toLowerCase().startsWith("localizacao (maps):") &&
        !line.toLowerCase().startsWith("localizacao (maps):") &&
        !line.toLowerCase().startsWith("cupom aplicado:")
    )
    .join("\n");
}

function normalizePhoneBR(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function buildWhatsAppLink(phone: string, message: string) {
  const normalized = normalizePhoneBR(phone);
  const text = encodeURIComponent(message);
  return normalized
    ? `https://api.whatsapp.com/send?phone=${normalized}&text=${text}`
    : `https://api.whatsapp.com/send?text=${text}`;
}

function etaByStatus(status: string, tipo?: string | null) {
  switch (status) {
    case "criado":
      return "Em ate 45 min";
    case "confirmado":
      if (tipo === "agendado") return "Pedido confirmado para o horario escolhido";
      return "Loja confirmou seu pedido";
    case "buscando_entregador":
      return "Localizando um entregador";
    case "preparando":
      return "Preparando para sair";
    case "saiu_para_entrega":
      return "Chegando em breve";
    case "entregue":
      return "Entrega concluida";
    case "cancelado":
      return "Pedido encerrado";
    default:
      return "Em breve";
  }
}

function statusHint(status: string, tipo?: string | null) {
  switch (status) {
    case "criado":
      return "Recebemos seu pedido e o fluxo ja foi iniciado.";
    case "confirmado":
      if (tipo === "agendado") {
        return "Seu pedido agendado esta confirmado e aguardando o inicio da operacao no horario escolhido.";
      }
      return "A loja confirmou seu pedido e esta preparando a saida.";
    case "buscando_entregador":
      return "Estamos procurando um entregador disponivel para assumir a entrega.";
    case "preparando":
      return "Seu pedido esta em preparacao final para entrar em rota.";
    case "saiu_para_entrega":
      return "Seu entregador ja saiu com o pedido e esta indo ate voce.";
    case "entregue":
      return "Pedido entregue com sucesso.";
    case "cancelado":
      return "Esse pedido saiu do fluxo operacional.";
    default:
      return "Aguardando atualizacao.";
  }
}

function formatTimestamp(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("pt-BR");
}

function getEnderecoTexto(pedidoData: PedidoLike) {
  if (!pedidoData.enderecoSnapshot) return "";

  return [
    safeText(
      pedidoData.enderecoSnapshot.street ??
        (pedidoData.enderecoSnapshot as any).rua
    ),
    safeText(
      pedidoData.enderecoSnapshot.number ??
        (pedidoData.enderecoSnapshot as any).numero
    ),
    safeText(
      pedidoData.enderecoSnapshot.neighborhood ??
        (pedidoData.enderecoSnapshot as any).bairro
    ),
    safeText(
      pedidoData.enderecoSnapshot.city ??
        (pedidoData.enderecoSnapshot as any).cidade
    ),
  ]
    .filter(Boolean)
    .join(", ");
}

export default function OrderDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const pedidos = usePedidoStore((state) => state.pedidos);
  const loadingRemote = usePedidoStore((state) => state.loadingRemote);
  const remoteReady = usePedidoStore((state) => state.remoteReady);
  const refetchPedidoById = usePedidoStore((state) => state.refetchPedidoById);

  const refreshPedido = useCallback(async () => {
    if (!id) return;

    try {
      await refetchPedidoById(id);
    } catch (error) {
      appLogger.error("order_detail", "refresh_pedido_failed", error, {
        pedidoId: id,
      });
    }
  }, [id, refetchPedidoById]);

  useEffect(() => {
    void refreshPedido();
    const stopRealtime = pedidoService.subscribePedidosRealtime((pedidoId) => {
      if (!pedidoId || String(pedidoId) === String(id)) {
        void refreshPedido();
      }
    });
    const timer = window.setInterval(() => {
      void refreshPedido();
    }, 8000);
    return () => {
      stopRealtime();
      window.clearInterval(timer);
    };
  }, [refreshPedido]);

  const pedido = useMemo(
    () => pedidos.find((item) => String(item.id) === String(id)) ?? null,
    [pedidos, id]
  );

  const etapaAtualIndex = useMemo(() => {
    if (!pedido) return -1;
    return etapas.findIndex(
      (etapa) => etapa.key === (pedido.status as EtapaKey)
    );
  }, [pedido]);

  const progresso = useMemo(() => {
    if (!pedido) return 0;
    if (pedido.status === "cancelado") return 100;
    if (etapaAtualIndex < 0) return 0;
    return ((etapaAtualIndex + 1) / etapas.length) * 100;
  }, [pedido, etapaAtualIndex]);

  const totalItens = useMemo(() => {
    if (!pedido) return 0;
    return pedido.itens.reduce(
      (acc: number, item: any) => acc + Number(item.quantidade ?? 0),
      0
    );
  }, [pedido]);

  const subtotal = useMemo(() => {
    if (!pedido) return 0;
    return pedido.itens.reduce(
      (acc: number, item: any) =>
        acc +
        Number(item.precoUnitario ?? 0) * Number(item.quantidade ?? 0),
      0
    );
  }, [pedido]);

  const taxaEntrega = useMemo(() => {
    if (!pedido) return 0;
    return Number(
      (pedido as any).taxaEntrega ??
        (pedido as any).taxa_entrega ??
        (pedido as any).deliveryFee ??
        0
    );
  }, [pedido]);

  const descontoAplicado = useMemo(() => {
    if (!pedido) return 0;
    return Number(
      (pedido as any).descontoAplicado ??
        (pedido as any).desconto_aplicado ??
        0
    );
  }, [pedido]);

  const totalCalc = useMemo(
    () => subtotal + taxaEntrega - descontoAplicado,
    [subtotal, taxaEntrega, descontoAplicado]
  );

  if (!pedido) {
    return (
      <Layout>
        <div style={notFoundCard}>
          <h3 style={{ marginTop: 0, color: "#111827" }}>
            Pedido nao encontrado
          </h3>
          <p style={{ marginTop: 8, color: "#666", lineHeight: 1.5 }}>
            Esse pedido pode ter sido removido ou o link esta incorreto.
          </p>
          <div style={syncLine}>
            Atualização: {remoteReady ? "ao vivo" : "reconectando"}
            {loadingRemote ? " | atualizando..." : ""}
          </div>
          <button
            onClick={() => navigate("/orders")}
            style={primaryBtn}
            type="button"
          >
            Voltar para meus pedidos
          </button>
        </div>
      </Layout>
    );
  }

  const pedidoData = pedido as PedidoLike;
  const statusCor = statusColor(pedidoData.status);
  const eta = etaByStatus(pedidoData.status, pedidoData.tipo);
  const enderecoTxt = getEnderecoTexto(pedidoData);

  const whatsappLoja =
    (pedidoData as any).whatsappLoja ??
    (pedidoData as any).whatsapp ??
    CENTRAL_SUPPORT_WHATSAPP;

  const resumoItens = pedidoData.itens
    .map((item: any) => `${item.quantidade}x ${item.nome}`)
    .join(", ");

  const observacaoExibicao = sanitizeObservacao(pedidoData.observacao);
  const whatsappLink = buildWhatsAppLink(
    whatsappLoja,
    `Ola! Quero falar sobre meu pedido (${pedidoData.id}).\nStatus: ${statusLabel(
      pedidoData.status
    )}\nItens: ${resumoItens}\nTotal: ${money(
      (pedidoData as any).total ?? totalCalc
    )}\nEndereco: ${enderecoTxt || "nao informado"}\nObs: ${
      observacaoExibicao || "sem observacao"
    }`
  );

  const historicoOrdenado = [...(pedidoData.historico ?? [])].sort(
    (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
  );

  return (
    <Layout>
      <style>
        {`@keyframes cg-status-flow { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }`}
      </style>

      <div style={heroCard}>
        <div style={heroTop}>
          <div>
            <h2 style={heroTitle}>Acompanhe seu pedido</h2>
            <p style={heroSub}>Status, PIN e entrega em um só lugar</p>
            <div style={heroSyncLine}>
              Atualização: {remoteReady ? "ao vivo" : "reconectando"}
              {loadingRemote ? " | atualizando..." : ""}
            </div>
          </div>

          <button
            onClick={() => navigate("/orders")}
            style={backBtn}
            type="button"
          >
            Meus pedidos
          </button>
        </div>
      </div>

      <div style={sectionCard}>
        <div style={statusHeader}>
          <div>
            <div style={miniLabel}>Status atual</div>
            <div style={{ ...statusValue, color: statusCor }}>
              {statusLabel(pedidoData.status)}
            </div>
            <div style={etaText}>
              Previsão: <span style={{ color: "#111827" }}>{eta}</span>
            </div>
          </div>

          <div style={summaryPill}>
            {totalItens} item(ns) | {money((pedidoData as any).total ?? totalCalc)}
          </div>
        </div>

        <div style={hintText}>{statusHint(pedidoData.status, pedidoData.tipo)}</div>

        {pedidoData.status !== "cancelado" ? (
          <>
            <div style={animatedProgressTrack}>
              <div
                style={{
                  ...animatedProgressFill,
                  width: `${progresso}%`,
                }}
              />
            </div>

            <div style={stepGrid}>
              {etapas.map((etapa, index) => {
                const ativa = index <= etapaAtualIndex;
                const atual = index === etapaAtualIndex;
                return (
                  <div
                    key={etapa.key}
                    style={{
                      ...stepCard,
                      borderColor: atual
                        ? "rgba(22,163,74,0.24)"
                        : ativa
                        ? "rgba(228,79,42,0.18)"
                        : "rgba(0,0,0,0.08)",
                      background: atual
                        ? "rgba(240,253,244,0.95)"
                        : ativa
                        ? "rgba(255,247,237,0.62)"
                        : "#fff",
                      opacity: atual ? 1 : ativa ? 0.82 : 0.58,
                    }}
                  >
                    <div
                      style={{
                        ...stepDot,
                        background: ativa ? "#E44F2A" : "#E5E7EB",
                        boxShadow: atual
                          ? "0 0 0 5px rgba(34,197,94,0.14)"
                          : ativa
                          ? "0 0 0 4px rgba(228,79,42,0.10)"
                          : "none",
                      }}
                    />
                    <div style={stepShort}>{etapa.short}</div>
                    <div style={stepLabel}>{etapa.label}</div>
                  </div>
                );
              })}
            </div>

            <div style={timelineHistory}>
              <div style={timelineTitle}>Histórico do pedido</div>
              <div style={timelineStack}>
                {historicoOrdenado.map((item, index) => {
                  const isLast = index === historicoOrdenado.length - 1;
                  return (
                    <div key={`${item.status}-${item.data}-${index}`} style={timelineEventRow}>
                      <div style={timelineRailWrap}>
                        <div style={timelineRailDot} />
                        {!isLast ? <div style={timelineRailLine} /> : null}
                      </div>
                      <div>
                        <div style={timelineEventTitle}>
                          {statusLabel(item.status)}
                        </div>
                        <div style={timelineEventTime}>
                          {formatTimestamp(item.data)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div style={cancelBox}>
            <div style={{ fontWeight: 950 }}>Pedido cancelado</div>
            <div style={{ marginTop: 8, lineHeight: 1.5 }}>
              <strong>Motivo:</strong>{" "}
              {safeText((pedidoData as any).motivoCancelamento) ||
                "Sem motivo informado"}
            </div>
            {safeText((pedidoData as any).observacaoCancelamento) ? (
              <div style={{ marginTop: 8, lineHeight: 1.5 }}>
                <strong>Obs:</strong>{" "}
                {safeText((pedidoData as any).observacaoCancelamento)}
              </div>
            ) : null}
          </div>
        )}

        <div style={metaGrid}>
          {pedidoData.tipo === "agendado" && pedidoData.horarioAgendado ? (
            <div style={metaBox}>
              <div style={metaLabel}>Agendado para</div>
              <div style={metaValue}>
                {new Date(pedidoData.horarioAgendado).toLocaleString("pt-BR")}
              </div>
            </div>
          ) : null}

          {pedidoData.deliveryPin &&
          pedidoData.status !== "entregue" &&
          pedidoData.status !== "cancelado" ? (
            <div style={metaBox}>
              <div style={metaLabel}>PIN de segurança</div>
              <div style={pinValue}>{pedidoData.deliveryPin}</div>
              <div style={pinHint}>
                Informe este PIN ao entregador somente no momento da entrega.
              </div>
            </div>
          ) : null}
        </div>

        <a
          href={whatsappLink}
          target="_blank"
          rel="noreferrer"
          style={ctaLink}
        >
          Falar no WhatsApp
        </a>
      </div>

      <div style={infoGrid}>
        <div style={sectionCardCompact}>
          <div style={sectionHeaderRow}>
            <h3 style={sectionHeading}>Itens</h3>
            <div style={sectionTotalText}>
              Total:{" "}
              <span style={{ color: "#E44F2A", fontWeight: 950 }}>
                {money((pedidoData as any).total ?? totalCalc)}
              </span>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {pedidoData.itens.map((item: any, index: number) => (
              <div
                key={`${item.produtoId ?? item.nome ?? "item"}-${index}`}
                style={itemRow}
              >
                <div style={{ fontWeight: 800 }}>
                  {item.quantidade}x {item.nome}
                </div>
                <div style={{ fontWeight: 900, color: "#444" }}>
                  {money(
                    Number(item.precoUnitario ?? 0) *
                      Number(item.quantidade ?? 0)
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={totalsWrap}>
            <div style={totalLine}>
              <span style={totalLabel}>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>

            <div style={{ ...totalLine, marginTop: 8 }}>
              <span style={totalLabel}>Taxa de entrega</span>
              <strong>{money(taxaEntrega)}</strong>
            </div>

            {descontoAplicado > 0 ? (
              <div style={{ ...totalLine, marginTop: 8 }}>
                <span style={totalLabel}>Desconto</span>
                <strong style={{ color: "#16A34A" }}>
                  - {money(descontoAplicado)}
                </strong>
              </div>
            ) : null}

            <div style={{ ...totalLine, marginTop: 10, fontSize: 16 }}>
              <strong>Total</strong>
              <strong style={{ color: "#E44F2A" }}>
                {money((pedidoData as any).total ?? totalCalc)}
              </strong>
            </div>
          </div>
        </div>

        {pedidoData.enderecoSnapshot ? (
          <div style={sectionCardCompact}>
            <h3 style={sectionHeading}>Endereço</h3>

            <div style={{ fontWeight: 900 }}>
              {(pedidoData.enderecoSnapshot as any).label ??
                (pedidoData.enderecoSnapshot as any).nome ??
                "Entrega"}
            </div>

            <div style={addressText}>
              {enderecoTxt || "Endereço não informado"}
            </div>

            {((pedidoData.enderecoSnapshot as any).lat ||
              (pedidoData.enderecoSnapshot as any).latitude ||
              (pedidoData.enderecoSnapshot as any).lng ||
              (pedidoData.enderecoSnapshot as any).longitude) ? (
              <div style={mapReadyPill}>Ponto de mapa salvo</div>
            ) : null}
          </div>
        ) : null}

        {observacaoExibicao ? (
          <div style={sectionCardCompact}>
            <h3 style={sectionHeading}>Observação</h3>
            <div style={obsText}>{observacaoExibicao}</div>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 18 }}>
        <button
          onClick={() => navigate("/loja")}
          style={newOrderBtn}
          type="button"
        >
          Pedir novamente
        </button>
      </div>
    </Layout>
  );
}

const notFoundCard: React.CSSProperties = {
  ...sectionCardStyle({
    padding: 20,
    marginTop: 16,
  }),
};

const syncLine: React.CSSProperties = {
  marginTop: 12,
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const primaryBtn: React.CSSProperties = {
  ...primaryButtonStyle({
    marginTop: 16,
    padding: "0 18px",
  }),
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg,#FF4500,#FF7A18)",
  padding: "20px 18px",
  borderRadius: 22,
  color: "#fff",
  position: "relative",
  overflow: "hidden",
  boxShadow: "0 14px 28px rgba(228,79,42,0.16)",
};

const heroTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const heroTitle: React.CSSProperties = {
  margin: 0,
  fontWeight: 950,
  color: "#fff",
};

const heroSub: React.CSSProperties = {
  marginTop: 6,
  opacity: 0.92,
  lineHeight: 1.45,
};

const heroSyncLine: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(255,255,255,0.92)",
};

const backBtn: React.CSSProperties = {
  alignSelf: "flex-start",
  ...secondaryButtonStyle({
    background: "rgba(255,255,255,.18)",
    border: "1px solid rgba(255,255,255,.35)",
    color: "#fff",
    padding: "10px 12px",
    minHeight: 42,
  }),
  whiteSpace: "nowrap",
};

const sectionCard: React.CSSProperties = {
  ...sectionCardStyle({
    padding: 18,
    marginTop: 14,
    border: "1px solid #f1f1f1",
  }),
};

const sectionCardCompact: React.CSSProperties = {
  ...sectionCardStyle({
    padding: 18,
    border: "1px solid #f1f1f1",
  }),
};

const statusHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const miniLabel: React.CSSProperties = {
  fontSize: 13,
  color: "#666",
  fontWeight: 700,
};

const statusValue: React.CSSProperties = {
  marginTop: 6,
  fontWeight: 950,
  fontSize: 20,
};

const etaText: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#777",
  fontWeight: 700,
};

const summaryPill: React.CSSProperties = {
  background: "rgba(228,79,42,.08)",
  border: "1px solid rgba(228,79,42,.20)",
  color: "#E44F2A",
  fontWeight: 900,
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const hintText: React.CSSProperties = {
  marginTop: 12,
  fontSize: 14,
  color: "#4B5563",
  lineHeight: 1.6,
};

const animatedProgressTrack: React.CSSProperties = {
  marginTop: 18,
  height: 10,
  background: "#EDF0F4",
  borderRadius: 999,
  overflow: "hidden",
};

const animatedProgressFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background:
    "linear-gradient(90deg, #E44F2A 0%, #FF7A18 32%, #34D399 68%, #E44F2A 100%)",
  backgroundSize: "200% 100%",
  animation: "cg-status-flow 2.2s linear infinite",
  transition: "width .35s ease",
};

const stepGrid: React.CSSProperties = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const stepCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  minHeight: 92,
};

const stepDot: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: "50%",
};

const stepShort: React.CSSProperties = {
  marginTop: 10,
  fontSize: 12,
  fontWeight: 900,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const stepLabel: React.CSSProperties = {
  marginTop: 6,
  fontWeight: 900,
  color: "#111827",
  lineHeight: 1.35,
};

const timelineHistory: React.CSSProperties = {
  marginTop: 18,
  padding: 16,
  borderRadius: 20,
  background: "#FAFAFA",
  border: "1px solid #EFEFEF",
};

const timelineTitle: React.CSSProperties = {
  fontWeight: 950,
  color: "#111827",
};

const timelineStack: React.CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 12,
};

const timelineEventRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "24px minmax(0, 1fr)",
  gap: 10,
};

const timelineRailWrap: React.CSSProperties = {
  display: "grid",
  justifyItems: "center",
};

const timelineRailDot: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: "50%",
  background: "#34D399",
  marginTop: 2,
};

const timelineRailLine: React.CSSProperties = {
  width: 2,
  flex: 1,
  minHeight: 28,
  marginTop: 6,
  background: "#A7F3D0",
};

const timelineEventTitle: React.CSSProperties = {
  fontWeight: 900,
  color: "#111827",
};

const timelineEventTime: React.CSSProperties = {
  marginTop: 4,
  color: "#6B7280",
  fontSize: 13,
};

const cancelBox: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 18,
  background: "rgba(185,28,28,0.06)",
  border: "1px solid rgba(185,28,28,0.14)",
  color: "#7F1D1D",
};

const metaGrid: React.CSSProperties = {
  marginTop: 18,
  display: "grid",
  gap: 12,
};

const metaBox: React.CSSProperties = {
  padding: 16,
  borderRadius: 20,
  background: "#FAFAFA",
  border: "1px solid #EFEFEF",
};

const metaLabel: React.CSSProperties = {
  fontWeight: 900,
  color: "#111827",
};

const metaValue: React.CSSProperties = {
  marginTop: 6,
  color: "#4B5563",
};

const pinValue: React.CSSProperties = {
  marginTop: 8,
  fontSize: 28,
  fontWeight: 950,
  color: "#111827",
  letterSpacing: "0.08em",
};

const pinHint: React.CSSProperties = {
  marginTop: 8,
  color: "#6B7280",
  lineHeight: 1.5,
};

const ctaLink: React.CSSProperties = {
  marginTop: 16,
  display: "flex",
  width: "100%",
  minHeight: 52,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: ui.radius.button,
  color: "#fff",
  background: ui.color.primaryGradient,
  fontWeight: 900,
  textDecoration: "none",
  boxShadow: ui.shadow.orange,
};

const infoGrid: React.CSSProperties = {
  marginTop: 16,
  display: "grid",
  gap: 16,
};

const sectionHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const sectionHeading: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  color: "#111827",
  fontWeight: 950,
};

const sectionTotalText: React.CSSProperties = {
  color: "#6B7280",
  fontWeight: 800,
};

const itemRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 10,
  borderBottom: "1px solid #F1F1F1",
};

const totalsWrap: React.CSSProperties = {
  marginTop: 16,
};

const totalLine: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const totalLabel: React.CSSProperties = {
  color: "#555",
};

const addressText: React.CSSProperties = {
  marginTop: 10,
  color: "#444",
  lineHeight: 1.65,
};

const mapReadyPill: React.CSSProperties = {
  marginTop: 12,
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(34,197,94,.10)",
  border: "1px solid rgba(34,197,94,.18)",
  color: "#15803D",
  fontWeight: 900,
};

const obsText: React.CSSProperties = {
  color: "#444",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const newOrderBtn: React.CSSProperties = {
  width: "100%",
  minHeight: 52,
  borderRadius: ui.radius.button,
  border: "2px solid rgba(228,79,42,.70)",
  background: "#fff",
  color: "#E44F2A",
  fontWeight: 900,
  cursor: "pointer",
};


