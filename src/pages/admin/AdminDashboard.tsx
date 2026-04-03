import { useMemo, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../layouts/AdminLayout";
import { usePedidoStore } from "../../store/usePedidoStore";
import { productCatalogService } from "../../services/productCatalogService";
import { couponAdminService } from "../../services/couponAdminService";
import { financeService } from "../../services/financeService";
import { money } from "../../utils/delivererHelpers";

export default function AdminDashboard() {
  const pedidos = usePedidoStore((s) => s.pedidos);

  const produtos = useMemo(() => productCatalogService.getAll(), []);
  const couponMetrics = useMemo(() => couponAdminService.getMetrics(pedidos), [pedidos]);
  const financialSummary = useMemo(() => financeService.getGlobalSummary(pedidos), [pedidos]);

  const overview = useMemo(() => {
    const all = Array.isArray(pedidos) ? pedidos : [];
    const ativos = all.filter((p: any) => p?.status !== "entregue" && p?.status !== "cancelado");
    const entregues = all.filter((p: any) => p?.status === "entregue");
    const cancelados = all.filter((p: any) => p?.status === "cancelado");
    const faturamento = all.reduce((acc: number, p: any) => acc + Number(p?.total || 0), 0);
    const descontoTotal = all.reduce((acc: number, p: any) => acc + Number(p?.descontoAplicado || 0), 0);

    return {
      total: all.length,
      ativos: ativos.length,
      entregues: entregues.length,
      cancelados: cancelados.length,
      faturamento,
      descontoTotal,
    };
  }, [pedidos]);

  const topProdutos = useMemo(() => {
    const map = new Map<
      string,
      {
        produtoId: string;
        nome: string;
        quantidade: number;
        faturamento: number;
        pedidos: number;
      }
    >();

    (Array.isArray(pedidos) ? pedidos : []).forEach((pedido: any) => {
      const itens = Array.isArray(pedido?.itens) ? pedido.itens : [];
      itens.forEach((item: any) => {
        const current = map.get(item.produtoId) || {
          produtoId: String(item.produtoId),
          nome: String(item.nome || "Produto"),
          quantidade: 0,
          faturamento: 0,
          pedidos: 0,
        };

        current.quantidade += Number(item.quantidade || 0);
        current.faturamento += Number(item.precoUnitario || 0) * Number(item.quantidade || 0);
        current.pedidos += 1;

        map.set(item.produtoId, current);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade).slice(0, 5);
  }, [pedidos]);

  const campanhasResumo = useMemo(() => {
    const ativos = couponMetrics.filter((item) => item.ativo).length;
    const usados = couponMetrics.filter((item) => item.pedidosVinculados > 0).length;
    const top = couponMetrics[0] ?? null;

    return {
      ativos,
      usados,
      top,
    };
  }, [couponMetrics]);

  const auditResumo = useMemo(() => {
    const all = Array.isArray(pedidos) ? pedidos : [];
    return {
      suspeitos: all.filter((p: any) => p?.cancelamentoSuspeito).length,
      auditaveis: all.filter((p: any) => p?.cancelamentoAuditavel).length,
      manuais: all.filter((p: any) => p?.deliveryConfirmationMethod === "manual").length,
    };
  }, [pedidos]);

  return (
    <AdminLayout
      title="Dashboard central"
      subtitle="Leitura geral da operação, catálogo, campanhas, risco e financeiro em um único painel"
    >
      <div style={topGrid}>
        <MetricCard label="Pedidos totais" value={String(overview.total)} />
        <MetricCard label="Pedidos ativos" value={String(overview.ativos)} />
        <MetricCard label="Entregues" value={String(overview.entregues)} />
        <MetricCardDanger label="Cancelados" value={String(overview.cancelados)} />
      </div>

      <div style={topGrid}>
        <MetricCard label="Faturamento bruto" value={money(overview.faturamento)} />
        <MetricCard label="Desconto total" value={money(overview.descontoTotal)} />
        <MetricCard label="Saldo em aberto" value={money(financialSummary.saldoEmAberto)} />
        <MetricCardDanger label="Entregadores bloqueados" value={String(financialSummary.bloqueados)} />
      </div>

      <div style={featureGrid}>
        <div style={spotlightCard}>
          <div style={spotlightHeader}>
            <div>
              <div style={spotlightLabel}>Campanha líder</div>
              <div style={spotlightTitle}>
                {campanhasResumo.top ? campanhasResumo.top.codigo : "Sem uso ainda"}
              </div>
              <div style={spotlightSub}>
                {campanhasResumo.top
                  ? `${campanhasResumo.top.pedidosVinculados} uso(s) • desconto ${money(
                      campanhasResumo.top.descontoTotal
                    )}`
                  : "Ative campanhas e gere pedidos para formar ranking."}
              </div>
            </div>

            <Link to="/admin/produtos" style={heroLinkBtn}>
              Ver campanhas
            </Link>
          </div>

          <div style={spotlightMiniGrid}>
            <MiniMetric title="Campanhas ativas" value={String(campanhasResumo.ativos)} />
            <MiniMetric title="Campanhas com uso" value={String(campanhasResumo.usados)} />
            <MiniMetric title="Produtos ativos" value={String(produtos.filter((p) => p.ativo).length)} />
          </div>
        </div>

        <div style={sideColumn}>
          <QuickLink
            to="/admin/pedidos"
            title="Pedidos"
            desc="Status, fila, reatribuição e cancelamento."
          />
          <QuickLink
            to="/admin/entregadores"
            title="Entregadores"
            desc="Bloqueio, ajustes e leitura operacional."
          />
          <QuickLink
            to="/admin/financeiro"
            title="Financeiro"
            desc="Saldo, comissão, pagamentos e histórico."
          />
          <QuickLink
            to="/admin/auditoria"
            title="Auditoria"
            desc="Cancelamentos suspeitos e leitura de risco."
          />
        </div>
      </div>

      <div style={mainGrid}>
        <div style={panelCard}>
          <div style={panelHeader}>
            <div style={panelTitle}>Produtos com mais giro</div>
            <Link to="/admin/produtos" style={inlineLinkBtn}>
              Gerenciar catálogo
            </Link>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {topProdutos.length === 0 ? (
              <div style={emptyText}>Ainda não há vendas suficientes para montar ranking.</div>
            ) : (
              topProdutos.map((item, index) => (
                <div key={item.produtoId} style={rowCard}>
                  <div style={{ minWidth: 0 }}>
                    <div style={rowTitle}>
                      #{index + 1} • {item.nome}
                    </div>
                    <div style={rowMeta}>
                      {item.quantidade} unidade(s) • {item.pedidos} ocorrência(s)
                    </div>
                  </div>

                  <div style={rowRight}>
                    <div style={rowStrong}>{money(item.faturamento)}</div>
                    <div style={rowMeta}>Faturamento</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={panelCard}>
          <div style={panelHeader}>
            <div style={panelTitle}>Leitura de risco</div>
            <Link to="/admin/auditoria" style={inlineLinkBtn}>
              Abrir auditoria
            </Link>
          </div>

          <div style={miniTripleGrid}>
            <MiniMetric title="Suspeitos" value={String(auditResumo.suspeitos)} danger />
            <MiniMetric title="Auditáveis" value={String(auditResumo.auditaveis)} />
            <MiniMetric title="Entrega manual" value={String(auditResumo.manuais)} />
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <InsightBox text="Cancelamento por entregador continua sendo risco alto e deve ser revisado primeiro." />
            <InsightBox text="Entrega manual sem PIN deve ser exceção e não rotina operacional." />
            <InsightBox text="Campanhas com muito desconto e pouco giro podem estar mal calibradas." />
          </div>
        </div>
      </div>

      <div style={mainGrid}>
        <div style={panelCard}>
          <div style={panelHeader}>
            <div style={panelTitle}>Resumo financeiro</div>
            <Link to="/admin/financeiro" style={inlineLinkBtn}>
              Ver financeiro
            </Link>
          </div>

          <div style={miniTripleGrid}>
            <MiniMetric title="Comissão total" value={money(financialSummary.totalComissao)} />
            <MiniMetric title="Pagamentos" value={money(financialSummary.totalPagamentos)} />
            <MiniMetric title="Ajustes" value={money(financialSummary.totalAjustes)} />
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {financialSummary.states.slice(0, 4).map((state) => (
              <div key={state.entregadorId} style={rowCard}>
                <div style={{ minWidth: 0 }}>
                  <div style={rowTitle}>{state.entregadorId}</div>
                  <div style={rowMeta}>
                    Histórico: {Array.isArray(state.historico) ? state.historico.length : 0} lançamento(s)
                  </div>
                </div>

                <div style={rowRight}>
                  <div
                    style={{
                      ...rowStrong,
                      color: state.bloqueado ? "#B91C1C" : "#111827",
                    }}
                  >
                    {money(state.saldoDevedor)}
                  </div>
                  <div style={rowMeta}>{state.bloqueado ? "Bloqueado" : "Normal"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={panelCard}>
          <div style={panelHeader}>
            <div style={panelTitle}>Campanhas no painel</div>
            <Link to="/admin/produtos" style={inlineLinkBtn}>
              Ver campanhas
            </Link>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {couponMetrics.length === 0 ? (
              <div style={emptyText}>Nenhuma campanha encontrada.</div>
            ) : (
              couponMetrics.slice(0, 5).map((item) => (
                <div key={item.id} style={rowCard}>
                  <div style={{ minWidth: 0 }}>
                    <div style={rowTitle}>
                      {item.codigo} • {item.titulo}
                    </div>
                    <div style={rowMeta}>
                      {item.tipo} • {item.ativo ? "Ativa" : "Inativa"}
                    </div>
                  </div>

                  <div style={rowRight}>
                    <div style={rowStrong}>{item.pedidosVinculados} uso(s)</div>
                    <div style={rowMeta}>Desc.: {money(item.descontoTotal)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function MetricCard(props: { label: string; value: string }) {
  const { label, value } = props;
  return (
    <div style={metricCard}>
      <div style={metricLabel}>{label}</div>
      <div style={metricValue}>{value}</div>
    </div>
  );
}

function MetricCardDanger(props: { label: string; value: string }) {
  const { label, value } = props;
  return (
    <div style={metricDangerCard}>
      <div style={metricLabelLight}>{label}</div>
      <div style={metricValueLight}>{value}</div>
    </div>
  );
}

function MiniMetric(props: { title: string; value: string; danger?: boolean }) {
  const { title, value, danger } = props;
  return (
    <div
      style={{
        ...miniCard,
        background: danger ? "rgba(185,28,28,0.05)" : "#F8FAFC",
        border: danger
          ? "1px solid rgba(185,28,28,0.12)"
          : "1px solid rgba(15,23,42,0.06)",
      }}
    >
      <div style={miniLabel}>{title}</div>
      <div style={{ ...miniValue, color: danger ? "#B91C1C" : "#111827" }}>{value}</div>
    </div>
  );
}

function QuickLink(props: { to: string; title: string; desc: string }) {
  return (
    <Link to={props.to} style={quickLinkCard}>
      <div style={quickLinkTitle}>{props.title}</div>
      <div style={quickLinkDesc}>{props.desc}</div>
    </Link>
  );
}

function InsightBox(props: { text: string }) {
  return <div style={insightBox}>{props.text}</div>;
}

const topGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const metricCard: CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const metricDangerCard: CSSProperties = {
  background: "linear-gradient(135deg,#7F1D1D 0%, #991B1B 55%, #B91C1C 100%)",
  borderRadius: 22,
  padding: 16,
  color: "#fff",
  boxShadow: "0 16px 30px rgba(127,29,29,0.18)",
};

const metricLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const metricValue: CSSProperties = {
  marginTop: 8,
  fontSize: 25,
  fontWeight: 950,
  color: "#111827",
  letterSpacing: -0.4,
};

const metricLabelLight: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(255,255,255,0.82)",
};

const metricValueLight: CSSProperties = {
  marginTop: 8,
  fontSize: 25,
  fontWeight: 950,
  color: "#fff",
  letterSpacing: -0.4,
};

const featureGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr",
  gap: 14,
};

const spotlightCard: CSSProperties = {
  background: "linear-gradient(135deg,#111827 0%, #1F2937 55%, #374151 100%)",
  borderRadius: 26,
  padding: 18,
  color: "#fff",
  boxShadow: "0 20px 42px rgba(15,23,42,0.18)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const spotlightHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const spotlightLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.70)",
};

const spotlightTitle: CSSProperties = {
  marginTop: 8,
  fontSize: 26,
  fontWeight: 950,
  letterSpacing: -0.5,
};

const spotlightSub: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "rgba(255,255,255,0.84)",
  lineHeight: 1.5,
};

const heroLinkBtn: CSSProperties = {
  textDecoration: "none",
  height: 40,
  padding: "0 14px",
  borderRadius: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.10)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#fff",
  fontWeight: 900,
  fontSize: 13,
};

const spotlightMiniGrid: CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const sideColumn: CSSProperties = {
  display: "grid",
  gap: 10,
};

const quickLinkCard: CSSProperties = {
  textDecoration: "none",
  background: "rgba(255,255,255,0.94)",
  borderRadius: 20,
  padding: 14,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const quickLinkTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const quickLinkDesc: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.45,
};

const mainGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const panelCard: CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const panelHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const panelTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const inlineLinkBtn: CSSProperties = {
  textDecoration: "none",
  height: 38,
  padding: "0 12px",
  borderRadius: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  fontSize: 13,
};

const miniTripleGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const miniCard: CSSProperties = {
  borderRadius: 18,
  padding: 12,
};

const miniLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const miniValue: CSSProperties = {
  marginTop: 8,
  fontSize: 18,
  fontWeight: 950,
};

const rowCard: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 18,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const rowTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const rowMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
};

const rowRight: CSSProperties = {
  textAlign: "right",
  whiteSpace: "nowrap",
};

const rowStrong: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const insightBox: CSSProperties = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(228,79,42,0.05)",
  border: "1px solid rgba(228,79,42,0.12)",
  color: "#7C2D12",
  lineHeight: 1.55,
  fontSize: 13.5,
  fontWeight: 800,
};

const emptyText: CSSProperties = {
  marginTop: 12,
  color: "#64748B",
  lineHeight: 1.5,
};