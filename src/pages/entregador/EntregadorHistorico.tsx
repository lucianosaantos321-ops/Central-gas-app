import EntregadorLayout from "../../layouts/EntregadorLayout";
import PageHeader from "../../components/PageHeader";
import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { usePedidoStore } from "../../store/usePedidoStore";
import { safeText, statusLabel, getTime, money } from "../../utils/delivererHelpers";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useEffectiveEntregadorId } from "../../hooks/useEffectiveEntregadorId";
import { sectionCardStyle, ui } from "../../styles/ui";
import { financeService } from "../../services/financeService";

type HistoryFilter = "entregues" | "cancelados";

function getPedidoDate(pedido: any) {
  return new Date(pedido?.updatedAt ?? pedido?.createdAt ?? 0);
}

function getSelectValue(value: string) {
  return value || "all";
}

function parseSelectValue(value: string) {
  return value === "all" ? "" : value;
}

export default function EntregadorHistorico() {
  const navigate = useNavigate();
  const pedidos = usePedidoStore((s) => s.pedidos);
  const entregadorId = useEffectiveEntregadorId();
  const [filtro, setFiltro] = useState<HistoryFilter>("entregues");
  const [busca, setBusca] = useState("");
  const buscaDebounced = useDebouncedValue(busca, 220);
  const [anoFiltro, setAnoFiltro] = useState("");
  const [mesFiltro, setMesFiltro] = useState("");
  const [diaFiltro, setDiaFiltro] = useState("");

  const years = useMemo(() => {
    const values = new Set<number>();
    (Array.isArray(pedidos) ? pedidos : []).forEach((pedido: any) => {
      const date = getPedidoDate(pedido);
      if (!Number.isNaN(date.getTime())) values.add(date.getFullYear());
    });
    return Array.from(values).sort((a, b) => b - a);
  }, [pedidos]);

  const rows = useMemo(() => {
    const base = (Array.isArray(pedidos) ? pedidos : [])
      .filter(
        (p: any) =>
          String(p?.entregadorId || "") === entregadorId &&
          (p?.status === "entregue" || p?.status === "cancelado")
      )
      .sort((a: any, b: any) => getTime(b) - getTime(a));

    const q = buscaDebounced.trim().toLowerCase();

    return base.filter((p: any) => {
      if (filtro === "entregues" && p?.status !== "entregue") return false;
      if (filtro === "cancelados" && p?.status !== "cancelado") return false;
      const date = getPedidoDate(p);

      if (anoFiltro && String(date.getFullYear()) !== anoFiltro) return false;
      if (mesFiltro && String(date.getMonth() + 1).padStart(2, "0") !== mesFiltro) return false;
      if (diaFiltro && String(date.getDate()).padStart(2, "0") !== diaFiltro) return false;
      if (!q) return true;

      const haystack = [
        p?.id,
        p?.clienteNome,
        p?.clienteTelefone,
        p?.enderecoSnapshot?.bairro,
        p?.enderecoSnapshot?.neighborhood,
        p?.enderecoSnapshot?.cidade,
        p?.enderecoSnapshot?.city,
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [pedidos, entregadorId, filtro, buscaDebounced, anoFiltro, mesFiltro, diaFiltro]);

  const resumo = useMemo(() => {
    const hoje = rows.filter((p: any) => {
      const d = getPedidoDate(p);
      const now = new Date();
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    });

    const totalVendido = rows
      .filter((p: any) => p?.status === "entregue")
      .reduce((acc: number, p: any) => acc + Number(p?.total ?? 0), 0);

    return {
      ofertas: rows.filter((p: any) => p?.status === "cancelado").length,
      filaAtiva: rows.filter((p: any) => p?.status === "entregue").length,
      entreguesHoje: hoje.filter((p: any) => p?.status === "entregue").length,
      comissaoApp: financeService.getDelivererState(entregadorId).saldoDevedor,
      totalVendido,
    };
  }, [rows, entregadorId]);

  return (
    <EntregadorLayout>
      <div style={{ display: "grid", gap: 14 }}>
        <PageHeader title="Histórico" subtitle="Entregas concluídas e cancelamentos" />

        <div style={summaryCard}>
          <div style={summaryTitle}>Resumo rápido</div>
          <div style={summaryGrid}>
            <div style={summaryMini}>
              <div style={summaryLabel}>Entregues</div>
              <div style={summaryValue}>{resumo.filaAtiva}</div>
            </div>
            <div style={summaryMini}>
              <div style={summaryLabel}>Cancelados</div>
              <div style={summaryValue}>{resumo.ofertas}</div>
            </div>
            <div style={summaryMini}>
              <div style={summaryLabel}>Entregues hoje</div>
              <div style={summaryValue}>{resumo.entreguesHoje}</div>
            </div>
            <div style={summaryMini}>
              <div style={summaryLabel}>Comissão do app</div>
              <div style={summaryMoney}>{money(resumo.comissaoApp)}</div>
            </div>
            <div style={summaryMiniWide}>
              <div style={summaryLabel}>Total vendido</div>
              <div style={summaryMoney}>{money(resumo.totalVendido)}</div>
            </div>
          </div>
        </div>

        <div style={heroCard}>
          <div style={heroTitle}>Histórico de entregas</div>
          <div style={tabsRow}>
            <button onClick={() => setFiltro("entregues")} type="button" style={{ ...tabBtn, ...(filtro === "entregues" ? tabBtnActive : null) }}>Concluídos</button>
            <button onClick={() => setFiltro("cancelados")} type="button" style={{ ...tabBtn, ...(filtro === "cancelados" ? tabBtnActive : null) }}>Cancelados</button>
          </div>
          <div style={filtersGrid}>
            <select value={getSelectValue(anoFiltro)} onChange={(e) => setAnoFiltro(parseSelectValue(e.target.value))} style={filterSelect}>
              <option value="all">Ano</option>
              {years.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
            <select value={getSelectValue(mesFiltro)} onChange={(e) => setMesFiltro(parseSelectValue(e.target.value))} style={filterSelect}>
              <option value="all">Mês</option>
              {Array.from({ length: 12 }, (_, index) => {
                const value = String(index + 1).padStart(2, "0");
                return (
                  <option key={value} value={value}>
                    {value}
                  </option>
                );
              })}
            </select>
            <select value={getSelectValue(diaFiltro)} onChange={(e) => setDiaFiltro(parseSelectValue(e.target.value))} style={filterSelect}>
              <option value="all">Dia</option>
              {Array.from({ length: 31 }, (_, index) => {
                const value = String(index + 1).padStart(2, "0");
                return (
                  <option key={value} value={value}>
                    {value}
                  </option>
                );
              })}
            </select>
          </div>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtre por ID ou endereço" style={searchInput} />
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>
              {rows.length} {filtro === "entregues" ? "entrega(s)" : "registro(s)"}
            </div>
          </div>

          {rows.length === 0 ? (
            <div style={emptyText}>Nenhum registro encontrado.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {rows.map((p: any, index: number) => {
                const bairro =
                  safeText(p?.enderecoSnapshot?.bairro ?? p?.enderecoSnapshot?.neighborhood) ||
                  safeText(p?.enderecoSnapshot?.cidade ?? p?.enderecoSnapshot?.city) ||
                  "Sem região";

                const resumoItens = Array.isArray(p?.itens)
                  ? p.itens.map((item: any) => `${item.quantidade} ${item.nome}`).join(", ")
                  : "Sem itens";

                const horario = getPedidoDate(p).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <button key={p.id} onClick={() => navigate(`/entregador/pedido/${p.id}`)} type="button" style={historyCardBtn}>
                    <div style={indexBadge}>{index + 1}</div>
                    <div style={{ minWidth: 0, textAlign: "left", flex: 1 }}>
                      <div style={cardTop}>
                        <div style={cardTitle}>Pedido #{String(p.id).slice(0, 6)}</div>
                        <span style={{ ...statusBadge, ...(p?.status === "entregue" ? deliveredBadge : cancelledBadge) }}>{statusLabel(p.status)}</span>
                      </div>
                      <div style={cardMeta}>{bairro}</div>
                      <div style={cardMeta}>{resumoItens}</div>
                      <div style={timeMeta}>Horário: {horario}</div>
                    </div>
                    <div style={valueCol}>
                      <div style={valueMoney}>{money(Number(p?.total ?? 0))}</div>
                      <div style={valueHint}>Ver pedido</div>
                    </div>
                  </button>
                );
              })}
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
const summaryCard: CSSProperties = {
  background: "linear-gradient(135deg,#0F172A 0%, #111827 100%)",
  borderRadius: ui.radius.section,
  padding: 16,
  color: "#fff",
  boxShadow: ui.shadow.dark,
};
const summaryTitle: CSSProperties = { fontSize: 16, fontWeight: 950, color: "#fff" };
const summaryGrid: CSSProperties = { marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const summaryMini: CSSProperties = { borderRadius: 16, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" };
const summaryMiniWide: CSSProperties = { ...summaryMini, gridColumn: "1 / -1" };
const summaryLabel: CSSProperties = { fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.72)" };
const summaryValue: CSSProperties = { marginTop: 8, fontSize: 22, fontWeight: 950, color: "#fff" };
const summaryMoney: CSSProperties = { marginTop: 8, fontSize: 18, fontWeight: 950, color: "#FDE68A" };
const heroTitle: CSSProperties = { fontSize: 18, fontWeight: 950, color: "#111827" };
const tabsRow: CSSProperties = { marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const tabBtn: CSSProperties = { height: 42, borderRadius: 999, border: "1px solid rgba(15,23,42,0.10)", background: "#fff", fontWeight: 900, cursor: "pointer" };
const tabBtnActive: CSSProperties = { border: "none", background: "linear-gradient(90deg,#E44F2A,#F59E0B)", color: "#fff" };
const filtersGrid: CSSProperties = { marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 };
const filterSelect: CSSProperties = { width: "100%", height: 44, borderRadius: 14, border: "1px solid rgba(15,23,42,0.10)", background: "#fff", padding: "0 12px", fontWeight: 800, color: "#111827", outline: "none" };
const searchInput: CSSProperties = { marginTop: 12, width: "100%", height: 46, borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", padding: "0 14px", fontWeight: 800, color: "#111827", outline: "none" };
const sectionCard: CSSProperties = { ...sectionCardStyle() };
const sectionHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" };
const sectionTitle: CSSProperties = { fontSize: 16, fontWeight: 950, color: "#111827" };
const emptyText: CSSProperties = { marginTop: 12, color: "#475569", lineHeight: 1.55 };
const historyCardBtn: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  width: "100%",
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#fff",
  boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
  cursor: "pointer",
};
const indexBadge: CSSProperties = { width: 34, height: 34, borderRadius: 999, background: "#F97316", color: "#fff", display: "grid", placeItems: "center", fontWeight: 950, flexShrink: 0 };
const cardTop: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" };
const cardTitle: CSSProperties = { fontSize: 16, fontWeight: 950, color: "#111827" };
const cardMeta: CSSProperties = { marginTop: 4, fontSize: 12.5, color: "#64748B", lineHeight: 1.35 };
const timeMeta: CSSProperties = { marginTop: 8, fontSize: 13, color: "#F97316", fontWeight: 900, lineHeight: 1.4 };
const statusBadge: CSSProperties = { padding: "6px 10px", borderRadius: 999, fontWeight: 900, fontSize: 12 };
const deliveredBadge: CSSProperties = { background: "rgba(34,197,94,0.10)", color: "#166534", border: "1px solid rgba(34,197,94,0.16)" };
const cancelledBadge: CSSProperties = { background: "rgba(239,68,68,0.10)", color: "#991B1B", border: "1px solid rgba(239,68,68,0.16)" };
const valueCol: CSSProperties = { minWidth: 74, textAlign: "right" };
const valueMoney: CSSProperties = { fontSize: 15, fontWeight: 950, color: "#E44F2A" };
const valueHint: CSSProperties = { marginTop: 8, fontSize: 12.5, color: "#64748B", fontWeight: 700 };
