import { useMemo, useState, type CSSProperties } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { usePedidoStore } from "../../store/usePedidoStore";
import { money, safeText, statusLabel } from "../../utils/delivererHelpers";

type AuditFilter =
  | "todos"
  | "suspeitos"
  | "auditaveis"
  | "cancelados_entregador"
  | "cancelados_cliente"
  | "cancelados_adm"
  | "entregas_manuais";

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function exportRowsToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    alert("Não há dados para exportar.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getRiskScore(pedido: any) {
  let score = 0;

  if (pedido?.cancelamentoSuspeito) score += 50;
  if (pedido?.canceladoPor === "entregador") score += 30;
  if (pedido?.deliveryConfirmationMethod === "manual") score += 25;
  if (pedido?.status === "cancelado") score += 10;
  if (
    String(pedido?.motivoCancelamento || "")
      .toLowerCase()
      .includes("comprou de outro")
  ) {
    score += 20;
  }
  if (
    String(pedido?.motivoCancelamento || "")
      .toLowerCase()
      .includes("cliente ausente")
  ) {
    score += 10;
  }

  return score;
}

function getRiskLabel(score: number) {
  if (score >= 70) return "Alto";
  if (score >= 35) return "Médio";
  return "Baixo";
}

export default function AdminAuditoria() {
  const pedidos = usePedidoStore((s) => s.pedidos);

  const [filtro, setFiltro] = useState<AuditFilter>("todos");
  const [busca, setBusca] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const ordered = useMemo(() => {
    const list = Array.isArray(pedidos) ? [...pedidos] : [];
    return list.sort(
      (a: any, b: any) =>
        new Date(b?.updatedAt ?? b?.createdAt ?? 0).getTime() -
        new Date(a?.updatedAt ?? a?.createdAt ?? 0).getTime()
    );
  }, [pedidos]);

  const auditRows = useMemo(() => {
    return ordered
      .map((pedido: any) => ({
        ...pedido,
        riskScore: getRiskScore(pedido),
        riskLabel: getRiskLabel(getRiskScore(pedido)),
      }))
      .filter((pedido: any) => {
        if (filtro === "suspeitos" && !pedido.cancelamentoSuspeito) return false;
        if (filtro === "auditaveis" && !pedido.cancelamentoAuditavel) return false;
        if (filtro === "cancelados_entregador" && pedido.canceladoPor !== "entregador") return false;
        if (filtro === "cancelados_cliente" && pedido.canceladoPor !== "cliente") return false;
        if (filtro === "cancelados_adm" && pedido.canceladoPor !== "adm") return false;
        if (filtro === "entregas_manuais" && pedido.deliveryConfirmationMethod !== "manual") return false;

        const q = busca.trim().toLowerCase();
        if (!q) return true;

        const haystack = [
          pedido.id,
          pedido.clienteNome,
          pedido.clienteTelefone,
          pedido.entregadorId,
          pedido.canceladoPor,
          pedido.motivoCancelamento,
          pedido.observacaoCancelamento,
          pedido.status,
          pedido.deliveryConfirmationMethod,
          pedido.enderecoSnapshot?.bairro,
          pedido.enderecoSnapshot?.neighborhood,
          pedido.enderecoSnapshot?.cidade,
          pedido.enderecoSnapshot?.city,
        ]
          .map((x) => String(x ?? ""))
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      });
  }, [ordered, filtro, busca]);

  const selected = useMemo(() => {
    return auditRows.find((item: any) => String(item.id) === selectedId) ?? auditRows[0] ?? null;
  }, [auditRows, selectedId]);

  const summary = useMemo(() => {
    return {
      total: ordered.length,
      suspeitos: ordered.filter((p: any) => p?.cancelamentoSuspeito).length,
      auditaveis: ordered.filter((p: any) => p?.cancelamentoAuditavel).length,
      manuais: ordered.filter((p: any) => p?.deliveryConfirmationMethod === "manual").length,
      canceladosEntregador: ordered.filter((p: any) => p?.canceladoPor === "entregador").length,
      canceladosCliente: ordered.filter((p: any) => p?.canceladoPor === "cliente").length,
    };
  }, [ordered]);

  function selectPedido(id: string) {
    setSelectedId(id);
  }

  function exportCsv() {
    exportRowsToCsv(
      "admin_auditoria.csv",
      auditRows.map((pedido: any) => ({
        pedido_id: pedido.id,
        cliente: pedido.clienteNome ?? "",
        telefone: pedido.clienteTelefone ?? "",
        entregador_id: pedido.entregadorId ?? "",
        status: pedido.status ?? "",
        cancelado_por: pedido.canceladoPor ?? "",
        motivo_cancelamento: pedido.motivoCancelamento ?? "",
        observacao_cancelamento: pedido.observacaoCancelamento ?? "",
        suspeito: pedido.cancelamentoSuspeito ? "sim" : "nao",
        auditavel: pedido.cancelamentoAuditavel ? "sim" : "nao",
        confirmacao_entrega: pedido.deliveryConfirmationMethod ?? "",
        risco: pedido.riskLabel,
        score_risco: pedido.riskScore,
        total: pedido.total ?? 0,
      }))
    );
  }

  return (
    <AdminLayout
      title="ADM Auditoria"
      subtitle="Fila de risco operacional, cancelamentos suspeitos e entregas auditáveis"
    >
      <div style={heroGrid}>
        <MetricCard label="Pedidos totais" value={String(summary.total)} />
        <MetricCardDanger label="Suspeitos" value={String(summary.suspeitos)} />
        <MetricCard label="Auditáveis" value={String(summary.auditaveis)} />
        <MetricCard label="Entrega manual" value={String(summary.manuais)} />
      </div>

      <div style={heroGrid}>
        <MetricCard label="Canc. entregador" value={String(summary.canceladosEntregador)} />
        <MetricCard label="Canc. cliente" value={String(summary.canceladosCliente)} />
        <MetricCard label="Risco alto" value={String(ordered.filter((p: any) => getRiskScore(p) >= 70).length)} />
        <MetricCard label="Risco médio+" value={String(ordered.filter((p: any) => getRiskScore(p) >= 35).length)} />
      </div>

      <div style={toolbarCard}>
        <div style={chipRow}>
          <button onClick={() => setFiltro("todos")} type="button" style={{ ...chipBtn, ...(filtro === "todos" ? chipBtnActive : null) }}>
            Todos
          </button>
          <button onClick={() => setFiltro("suspeitos")} type="button" style={{ ...chipBtn, ...(filtro === "suspeitos" ? chipBtnActive : null) }}>
            Suspeitos
          </button>
          <button onClick={() => setFiltro("auditaveis")} type="button" style={{ ...chipBtn, ...(filtro === "auditaveis" ? chipBtnActive : null) }}>
            Auditáveis
          </button>
          <button onClick={() => setFiltro("cancelados_entregador")} type="button" style={{ ...chipBtn, ...(filtro === "cancelados_entregador" ? chipBtnActive : null) }}>
            Entregador
          </button>
          <button onClick={() => setFiltro("cancelados_cliente")} type="button" style={{ ...chipBtn, ...(filtro === "cancelados_cliente" ? chipBtnActive : null) }}>
            Cliente
          </button>
          <button onClick={() => setFiltro("cancelados_adm")} type="button" style={{ ...chipBtn, ...(filtro === "cancelados_adm" ? chipBtnActive : null) }}>
            ADM
          </button>
          <button onClick={() => setFiltro("entregas_manuais")} type="button" style={{ ...chipBtn, ...(filtro === "entregas_manuais" ? chipBtnActive : null) }}>
            Manual
          </button>
        </div>

        <div style={toolbarBottom}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={searchInput}
            placeholder="Buscar por cliente, pedido, telefone, motivo ou entregador..."
          />

          <button onClick={exportCsv} type="button" style={exportBtn}>
            Exportar CSV
          </button>
        </div>
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Fila de auditoria</div>
            <span style={countPill}>{auditRows.length}</span>
          </div>

          {auditRows.length === 0 ? (
            <div style={emptyText}>Nenhum item encontrado nesse filtro.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {auditRows.map((pedido: any) => (
                <button
                  key={pedido.id}
                  onClick={() => selectPedido(String(pedido.id))}
                  type="button"
                  style={{
                    ...rowBtn,
                    border:
                      String(selected?.id ?? "") === String(pedido.id)
                        ? "2px solid rgba(228,79,42,0.24)"
                        : "1px solid rgba(15,23,42,0.06)",
                    boxShadow:
                      String(selected?.id ?? "") === String(pedido.id)
                        ? "0 12px 26px rgba(228,79,42,0.08)"
                        : "none",
                  }}
                >
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={rowTitle}>
                      Pedido #{String(pedido.id).slice(0, 6)}
                    </div>
                    <div style={rowMeta}>
                      {safeText(pedido.clienteNome) || "Cliente"} • {statusLabel(pedido.status)}
                    </div>
                    <div style={rowMetaSecondary}>
                      {pedido.canceladoPor ? `Cancelado por: ${pedido.canceladoPor}` : `Confirmação: ${pedido.deliveryConfirmationMethod || "—"}`}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        ...riskPill,
                        background:
                          pedido.riskLabel === "Alto"
                            ? "rgba(185,28,28,0.10)"
                            : pedido.riskLabel === "Médio"
                            ? "rgba(234,88,12,0.10)"
                            : "rgba(22,163,74,0.10)",
                        color:
                          pedido.riskLabel === "Alto"
                            ? "#B91C1C"
                            : pedido.riskLabel === "Médio"
                            ? "#C2410C"
                            : "#166534",
                      }}
                    >
                      {pedido.riskLabel}
                    </div>
                    <div style={rowMetaSecondary}>Score {pedido.riskScore}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Detalhes da auditoria</div>
            {selected ? <span style={countPill}>#{String(selected.id).slice(0, 6)}</span> : null}
          </div>

          {!selected ? (
            <div style={emptyText}>Selecione um item da fila.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
              <div style={detailsGrid}>
                <DetailBox label="Pedido" value={`#${String(selected.id).slice(0, 6)}`} />
                <DetailBox label="Cliente" value={safeText(selected.clienteNome) || "Cliente"} />
                <DetailBox label="Telefone" value={safeText(selected.clienteTelefone) || "Não informado"} />
                <DetailBox label="Entregador" value={safeText(selected.entregadorId) || "Não atribuído"} />
                <DetailBox label="Status" value={statusLabel(selected.status)} />
                <DetailBox label="Total" value={money(Number(selected.total || 0))} />
                <DetailBox label="Risco" value={`${selected.riskLabel} (${selected.riskScore})`} />
                <DetailBox label="Confirmação entrega" value={safeText(selected.deliveryConfirmationMethod) || "—"} />
              </div>

              <div style={subCard}>
                <div style={subTitle}>Dados de cancelamento</div>

                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <AuditLine label="Cancelado por" value={safeText(selected.canceladoPor) || "—"} />
                  <AuditLine label="Auditável" value={selected.cancelamentoAuditavel ? "Sim" : "Não"} />
                  <AuditLine label="Suspeito" value={selected.cancelamentoSuspeito ? "Sim" : "Não"} danger={selected.cancelamentoSuspeito} />
                  <AuditLine label="Data" value={selected.canceladoEm ? new Date(selected.canceladoEm).toLocaleString("pt-BR") : "—"} />
                </div>

                {safeText(selected.motivoCancelamento) ? (
                  <div style={reasonBox}>
                    <strong>Motivo:</strong> {safeText(selected.motivoCancelamento)}
                  </div>
                ) : null}

                {safeText(selected.observacaoCancelamento) ? (
                  <div style={reasonBox}>
                    <strong>Observação:</strong> {safeText(selected.observacaoCancelamento)}
                  </div>
                ) : null}
              </div>

              <div style={subCard}>
                <div style={subTitle}>Endereço e georreferência</div>

                <div style={reasonBox}>
                  <strong>Endereço:</strong>{" "}
                  {[
                    safeText(selected?.enderecoSnapshot?.street ?? selected?.enderecoSnapshot?.rua),
                    safeText(selected?.enderecoSnapshot?.number ?? selected?.enderecoSnapshot?.numero),
                    safeText(selected?.enderecoSnapshot?.bairro ?? selected?.enderecoSnapshot?.neighborhood),
                    safeText(selected?.enderecoSnapshot?.cidade ?? selected?.enderecoSnapshot?.city),
                  ]
                    .filter(Boolean)
                    .join(", ") || "Não informado"}
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <AuditLine label="Lat cancelamento" value={selected.cancelamentoLat != null ? String(selected.cancelamentoLat) : "—"} />
                  <AuditLine label="Lng cancelamento" value={selected.cancelamentoLng != null ? String(selected.cancelamentoLng) : "—"} />
                </div>
              </div>

              <div style={subCardDanger}>
                <div style={subTitle}>Leitura operacional</div>
                <div style={insightText}>
                  {selected.riskLabel === "Alto"
                    ? "Esse item deve ser investigado primeiro. O cancelamento ou confirmação tem sinais fortes de risco."
                    : selected.riskLabel === "Médio"
                    ? "Esse item merece revisão manual. Há sinal parcial de risco operacional."
                    : "Esse item tem baixo risco relativo, mas continua auditável conforme o contexto."}
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <AuditLine
                    label="Entrega manual"
                    value={selected.deliveryConfirmationMethod === "manual" ? "Sim" : "Não"}
                    danger={selected.deliveryConfirmationMethod === "manual"}
                  />
                  <AuditLine
                    label="Cancelado por entregador"
                    value={selected.canceladoPor === "entregador" ? "Sim" : "Não"}
                    danger={selected.canceladoPor === "entregador"}
                  />
                  <AuditLine
                    label="Motivo crítico"
                    value={
                      String(selected.motivoCancelamento || "").trim()
                        ? "Sim"
                        : "Não"
                    }
                  />
                </div>
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

function AuditLine(props: { label: string; value: string; danger?: boolean }) {
  const { label, value, danger } = props;

  return (
    <div style={auditLine}>
      <span style={auditLineLabel}>{label}</span>
      <strong style={{ color: danger ? "#B91C1C" : "#111827" }}>{value}</strong>
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

const riskPill: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
  whiteSpace: "nowrap",
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

const subCardDanger: CSSProperties = {
  borderRadius: 20,
  padding: 14,
  background: "rgba(185,28,28,0.04)",
  border: "1px solid rgba(185,28,28,0.12)",
};

const subTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const auditLine: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.06)",
};

const auditLineLabel: CSSProperties = {
  color: "#64748B",
  fontWeight: 800,
};

const reasonBox: CSSProperties = {
  marginTop: 12,
  borderRadius: 16,
  padding: 12,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.06)",
  color: "#111827",
  lineHeight: 1.55,
};

const insightText: CSSProperties = {
  marginTop: 12,
  color: "#7F1D1D",
  lineHeight: 1.55,
  fontWeight: 800,
};