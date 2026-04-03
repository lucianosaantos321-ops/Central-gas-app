import { useMemo, useState, type CSSProperties } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { usePedidoStore } from "../../store/usePedidoStore";
import { financeService } from "../../services/financeService";
import { adminRulesService } from "../../services/adminRulesService";
import { delivererAdminService } from "../../services/delivererAdminService";
import { money, safeText } from "../../utils/delivererHelpers";

type DelivererFilter = "todos" | "ativos" | "bloqueados" | "sem_pedido";

function normalizeId(id: string) {
  return String(id || "").trim();
}

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

export default function AdminEntregadores() {
  const pedidos = usePedidoStore((s) => s.pedidos);

  const [refreshKey, setRefreshKey] = useState(0);
  const [filtro, setFiltro] = useState<DelivererFilter>("todos");
  const [busca, setBusca] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [ajusteValor, setAjusteValor] = useState("");
  const [ajusteObs, setAjusteObs] = useState("");

  const rules = useMemo(() => adminRulesService.getRules(), [refreshKey]);

  const delivererRows = useMemo(() => {
    const base = Array.isArray(pedidos) ? pedidos : [];

    const idsFromPedidos = base
      .map((p: any) => normalizeId(p?.entregadorId))
      .filter(Boolean);

    const idsFromFinance = financeService
      .getAllDelivererStates()
      .map((item) => normalizeId(item.entregadorId))
      .filter(Boolean);

    const idsFromManual = delivererAdminService
      .getAll()
      .map((item) => normalizeId(item.entregadorId))
      .filter(Boolean);

    const ids = Array.from(new Set([...idsFromPedidos, ...idsFromFinance, ...idsFromManual]));

    return ids.map((entregadorId) => {
      const rows = base.filter((p: any) => normalizeId(p?.entregadorId) === entregadorId);

      const ativos = rows.filter(
        (p: any) => p?.status !== "entregue" && p?.status !== "cancelado"
      );
      const entregues = rows.filter((p: any) => p?.status === "entregue");
      const cancelados = rows.filter((p: any) => p?.status === "cancelado");

      const finance = financeService.getDelivererState(entregadorId);
      const manual = delivererAdminService.getState(entregadorId);

      const lastPedido = [...rows].sort(
        (a: any, b: any) =>
          new Date(b?.updatedAt ?? b?.createdAt ?? 0).getTime() -
          new Date(a?.updatedAt ?? a?.createdAt ?? 0).getTime()
      )[0] ?? null;

      return {
        entregadorId,
        ativos: ativos.length,
        entregues: entregues.length,
        cancelados: cancelados.length,
        saldoDevedor: finance.saldoDevedor,
        bloqueadoPorSaldo: finance.bloqueado,
        bloqueadoManual: manual.manualBlocked,
        motivoBloqueioManual: manual.manualBlockReason,
        bloqueadoFinal: finance.bloqueado || manual.manualBlocked,
        lastPedido,
        ledger: finance.historico,
        limiteBloqueio: rules.limiteBloqueioSaldo,
      };
    });
  }, [pedidos, refreshKey, rules.limiteBloqueioSaldo]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return delivererRows.filter((row) => {
      if (filtro === "ativos" && row.ativos <= 0) return false;
      if (filtro === "bloqueados" && !row.bloqueadoFinal) return false;
      if (filtro === "sem_pedido" && row.ativos > 0) return false;

      if (!q) return true;

      const text = [
        row.entregadorId,
        row.lastPedido?.clienteNome,
        row.lastPedido?.clienteTelefone,
        row.lastPedido?.id,
        row.motivoBloqueioManual,
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [delivererRows, filtro, busca]);

  const selected = useMemo(() => {
    return filtered.find((row) => row.entregadorId === selectedId) ?? filtered[0] ?? null;
  }, [filtered, selectedId]);

  const summary = useMemo(() => {
    return {
      total: delivererRows.length,
      ativos: delivererRows.filter((r) => r.ativos > 0).length,
      bloqueados: delivererRows.filter((r) => r.bloqueadoFinal).length,
      saldoTotal: delivererRows.reduce((acc, r) => acc + Number(r.saldoDevedor || 0), 0),
    };
  }, [delivererRows]);

  function refresh() {
    setRefreshKey((v) => v + 1);
  }

  function selectDeliverer(id: string) {
    setSelectedId(id);
    setBlockReason("");
    setAjusteValor("");
    setAjusteObs("");
  }

  function bloquearManual() {
    if (!selected?.entregadorId) return;

    delivererAdminService.setManualBlock(
      selected.entregadorId,
      blockReason.trim() || "Bloqueio manual do ADM"
    );
    alert("Entregador bloqueado manualmente ✅");
    setBlockReason("");
    refresh();
  }

  function desbloquearManual() {
    if (!selected?.entregadorId) return;

    delivererAdminService.clearManualBlock(selected.entregadorId);
    alert("Bloqueio manual removido ✅");
    refresh();
  }

  function aplicarAjuste() {
    if (!selected?.entregadorId) return;

    const valor = Number(ajusteValor);
    if (!Number.isFinite(valor) || valor === 0) {
      alert("Informe um valor válido. Use positivo para aumentar e negativo para reduzir.");
      return;
    }

    financeService.addAjuste(
      selected.entregadorId,
      valor,
      ajusteObs.trim() || "Ajuste manual do ADM"
    );

    alert("Ajuste financeiro aplicado ✅");
    setAjusteValor("");
    setAjusteObs("");
    refresh();
  }

  function exportCsv() {
    exportRowsToCsv(
      "admin_entregadores.csv",
      filtered.map((row) => ({
        entregador_id: row.entregadorId,
        pedidos_ativos: row.ativos,
        entregues: row.entregues,
        cancelados: row.cancelados,
        saldo_devedor: row.saldoDevedor,
        bloqueado_por_saldo: row.bloqueadoPorSaldo ? "sim" : "nao",
        bloqueado_manual: row.bloqueadoManual ? "sim" : "nao",
        bloqueado_final: row.bloqueadoFinal ? "sim" : "nao",
        motivo_bloqueio_manual: row.motivoBloqueioManual ?? "",
        ultimo_pedido: row.lastPedido?.id ?? "",
      }))
    );
  }

  return (
    <AdminLayout
      title="ADM Entregadores"
      subtitle="Visão operacional, bloqueio manual, ajustes e histórico financeiro"
    >
      <div style={heroGrid}>
        <div style={heroStat}>
          <div style={heroLabel}>Entregadores</div>
          <div style={heroValue}>{summary.total}</div>
        </div>

        <div style={heroStat}>
          <div style={heroLabel}>Com pedidos ativos</div>
          <div style={heroValue}>{summary.ativos}</div>
        </div>

        <div style={heroStatDanger}>
          <div style={heroLabelLight}>Bloqueados</div>
          <div style={heroValueLight}>{summary.bloqueados}</div>
        </div>

        <div style={heroStat}>
          <div style={heroLabel}>Saldo total</div>
          <div style={heroValue}>{money(summary.saldoTotal)}</div>
        </div>
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
            onClick={() => setFiltro("ativos")}
            type="button"
            style={{ ...chipBtn, ...(filtro === "ativos" ? chipBtnActive : null) }}
          >
            Ativos
          </button>
          <button
            onClick={() => setFiltro("bloqueados")}
            type="button"
            style={{ ...chipBtn, ...(filtro === "bloqueados" ? chipBtnActive : null) }}
          >
            Bloqueados
          </button>
          <button
            onClick={() => setFiltro("sem_pedido")}
            type="button"
            style={{ ...chipBtn, ...(filtro === "sem_pedido" ? chipBtnActive : null) }}
          >
            Sem pedido ativo
          </button>
        </div>

        <div style={toolbarBottom}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={searchInput}
            placeholder="Buscar por entregador, pedido, cliente, telefone..."
          />

          <button onClick={exportCsv} type="button" style={exportBtn}>
            Exportar CSV
          </button>
        </div>
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Lista de entregadores</div>
            <span style={countPill}>{filtered.length}</span>
          </div>

          {filtered.length === 0 ? (
            <div style={emptyText}>Nenhum entregador encontrado.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {filtered.map((row) => (
                <button
                  key={row.entregadorId}
                  onClick={() => selectDeliverer(row.entregadorId)}
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
                      Ativos: {row.ativos} • Entregues: {row.entregues} • Cancelados: {row.cancelados}
                    </div>
                    <div style={rowMetaSecondary}>
                      Saldo: {money(row.saldoDevedor)}
                    </div>
                  </div>

                  <span
                    style={{
                      ...statusPill,
                      background: row.bloqueadoFinal
                        ? "rgba(185,28,28,0.10)"
                        : "rgba(16,185,129,0.10)",
                      color: row.bloqueadoFinal ? "#B91C1C" : "#166534",
                      border: row.bloqueadoFinal
                        ? "1px solid rgba(185,28,28,0.18)"
                        : "1px solid rgba(22,163,74,0.18)",
                    }}
                  >
                    {row.bloqueadoFinal ? "Bloqueado" : "Normal"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Controle do entregador</div>
            {selected ? <span style={countPill}>{selected.entregadorId}</span> : null}
          </div>

          {!selected ? (
            <div style={emptyText}>Selecione um entregador na lista.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
              <div style={detailsGrid}>
                <DetailBox label="Entregador" value={selected.entregadorId} />
                <DetailBox label="Pedidos ativos" value={String(selected.ativos)} />
                <DetailBox label="Entregues" value={String(selected.entregues)} />
                <DetailBox label="Cancelados" value={String(selected.cancelados)} />
                <DetailBox label="Saldo devedor" value={money(selected.saldoDevedor)} />
                <DetailBox label="Limite de bloqueio" value={money(selected.limiteBloqueio)} />
              </div>

              <div style={subCard}>
                <div style={subTitle}>Status de bloqueio</div>

                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <StatusLine
                    label="Bloqueio por saldo"
                    value={selected.bloqueadoPorSaldo ? "Sim" : "Não"}
                    danger={selected.bloqueadoPorSaldo}
                  />
                  <StatusLine
                    label="Bloqueio manual"
                    value={selected.bloqueadoManual ? "Sim" : "Não"}
                    danger={selected.bloqueadoManual}
                  />
                  <StatusLine
                    label="Bloqueio final"
                    value={selected.bloqueadoFinal ? "Sim" : "Não"}
                    danger={selected.bloqueadoFinal}
                  />
                </div>

                {safeText(selected.motivoBloqueioManual) ? (
                  <div style={blockReasonBox}>
                    <strong>Motivo manual:</strong> {safeText(selected.motivoBloqueioManual)}
                  </div>
                ) : null}
              </div>

              <div style={subCardDanger}>
                <div style={subTitle}>Bloqueio manual do ADM</div>

                <div style={formGrid}>
                  <input
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    style={fieldInput}
                    placeholder="Motivo do bloqueio manual"
                  />

                  <div style={actionDualGrid}>
                    <button onClick={bloquearManual} type="button" style={dangerBtn}>
                      Bloquear manualmente
                    </button>

                    <button onClick={desbloquearManual} type="button" style={secondaryBtn}>
                      Remover bloqueio manual
                    </button>
                  </div>
                </div>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Ajuste financeiro manual</div>

                <div style={adjustHint}>
                  Use valor positivo para aumentar saldo devedor. Use valor negativo para reduzir saldo.
                </div>

                <div style={formGrid}>
                  <input
                    value={ajusteValor}
                    onChange={(e) => setAjusteValor(e.target.value)}
                    style={fieldInput}
                    placeholder="Ex.: 10 ou -10"
                  />

                  <textarea
                    value={ajusteObs}
                    onChange={(e) => setAjusteObs(e.target.value)}
                    style={fieldTextArea}
                    placeholder="Observação do ajuste"
                  />

                  <button onClick={aplicarAjuste} type="button" style={primaryBtn}>
                    Aplicar ajuste
                  </button>
                </div>
              </div>

              {selected.lastPedido ? (
                <div style={subCard}>
                  <div style={subTitle}>Último pedido vinculado</div>
                  <div style={lastOrderGrid}>
                    <DetailBox label="Pedido" value={`#${String(selected.lastPedido.id).slice(0, 6)}`} />
                    <DetailBox label="Cliente" value={safeText(selected.lastPedido.clienteNome) || "Cliente"} />
                    <DetailBox label="Telefone" value={safeText(selected.lastPedido.clienteTelefone) || "Não informado"} />
                    <DetailBox label="Status" value={safeText(selected.lastPedido.status) || "-"} />
                  </div>
                </div>
              ) : null}

              <div style={subCard}>
                <div style={subTitle}>Histórico financeiro</div>

                {selected.ledger.length === 0 ? (
                  <div style={emptyTextSmall}>Sem histórico financeiro ainda.</div>
                ) : (
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {selected.ledger.slice(0, 12).map((item, index) => (
                      <div key={`${item.tipo}_${item.data}_${index}`} style={ledgerRow}>
                        <div>
                          <div style={ledgerTitle}>
                            {item.tipo === "comissao"
                              ? "Comissão"
                              : item.tipo === "pagamento"
                              ? "Pagamento"
                              : "Ajuste"}
                          </div>
                          <div style={ledgerMeta}>
                            {new Date(item.data).toLocaleString("pt-BR")}
                            {item.pedidoId ? ` • Pedido ${String(item.pedidoId).slice(0, 6)}` : ""}
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
                            color: item.tipo === "pagamento"
                              ? "#16A34A"
                              : item.valor < 0
                              ? "#16A34A"
                              : "#B91C1C",
                          }}
                        >
                          {item.tipo === "pagamento" || Number(item.valor) < 0 ? "+" : "-"}{" "}
                          {money(Math.abs(Number(item.valor || 0)))}
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

function DetailBox(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div style={detailBox}>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value}</div>
    </div>
  );
}

function StatusLine(props: { label: string; value: string; danger?: boolean }) {
  const { label, value, danger } = props;

  return (
    <div style={statusLine}>
      <span style={statusLineLabel}>{label}</span>
      <strong style={{ color: danger ? "#B91C1C" : "#111827" }}>{value}</strong>
    </div>
  );
}

const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const heroStat: CSSProperties = {
  background: "#fff",
  borderRadius: 20,
  padding: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const heroStatDanger: CSSProperties = {
  background: "linear-gradient(135deg,#7F1D1D 0%, #991B1B 55%, #B91C1C 100%)",
  borderRadius: 20,
  padding: 14,
  color: "#fff",
  boxShadow: "0 14px 28px rgba(127,29,29,0.18)",
};

const heroLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const heroValue: CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 950,
  color: "#111827",
};

const heroLabelLight: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(255,255,255,0.80)",
};

const heroValueLight: CSSProperties = {
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

const statusPill: CSSProperties = {
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

const actionDualGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const primaryBtn: CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(228,79,42,0.18)",
};

const secondaryBtn: CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const dangerBtn: CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#B91C1C,#EF4444)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const statusLine: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.06)",
};

const statusLineLabel: CSSProperties = {
  color: "#64748B",
  fontWeight: 800,
};

const blockReasonBox: CSSProperties = {
  marginTop: 12,
  borderRadius: 16,
  padding: 12,
  background: "rgba(185,28,28,0.06)",
  border: "1px solid rgba(185,28,28,0.12)",
  color: "#7F1D1D",
  lineHeight: 1.5,
};

const adjustHint: CSSProperties = {
  marginTop: 10,
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.5,
};

const lastOrderGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
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