import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { usePedidoStore } from "../../store/usePedidoStore";
import { pedidoService } from "../../services/pedidoService";
import { money, safeText, statusLabel, getTime } from "../../utils/delivererHelpers";
import type { StatusPedido } from "../../types";

type PedidoFiltro =
  | "todos"
  | "criado"
  | "confirmado"
  | "buscando_entregador"
  | "preparando"
  | "saiu_para_entrega"
  | "entregue"
  | "cancelado";

function badgeByStatus(status: string): CSSProperties {
  switch (status) {
    case "criado":
      return {
        background: "rgba(100,116,139,0.10)",
        color: "#475569",
        border: "1px solid rgba(100,116,139,0.18)",
      };
    case "confirmado":
      return {
        background: "rgba(37,99,235,0.10)",
        color: "#1D4ED8",
        border: "1px solid rgba(37,99,235,0.18)",
      };
    case "buscando_entregador":
      return {
        background: "rgba(146,64,14,0.10)",
        color: "#92400E",
        border: "1px solid rgba(146,64,14,0.18)",
      };
    case "preparando":
      return {
        background: "rgba(234,88,12,0.10)",
        color: "#C2410C",
        border: "1px solid rgba(234,88,12,0.18)",
      };
    case "saiu_para_entrega":
      return {
        background: "rgba(124,58,237,0.10)",
        color: "#7C3AED",
        border: "1px solid rgba(124,58,237,0.18)",
      };
    case "entregue":
      return {
        background: "rgba(22,163,74,0.10)",
        color: "#15803D",
        border: "1px solid rgba(22,163,74,0.18)",
      };
    case "cancelado":
      return {
        background: "rgba(185,28,28,0.10)",
        color: "#B91C1C",
        border: "1px solid rgba(185,28,28,0.18)",
      };
    default:
      return {
        background: "#F1F5F9",
        color: "#111827",
        border: "1px solid rgba(15,23,42,0.08)",
      };
  }
}

function nextStatusOptions(current: string): StatusPedido[] {
  switch (current) {
    case "criado":
      return ["confirmado", "buscando_entregador", "preparando", "cancelado"];
    case "confirmado":
      return ["buscando_entregador", "preparando", "cancelado"];
    case "buscando_entregador":
      return ["preparando", "cancelado"];
    case "preparando":
      return ["saiu_para_entrega", "cancelado"];
    case "saiu_para_entrega":
      return ["entregue", "cancelado"];
    default:
      return [];
  }
}

function dedupePedidos(list: any[]) {
  const map = new Map<string, any>();

  for (const pedido of list) {
    const id = String(pedido?.id ?? "").trim();
    if (!id) continue;

    const existing = map.get(id);
    if (!existing) {
      map.set(id, pedido);
      continue;
    }

    const existingTime = getTime(existing);
    const incomingTime = getTime(pedido);
    map.set(id, incomingTime >= existingTime ? pedido : existing);
  }

  return Array.from(map.values());
}

export default function AdminPedidos() {
  const pedidos = usePedidoStore((s) => s.pedidos);
  const replacePedidos = usePedidoStore((s) => s.replacePedidos);
  const atualizarStatus = usePedidoStore((s) => s.atualizarStatus);
  const atribuirEntregador = usePedidoStore((s) => s.atribuirEntregador);
  const cancelarPedido = usePedidoStore((s) => s.cancelarPedido);

  const [filtro, setFiltro] = useState<PedidoFiltro>("todos");
  const [busca, setBusca] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [delivererDraft, setDelivererDraft] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelObs, setCancelObs] = useState("");
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);

  const refreshPedidos = useCallback(async () => {
    try {
      setLoadingRemote(true);
      const data = await pedidoService.listarPedidosRemotos();
      if (Array.isArray(data)) {
        replacePedidos(dedupePedidos(data));
        setRemoteReady(true);
      }
    } catch (error) {
      console.error("AdminPedidos refreshPedidos error:", error);
    } finally {
      setLoadingRemote(false);
    }
  }, [replacePedidos]);

  useEffect(() => {
    void refreshPedidos();

    const timer = window.setInterval(() => {
      void refreshPedidos();
    }, 2500);

    return () => window.clearInterval(timer);
  }, [refreshPedidos]);

  const ordered = useMemo(() => {
    const list = Array.isArray(pedidos) ? dedupePedidos([...pedidos]) : [];
    return list.sort((a: any, b: any) => getTime(b) - getTime(a));
  }, [pedidos]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return ordered.filter((p: any) => {
      if (filtro !== "todos" && p?.status !== filtro) return false;

      if (!q) return true;

      const haystack = [
        p?.id,
        p?.clienteNome,
        p?.clienteTelefone,
        p?.entregadorId,
        p?.status,
        p?.enderecoSnapshot?.bairro,
        p?.enderecoSnapshot?.neighborhood,
        p?.enderecoSnapshot?.cidade,
        p?.enderecoSnapshot?.city,
        p?.motivoCancelamento,
        p?.observacaoCancelamento,
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [ordered, filtro, busca]);

  const selected = useMemo(() => {
    return (
      filtered.find((p: any) => String(p?.id ?? "") === selectedId) ??
      filtered[0] ??
      null
    );
  }, [filtered, selectedId]);

  const summary = useMemo(() => {
    return {
      total: ordered.length,
      andamento: ordered.filter(
        (p: any) => p?.status !== "entregue" && p?.status !== "cancelado"
      ).length,
      entregues: ordered.filter((p: any) => p?.status === "entregue").length,
      cancelados: ordered.filter((p: any) => p?.status === "cancelado").length,
    };
  }, [ordered]);

  function selectPedido(id: string) {
    setSelectedId(id);
    setDelivererDraft("");
    setCancelReason("");
    setCancelObs("");
  }

  async function onAssignDeliverer() {
    if (!selected?.id) return;

    const id = delivererDraft.trim();
    if (!id) {
      alert("Informe o ID do entregador.");
      return;
    }

    atribuirEntregador(selected.id, id);
    setDelivererDraft("");
    await refreshPedidos();
    alert("Entregador atribuído/reatribuído ✅");
  }

  async function onStatusChange(next: StatusPedido) {
    if (!selected?.id) return;
    atualizarStatus(selected.id, next);
    await refreshPedidos();
    alert(`Status alterado para ${statusLabel(next)} ✅`);
  }

  async function onCancelByAdmin() {
    if (!selected?.id) return;

    if (!cancelReason.trim()) {
      alert("Informe o motivo do cancelamento.");
      return;
    }

    cancelarPedido({
      pedidoId: selected.id,
      canceladoPor: "adm",
      motivoCancelamento: cancelReason.trim(),
      observacaoCancelamento: cancelObs.trim() || null,
      lat: null,
      lng: null,
    });

    setCancelReason("");
    setCancelObs("");
    await refreshPedidos();
    alert("Pedido cancelado pelo ADM ✅");
  }

  return (
    <AdminLayout
      title="ADM Pedidos"
      subtitle="Controle central da operação, status e reatribuição"
    >
      <div style={syncLine}>
        Fonte atual: {remoteReady ? "Supabase" : "Aguardando sync"}
        {loadingRemote ? " • sincronizando..." : ""}
      </div>

      <div style={heroGrid}>
        <div style={heroStat}>
          <div style={heroLabel}>Pedidos totais</div>
          <div style={heroValue}>{summary.total}</div>
        </div>

        <div style={heroStat}>
          <div style={heroLabel}>Em andamento</div>
          <div style={heroValue}>{summary.andamento}</div>
        </div>

        <div style={heroStat}>
          <div style={heroLabel}>Entregues</div>
          <div style={heroValue}>{summary.entregues}</div>
        </div>

        <div style={heroStatDanger}>
          <div style={heroLabelLight}>Cancelados</div>
          <div style={heroValueLight}>{summary.cancelados}</div>
        </div>
      </div>

      <div style={toolbarCard}>
        <div style={chipRow}>
          {[
            "todos",
            "criado",
            "confirmado",
            "buscando_entregador",
            "preparando",
            "saiu_para_entrega",
            "entregue",
            "cancelado",
          ].map((item) => (
            <button
              key={item}
              onClick={() => setFiltro(item as PedidoFiltro)}
              type="button"
              style={{
                ...chipBtn,
                ...(filtro === item ? chipBtnActive : null),
              }}
            >
              {item === "todos" ? "Todos" : statusLabel(item)}
            </button>
          ))}
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={searchInput}
          placeholder="Buscar por pedido, cliente, telefone, entregador ou bairro..."
        />
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Fila operacional</div>
            <span style={countPill}>{filtered.length}</span>
          </div>

          {filtered.length === 0 ? (
            <div style={emptyText}>Nenhum pedido encontrado para esse filtro.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {filtered.map((p: any) => {
                const active = String(selected?.id ?? "") === String(p?.id ?? "");
                const bairro =
                  safeText(p?.enderecoSnapshot?.bairro ?? p?.enderecoSnapshot?.neighborhood) ||
                  safeText(p?.enderecoSnapshot?.cidade ?? p?.enderecoSnapshot?.city) ||
                  "Sem região";

                return (
                  <button
                    key={p.id}
                    onClick={() => selectPedido(String(p.id))}
                    type="button"
                    style={{
                      ...pedidoRowBtn,
                      border: active
                        ? "2px solid rgba(228,79,42,0.24)"
                        : "1px solid rgba(15,23,42,0.06)",
                      boxShadow: active
                        ? "0 12px 26px rgba(228,79,42,0.08)"
                        : "none",
                    }}
                  >
                    <div style={{ minWidth: 0, textAlign: "left" }}>
                      <div style={pedidoTop}>
                        <div style={pedidoTitle}>
                          Pedido #{String(p.id).slice(0, 6)}
                        </div>
                        <span
                          style={{
                            ...statusBadge,
                            ...badgeByStatus(String(p?.status ?? "")),
                          }}
                        >
                          {statusLabel(p.status)}
                        </span>
                      </div>

                      <div style={pedidoMeta}>
                        {safeText(p?.clienteNome) || "Cliente"} • {bairro}
                      </div>

                      <div style={pedidoMetaSecondary}>
                        Entregador: {safeText(p?.entregadorId) || "Não atribuído"}
                      </div>
                    </div>

                    <div style={pedidoPrice}>
                      {money(Number(p?.total ?? 0))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Detalhes operacionais</div>
            {selected ? (
              <span style={countPill}>#{String(selected.id).slice(0, 6)}</span>
            ) : null}
          </div>

          {!selected ? (
            <div style={emptyText}>Selecione um pedido na fila para operar.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
              <div style={detailsGrid}>
                <DetailBox
                  label="Cliente"
                  value={safeText(selected.clienteNome) || "Cliente"}
                />
                <DetailBox
                  label="Telefone"
                  value={safeText(selected.clienteTelefone) || "Não informado"}
                />
                <DetailBox
                  label="Status"
                  value={statusLabel(selected.status)}
                />
                <DetailBox
                  label="Entregador"
                  value={safeText(selected.entregadorId) || "Não atribuído"}
                />
                <DetailBox
                  label="Total"
                  value={money(Number(selected.total ?? 0))}
                />
                <DetailBox
                  label="Endereço"
                  value={
                    [
                      safeText(
                        (selected as any)?.enderecoSnapshot?.street ??
                          (selected as any)?.enderecoSnapshot?.rua
                      ),
                      safeText(
                        (selected as any)?.enderecoSnapshot?.number ??
                          (selected as any)?.enderecoSnapshot?.numero
                      ),
                      safeText(
                        (selected as any)?.enderecoSnapshot?.bairro ??
                          (selected as any)?.enderecoSnapshot?.neighborhood
                      ),
                      safeText(
                        (selected as any)?.enderecoSnapshot?.cidade ??
                          (selected as any)?.enderecoSnapshot?.city
                      ),
                    ]
                      .filter(Boolean)
                      .join(", ") || "Não informado"
                  }
                />
              </div>

              <div style={subCard}>
                <div style={subTitle}>Ações rápidas do ADM</div>

                <div style={actionsGrid}>
                  {nextStatusOptions(String(selected.status)).map((next) => (
                    <button
                      key={next}
                      onClick={() => onStatusChange(next)}
                      type="button"
                      style={actionBtn}
                    >
                      Alterar para {statusLabel(next)}
                    </button>
                  ))}
                </div>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Reatribuir entregador</div>

                <div style={formGrid}>
                  <input
                    value={delivererDraft}
                    onChange={(e) => setDelivererDraft(e.target.value)}
                    style={fieldInput}
                    placeholder="Ex.: d_123456"
                  />

                  <button onClick={onAssignDeliverer} type="button" style={primaryBtn}>
                    Salvar entregador
                  </button>
                </div>
              </div>

              <div style={subCardDanger}>
                <div style={subTitle}>Cancelar pelo ADM</div>

                <div style={formGrid}>
                  <input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    style={fieldInput}
                    placeholder="Motivo do cancelamento"
                  />

                  <textarea
                    value={cancelObs}
                    onChange={(e) => setCancelObs(e.target.value)}
                    style={fieldTextArea}
                    placeholder="Observação adicional"
                  />

                  <button onClick={onCancelByAdmin} type="button" style={dangerBtn}>
                    Cancelar pedido
                  </button>
                </div>
              </div>

              {Array.isArray(selected.itens) && selected.itens.length > 0 ? (
                <div style={subCard}>
                  <div style={subTitle}>Itens do pedido</div>

                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    {selected.itens.map((item: any) => (
                      <div key={item.produtoId} style={itemRow}>
                        <div style={{ fontWeight: 900, color: "#111827" }}>
                          {item.quantidade}x {item.nome}
                        </div>
                        <div style={{ fontWeight: 950, color: "#111827" }}>
                          {money(
                            Number(item.precoUnitario ?? 0) *
                              Number(item.quantidade ?? 0)
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {safeText((selected as any).motivoCancelamento) ? (
                <div style={subCardDanger}>
                  <div style={subTitle}>Cancelamento registrado</div>
                  <div style={cancelText}>
                    <strong>Motivo:</strong>{" "}
                    {safeText((selected as any).motivoCancelamento)}
                  </div>
                  {safeText((selected as any).observacaoCancelamento) ? (
                    <div style={cancelText}>
                      <strong>Obs:</strong>{" "}
                      {safeText((selected as any).observacaoCancelamento)}
                    </div>
                  ) : null}
                </div>
              ) : null}
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

const syncLine: CSSProperties = {
  marginBottom: 14,
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

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

const searchInput: CSSProperties = {
  marginTop: 12,
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

const contentGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "0.95fr 1.05fr",
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

const pedidoRowBtn: CSSProperties = {
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

const pedidoTop: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const pedidoTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const statusBadge: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
};

const pedidoMeta: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#64748B",
};

const pedidoMetaSecondary: CSSProperties = {
  marginTop: 6,
  fontSize: 12.5,
  color: "#94A3B8",
};

const pedidoPrice: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
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

const actionsGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 10,
};

const actionBtn: CSSProperties = {
  height: 44,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  color: "#111827",
  fontWeight: 950,
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

const itemRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  borderRadius: 16,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.06)",
  alignItems: "center",
};

const cancelText: CSSProperties = {
  marginTop: 8,
  color: "#7F1D1D",
  lineHeight: 1.5,
  fontSize: 13,
};