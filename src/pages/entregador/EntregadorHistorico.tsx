import EntregadorLayout from "../../layouts/EntregadorLayout";
import PageHeader from "../../components/PageHeader";
import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { usePedidoStore } from "../../store/usePedidoStore";
import { useEntregadorStore } from "../../store/useEntregadorStore";
import { money, safeText, statusLabel, getTime } from "../../utils/delivererHelpers";

type HistoryFilter = "todos" | "entregues" | "cancelados";

function formatDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
    ...rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(",")),
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

function badgeStyle(status: string): CSSProperties {
  if (status === "entregue") {
    return {
      background: "rgba(22,163,74,0.10)",
      color: "#166534",
      border: "1px solid rgba(22,163,74,0.16)",
    };
  }

  if (status === "cancelado") {
    return {
      background: "rgba(185,28,28,0.08)",
      color: "#7F1D1D",
      border: "1px solid rgba(185,28,28,0.14)",
    };
  }

  return {
    background: "#F1F5F9",
    color: "#111827",
    border: "1px solid rgba(15,23,42,0.06)",
  };
}

export default function EntregadorHistorico() {
  const navigate = useNavigate();

  const pedidos = usePedidoStore((s) => s.pedidos);
  const entregadorId = useEntregadorStore((s) => s.entregadorId);

  const today = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return formatDateInput(d);
  }, []);
  const defaultEnd = useMemo(() => formatDateInput(today), [today]);

  const [filtro, setFiltro] = useState<HistoryFilter>("todos");
  const [busca, setBusca] = useState("");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const allHistory = useMemo(() => {
    const base = Array.isArray(pedidos) ? pedidos : [];

    return [...base]
      .filter(
        (p: any) =>
          String(p?.entregadorId || "") === entregadorId &&
          (p?.status === "entregue" || p?.status === "cancelado")
      )
      .sort((a: any, b: any) => getTime(b) - getTime(a));
  }, [pedidos, entregadorId]);

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const startMs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : 0;
    const endMs = endDate ? new Date(`${endDate}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;

    return allHistory.filter((p: any) => {
      const ts = new Date(p?.updatedAt ?? p?.createdAt ?? 0).getTime();

      if (Number.isFinite(startMs) && ts < startMs) return false;
      if (Number.isFinite(endMs) && ts > endMs) return false;

      if (filtro === "entregues" && p?.status !== "entregue") return false;
      if (filtro === "cancelados" && p?.status !== "cancelado") return false;

      if (!q) return true;

      const haystack = [
        p?.id,
        p?.clienteNome,
        p?.clienteTelefone,
        p?.status,
        p?.motivoCancelamento,
        p?.observacaoCancelamento,
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
  }, [allHistory, filtro, busca, startDate, endDate]);

  const summary = useMemo(() => {
    const entregues = rows.filter((p: any) => p?.status === "entregue");
    const cancelados = rows.filter((p: any) => p?.status === "cancelado");

    return {
      total: rows.length,
      entregues: entregues.length,
      cancelados: cancelados.length,
      ganhoBruto: entregues.length * 7,
    };
  }, [rows]);

  function exportCsv() {
    exportRowsToCsv(
      `historico_entregador_${entregadorId}.csv`,
      rows.map((p: any) => ({
        pedido_id: String(p?.id ?? ""),
        status: String(p?.status ?? ""),
        cliente_nome: String(p?.clienteNome ?? ""),
        cliente_telefone: String(p?.clienteTelefone ?? ""),
        total_pedido: Number(p?.total ?? 0),
        taxa_entrega: Number(p?.taxaEntrega ?? 0),
        data: String(p?.updatedAt ?? p?.createdAt ?? ""),
        bairro: String(
          p?.enderecoSnapshot?.bairro ?? p?.enderecoSnapshot?.neighborhood ?? ""
        ),
        cidade: String(
          p?.enderecoSnapshot?.cidade ?? p?.enderecoSnapshot?.city ?? ""
        ),
        motivo_cancelamento: String(p?.motivoCancelamento ?? ""),
        observacao_cancelamento: String(p?.observacaoCancelamento ?? ""),
      }))
    );
  }

  return (
    <EntregadorLayout>
      <div style={{ display: "grid", gap: 14 }}>
        <PageHeader
          title="Histórico"
          subtitle="Entregas concluídas, cancelamentos e exportação"
        />

        <div style={heroCard}>
          <div style={heroTop}>
            <div>
              <div style={heroMini}>Período analisado</div>
              <div style={heroTitle}>{summary.total} registro(s)</div>
              <div style={heroSub}>Consulta padrão dos últimos 60 dias</div>
            </div>

            <button onClick={exportCsv} type="button" style={heroAction}>
              Exportar CSV
            </button>
          </div>

          <div style={statsGrid}>
            <div style={statCardDark}>
              <div style={statLabel}>Entregues</div>
              <div style={statValue}>{summary.entregues}</div>
            </div>

            <div style={statCardDark}>
              <div style={statLabel}>Cancelados</div>
              <div style={statValue}>{summary.cancelados}</div>
            </div>

            <div style={statCardDark}>
              <div style={statLabel}>Ganho bruto</div>
              <div style={statValueMoney}>{money(summary.ganhoBruto)}</div>
            </div>

            <div style={statCardDark}>
              <div style={statLabel}>Filtro ativo</div>
              <div style={statValueSmall}>
                {filtro === "todos"
                  ? "Todos"
                  : filtro === "entregues"
                  ? "Entregues"
                  : "Cancelados"}
              </div>
            </div>
          </div>
        </div>

        <div style={toolbarCard}>
          <div style={chipRow}>
            <button
              onClick={() => setFiltro("todos")}
              type="button"
              style={{
                ...chipBtn,
                ...(filtro === "todos" ? chipBtnActive : null),
              }}
            >
              Todos
            </button>

            <button
              onClick={() => setFiltro("entregues")}
              type="button"
              style={{
                ...chipBtn,
                ...(filtro === "entregues" ? chipBtnActive : null),
              }}
            >
              Entregues
            </button>

            <button
              onClick={() => setFiltro("cancelados")}
              type="button"
              style={{
                ...chipBtn,
                ...(filtro === "cancelados" ? chipBtnActive : null),
              }}
            >
              Cancelados
            </button>
          </div>

          <div style={toolbarGrid}>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por pedido, cliente, bairro..."
              style={searchInput}
            />

            <div style={dateGrid}>
              <label style={fieldWrap}>
                <span style={fieldLabel}>De</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={fieldInput}
                />
              </label>

              <label style={fieldWrap}>
                <span style={fieldLabel}>Até</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={fieldInput}
                />
              </label>
            </div>
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Registros</div>
            <span style={countPill}>{rows.length}</span>
          </div>

          {rows.length === 0 ? (
            <div style={emptyCard}>
              <div style={emptyTitle}>Nenhum registro encontrado</div>
              <div style={emptyText}>
                Ajuste o período ou o filtro para localizar entregas e cancelamentos.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {rows.map((p: any) => {
                const bairro =
                  safeText(
                    p?.enderecoSnapshot?.bairro ?? p?.enderecoSnapshot?.neighborhood
                  ) ||
                  safeText(
                    p?.enderecoSnapshot?.cidade ?? p?.enderecoSnapshot?.city
                  ) ||
                  "Sem região";

                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/entregador/pedido/${p.id}`)}
                    type="button"
                    style={historyCardBtn}
                  >
                    <div style={{ minWidth: 0, textAlign: "left" }}>
                      <div style={cardTop}>
                        <div style={cardTitle}>Pedido nº {String(p.id).slice(0, 6)}</div>

                        <span
                          style={{
                            ...statusBadge,
                            ...badgeStyle(String(p?.status ?? "")),
                          }}
                        >
                          {statusLabel(p.status)}
                        </span>
                      </div>

                      <div style={cardMeta}>
                        {safeText(p?.clienteNome) || "Cliente"} • {bairro}
                      </div>

                      <div style={cardDate}>
                        {new Date(p.updatedAt ?? p.createdAt).toLocaleString("pt-BR")}
                      </div>

                      {p?.status === "cancelado" ? (
                        <div style={cancelBox}>
                          <strong>Motivo:</strong>{" "}
                          {safeText(p?.motivoCancelamento) || "Sem motivo informado"}
                          {safeText(p?.observacaoCancelamento) ? (
                            <div style={{ marginTop: 6 }}>
                              <strong>Obs:</strong> {safeText(p.observacaoCancelamento)}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div style={sideValueWrap}>
                      <div style={sideValue}>{money(Number(p?.total ?? 0))}</div>
                      <div style={sideHint}>Abrir</div>
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
  background: "linear-gradient(135deg,#0F172A 0%, #111827 55%, #1F2937 100%)",
  borderRadius: 24,
  padding: 16,
  color: "#fff",
  boxShadow: "0 18px 44px rgba(0,0,0,0.20)",
};

const heroTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const heroMini: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.82,
  textTransform: "uppercase",
};

const heroTitle: CSSProperties = {
  marginTop: 6,
  fontSize: 26,
  fontWeight: 950,
};

const heroSub: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  opacity: 0.82,
};

const heroAction: CSSProperties = {
  height: 44,
  minWidth: 150,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.10)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const statsGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const statCardDark: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 18,
  padding: 12,
};

const statLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.82,
};

const statValue: CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  fontWeight: 950,
};

const statValueMoney: CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 950,
};

const statValueSmall: CSSProperties = {
  marginTop: 6,
  fontSize: 16,
  fontWeight: 950,
};

const toolbarCard: CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: 16,
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

const toolbarGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 12,
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

const dateGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const fieldWrap: CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
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

const emptyCard: CSSProperties = {
  marginTop: 12,
  borderRadius: 18,
  padding: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const emptyTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const emptyText: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.5,
};

const historyCardBtn: CSSProperties = {
  width: "100%",
  textAlign: "left",
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(15,23,42,0.06)",
  background: "#F8FAFC",
  cursor: "pointer",
};

const cardTop: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const cardTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const cardMeta: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#64748B",
};

const cardDate: CSSProperties = {
  marginTop: 6,
  fontSize: 12.5,
  color: "#94A3B8",
};

const statusBadge: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
};

const cancelBox: CSSProperties = {
  marginTop: 10,
  borderRadius: 14,
  padding: 10,
  background: "rgba(185,28,28,0.06)",
  color: "#7F1D1D",
  fontSize: 12.5,
  lineHeight: 1.5,
  border: "1px solid rgba(185,28,28,0.12)",
};

const sideValueWrap: CSSProperties = {
  textAlign: "right",
  whiteSpace: "nowrap",
};

const sideValue: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const sideHint: CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  fontWeight: 900,
  color: "#E44F2A",
};