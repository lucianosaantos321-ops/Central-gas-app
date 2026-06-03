import EntregadorLayout from "../../layouts/EntregadorLayout";
import PageHeader from "../../components/PageHeader";
import { useMemo, useState, type CSSProperties } from "react";
import { usePedidoStore } from "../../store/usePedidoStore";
import { useRemoteSyncStore } from "../../store/useRemoteSyncStore";
import { money, getTime } from "../../utils/delivererHelpers";
import { financeService } from "../../services/financeService";
import { cardStyle, sectionCardStyle, ui } from "../../styles/ui";
import { useEffectiveEntregadorId } from "../../hooks/useEffectiveEntregadorId";

type RangeKey = "hoje" | "semanal" | "mensal";

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function EntregadorGanhos() {
  const pedidos = usePedidoStore((s) => s.pedidos);
  const publicVersion = useRemoteSyncStore((s) => s.publicVersion);
  const financeVersion = useRemoteSyncStore((s) => s.financeVersion);
  const entregadorId = useEffectiveEntregadorId();
  const [range, setRange] = useState<RangeKey>("semanal");

  const stats = useMemo(() => {
    const historico = (Array.isArray(pedidos) ? pedidos : [])
      .filter((p: any) => String(p?.entregadorId || "") === entregadorId && p?.status === "entregue")
      .sort((a: any, b: any) => getTime(b) - getTime(a));

    const now = new Date();
    const weekStart = startOfWeek(now).getTime();
    const month = now.getMonth();
    const year = now.getFullYear();

    const hoje = historico.filter((p: any) => sameDay(new Date(p?.updatedAt ?? p?.createdAt ?? 0), now));
    const semanal = historico.filter((p: any) => new Date(p?.updatedAt ?? p?.createdAt ?? 0).getTime() >= weekStart);
    const mensal = historico.filter((p: any) => {
      const d = new Date(p?.updatedAt ?? p?.createdAt ?? 0);
      return d.getMonth() === month && d.getFullYear() === year;
    });

    const selected = range === "hoje" ? hoje : range === "semanal" ? semanal : mensal;
    const finance = financeService.getDelivererState(entregadorId);
    const ledger = financeService.getHistorico(entregadorId);

    const totalHoje = hoje.reduce((acc: number, p: any) => acc + Number(p?.total ?? 0), 0);
    const totalSemana = semanal.reduce((acc: number, p: any) => acc + Number(p?.total ?? 0), 0);
    const totalMes = mensal.reduce((acc: number, p: any) => acc + Number(p?.total ?? 0), 0);

    return {
      historico,
      hoje,
      semanal,
      mensal,
      selected,
      ganhoHoje: totalHoje,
      ganhoSemana: totalSemana,
      ganhoMes: totalMes,
      finance,
      ledger,
    };
  }, [pedidos, entregadorId, range, publicVersion, financeVersion]);

  return (
    <EntregadorLayout>
      <div style={{ display: "grid", gap: 14 }}>
        <PageHeader title="Ganhos" subtitle="Total vendido e comissão do app" />

        <div style={heroCard}>
          <div style={tabsRow}>
            <TabBtn active={range === "hoje"} onClick={() => setRange("hoje")} label="Hoje" />
            <TabBtn active={range === "semanal"} onClick={() => setRange("semanal")} label="Semanal" />
            <TabBtn active={range === "mensal"} onClick={() => setRange("mensal")} label="Mensal" />
          </div>

          <div style={heroTitle}>
            {range === "hoje" ? "Hoje" : range === "semanal" ? "Esta semana" : "Este mes"}
          </div>
          <div style={heroValue}>
            {money(range === "hoje" ? stats.ganhoHoje : range === "semanal" ? stats.ganhoSemana : stats.ganhoMes)}
          </div>
          <div style={heroSub}>{stats.selected.length} entrega(s) no periodo</div>

          <div style={summaryGrid}>
            <div style={summaryCard}>
              <div style={summaryLabel}>Ganhos hoje</div>
              <div style={summaryValue}>{money(stats.ganhoHoje)}</div>
            </div>
            <div style={summaryCard}>
              <div style={summaryLabel}>Comissão do app</div>
              <div style={summaryValue}>{money(stats.finance.saldoDevedor)}</div>
            </div>
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Ultimos pagamentos</div>
          {stats.selected.length === 0 ? (
            <div style={sectionText}>Sem entregas concluidas no periodo.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {stats.selected.slice(0, 10).map((p: any) => (
                <div key={p.id} style={paymentRow}>
                  <div>
                    <div style={paymentTitle}>Pedido #{String(p.id).slice(0, 6)}</div>
                    <div style={paymentMeta}>{new Date(p.updatedAt ?? p.createdAt).toLocaleString("pt-BR")}</div>
                  </div>
                  <div style={paymentValue}>{money(Number(p?.total ?? 0))}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={sectionCardDark}>
          <div style={sectionTitleDark}>Financeiro do app</div>
          <div style={darkInfoRow}><span>Comissão por entrega</span><strong>{money(10)}</strong></div>
          <div style={darkInfoRow}><span>Limite de bloqueio</span><strong>{money(stats.finance.limiteBloqueio)}</strong></div>
          <div style={darkInfoRow}><span>Status</span><strong>{stats.finance.bloqueado ? "Bloqueado" : "Normal"}</strong></div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Histórico financeiro</div>
          {stats.ledger.length === 0 ? (
            <div style={sectionText}>Sem movimentos financeiros ainda.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {stats.ledger.slice(0, 8).map((item: any, index: number) => (
                <div key={`${item.tipo}_${item.data}_${index}`} style={ledgerRow}>
                  <div>
                    <div style={paymentTitle}>{item.tipo === "pagamento" ? "Pagamento" : item.tipo === "comissao" ? "Comissão" : "Ajuste"}</div>
                    <div style={paymentMeta}>{new Date(item.data).toLocaleString("pt-BR")}</div>
                  </div>
                  <div style={{ ...paymentValue, color: item.tipo === "pagamento" ? "#16A34A" : "#DC2626" }}>
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

function TabBtn(props: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={props.onClick}
      type="button"
      style={{
        ...tabBtn,
        ...(props.active ? tabBtnActive : null),
      }}
    >
      {props.label}
    </button>
  );
}

const heroCard: CSSProperties = {
  background: "linear-gradient(180deg,#FFF7ED 0%, #FFFFFF 100%)",
  borderRadius: ui.radius.hero,
  padding: 18,
  border: "1px solid rgba(228,79,42,0.12)",
  boxShadow: ui.shadow.orange,
};
const tabsRow: CSSProperties = { display: "flex", gap: 8, marginBottom: 14 };
const tabBtn: CSSProperties = { flex: 1, height: 40, borderRadius: 999, border: "1px solid rgba(15,23,42,0.10)", background: "#fff", fontWeight: 900, cursor: "pointer" };
const tabBtnActive: CSSProperties = { border: "none", background: "linear-gradient(90deg,#E44F2A,#F59E0B)", color: "#fff" };
const heroTitle: CSSProperties = { fontSize: 14, fontWeight: 900, color: "#64748B" };
const heroValue: CSSProperties = { marginTop: 8, fontSize: 36, fontWeight: 950, color: "#111827" };
const heroSub: CSSProperties = { marginTop: 6, fontSize: 13, color: "#64748B" };
const summaryGrid: CSSProperties = { marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const summaryCard: CSSProperties = { ...cardStyle({ borderRadius: 16, padding: 14, boxShadow: "none" }) };
const summaryLabel: CSSProperties = { fontSize: 12, fontWeight: 900, color: "#64748B" };
const summaryValue: CSSProperties = { marginTop: 8, fontSize: 22, fontWeight: 950, color: "#111827" };
const sectionCard: CSSProperties = { ...sectionCardStyle() };
const sectionTitle: CSSProperties = { fontSize: 16, fontWeight: 950, color: "#111827" };
const sectionText: CSSProperties = { marginTop: 12, color: "#475569", lineHeight: 1.55 };
const paymentRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, background: "#F8FAFC", border: "1px solid rgba(15,23,42,0.06)" };
const paymentTitle: CSSProperties = { fontSize: 15, fontWeight: 950, color: "#111827" };
const paymentMeta: CSSProperties = { marginTop: 4, fontSize: 12.5, color: "#64748B" };
const paymentValue: CSSProperties = { fontSize: 15, fontWeight: 950, color: "#111827" };
const sectionCardDark: CSSProperties = { background: "linear-gradient(135deg,#0F172A 0%, #111827 100%)", borderRadius: ui.radius.section, padding: 16, color: "#fff", boxShadow: ui.shadow.dark };
const sectionTitleDark: CSSProperties = { fontSize: 16, fontWeight: 950, color: "#fff" };
const darkInfoRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12, color: "#E5E7EB" };
const ledgerRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 13, borderRadius: 18, background: "#fff", border: "1px solid rgba(15,23,42,0.08)" };
