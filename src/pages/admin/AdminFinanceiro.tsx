import { useMemo, useState, type CSSProperties } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { usePedidoStore } from "../../store/usePedidoStore";
import { useRemoteSyncStore } from "../../store/useRemoteSyncStore";
import { exportRowsToCsv } from "../../services/csvExportService";
import { financeService } from "../../services/financeService";
import { emitToast } from "../../services/realtimeBus";
import { money, safeText } from "../../utils/delivererHelpers";

type FinanceFilter = "todos" | "devedores" | "bloqueados" | "quitados";

export default function AdminFinanceiro() {
  const pedidos = usePedidoStore((s) => s.pedidos);
  const publicVersion = useRemoteSyncStore((s) => s.publicVersion);
  const financeVersion = useRemoteSyncStore((s) => s.financeVersion);

  const [refreshKey, setRefreshKey] = useState(0);
  const [filtro, setFiltro] = useState<FinanceFilter>("todos");
  const [busca, setBusca] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [paymentValue, setPaymentValue] = useState("");
  const [paymentObs, setPaymentObs] = useState("");
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustObs, setAdjustObs] = useState("");
  const [actionBusy, setActionBusy] = useState<"" | "payment" | "adjust">("");

  const syncedStates = useMemo(() => {
    return financeService.syncDeliveredOrders(pedidos) || [];
  }, [pedidos, refreshKey, publicVersion, financeVersion]);

  const summary = useMemo(() => {
    return financeService.getGlobalSummary(pedidos);
  }, [pedidos, refreshKey, publicVersion, financeVersion]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return syncedStates.filter((row) => {
      if (filtro === "devedores" && Number(row.saldoDevedor || 0) <= 0) return false;
      if (filtro === "bloqueados" && !row.bloqueado) return false;
      if (filtro === "quitados" && Number(row.saldoDevedor || 0) !== 0) return false;

      if (!q) return true;

      const haystack = [
        row.entregadorId,
        ...(row.historico || []).flatMap((h) => [h.observacao, h.pedidoId, h.tipo]),
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [syncedStates, filtro, busca]);

  const selected = useMemo(() => {
    return filtered.find((item) => item.entregadorId === selectedId) ?? filtered[0] ?? null;
  }, [filtered, selectedId]);

  const dailySummary = useMemo(() => {
    const today = new Date();
    const isToday = (value: string) => {
      const d = new Date(value);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    };

    const historico = summary.states.flatMap((item) => item.historico || []);
    const hoje = historico.filter((item) => isToday(item.data));

    return {
      comissaoHoje: hoje
        .filter((item) => item.tipo === "comissao")
        .reduce((acc, item) => acc + Number(item.valor || 0), 0),
      pagamentoHoje: hoje
        .filter((item) => item.tipo === "pagamento")
        .reduce((acc, item) => acc + Math.abs(Number(item.valor || 0)), 0),
      ajusteHoje: hoje
        .filter((item) => item.tipo === "ajuste")
        .reduce((acc, item) => acc + Number(item.valor || 0), 0),
    };
  }, [summary]);

  function refresh() {
    setRefreshKey((v) => v + 1);
  }

  function selectRow(id: string) {
    setSelectedId(id);
    setPaymentValue("");
    setPaymentObs("");
    setAdjustValue("");
    setAdjustObs("");
  }

  function registrarPagamento() {
    if (!selected?.entregadorId) return;
    if (actionBusy) return;

    const valor = Number(paymentValue);
    if (!Number.isFinite(valor) || valor <= 0) {
      emitToast("Valor invalido", "Informe um valor de pagamento valido.", "warning");
      return;
    }

    const saldoAtual = Number(selected.saldoDevedor || 0);
    if (saldoAtual > 0 && valor > saldoAtual) {
      emitToast(
        "Pagamento acima do saldo",
        `O saldo pendente atual e ${money(saldoAtual)}. Informe um valor menor ou ajuste o saldo antes.`,
        "warning"
      );
      return;
    }

    setActionBusy("payment");
    try {
      financeService.registerPagamento(
        selected.entregadorId,
        valor,
        paymentObs.trim() || "Pagamento manual registrado no ADM"
      );

      emitToast("Pagamento registrado", "O pagamento foi salvo no financeiro.", "success");
      setPaymentValue("");
      setPaymentObs("");
      refresh();
    } finally {
      setActionBusy("");
    }
  }

  function registrarAjuste() {
    if (!selected?.entregadorId) return;
    if (actionBusy) return;

    const valor = Number(adjustValue);
    if (!Number.isFinite(valor) || valor === 0) {
      emitToast(
        "Valor invalido",
        "Informe um valor de ajuste valido. Pode ser positivo ou negativo.",
        "warning"
      );
      return;
    }

    setActionBusy("adjust");
    try {
      financeService.addAjuste(
        selected.entregadorId,
        valor,
        adjustObs.trim() || "Ajuste financeiro manual do ADM"
      );

      emitToast("Ajuste aplicado", "O ajuste financeiro foi registrado.", "success");
      setAdjustValue("");
      setAdjustObs("");
      refresh();
    } finally {
      setActionBusy("");
    }
  }

  function exportCsv() {
    exportRowsToCsv(
      "admin_financeiro_entregadores.csv",
      filtered.map((row) => ({
        entregador_id: row.entregadorId,
        saldo_devedor: row.saldoDevedor,
        bloqueado: row.bloqueado ? "sim" : "nao",
        limite_bloqueio: row.limiteBloqueio,
        historico_qtd: Array.isArray(row.historico) ? row.historico.length : 0,
      }))
    );
  }

  return (
    <AdminLayout
      title="ADM Financeiro"
      subtitle="Consolidação de comissão, pagamentos, saldo devedor e repasse"
    >
      <div style={heroGrid}>
        <MetricCard label="Entregadores" value={String(summary.totalEntregadores)} />
        <MetricCardDanger label="Bloqueados" value={String(summary.bloqueados)} />
        <MetricCard label="Saldo em aberto" value={money(summary.saldoEmAberto)} />
        <MetricCard label="Comissão total" value={money(summary.totalComissao)} />
      </div>

      <div style={heroGrid}>
        <MetricCard label="Pagamento total" value={money(summary.totalPagamentos)} />
        <MetricCard label="Ajustes totais" value={money(summary.totalAjustes)} />
        <MetricCard label="Comissão hoje" value={money(dailySummary.comissaoHoje)} />
        <MetricCard label="Pagamentos hoje" value={money(dailySummary.pagamentoHoje)} />
      </div>

      <div style={toolbarCard}>
        <div style={chipRow}>
          <button
            onClick={() => setFiltro("todos")}
            type="button"
            style={{ ...chipBtn, ...(filtro === "todos" ? chipBtnActive : null) }}
          >
            Todos
          </button>
          <button
            onClick={() => setFiltro("devedores")}
            type="button"
            style={{ ...chipBtn, ...(filtro === "devedores" ? chipBtnActive : null) }}
          >
            Devedores
          </button>
          <button
            onClick={() => setFiltro("bloqueados")}
            type="button"
            style={{ ...chipBtn, ...(filtro === "bloqueados" ? chipBtnActive : null) }}
          >
            Bloqueados
          </button>
          <button
            onClick={() => setFiltro("quitados")}
            type="button"
            style={{ ...chipBtn, ...(filtro === "quitados" ? chipBtnActive : null) }}
          >
            Quitados
          </button>
        </div>

        <div style={toolbarBottom}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={searchInput}
            placeholder="Buscar por entregador, pedido ou observação..."
          />

          <button onClick={exportCsv} type="button" style={exportBtn}>
            Exportar CSV
          </button>
        </div>
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Consolidado por entregador</div>
            <span style={countPill}>{filtered.length}</span>
          </div>

          {filtered.length === 0 ? (
            <div style={emptyText}>Nenhum entregador encontrado nesse filtro.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {filtered.map((row) => (
                <button
                  key={row.entregadorId}
                  onClick={() => selectRow(row.entregadorId)}
                  type="button"
                  style={{
                    ...rowBtn,
                    border:
                      selected?.entregadorId === row.entregadorId
                        ? "2px solid rgba(228,79,42,0.24)"
                        : "1px solid rgba(15,23,42,0.06)",
                    boxShadow:
                      selected?.entregadorId === row.entregadorId
                        ? "0 12px 26px rgba(228,79,42,0.08)"
                        : "none",
                  }}
                >
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={rowTitle}>{row.entregadorId}</div>
                    <div style={rowMeta}>
                      Histórico: {Array.isArray(row.historico) ? row.historico.length : 0} lançamento(s)
                    </div>
                    <div style={rowMetaSecondary}>
                      Limite: {money(row.limiteBloqueio)}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={rowStrong}>{money(row.saldoDevedor)}</div>
                    <div
                      style={{
                        ...statusMini,
                        color: row.bloqueado ? "#B91C1C" : "#166534",
                      }}
                    >
                      {row.bloqueado ? "Bloqueado" : "Normal"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Operação financeira</div>
            {selected ? <span style={countPill}>{selected.entregadorId}</span> : null}
          </div>

          {!selected ? (
            <div style={emptyText}>Selecione um entregador.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
              <div style={detailsGrid}>
                <DetailBox label="Entregador" value={selected.entregadorId} />
                <DetailBox label="Saldo devedor" value={money(selected.saldoDevedor)} />
                <DetailBox label="Bloqueado" value={selected.bloqueado ? "Sim" : "Não"} />
                <DetailBox label="Limite de bloqueio" value={money(selected.limiteBloqueio)} />
              </div>

              <div style={subCard}>
                <div style={subTitle}>Registrar pagamento</div>
                <div style={subHint}>
                  Use quando o entregador fizer Pix ou quitar parte do saldo.
                </div>

                <div style={formGrid}>
                  <input
                    value={paymentValue}
                    onChange={(e) => setPaymentValue(e.target.value)}
                    style={fieldInput}
                    placeholder="Valor pago"
                    inputMode="decimal"
                    disabled={actionBusy !== ""}
                  />

                  <textarea
                    value={paymentObs}
                    onChange={(e) => setPaymentObs(e.target.value)}
                    style={fieldTextArea}
                    placeholder="Observação do pagamento"
                    disabled={actionBusy !== ""}
                  />

                  <button onClick={registrarPagamento} type="button" style={primaryBtn} disabled={actionBusy !== ""}>
                    {actionBusy === "payment" ? "Registrando..." : "Registrar pagamento"}
                  </button>
                </div>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Registrar ajuste</div>
                <div style={subHint}>
                  Positivo aumenta saldo. Negativo reduz saldo.
                </div>

                <div style={formGrid}>
                  <input
                    value={adjustValue}
                    onChange={(e) => setAdjustValue(e.target.value)}
                    style={fieldInput}
                    placeholder="Ex.: 10 ou -10"
                    inputMode="decimal"
                    disabled={actionBusy !== ""}
                  />

                  <textarea
                    value={adjustObs}
                    onChange={(e) => setAdjustObs(e.target.value)}
                    style={fieldTextArea}
                    placeholder="Observação do ajuste"
                    disabled={actionBusy !== ""}
                  />

                  <button onClick={registrarAjuste} type="button" style={secondaryBtn} disabled={actionBusy !== ""}>
                    {actionBusy === "adjust" ? "Registrando..." : "Registrar ajuste"}
                  </button>
                </div>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Histórico financeiro</div>

                {selected.historico.length === 0 ? (
                  <div style={emptyTextSmall}>Sem lançamentos ainda.</div>
                ) : (
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {selected.historico.slice(0, 20).map((item, index) => (
                      <div key={`${item.tipo}_${item.data}_${index}`} style={ledgerRow}>
                        <div style={{ minWidth: 0 }}>
                          <div style={ledgerTitle}>
                            {item.tipo === "comissao"
                              ? "Comissão"
                              : item.tipo === "pagamento"
                              ? "Pagamento"
                              : "Ajuste"}
                          </div>

                          <div style={ledgerMeta}>
                            {new Date(item.data).toLocaleString("pt-BR")}
                            {item.pedidoId ? ` | Pedido ${String(item.pedidoId).slice(0, 6)}` : ""}
                          </div>

                          {safeText(item.observacao) ? (
                            <div style={{ ...ledgerMeta, marginTop: 6 }}>
                              {safeText(item.observacao)}
                            </div>
                          ) : null}
                        </div>

                        <div
                          style={{
                            ...ledgerValue,
                            color:
                              item.tipo === "pagamento"
                                ? "#16A34A"
                                : item.tipo === "ajuste" && Number(item.valor) < 0
                                ? "#16A34A"
                                : "#B91C1C",
                          }}
                        >
                          {item.tipo === "pagamento"
                            ? `+ ${money(Math.abs(Number(item.valor || 0)))}`
                            : item.tipo === "ajuste" && Number(item.valor) < 0
                            ? `+ ${money(Math.abs(Number(item.valor || 0)))}`
                            : `- ${money(Math.abs(Number(item.valor || 0)))}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
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

function DetailBox(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div style={detailBox}>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value}</div>
    </div>
  );
}

const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const metricCard: CSSProperties = {
  background: "#fff",
  borderRadius: 20,
  padding: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const metricDangerCard: CSSProperties = {
  background: "linear-gradient(135deg,#7F1D1D 0%, #991B1B 55%, #B91C1C 100%)",
  borderRadius: 20,
  padding: 14,
  color: "#fff",
  boxShadow: "0 14px 28px rgba(127,29,29,0.18)",
};

const metricLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const metricValue: CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 950,
  color: "#111827",
};

const metricLabelLight: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(255,255,255,0.82)",
};

const metricValueLight: CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 950,
  color: "#fff",
};

const toolbarCard: CSSProperties = {
  marginTop: 14,
  background: "#fff",
  borderRadius: 22,
  padding: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const chipRow: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const chipBtn: CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const chipBtnActive: CSSProperties = {
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  boxShadow: "0 10px 22px rgba(228,79,42,0.18)",
};

const toolbarBottom: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
};

const searchInput: CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  padding: "0 14px",
  fontWeight: 800,
  color: "#111827",
  outline: "none",
};

const exportBtn: CSSProperties = {
  height: 46,
  padding: "0 16px",
  borderRadius: 16,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "#111827",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const contentGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "0.9fr 1.1fr",
  gap: 14,
};

const sectionCard: CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const sectionHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const sectionTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const countPill: CSSProperties = {
  minWidth: 30,
  height: 30,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "#F1F5F9",
  color: "#111827",
  fontWeight: 950,
  fontSize: 12,
};

const emptyText: CSSProperties = {
  marginTop: 12,
  color: "#64748B",
  lineHeight: 1.5,
};

const emptyTextSmall: CSSProperties = {
  marginTop: 12,
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.5,
};

const rowBtn: CSSProperties = {
  width: "100%",
  textAlign: "left",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  padding: 14,
  borderRadius: 18,
  background: "#F8FAFC",
  cursor: "pointer",
};

const rowTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const rowMeta: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#64748B",
};

const rowMetaSecondary: CSSProperties = {
  marginTop: 6,
  fontSize: 12.5,
  color: "#94A3B8",
};

const rowStrong: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
  whiteSpace: "nowrap",
};

const statusMini: CSSProperties = {
  marginTop: 6,
  fontSize: 12.5,
  fontWeight: 900,
};

const detailsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const detailBox: CSSProperties = {
  borderRadius: 16,
  padding: 12,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const detailLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
};

const detailValue: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  fontWeight: 900,
  color: "#111827",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const subCard: CSSProperties = {
  borderRadius: 20,
  padding: 14,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const subTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const subHint: CSSProperties = {
  marginTop: 10,
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.5,
};

const formGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 10,
};

const fieldInput: CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  padding: "0 14px",
  fontWeight: 800,
  color: "#111827",
  outline: "none",
};

const fieldTextArea: CSSProperties = {
  width: "100%",
  minHeight: 92,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  padding: 12,
  fontWeight: 700,
  color: "#111827",
  outline: "none",
  resize: "vertical",
};

const primaryBtn: CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#16A34A,#22C55E)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(34,197,94,0.18)",
};

const secondaryBtn: CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(228,79,42,0.18)",
};

const ledgerRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  padding: 12,
  borderRadius: 16,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.06)",
};

const ledgerTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const ledgerMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
  lineHeight: 1.5,
};

const ledgerValue: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  whiteSpace: "nowrap",
};



