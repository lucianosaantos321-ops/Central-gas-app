import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../layouts/AdminLayout";
import { usePedidoStore } from "../../store/usePedidoStore";
import { clientAdminService } from "../../services/clientAdminService";
import { money, safeText, statusLabel } from "../../utils/delivererHelpers";

type ClientFilter =
  | "todos"
  | "ativos"
  | "suspeitos"
  | "bloqueados"
  | "atencao"
  | "canceladores"
  | "recorrentes"
  | "vip"
  | "churn"
  | "ausentes";

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhoneBR(raw: string) {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function buildClientKey(input: { nome?: string | null; telefone?: string | null }) {
  const phone = onlyDigits(String(input.telefone || ""));
  if (phone) return `phone:${phone}`;

  const nome = safeText(input.nome || "").toLowerCase();
  if (nome) return `name:${nome}`;

  return "unknown:sem-identificacao";
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

function daysSince(dateStr: string | null | undefined) {
  if (!dateStr) return 9999;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return 9999;
  return Math.floor((Date.now() - t) / 86_400_000);
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

function riskLevel(row: {
  cancelamentosSuspeitos: number;
  cancelados: number;
  ausenciaCount: number;
  adminStatus: "normal" | "atencao" | "bloqueado";
}) {
  let score = 0;
  score += row.cancelamentosSuspeitos * 3;
  score += row.cancelados * 1.5;
  score += row.ausenciaCount * 2;

  if (row.adminStatus === "atencao") score += 3;
  if (row.adminStatus === "bloqueado") score += 8;

  if (score >= 8) return "Alto";
  if (score >= 4) return "Médio";
  return "Baixo";
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

function normalizeReason(text: string) {
  return safeText(text).toLowerCase();
}

export default function AdminClientes() {
  const pedidos = usePedidoStore((s) => s.pedidos);

  const [refreshKey, setRefreshKey] = useState(0);
  const [filtro, setFiltro] = useState<ClientFilter>("todos");
  const [busca, setBusca] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const clientRows = useMemo(() => {
    const all = Array.isArray(pedidos) ? pedidos : [];
    const map = new Map<
      string,
      {
        clientKey: string;
        nome: string;
        telefone: string;
        pedidos: any[];
        totalPedidos: number;
        ativos: number;
        entregues: number;
        cancelados: number;
        cancelamentosSuspeitos: number;
        totalGasto: number;
        ultimoPedidoAt: string | null;
        primeiroPedidoAt: string | null;
        ultimoStatus: string;
        ultimoEndereco: string;
        ausenciaCount: number;
        comprouDeOutroCount: number;
        semContatoCount: number;
        ticketMedio: number;
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
        pedidos: [],
        totalPedidos: 0,
        ativos: 0,
        entregues: 0,
        cancelados: 0,
        cancelamentosSuspeitos: 0,
        totalGasto: 0,
        ultimoPedidoAt: null,
        primeiroPedidoAt: null,
        ultimoStatus: "",
        ultimoEndereco: "",
        ausenciaCount: 0,
        comprouDeOutroCount: 0,
        semContatoCount: 0,
        ticketMedio: 0,
      };

      current.pedidos.push(pedido);
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

      if (reason.includes("comprou de outro") || reason.includes("concorrente")) {
        current.comprouDeOutroCount += 1;
      }

      if (
        reason.includes("sem contato") ||
        reason.includes("não atendeu") ||
        reason.includes("nao atendeu")
      ) {
        current.semContatoCount += 1;
      }

      const updatedAt = String(pedido?.updatedAt || pedido?.createdAt || "");
      const createdAt = String(pedido?.createdAt || pedido?.updatedAt || "");

      if (!current.ultimoPedidoAt || new Date(updatedAt).getTime() > new Date(current.ultimoPedidoAt).getTime()) {
        current.ultimoPedidoAt = updatedAt;
        current.ultimoStatus = safeText(pedido?.status) || "";
        current.ultimoEndereco =
          [
            safeText(pedido?.enderecoSnapshot?.bairro ?? pedido?.enderecoSnapshot?.neighborhood),
            safeText(pedido?.enderecoSnapshot?.cidade ?? pedido?.enderecoSnapshot?.city),
          ]
            .filter(Boolean)
            .join(" / ") || "Não informado";
      }

      if (!current.primeiroPedidoAt || new Date(createdAt).getTime() < new Date(current.primeiroPedidoAt).getTime()) {
        current.primeiroPedidoAt = createdAt;
      }

      map.set(clientKey, current);
    });

    return Array.from(map.values())
      .map((row) => {
        const admin = clientAdminService.get(row.clientKey);
        const diasDesdeUltimoPedido = daysSince(row.ultimoPedidoAt);
        const tier = clientTier(row);
        const risco = riskLevel({
          cancelamentosSuspeitos: row.cancelamentosSuspeitos,
          cancelados: row.cancelados,
          ausenciaCount: row.ausenciaCount,
          adminStatus: admin.status,
        });
        const churn = churnRisk({
          totalPedidos: row.totalPedidos,
          diasDesdeUltimoPedido,
          ativos: row.ativos,
        });

        return {
          ...row,
          ticketMedio: row.totalPedidos > 0 ? row.totalGasto / row.totalPedidos : 0,
          diasDesdeUltimoPedido,
          tier,
          risco,
          churn,
          adminStatus: admin.status,
          adminNotes: admin.notes,
          adminUpdatedAt: admin.updatedAt,
        };
      })
      .sort((a, b) => {
        const tA = new Date(a.ultimoPedidoAt || 0).getTime();
        const tB = new Date(b.ultimoPedidoAt || 0).getTime();
        return tB - tA;
      });
  }, [pedidos, refreshKey]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return clientRows.filter((row) => {
      if (filtro === "ativos" && row.ativos <= 0) return false;
      if (filtro === "suspeitos" && row.cancelamentosSuspeitos <= 0) return false;
      if (filtro === "bloqueados" && row.adminStatus !== "bloqueado") return false;
      if (filtro === "atencao" && row.adminStatus !== "atencao") return false;
      if (filtro === "canceladores" && row.cancelados <= 0) return false;
      if (filtro === "recorrentes" && row.totalPedidos < 3) return false;
      if (filtro === "vip" && row.tier !== "VIP") return false;
      if (filtro === "churn" && row.churn !== "Alto") return false;
      if (filtro === "ausentes" && row.ausenciaCount <= 0) return false;

      if (!q) return true;

      const haystack = [
        row.nome,
        row.telefone,
        row.clientKey,
        row.ultimoEndereco,
        row.adminNotes,
        row.tier,
        row.risco,
        row.churn,
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [clientRows, filtro, busca]);

  const selected = useMemo(() => {
    return filtered.find((row) => row.clientKey === selectedKey) ?? filtered[0] ?? null;
  }, [filtered, selectedKey]);

  const summary = useMemo(() => {
    return {
      total: clientRows.length,
      bloqueados: clientRows.filter((x) => x.adminStatus === "bloqueado").length,
      atencao: clientRows.filter((x) => x.adminStatus === "atencao").length,
      suspeitos: clientRows.filter((x) => x.cancelamentosSuspeitos > 0).length,
      ativos: clientRows.filter((x) => x.ativos > 0).length,
      gastoTotal: clientRows.reduce((acc, row) => acc + Number(row.totalGasto || 0), 0),
      vip: clientRows.filter((x) => x.tier === "VIP").length,
      recorrentes: clientRows.filter((x) => x.totalPedidos >= 3).length,
      churn: clientRows.filter((x) => x.churn === "Alto").length,
      ausentes: clientRows.filter((x) => x.ausenciaCount > 0).length,
    };
  }, [clientRows]);

  const rankingTopClientes = useMemo(() => {
    return [...clientRows]
      .sort((a, b) => Number(b.totalGasto || 0) - Number(a.totalGasto || 0))
      .slice(0, 5);
  }, [clientRows]);

  const rankingRecorrencia = useMemo(() => {
    return [...clientRows]
      .sort((a, b) => Number(b.totalPedidos || 0) - Number(a.totalPedidos || 0))
      .slice(0, 5);
  }, [clientRows]);

  function refresh() {
    setRefreshKey((v) => v + 1);
  }

  function selectClient(clientKey: string) {
    setSelectedKey(clientKey);
    const item = clientRows.find((row) => row.clientKey === clientKey);
    setNotesInput(item?.adminNotes || "");
  }

  function setClientStatus(status: "normal" | "atencao" | "bloqueado") {
    if (!selected?.clientKey) return;
    clientAdminService.setStatus(selected.clientKey, status);
    alert("Status do cliente atualizado ✅");
    refresh();
  }

  function saveNotes() {
    if (!selected?.clientKey) return;
    clientAdminService.setNotes(selected.clientKey, notesInput);
    alert("Observação interna salva ✅");
    refresh();
  }

  function exportCsv() {
    exportRowsToCsv(
      "admin_clientes_premium.csv",
      filtered.map((row) => ({
        client_key: row.clientKey,
        nome: row.nome,
        telefone: row.telefone,
        total_pedidos: row.totalPedidos,
        ativos: row.ativos,
        entregues: row.entregues,
        cancelados: row.cancelados,
        cancelamentos_suspeitos: row.cancelamentosSuspeitos,
        ausencia_count: row.ausenciaCount,
        comprou_de_outro_count: row.comprouDeOutroCount,
        sem_contato_count: row.semContatoCount,
        total_gasto: row.totalGasto,
        ticket_medio: row.ticketMedio,
        tier: row.tier,
        risco: row.risco,
        churn: row.churn,
        dias_desde_ultimo_pedido: row.diasDesdeUltimoPedido,
        status_manual: row.adminStatus,
        observacao_interna: row.adminNotes ?? "",
        ultimo_status: row.ultimoStatus,
        ultimo_endereco: row.ultimoEndereco,
      }))
    );
  }

  return (
    <AdminLayout
      title="ADM Clientes Premium"
      subtitle="Leitura comercial, recorrência, risco, churn e controle interno do relacionamento com o cliente"
    >
      <div style={heroGrid}>
        <MetricCard label="Clientes" value={String(summary.total)} />
        <MetricCard label="Com pedido ativo" value={String(summary.ativos)} />
        <MetricCard label="Recorrentes" value={String(summary.recorrentes)} />
        <MetricCardDanger label="Bloqueados" value={String(summary.bloqueados)} />
      </div>

      <div style={heroGrid}>
        <MetricCard label="VIP" value={String(summary.vip)} />
        <MetricCard label="Churn alto" value={String(summary.churn)} />
        <MetricCard label="Ausentes" value={String(summary.ausentes)} />
        <MetricCard label="Gasto total" value={money(summary.gastoTotal)} />
      </div>

      <div style={premiumGrid}>
        <div style={spotlightCard}>
          <div style={spotlightLabel}>Melhores clientes por gasto</div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {rankingTopClientes.length === 0 ? (
              <div style={emptyText}>Ainda não há clientes suficientes para ranking.</div>
            ) : (
              rankingTopClientes.map((row, index) => (
                <div key={row.clientKey} style={premiumRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={premiumTitle}>
                      #{index + 1} • {row.nome}
                    </div>
                    <div style={premiumMeta}>
                      {row.totalPedidos} pedido(s) • ticket {money(row.ticketMedio)}
                    </div>
                  </div>

                  <div style={premiumValue}>{money(row.totalGasto)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={spotlightCardDark}>
          <div style={spotlightLabelDark}>Maior recorrência</div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {rankingRecorrencia.length === 0 ? (
              <div style={emptyTextOnDark}>Ainda não há recorrência suficiente.</div>
            ) : (
              rankingRecorrencia.map((row, index) => (
                <div key={row.clientKey} style={premiumRowDark}>
                  <div style={{ minWidth: 0 }}>
                    <div style={premiumTitleDark}>
                      #{index + 1} • {row.nome}
                    </div>
                    <div style={premiumMetaDark}>
                      Último pedido há {row.diasDesdeUltimoPedido} dia(s)
                    </div>
                  </div>

                  <div style={premiumValueDark}>{row.totalPedidos}x</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={toolbarCard}>
        <div style={chipRow}>
          <button onClick={() => setFiltro("todos")} type="button" style={{ ...chipBtn, ...(filtro === "todos" ? chipBtnActive : null) }}>
            Todos
          </button>
          <button onClick={() => setFiltro("ativos")} type="button" style={{ ...chipBtn, ...(filtro === "ativos" ? chipBtnActive : null) }}>
            Ativos
          </button>
          <button onClick={() => setFiltro("suspeitos")} type="button" style={{ ...chipBtn, ...(filtro === "suspeitos" ? chipBtnActive : null) }}>
            Suspeitos
          </button>
          <button onClick={() => setFiltro("vip")} type="button" style={{ ...chipBtn, ...(filtro === "vip" ? chipBtnActive : null) }}>
            VIP
          </button>
          <button onClick={() => setFiltro("recorrentes")} type="button" style={{ ...chipBtn, ...(filtro === "recorrentes" ? chipBtnActive : null) }}>
            Recorrentes
          </button>
          <button onClick={() => setFiltro("churn")} type="button" style={{ ...chipBtn, ...(filtro === "churn" ? chipBtnActive : null) }}>
            Churn alto
          </button>
          <button onClick={() => setFiltro("ausentes")} type="button" style={{ ...chipBtn, ...(filtro === "ausentes" ? chipBtnActive : null) }}>
            Ausentes
          </button>
          <button onClick={() => setFiltro("atencao")} type="button" style={{ ...chipBtn, ...(filtro === "atencao" ? chipBtnActive : null) }}>
            Atenção
          </button>
          <button onClick={() => setFiltro("bloqueados")} type="button" style={{ ...chipBtn, ...(filtro === "bloqueados" ? chipBtnActive : null) }}>
            Bloqueados
          </button>
        </div>

        <div style={toolbarBottom}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={searchInput}
            placeholder="Buscar por nome, telefone, chave, risco, churn ou endereço..."
          />

          <button onClick={exportCsv} type="button" style={exportBtn}>
            Exportar CSV
          </button>
        </div>
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Base de clientes</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Link to="/admin/clientes/campanhas" style={campaignLinkBtn}>
                Campanhas
              </Link>
              <span style={countPill}>{filtered.length}</span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={emptyText}>Nenhum cliente encontrado nesse filtro.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {filtered.map((row) => (
                <button
                  key={row.clientKey}
                  onClick={() => selectClient(row.clientKey)}
                  type="button"
                  style={{
                    ...rowBtn,
                    border:
                      selected?.clientKey === row.clientKey
                        ? "2px solid rgba(228,79,42,0.24)"
                        : "1px solid rgba(15,23,42,0.06)",
                    boxShadow:
                      selected?.clientKey === row.clientKey
                        ? "0 12px 26px rgba(228,79,42,0.08)"
                        : "none",
                  }}
                >
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={rowTitle}>{row.nome}</div>
                    <div style={rowMeta}>
                      {row.telefone ? formatPhoneBR(row.telefone) : "Sem telefone"} • {row.totalPedidos} pedido(s)
                    </div>
                    <div style={rowMetaSecondary}>
                      {row.tier} • risco {row.risco} • churn {row.churn}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={rowStrong}>{money(row.totalGasto)}</div>
                    <div
                      style={{
                        ...statusMini,
                        color:
                          row.adminStatus === "bloqueado"
                            ? "#B91C1C"
                            : row.adminStatus === "atencao"
                            ? "#C2410C"
                            : "#166534",
                      }}
                    >
                      {row.adminStatus === "bloqueado"
                        ? "Bloqueado"
                        : row.adminStatus === "atencao"
                        ? "Atenção"
                        : "Normal"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Ficha premium do cliente</div>
            {selected ? <span style={countPill}>{selected.totalPedidos}</span> : null}
          </div>

          {!selected ? (
            <div style={emptyText}>Selecione um cliente.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
              <div style={detailsGrid}>
                <DetailBox label="Cliente" value={selected.nome} />
                <DetailBox label="Telefone" value={selected.telefone ? formatPhoneBR(selected.telefone) : "Não informado"} />
                <DetailBox label="Tier" value={selected.tier} />
                <DetailBox label="Risco" value={selected.risco} />
                <DetailBox label="Churn" value={selected.churn} />
                <DetailBox label="Dias sem pedir" value={String(selected.diasDesdeUltimoPedido)} />
                <DetailBox label="Pedidos" value={String(selected.totalPedidos)} />
                <DetailBox label="Total gasto" value={money(selected.totalGasto)} />
                <DetailBox label="Ticket médio" value={money(selected.ticketMedio)} />
                <DetailBox label="Entregues" value={String(selected.entregues)} />
                <DetailBox label="Cancelados" value={String(selected.cancelados)} />
                <DetailBox label="Suspeitos" value={String(selected.cancelamentosSuspeitos)} />
              </div>

              <div style={miniInsightGrid}>
                <InsightMini
                  title="Ausências"
                  value={String(selected.ausenciaCount)}
                  danger={selected.ausenciaCount > 0}
                />
                <InsightMini
                  title="Comprou de outro"
                  value={String(selected.comprouDeOutroCount)}
                  danger={selected.comprouDeOutroCount > 0}
                />
                <InsightMini
                  title="Sem contato"
                  value={String(selected.semContatoCount)}
                  danger={selected.semContatoCount > 0}
                />
              </div>

              <div style={subCard}>
                <div style={subTitle}>Status manual do cliente</div>
                <div style={subHint}>
                  Controle interno do ADM para relacionamento, prevenção de abuso e ação comercial.
                </div>

                <div style={statusActionGrid}>
                  <button onClick={() => setClientStatus("normal")} type="button" style={normalBtn}>
                    Marcar normal
                  </button>
                  <button onClick={() => setClientStatus("atencao")} type="button" style={warnBtn}>
                    Marcar atenção
                  </button>
                  <button onClick={() => setClientStatus("bloqueado")} type="button" style={dangerBtn}>
                    Bloquear cliente
                  </button>
                </div>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Observação interna</div>

                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  style={fieldTextArea}
                  placeholder="Ex.: cliente VIP, ligar antes, risco de ausência, candidato a campanha, acompanhamento manual..."
                />

                <button onClick={saveNotes} type="button" style={primaryBtn}>
                  Salvar observação
                </button>
              </div>

              <div style={subCardDark}>
                <div style={subTitleDark}>Leitura estratégica</div>
                <div style={strategyText}>
                  {selected.tier === "VIP"
                    ? "Cliente forte. Bom candidato para prioridade comercial, retenção e benefício futuro."
                    : selected.churn === "Alto"
                    ? "Cliente com risco alto de sumir. Ideal para campanha de retorno futura."
                    : selected.risco === "Alto"
                    ? "Cliente com risco operacional elevado. Exigir mais cautela e monitoramento."
                    : "Cliente em base estável. Pode seguir fluxo normal de operação."}
                </div>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Últimos pedidos do cliente</div>

                {selected.pedidos.length === 0 ? (
                  <div style={emptyTextSmall}>Sem pedidos registrados.</div>
                ) : (
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {selected.pedidos.slice(0, 8).map((pedido: any) => (
                      <div key={pedido.id} style={orderRow}>
                        <div style={{ minWidth: 0 }}>
                          <div style={orderTitle}>
                            Pedido #{String(pedido.id).slice(0, 6)}
                          </div>
                          <div style={orderMeta}>
                            {statusLabel(pedido.status)} • {new Date(pedido.updatedAt ?? pedido.createdAt).toLocaleString("pt-BR")}
                          </div>
                          <div style={orderMeta}>
                            {safeText(
                              pedido?.enderecoSnapshot?.bairro ??
                                pedido?.enderecoSnapshot?.neighborhood
                            ) || "Sem bairro"}{" "}
                            /{" "}
                            {safeText(
                              pedido?.enderecoSnapshot?.cidade ??
                                pedido?.enderecoSnapshot?.city
                            ) || "Sem cidade"}
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={orderValue}>{money(Number(pedido.total || 0))}</div>
                          {pedido.cancelamentoSuspeito ? (
                            <div style={riskTag}>Suspeito</div>
                          ) : null}
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

function InsightMini(props: { title: string; value: string; danger?: boolean }) {
  const { title, value, danger } = props;
  return (
    <div
      style={{
        ...insightMiniCard,
        background: danger ? "rgba(185,28,28,0.05)" : "#F8FAFC",
        border: danger
          ? "1px solid rgba(185,28,28,0.12)"
          : "1px solid rgba(15,23,42,0.06)",
      }}
    >
      <div style={insightMiniLabel}>{title}</div>
      <div style={{ ...insightMiniValue, color: danger ? "#B91C1C" : "#111827" }}>
        {value}
      </div>
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

const premiumGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const spotlightCard: CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const spotlightCardDark: CSSProperties = {
  background: "linear-gradient(135deg,#111827 0%, #1F2937 60%, #374151 100%)",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.06)",
  boxShadow: "0 20px 40px rgba(15,23,42,0.16)",
  color: "#fff",
};

const spotlightLabel: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const spotlightLabelDark: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#fff",
};

const premiumRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const premiumRowDark: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const premiumTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const premiumMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
};

const premiumValue: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
  whiteSpace: "nowrap",
};

const premiumTitleDark: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#fff",
};

const premiumMetaDark: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "rgba(255,255,255,0.72)",
};

const premiumValueDark: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#fff",
  whiteSpace: "nowrap",
};

const toolbarCard: CSSProperties = {
  marginTop: 14,
  background: "rgba(255,255,255,0.94)",
  borderRadius: 24,
  padding: 14,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
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

const emptyTextOnDark: CSSProperties = {
  marginTop: 12,
  color: "rgba(255,255,255,0.72)",
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

const miniInsightGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 10,
};

const insightMiniCard: CSSProperties = {
  borderRadius: 16,
  padding: 12,
};

const insightMiniLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const insightMiniValue: CSSProperties = {
  marginTop: 8,
  fontSize: 18,
  fontWeight: 950,
};

const subCard: CSSProperties = {
  borderRadius: 20,
  padding: 14,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const subCardDark: CSSProperties = {
  borderRadius: 20,
  padding: 14,
  background: "linear-gradient(135deg,#111827 0%, #1F2937 65%, #374151 100%)",
  border: "1px solid rgba(255,255,255,0.06)",
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

const subTitleDark: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#fff",
};

const strategyText: CSSProperties = {
  marginTop: 10,
  color: "rgba(255,255,255,0.84)",
  fontSize: 13.5,
  lineHeight: 1.6,
  fontWeight: 800,
};

const statusActionGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 10,
};

const normalBtn: CSSProperties = {
  height: 44,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#16A34A,#22C55E)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const warnBtn: CSSProperties = {
  height: 44,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#F59E0B,#FB923C)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const dangerBtn: CSSProperties = {
  height: 44,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#B91C1C,#EF4444)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const primaryBtn: CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#111827,#374151)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const fieldTextArea: CSSProperties = {
  marginTop: 12,
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

const orderRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  padding: 12,
  borderRadius: 16,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.06)",
};

const orderTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const orderMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
  lineHeight: 1.5,
};

const orderValue: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const riskTag: CSSProperties = {
  marginTop: 6,
  display: "inline-flex",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(185,28,28,0.10)",
  color: "#B91C1C",
  border: "1px solid rgba(185,28,28,0.14)",
  fontWeight: 900,
  fontSize: 12,
};

const campaignLinkBtn: CSSProperties = {
  textDecoration: "none",
  height: 36,
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