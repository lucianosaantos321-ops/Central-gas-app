import EntregadorLayout from "../../layouts/EntregadorLayout";
import PageHeader from "../../components/PageHeader";
import { useMemo, type CSSProperties } from "react";
import { usePedidoStore } from "../../store/usePedidoStore";
import { useEntregadorStore } from "../../store/useEntregadorStore";
import { money, getTime } from "../../utils/delivererHelpers";
import { financeService } from "../../services/financeService";
import { adminRulesService } from "../../services/adminRulesService";

function isToday(value: any) {
  const t = typeof value === "number" ? value : Date.parse(value ?? "");
  if (!Number.isFinite(t)) return false;

  const d = new Date(t);
  const now = new Date();

  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isYesterday(value: any) {
  const t = typeof value === "number" ? value : Date.parse(value ?? "");
  if (!Number.isFinite(t)) return false;

  const d = new Date(t);
  const ref = new Date();
  ref.setDate(ref.getDate() - 1);

  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function financeLabel(tipo: string) {
  switch (tipo) {
    case "comissao":
      return "Comissão do app";
    case "pagamento":
      return "Pagamento do entregador";
    case "ajuste":
      return "Ajuste";
    default:
      return "Movimento";
  }
}

export default function EntregadorGanhos() {
  const pedidos = usePedidoStore((s) => s.pedidos);
  const entregadorId = useEntregadorStore((s) => s.entregadorId);

  const stats = useMemo(() => {
    const historico = (Array.isArray(pedidos) ? pedidos : [])
      .filter((p: any) => String(p?.entregadorId || "") === entregadorId && p?.status === "entregue")
      .sort((a: any, b: any) => getTime(b) - getTime(a));

    const hoje = historico.filter((p: any) => isToday(p?.updatedAt ?? p?.createdAt));
    const ontem = historico.filter((p: any) => isYesterday(p?.updatedAt ?? p?.createdAt));

    const ganhoHoje = hoje.length * 7;
    const ganhoOntem = ontem.length * 7;
    const ganhoTotal = historico.length * 7;

    const finance = financeService.getDelivererState(entregadorId);
    const ledger = financeService.getHistorico(entregadorId);
    const rules = adminRulesService.getRules();

    return {
      hoje,
      ontem,
      historico,
      ganhoHoje,
      ganhoOntem,
      ganhoTotal,
      finance,
      ledger,
      rules,
    };
  }, [pedidos, entregadorId]);

  return (
    <EntregadorLayout>
      <div style={{ display: "grid", gap: 14 }}>
        <PageHeader title="Ganhos" subtitle="Resumo financeiro da operação" />

        <div style={heroCard}>
          <div style={heroMini}>Hoje</div>
          <div style={heroValue}>{money(stats.ganhoHoje)}</div>
          <div style={heroSub}>{stats.hoje.length} entrega(s)</div>
        </div>

        <div style={summaryGrid}>
          <div style={summaryCard}>
            <div style={summaryLabel}>Ontem</div>
            <div style={summaryValue}>{money(stats.ganhoOntem)}</div>
            <div style={summarySub}>{stats.ontem.length} entrega(s)</div>
          </div>

          <div style={summaryCard}>
            <div style={summaryLabel}>Total</div>
            <div style={summaryValue}>{money(stats.ganhoTotal)}</div>
            <div style={summarySub}>{stats.historico.length} entrega(s)</div>
          </div>
        </div>

        <div style={financeCard}>
          <div style={sectionTitle}>Financeiro do app</div>

          <div style={financeGrid}>
            <div style={financeBox}>
              <div style={financeLabelStyle}>Saldo pendente</div>
              <div style={financeValue}>{money(stats.finance.saldoDevedor)}</div>
            </div>

            <div style={financeBox}>
              <div style={financeLabelStyle}>Limite de bloqueio</div>
              <div style={financeValue}>{money(stats.finance.limiteBloqueio)}</div>
            </div>
          </div>

          <div style={rulesBox}>
            Comissão atual do app por entrega: <strong>{money(stats.rules.comissaoPorEntrega)}</strong>
          </div>

          <div
            style={{
              ...financeStatus,
              background: stats.finance.bloqueado
                ? "rgba(185,28,28,0.08)"
                : "rgba(245,158,11,0.10)",
              border: stats.finance.bloqueado
                ? "1px solid rgba(185,28,28,0.14)"
                : "1px solid rgba(245,158,11,0.20)",
              color: stats.finance.bloqueado ? "#7F1D1D" : "#92400E",
            }}
          >
            {stats.finance.bloqueado
              ? "Bloqueado até regularizar o Pix"
              : "Regularize o saldo antes de atingir o bloqueio"}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Últimas entregas</div>

          {stats.historico.length === 0 ? (
            <div style={sectionText}>Sem entregas concluídas ainda.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {stats.historico.slice(0, 8).map((p: any) => (
                <div key={p.id} style={historyRow}>
                  <div>
                    <div style={historyTitle}>Pedido nº {String(p.id).slice(0, 6)}</div>
                    <div style={historyMeta}>
                      {new Date(p.updatedAt ?? p.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </div>

                  <div style={historyPrice}>{money(7)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Histórico financeiro</div>

          {stats.ledger.length === 0 ? (
            <div style={sectionText}>Sem movimentos financeiros ainda.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {stats.ledger.slice(0, 12).map((item: any, index: number) => (
                <div key={`${item.tipo}_${item.data}_${index}`} style={ledgerRow}>
                  <div>
                    <div style={historyTitle}>{financeLabel(item.tipo)}</div>
                    <div style={historyMeta}>
                      {new Date(item.data).toLocaleString("pt-BR")}
                      {item.pedidoId ? ` • Pedido ${String(item.pedidoId).slice(0, 6)}` : ""}
                    </div>
                    {item.observacao ? (
                      <div style={{ ...historyMeta, marginTop: 6 }}>
                        {item.observacao}
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      ...historyPrice,
                      color: item.tipo === "pagamento" ? "#16A34A" : "#B91C1C",
                    }}
                  >
                    {item.tipo === "pagamento" ? "+" : "-"} {money(Number(item.valor || 0))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </EntregadorLayout>
  );
}

const heroCard: CSSProperties = {
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  borderRadius: 28,
  padding: 20,
  color: "#fff",
  boxShadow: "0 22px 44px rgba(228,79,42,0.18)",
};

const heroMini: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  opacity: 0.92,
};

const heroValue: CSSProperties = {
  marginTop: 10,
  fontSize: 34,
  fontWeight: 950,
  letterSpacing: -0.6,
};

const heroSub: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  opacity: 0.94,
};

const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const summaryCard: CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const summaryLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#64748B",
};

const summaryValue: CSSProperties = {
  marginTop: 10,
  fontSize: 24,
  fontWeight: 950,
  color: "#111827",
  letterSpacing: -0.3,
};

const summarySub: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#64748B",
};

const financeCard: CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const financeGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const financeBox: CSSProperties = {
  background: "#F8FAFC",
  borderRadius: 18,
  padding: 12,
  border: "1px solid rgba(15,23,42,0.06)",
};

const financeLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const financeValue: CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 950,
  color: "#111827",
};

const rulesBox: CSSProperties = {
  marginTop: 12,
  borderRadius: 16,
  padding: 12,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
  color: "#111827",
  fontSize: 13,
  lineHeight: 1.5,
};

const financeStatus: CSSProperties = {
  marginTop: 12,
  borderRadius: 16,
  padding: 12,
  fontWeight: 900,
};

const sectionCard: CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const sectionTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const sectionText: CSSProperties = {
  marginTop: 12,
  fontSize: 14,
  color: "#475569",
  lineHeight: 1.6,
};

const historyRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: 13,
  borderRadius: 18,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const ledgerRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: 13,
  borderRadius: 18,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.08)",
};

const historyTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const historyMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
};

const historyPrice: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};