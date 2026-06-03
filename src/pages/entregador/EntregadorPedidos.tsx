import EntregadorLayout from "../../layouts/EntregadorLayout";
import PageHeader from "../../components/PageHeader";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate } from "react-router-dom";
import { usePedidoStore } from "../../store/usePedidoStore";
import { appLogger } from "../../services/appLogger";
import { pedidoService } from "../../services/pedidoService";
import { money, safeText, statusLabel, statusPill, getTime } from "../../utils/delivererHelpers";
import { useEffectiveEntregadorId } from "../../hooks/useEffectiveEntregadorId";

type ActiveFilter = "todos" | "preparando" | "emrota";

export default function EntregadorPedidos() {
  const navigate = useNavigate();

  const pedidos = usePedidoStore((s) => s.pedidos);
  const loadingRemote = usePedidoStore((s) => s.loadingRemote);
  const remoteReady = usePedidoStore((s) => s.remoteReady);
  const refetchPedidos = usePedidoStore((s) => s.refetchPedidos);
  const entregadorId = useEffectiveEntregadorId();

  const [filtro, setFiltro] = useState<ActiveFilter>("todos");
  const [busca, setBusca] = useState("");

  const refreshPedidos = useCallback(async () => {
    try {
      await refetchPedidos();
    } catch (error) {
      appLogger.error("deliverer_pedidos", "refresh_pedidos_failed", error);
    }
  }, [refetchPedidos]);

  useEffect(() => {
    void refreshPedidos();
    const stopRealtime = pedidoService.subscribePedidosRealtime(() => {
      void refreshPedidos();
    });
    const timer = window.setInterval(() => {
      void refreshPedidos();
    }, 8000);

    return () => {
      stopRealtime();
      window.clearInterval(timer);
    };
  }, [refreshPedidos]);

  const allActive = useMemo(() => {
    const base = Array.isArray(pedidos) ? pedidos : [];

    return [...base]
      .filter((p: any) => {
        const status = String(p?.status ?? "");
        return (
          String(p?.entregadorId || "") === String(entregadorId || "") &&
          status !== "entregue" &&
          status !== "cancelado"
        );
      })
      .sort((a: any, b: any) => {
        const aRoute = String(a?.status ?? "") === "saiu_para_entrega" ? 1 : 0;
        const bRoute = String(b?.status ?? "") === "saiu_para_entrega" ? 1 : 0;
        if (aRoute !== bRoute) return bRoute - aRoute;

        return getTime(b) - getTime(a);
      });
  }, [pedidos, entregadorId]);

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return allActive.filter((p: any) => {
      const status = String(p?.status ?? "");

      if (filtro === "preparando" && status !== "preparando") return false;
      if (filtro === "emrota" && status !== "saiu_para_entrega") return false;

      if (!q) return true;

      const haystack = [
        p?.id,
        p?.clienteNome,
        p?.clienteTelefone,
        p?.status,
        p?.observacao,
        p?.enderecoSnapshot?.bairro,
        p?.enderecoSnapshot?.neighborhood,
        p?.enderecoSnapshot?.cidade,
        p?.enderecoSnapshot?.city,
        ...(Array.isArray(p?.itens) ? p.itens.map((item: any) => item?.nome) : []),
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [allActive, filtro, busca]);

  const summary = useMemo(() => {
    const emRota = rows.filter((p: any) => String(p?.status ?? "") === "saiu_para_entrega");
    const preparando = rows.filter((p: any) => String(p?.status ?? "") === "preparando");
    const criados = rows.filter((p: any) => {
      const status = String(p?.status ?? "");
      return status === "criado" || status === "confirmado" || status === "buscando_entregador";
    });

    return {
      total: rows.length,
      emRota: emRota.length,
      preparando: preparando.length,
      pendentes: criados.length,
      totalBruto: rows.reduce((acc: number, p: any) => acc + Number(p?.total ?? 0), 0),
    };
  }, [rows]);

  return (
    <EntregadorLayout>
      <div style={{ display: "grid", gap: 14 }}>
        <PageHeader
          title="Pedidos ativos"
          subtitle="Pedidos atribuídos a você e em andamento"
        />
        <div style={syncLine}>
          Atualização: {remoteReady ? "ao vivo" : "reconectando"}
          {loadingRemote ? " • atualizando..." : ""}
        </div>

        <div style={heroCard}>
          <div style={heroTop}>
            <div>
              <div style={heroMini}>Operação atual</div>
              <div style={heroTitle}>{summary.total} pedido(s)</div>
              <div style={heroSub}>Acompanhe o que ainda precisa ser entregue</div>
            </div>

            <div style={heroSideInfo}>
              <div style={heroSideLabel}>Valor bruto em aberto</div>
              <div style={heroSideValue}>{money(summary.totalBruto)}</div>
            </div>
          </div>

          <div style={statsGrid}>
            <div style={statCardDark}>
              <div style={statLabel}>Em rota</div>
              <div style={statValue}>{summary.emRota}</div>
            </div>

            <div style={statCardDark}>
              <div style={statLabel}>Preparando</div>
              <div style={statValue}>{summary.preparando}</div>
            </div>

            <div style={statCardDark}>
              <div style={statLabel}>Aguardando saída</div>
              <div style={statValue}>{summary.pendentes}</div>
            </div>

            <div style={statCardDark}>
              <div style={statLabel}>Filtro ativo</div>
              <div style={statValueSmall}>
                {filtro === "todos" ? "Todos" : filtro === "emrota" ? "Em rota" : "Preparando"}
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
              onClick={() => setFiltro("emrota")}
              type="button"
              style={{
                ...chipBtn,
                ...(filtro === "emrota" ? chipBtnActive : null),
              }}
            >
              Em rota
            </button>

            <button
              onClick={() => setFiltro("preparando")}
              type="button"
              style={{
                ...chipBtn,
                ...(filtro === "preparando" ? chipBtnActive : null),
              }}
            >
              Preparando
            </button>
          </div>

          <div style={toolbarGrid}>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por pedido, cliente, bairro..."
              style={searchInput}
            />
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Pedidos atribuídos</div>
            <span style={countPill}>{rows.length}</span>
          </div>

          {rows.length === 0 ? (
            <div style={emptyCard}>
              <div style={emptyTitle}>Nenhum pedido ativo no momento</div>
              <div style={emptyText}>
                Quando houver novos pedidos atribuídos a você, eles aparecerão aqui.
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

                const itemCount = Array.isArray(p?.itens)
                  ? p.itens.reduce((acc: number, item: any) => acc + Number(item?.quantidade ?? 0), 0)
                  : 0;

                const pill = statusPill(p?.status);

                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/entregador/pedido/${p.id}`)}
                    type="button"
                    style={historyCardBtn}
                  >
                    <div style={{ minWidth: 0, textAlign: "left" }}>
                      <div style={cardTop}>
                        <div style={cardTitle}>Pedido # {String(p.id).slice(0, 6)}</div>

                        <span
                          style={{
                            ...statusBadge,
                            background: pill.bg,
                            color: pill.fg,
                            border: `1px solid ${pill.bd}`,
                          }}
                        >
                          {statusLabel(p.status)}
                        </span>
                      </div>

                      <div style={cardMeta}>
                        {safeText(p?.clienteNome) || "Cliente"} • {bairro}
                      </div>

                      <div style={cardDate}>
                        Atualizado em {new Date(p.updatedAt ?? p.createdAt).toLocaleString("pt-BR")}
                      </div>

                      <div style={activeInfoRow}>
                        <span>{itemCount || Number(p?.itens?.length ?? 0)} item(ns)</span>
                        <span>•</span>
                        <span>{money(Number(p?.taxaEntrega ?? 0))} taxa</span>
                      </div>
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

const heroSideInfo: CSSProperties = {
  minWidth: 150,
  borderRadius: 18,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
};

const heroSideLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.82,
};

const heroSideValue: CSSProperties = {
  marginTop: 6,
  fontSize: 20,
  fontWeight: 950,
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

const sectionCard: CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const sectionHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const sectionTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  color: "#111827",
};

const countPill: CSSProperties = {
  minWidth: 34,
  height: 30,
  borderRadius: 999,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(228,79,42,0.10)",
  color: "#E44F2A",
  fontWeight: 950,
};

const emptyCard: CSSProperties = {
  marginTop: 12,
  borderRadius: 20,
  padding: 18,
  background: "#F8FAFC",
  border: "1px dashed rgba(15,23,42,0.12)",
};

const emptyTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const emptyText: CSSProperties = {
  marginTop: 6,
  color: "#64748B",
  lineHeight: 1.55,
};

const historyCardBtn: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  borderRadius: 20,
  padding: 14,
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 12,
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(0,0,0,0.04)",
};

const cardTop: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
};

const cardTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const statusBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 30,
  borderRadius: 999,
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 950,
};

const cardMeta: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#334155",
  fontWeight: 800,
};

const cardDate: CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
};

const activeInfoRow: CSSProperties = {
  marginTop: 10,
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  color: "#475569",
  fontSize: 12,
  fontWeight: 900,
};

const sideValueWrap: CSSProperties = {
  minWidth: 88,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 8,
};

const sideValue: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const sideHint: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#E44F2A",
};

const syncLine: CSSProperties = {
  marginTop: -4,
  fontSize: 12,
  fontWeight: 800,
  color: "#64748B",
};

