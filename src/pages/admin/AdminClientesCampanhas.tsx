import { useMemo, useState, type CSSProperties } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { usePedidoStore } from "../../store/usePedidoStore";
import {
  clientCampaignService,
  type ClientCampaignSegment,
} from "../../services/clientCampaignService";
import { clientAdminService } from "../../services/clientAdminService";
import { money, safeText } from "../../utils/delivererHelpers";

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function buildClientKey(input: { nome?: string | null; telefone?: string | null }) {
  const phone = onlyDigits(String(input.telefone || ""));
  if (phone) return `phone:${phone}`;

  const nome = safeText(input.nome || "").toLowerCase();
  if (nome) return `name:${nome}`;

  return "unknown:sem-identificacao";
}

function daysSince(dateStr: string | null | undefined) {
  if (!dateStr) return 9999;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return 9999;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function normalizeReason(text: string) {
  return safeText(text).toLowerCase();
}

function getSegmentLabel(segmento: ClientCampaignSegment) {
  switch (segmento) {
    case "vip":
      return "VIP";
    case "recorrentes":
      return "Recorrentes";
    case "churn":
      return "Churn alto";
    case "ausentes":
      return "Ausentes";
    case "atencao":
      return "Em atenção";
    default:
      return segmento;
  }
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

function clientTier(row: {
  totalPedidos: number;
  totalGasto: number;
  cancelados: number;
}) {
  if (row.totalPedidos >= 5 || row.totalGasto >= 500) return "VIP";
  if (row.totalPedidos >= 3 || row.totalGasto >= 250) return "Recorrente";
  if (row.cancelados >= 2) return "Atenção";
  return "Base";
}

function churnRisk(row: {
  totalPedidos: number;
  diasDesdeUltimoPedido: number;
  ativos: number;
}) {
  if (row.ativos > 0) return "Baixo";
  if (row.totalPedidos >= 3 && row.diasDesdeUltimoPedido >= 30) return "Alto";
  if (row.totalPedidos >= 2 && row.diasDesdeUltimoPedido >= 21) return "Médio";
  if (row.totalPedidos === 1 && row.diasDesdeUltimoPedido >= 14) return "Médio";
  return "Baixo";
}

export default function AdminClientesCampanhas() {
  const pedidos = usePedidoStore((s) => s.pedidos);

  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [form, setForm] = useState({
    nome: "",
    segmento: "vip" as ClientCampaignSegment,
    tituloInterno: "",
    mensagemBase: "",
    ativo: true,
  });

  const campaigns = useMemo(() => clientCampaignService.getAll(), [refreshKey]);

  const clientRows = useMemo(() => {
    const all = Array.isArray(pedidos) ? pedidos : [];
    const map = new Map<
      string,
      {
        clientKey: string;
        nome: string;
        telefone: string;
        totalPedidos: number;
        ativos: number;
        entregues: number;
        cancelados: number;
        cancelamentosSuspeitos: number;
        totalGasto: number;
        ultimoPedidoAt: string | null;
        ausenciaCount: number;
      }
    >();

    all.forEach((pedido: any) => {
      const clientKey = buildClientKey({
        nome: pedido?.clienteNome,
        telefone: pedido?.clienteTelefone,
      });

      const current = map.get(clientKey) || {
        clientKey,
        nome: safeText(pedido?.clienteNome) || "Cliente",
        telefone: safeText(pedido?.clienteTelefone) || "",
        totalPedidos: 0,
        ativos: 0,
        entregues: 0,
        cancelados: 0,
        cancelamentosSuspeitos: 0,
        totalGasto: 0,
        ultimoPedidoAt: null,
        ausenciaCount: 0,
      };

      current.totalPedidos += 1;
      current.totalGasto += Number(pedido?.total || 0);

      if (pedido?.status === "entregue") current.entregues += 1;
      else if (pedido?.status === "cancelado") current.cancelados += 1;
      else current.ativos += 1;

      if (pedido?.cancelamentoSuspeito) current.cancelamentosSuspeitos += 1;

      const reason = normalizeReason(
        `${pedido?.motivoCancelamento || ""} ${pedido?.observacaoCancelamento || ""}`
      );

      if (
        reason.includes("cliente ausente") ||
        reason.includes("ausente") ||
        reason.includes("não estava") ||
        reason.includes("nao estava")
      ) {
        current.ausenciaCount += 1;
      }

      const updatedAt = String(pedido?.updatedAt || pedido?.createdAt || "");
      if (!current.ultimoPedidoAt || new Date(updatedAt).getTime() > new Date(current.ultimoPedidoAt).getTime()) {
        current.ultimoPedidoAt = updatedAt;
      }

      map.set(clientKey, current);
    });

    return Array.from(map.values()).map((row) => {
      const admin = clientAdminService.get(row.clientKey);
      const diasDesdeUltimoPedido = daysSince(row.ultimoPedidoAt);
      const tier = clientTier(row);
      const churn = churnRisk({
        totalPedidos: row.totalPedidos,
        diasDesdeUltimoPedido,
        ativos: row.ativos,
      });

      return {
        ...row,
        diasDesdeUltimoPedido,
        tier,
        churn,
        adminStatus: admin.status,
      };
    });
  }, [pedidos, refreshKey]);

  const selectedCampaign = useMemo(
    () => campaigns.find((item) => item.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const eligibleClients = useMemo(() => {
    const segment = selectedCampaign?.segmento ?? form.segmento;

    return clientRows.filter((row) => {
      if (segment === "vip") return row.tier === "VIP";
      if (segment === "recorrentes") return row.totalPedidos >= 3;
      if (segment === "churn") return row.churn === "Alto";
      if (segment === "ausentes") return row.ausenciaCount > 0;
      if (segment === "atencao") return row.adminStatus === "atencao";
      return false;
    });
  }, [clientRows, selectedCampaign, form.segmento]);

  const summary = useMemo(() => {
    return {
      totalCampanhas: campaigns.length,
      ativas: campaigns.filter((x) => x.ativo).length,
      vip: clientRows.filter((x) => x.tier === "VIP").length,
      recorrentes: clientRows.filter((x) => x.totalPedidos >= 3).length,
      churn: clientRows.filter((x) => x.churn === "Alto").length,
      ausentes: clientRows.filter((x) => x.ausenciaCount > 0).length,
      atencao: clientRows.filter((x) => x.adminStatus === "atencao").length,
    };
  }, [campaigns, clientRows]);

  function refresh() {
    setRefreshKey((v) => v + 1);
  }

  function resetForm() {
    setSelectedCampaignId("");
    setForm({
      nome: "",
      segmento: "vip",
      tituloInterno: "",
      mensagemBase: "",
      ativo: true,
    });
  }

  function loadCampaign(id: string) {
    const item = campaigns.find((x) => x.id === id);
    if (!item) return;

    setSelectedCampaignId(item.id);
    setForm({
      nome: item.nome,
      segmento: item.segmento,
      tituloInterno: item.tituloInterno,
      mensagemBase: item.mensagemBase,
      ativo: item.ativo,
    });
  }

  function saveCampaign() {
    if (!form.nome.trim()) {
      alert("Informe o nome da campanha.");
      return;
    }

    if (!form.tituloInterno.trim()) {
      alert("Informe o título interno.");
      return;
    }

    if (!form.mensagemBase.trim()) {
      alert("Informe a mensagem base.");
      return;
    }

    if (selectedCampaign) {
      clientCampaignService.update(selectedCampaign.id, {
        nome: form.nome.trim(),
        segmento: form.segmento,
        tituloInterno: form.tituloInterno.trim(),
        mensagemBase: form.mensagemBase.trim(),
        ativo: form.ativo,
      });
      alert("Campanha atualizada ✅");
    } else {
      clientCampaignService.create({
        nome: form.nome.trim(),
        segmento: form.segmento,
        tituloInterno: form.tituloInterno.trim(),
        mensagemBase: form.mensagemBase.trim(),
        ativo: form.ativo,
      });
      alert("Campanha criada ✅");
    }

    resetForm();
    refresh();
  }

  function removeCampaign() {
    if (!selectedCampaign) return;

    const ok = confirm(`Remover a campanha "${selectedCampaign.nome}"?`);
    if (!ok) return;

    clientCampaignService.remove(selectedCampaign.id);
    alert("Campanha removida ✅");
    resetForm();
    refresh();
  }

  function toggleCampaign(id: string) {
    clientCampaignService.toggleActive(id);
    refresh();
  }

  function exportSegmentCsv() {
    const segment = selectedCampaign?.segmento ?? form.segmento;

    exportRowsToCsv(
      `clientes_segmento_${segment}.csv`,
      eligibleClients.map((row) => ({
        client_key: row.clientKey,
        nome: row.nome,
        telefone: row.telefone,
        total_pedidos: row.totalPedidos,
        total_gasto: row.totalGasto,
        tier: row.tier,
        churn: row.churn,
        dias_sem_pedir: row.diasDesdeUltimoPedido,
        admin_status: row.adminStatus,
        ausencia_count: row.ausenciaCount,
      }))
    );
  }

  const previewTitle = selectedCampaign?.tituloInterno || form.tituloInterno || "Sem título";
  const previewMessage =
    selectedCampaign?.mensagemBase || form.mensagemBase || "Sem mensagem definida";

  return (
    <AdminLayout
      title="Campanhas de clientes"
      subtitle="Segmentação comercial interna para VIP, recorrentes, churn, ausentes e clientes em atenção"
    >
      <div style={heroGrid}>
        <MetricCard label="Campanhas" value={String(summary.totalCampanhas)} />
        <MetricCard label="Ativas" value={String(summary.ativas)} />
        <MetricCard label="VIP" value={String(summary.vip)} />
        <MetricCard label="Recorrentes" value={String(summary.recorrentes)} />
      </div>

      <div style={heroGrid}>
        <MetricCard label="Churn alto" value={String(summary.churn)} />
        <MetricCard label="Ausentes" value={String(summary.ausentes)} />
        <MetricCardDanger label="Em atenção" value={String(summary.atencao)} />
        <MetricCard label="Elegíveis agora" value={String(eligibleClients.length)} />
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Campanhas cadastradas</div>
            <span style={countPill}>{campaigns.length}</span>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {campaigns.map((item) => (
              <div key={item.id} style={campaignRow}>
                <button onClick={() => loadCampaign(item.id)} type="button" style={campaignLoadBtn}>
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={campaignTitle}>{item.nome}</div>
                    <div style={campaignMeta}>
                      {getSegmentLabel(item.segmento)} • {item.ativo ? "Ativa" : "Inativa"}
                    </div>
                  </div>

                  <span
                    style={{
                      ...statusPill,
                      background: item.ativo
                        ? "rgba(22,163,74,0.10)"
                        : "rgba(100,116,139,0.10)",
                      color: item.ativo ? "#15803D" : "#475569",
                    }}
                  >
                    {item.ativo ? "Ativa" : "Inativa"}
                  </span>
                </button>

                <button onClick={() => toggleCampaign(item.id)} type="button" style={inlineActionBtn}>
                  {item.ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>
              {selectedCampaign ? "Editar campanha" : "Nova campanha"}
            </div>

            <button onClick={resetForm} type="button" style={ghostBtn}>
              Limpar
            </button>
          </div>

          <div style={formGrid}>
            <input
              value={form.nome}
              onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
              style={fieldInput}
              placeholder="Nome da campanha"
            />

            <select
              value={form.segmento}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  segmento: e.target.value as ClientCampaignSegment,
                }))
              }
              style={fieldInput}
            >
              <option value="vip">VIP</option>
              <option value="recorrentes">Recorrentes</option>
              <option value="churn">Churn alto</option>
              <option value="ausentes">Ausentes</option>
              <option value="atencao">Em atenção</option>
            </select>

            <input
              value={form.tituloInterno}
              onChange={(e) => setForm((p) => ({ ...p, tituloInterno: e.target.value }))}
              style={fieldInput}
              placeholder="Título interno"
            />

            <textarea
              value={form.mensagemBase}
              onChange={(e) => setForm((p) => ({ ...p, mensagemBase: e.target.value }))}
              style={fieldTextArea}
              placeholder="Mensagem base da campanha"
            />

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
              />
              <span>Campanha ativa</span>
            </label>

            <div style={actionGrid}>
              <button onClick={saveCampaign} type="button" style={primaryBtn}>
                {selectedCampaign ? "Salvar edição" : "Criar campanha"}
              </button>

              <button
                onClick={removeCampaign}
                type="button"
                style={dangerBtn}
                disabled={!selectedCampaign}
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Preview da campanha</div>
            <span style={countPill}>{eligibleClients.length}</span>
          </div>

          <div style={previewCard}>
            <div style={previewLabel}>Título interno</div>
            <div style={previewTitleText}>{previewTitle}</div>

            <div style={{ ...previewLabel, marginTop: 14 }}>Segmento</div>
            <div style={previewMeta}>
              {getSegmentLabel(selectedCampaign?.segmento ?? form.segmento)}
            </div>

            <div style={{ ...previewLabel, marginTop: 14 }}>Mensagem base</div>
            <div style={previewMessageText}>{previewMessage}</div>
          </div>

          <button onClick={exportSegmentCsv} type="button" style={exportBtnFull}>
            Exportar clientes do segmento
          </button>
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Clientes elegíveis</div>
            <span style={countPill}>{eligibleClients.length}</span>
          </div>

          {eligibleClients.length === 0 ? (
            <div style={emptyText}>Nenhum cliente elegível para esse segmento agora.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {eligibleClients.slice(0, 12).map((row) => (
                <div key={row.clientKey} style={eligibleRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={eligibleTitle}>{row.nome}</div>
                    <div style={eligibleMeta}>
                      {row.totalPedidos} pedido(s) • {money(row.totalGasto)}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={eligibleValue}>{row.tier}</div>
                    <div style={eligibleMeta}>Churn {row.churn}</div>
                  </div>
                </div>
              ))}
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

const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const metricCard: CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  borderRadius: 22,
  padding: 14,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const metricDangerCard: CSSProperties = {
  background: "linear-gradient(135deg,#7F1D1D 0%, #991B1B 55%, #B91C1C 100%)",
  borderRadius: 22,
  padding: 14,
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

const contentGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const sectionCard: CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
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

const campaignRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
  alignItems: "center",
  padding: 12,
  borderRadius: 18,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const campaignLoadBtn: CSSProperties = {
  width: "100%",
  textAlign: "left",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};

const campaignTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const campaignMeta: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#64748B",
};

const statusPill: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const inlineActionBtn: CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
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
  minHeight: 96,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  padding: 12,
  fontWeight: 700,
  color: "#111827",
  outline: "none",
  resize: "vertical",
};

const checkRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 900,
  color: "#111827",
};

const actionGrid: CSSProperties = {
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

const dangerBtn: CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#B91C1C,#EF4444)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const ghostBtn: CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const previewCard: CSSProperties = {
  marginTop: 12,
  borderRadius: 20,
  padding: 14,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const previewLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
};

const previewTitleText: CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 950,
  color: "#111827",
};

const previewMeta: CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  fontWeight: 900,
  color: "#111827",
};

const previewMessageText: CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  color: "#475569",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const exportBtnFull: CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const eligibleRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const eligibleTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const eligibleMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
};

const eligibleValue: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
  whiteSpace: "nowrap",
};

const emptyText: CSSProperties = {
  marginTop: 12,
  color: "#64748B",
  lineHeight: 1.5,
};