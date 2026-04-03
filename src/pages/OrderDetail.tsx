import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../layout";
import { usePedidoStore } from "../store/usePedidoStore";
import { pedidoService } from "../services/pedidoService";
import type { Pedido } from "../types";

const etapas = [
  { key: "criado", label: "Pedido criado" },
  { key: "confirmado", label: "Confirmado" },
  { key: "buscando_entregador", label: "Buscando entregador" },
  { key: "preparando", label: "Preparando" },
  { key: "saiu_para_entrega", label: "Saiu para entrega" },
  { key: "entregue", label: "Entregue" },
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

function money(value: number) {
  if (!Number.isFinite(value)) return "R$ 0,00";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function safeText(value: any) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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

function etaByStatus(status: string) {
  switch (status) {
    case "criado":
      return "Em até 45 min";
    case "confirmado":
      return "Em até 40 min";
    case "buscando_entregador":
      return "Localizando entregador";
    case "preparando":
      return "Preparando para sair";
    case "saiu_para_entrega":
      return "Chegando em breve";
    case "entregue":
      return "Entrega concluída";
    case "cancelado":
      return "Pedido encerrado";
    default:
      return "Em breve";
  }
}

function statusHint(status: string) {
  switch (status) {
    case "criado":
      return "Seu pedido foi criado no sistema.";
    case "confirmado":
      return "A loja confirmou seu pedido.";
    case "buscando_entregador":
      return "Estamos localizando um entregador disponível.";
    case "preparando":
      return "Pedido em preparação para saída.";
    case "saiu_para_entrega":
      return "O entregador já saiu para entrega.";
    case "entregue":
      return "Pedido concluído com sucesso.";
    case "cancelado":
      return "Esse pedido foi cancelado e saiu do fluxo operacional.";
    default:
      return "Aguardando atualização.";
  }
}

export default function OrderDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const pedidos = usePedidoStore((state) => state.pedidos);
  const upsertPedidoLocal = usePedidoStore((state) => state.upsertPedidoLocal);

  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);

  const refreshPedido = useCallback(async () => {
    if (!id) return;

    try {
      setLoadingRemote(true);
      const data = await pedidoService.buscarPedidoRemotoPorId(id);
      if (data) {
        upsertPedidoLocal(data);
        setRemoteReady(true);
      }
    } catch (error) {
      console.error("OrderDetail refreshPedido error:", error);
    } finally {
      setLoadingRemote(false);
    }
  }, [id, upsertPedidoLocal]);

  useEffect(() => {
    void refreshPedido();
    const timer = window.setInterval(() => {
      void refreshPedido();
    }, 2500);
    return () => window.clearInterval(timer);
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
    return (etapaAtualIndex / (etapas.length - 1)) * 100;
  }, [pedido, etapaAtualIndex]);

  const totalItens = useMemo(() => {
    if (!pedido) return 0;
    return pedido.itens.reduce(
      (acc: number, item: any) => acc + (item.quantidade ?? 0),
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
            Pedido não encontrado
          </h3>
          <p style={{ marginTop: 8, color: "#666", lineHeight: 1.5 }}>
            Esse pedido pode ter sido removido ou o link está incorreto.
          </p>
          <div style={syncLine}>
            Fonte atual: {remoteReady ? "Supabase" : "Aguardando sync"}
            {loadingRemote ? " • sincronizando..." : ""}
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
  const eta = etaByStatus(pedidoData.status);

  const whatsappLoja =
    (pedidoData as any).whatsappLoja ??
    (pedidoData as any).whatsapp ??
    "61999999999";

  const resumoItens = pedidoData.itens
    .map((item: any) => `${item.quantidade}x ${item.nome}`)
    .join(", ");

  const enderecoTxt = pedidoData.enderecoSnapshot
    ? [
        safeText(
          pedidoData.enderecoSnapshot.street ??
            (pedidoData.enderecoSnapshot as any).rua
        ),
        safeText(
          pedidoData.enderecoSnapshot.number ??
            (pedidoData.enderecoSnapshot as any).numero
        ),
        safeText(
          (pedidoData.enderecoSnapshot as any).bairro ??
            (pedidoData.enderecoSnapshot as any).neighborhood
        ),
        safeText(
          (pedidoData.enderecoSnapshot as any).cidade ??
            (pedidoData.enderecoSnapshot as any).city
        ),
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const msgWhats = `Olá! Quero falar sobre meu pedido (${pedidoData.id}).
Status: ${statusLabel(pedidoData.status)}
Itens: ${resumoItens}
Total: ${money((pedidoData as any).total ?? totalCalc)}
Endereço: ${enderecoTxt || "não informado"}
Obs: ${safeText((pedidoData as any).observacao) || "sem observação"}`;

  const whatsappLink = buildWhatsAppLink(whatsappLoja, msgWhats);

  return (
    <Layout>
      <div style={heroCard}>
        <div style={heroTop}>
          <div>
            <h2 style={heroTitle}>Detalhe do pedido</h2>
            <p style={heroSub}>Acompanhe status, PIN, itens e entrega</p>
            <div style={heroSyncLine}>
              Fonte atual: {remoteReady ? "Supabase" : "Aguardando sync"}
              {loadingRemote ? " • sincronizando..." : ""}
            </div>
          </div>

          <button
            onClick={() => navigate("/orders")}
            style={backBtn}
            type="button"
          >
            ← Voltar
          </button>
        </div>
      </div>

      <div style={sectionCard}>
        <div style={statusTop}>
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
            {totalItens} item(ns) • {money((pedidoData as any).total ?? totalCalc)}
          </div>
        </div>

        <div style={hintText}>{statusHint(pedidoData.status)}</div>

        {pedidoData.status !== "cancelado" ? (
          <>
            <div style={progressTrack}>
              <div style={{ ...progressFill, width: `${progresso}%` }} />
            </div>

            <div style={{ marginTop: 18 }}>
              {etapas.map((etapa, index) => {
                const ativa = index <= etapaAtualIndex;

                return (
                  <div key={etapa.key} style={timelineRow}>
                    <div
                      style={{
                        ...timelineDot,
                        background: ativa ? "#E44F2A" : "#ddd",
                        boxShadow: ativa
                          ? "0 0 0 4px rgba(228,79,42,.12)"
                          : "none",
                      }}
                    />
                    <span
                      style={{
                        fontWeight: ativa ? 900 : 600,
                        opacity: ativa ? 1 : 0.55,
                      }}
                    >
                      {etapa.label}
                    </span>
                  </div>
                );
              })}
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

        {pedidoData.tipo === "agendado" && pedidoData.horarioAgendado ? (
          <div style={subCard}>
            <div style={{ fontWeight: 900 }}>Agendado para</div>
            <div style={{ marginTop: 6, color: "#444" }}>
              {new Date(pedidoData.horarioAgendado).toLocaleString("pt-BR")}
            </div>
          </div>
        ) : null}

        {pedidoData.deliveryPin &&
        pedidoData.status !== "entregue" &&
        pedidoData.status !== "cancelado" ? (
          <div style={pinCard}>
            <div style={{ fontWeight: 950, color: "#111827" }}>
              PIN de segurança
            </div>
            <div style={pinValue}>{pedidoData.deliveryPin}</div>
            <div style={pinHint}>
              Informe este PIN ao entregador somente no momento da entrega.
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <a
            href={whatsappLink}
            target="_blank"
            rel="noreferrer"
            style={ctaLink}
          >
            Falar no WhatsApp
          </a>
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeaderRow}>
          <h3 style={sectionHeading}>Itens</h3>
          <div style={sectionTotalText}>
            Total:{" "}
            <span style={{ color: "#E44F2A", fontWeight: 950 }}>
              {money((pedidoData as any).total ?? totalCalc)}
            </span>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
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
        <div style={sectionCard}>
          <h3 style={sectionHeading}>Endereço</h3>

          <div style={{ fontWeight: 900 }}>
            {(pedidoData.enderecoSnapshot as any).label ??
              (pedidoData.enderecoSnapshot as any).nome ??
              "Entrega"}
          </div>

          <div style={addressText}>
            {safeText(
              pedidoData.enderecoSnapshot.street ??
                (pedidoData.enderecoSnapshot as any).rua
            )}
            {safeText(
              pedidoData.enderecoSnapshot.street ??
                (pedidoData.enderecoSnapshot as any).rua
            ) &&
            safeText(
              pedidoData.enderecoSnapshot.number ??
                (pedidoData.enderecoSnapshot as any).numero
            )
              ? ", "
              : ""}
            {safeText(
              pedidoData.enderecoSnapshot.number ??
                (pedidoData.enderecoSnapshot as any).numero
            )}
            <br />
            {safeText(
              pedidoData.enderecoSnapshot.neighborhood ??
                (pedidoData.enderecoSnapshot as any).bairro
            )}
            {safeText(
              pedidoData.enderecoSnapshot.neighborhood ??
                (pedidoData.enderecoSnapshot as any).bairro
            ) &&
            safeText(
              pedidoData.enderecoSnapshot.city ??
                (pedidoData.enderecoSnapshot as any).cidade
            )
              ? "/"
              : ""}
            {safeText(
              pedidoData.enderecoSnapshot.city ??
                (pedidoData.enderecoSnapshot as any).cidade
            )}
          </div>

          {((pedidoData.enderecoSnapshot as any).lat ||
            (pedidoData.enderecoSnapshot as any).latitude ||
            (pedidoData.enderecoSnapshot as any).lng ||
            (pedidoData.enderecoSnapshot as any).longitude) ? (
            <div style={mapReadyPill}>Ponto de mapa salvo ✅</div>
          ) : null}
        </div>
      ) : null}

      {pedidoData.observacao ? (
        <div style={sectionCard}>
          <h3 style={sectionHeading}>Observação</h3>
          <div
            style={{
              color: "#444",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {pedidoData.observacao}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <button
          onClick={() => navigate("/loja")}
          style={newOrderBtn}
          type="button"
        >
          Fazer novo pedido
        </button>
      </div>
    </Layout>
  );
}

const notFoundCard: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 24,
  marginTop: 16,
  boxShadow: "0 10px 24px rgba(0,0,0,.05)",
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg,#FF4500,#FF7A18)",
  padding: "24px 20px",
  borderRadius: 24,
  color: "#fff",
  position: "relative",
  overflow: "hidden",
  boxShadow: "0 18px 36px rgba(228,79,42,0.18)",
};

const heroTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
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
  background: "rgba(255,255,255,.18)",
  border: "1px solid rgba(255,255,255,.35)",
  color: "#fff",
  padding: "10px 12px",
  borderRadius: 14,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const sectionCard: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 24,
  marginTop: 16,
  boxShadow: "0 10px 24px rgba(0,0,0,.05)",
  border: "1px solid #f1f1f1",
};

const statusTop: React.CSSProperties = {
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
  fontSize: 13,
  color: "#666",
  lineHeight: 1.5,
};

const progressTrack: React.CSSProperties = {
  marginTop: 16,
  height: 10,
  background: "#eee",
  borderRadius: 999,
  overflow: "hidden",
};

const progressFill: React.CSSProperties = {
  height: "100%",
  background: "#E44F2A",
  transition: "0.35s",
};

const timelineRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  marginTop: 10,
};

const timelineDot: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 999,
  marginRight: 10,
};

const cancelBox: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 18,
  background: "rgba(185,28,28,0.06)",
  border: "1px solid rgba(185,28,28,0.14)",
  color: "#7F1D1D",
};

const subCard: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 18,
  background: "#FAFAFA",
  border: "1px solid #eee",
};

const pinCard: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 18,
  background: "rgba(17,24,39,0.05)",
  border: "1px solid rgba(17,24,39,0.10)",
};

const pinValue: React.CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 950,
  letterSpacing: 2,
  color: "#111827",
};

const pinHint: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.5,
};

const ctaLink: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  textAlign: "center",
  padding: 14,
  borderRadius: 18,
  background: "#E44F2A",
  color: "#fff",
  fontWeight: 900,
};

const sectionHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const sectionHeading: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 0,
  color: "#111827",
};

const sectionTotalText: React.CSSProperties = {
  fontSize: 13,
  color: "#777",
  fontWeight: 700,
};

const itemRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "12px 0",
  borderTop: "1px dashed #eee",
  gap: 12,
};

const totalsWrap: React.CSSProperties = {
  marginTop: 14,
  borderTop: "1px solid #eee",
  paddingTop: 12,
};

const totalLine: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 14,
};

const totalLabel: React.CSSProperties = {
  color: "#666",
  fontWeight: 700,
};

const addressText: React.CSSProperties = {
  marginTop: 8,
  color: "#444",
  lineHeight: 1.6,
};

const mapReadyPill: React.CSSProperties = {
  marginTop: 12,
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(22,163,74,0.10)",
  border: "1px solid rgba(22,163,74,0.16)",
  color: "#166534",
  fontWeight: 900,
  fontSize: 12,
};

const newOrderBtn: React.CSSProperties = {
  width: "100%",
  padding: 16,
  borderRadius: 24,
  background: "#fff",
  color: "#E44F2A",
  fontSize: 16,
  fontWeight: 900,
  border: "2px solid #E44F2A",
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  marginTop: 12,
  width: "100%",
  padding: 14,
  borderRadius: 18,
  border: "none",
  background: "#E44F2A",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const syncLine: React.CSSProperties = {
  marginTop: 12,
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};