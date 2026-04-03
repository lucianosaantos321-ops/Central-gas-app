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
import { useEntregadorStore } from "../../store/useEntregadorStore";
import { financeService } from "../../services/financeService";
import { pedidoService } from "../../services/pedidoService";
import type { Pedido } from "../../types";
import {
  money,
  safeText,
  statusLabel,
  getTime,
} from "../../utils/delivererHelpers";

function isToday(value: any) {
  const t = typeof value === "number" ? value : Date.parse(value ?? "");
  if (!Number.isFinite(t)) return false;

  const d = new Date(t);
  const now = new Date();

  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function rankPedido(p: any, currentPedidoId: string) {
  const isFocus = String(p?.id ?? "") === currentPedidoId ? 10000 : 0;
  const routeBonus = p?.status === "saiu_para_entrega" ? 5000 : 0;
  const created = new Date(p?.createdAt ?? 0).getTime();
  const ageScore = Number.isFinite(created)
    ? Math.max(0, Date.now() - created) / 60000
    : 0;

  return isFocus + routeBonus + ageScore;
}

function ageLabel(p: any) {
  const created = new Date(p?.createdAt ?? 0).getTime();
  if (!Number.isFinite(created)) return "Agora";

  const mins = Math.max(1, Math.floor((Date.now() - created) / 60000));
  if (mins < 60) return `${mins} min`;

  const hrs = Math.floor(mins / 60);
  return `${hrs}h`;
}

function useWindowWidth() {
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return 1280;
    return window.innerWidth;
  });

  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth);
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}

function isOfertaElegivel(p: Pedido) {
  const status = String(p?.status ?? "");
  return !p?.entregadorId && status !== "entregue" && status !== "cancelado";
}

function isPedidoAtivoDoEntregador(p: Pedido, entregadorId: string) {
  const status = String(p?.status ?? "");
  return (
    String(p?.entregadorId || "") === String(entregadorId || "") &&
    status !== "entregue" &&
    status !== "cancelado"
  );
}

function normalizePedidosForHome(list: Pedido[]) {
  const map = new Map<string, Pedido>();

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

export default function EntregadorHome() {
  const navigate = useNavigate();
  const width = useWindowWidth();
  const isMobile = width <= 900;

  const pedidos = usePedidoStore((s) => s.pedidos);
  const replacePedidos = usePedidoStore((s) => s.replacePedidos);

  const entregadorId = useEntregadorStore((s) => s.entregadorId);
  const online = useEntregadorStore((s) => s.online);
  const setOnline = useEntregadorStore((s) => s.setOnline);
  const ensureEntregadorId = useEntregadorStore((s) => s.ensureEntregadorId);
  const currentPedidoId = useEntregadorStore((s) => s.currentPedidoId);
  const setCurrentPedidoId = useEntregadorStore((s) => s.setCurrentPedidoId);
  const setLastPedidosTab = useEntregadorStore((s) => s.setLastPedidosTab);

  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);

  useEffect(() => {
    ensureEntregadorId();
  }, [ensureEntregadorId]);

  const refreshPedidos = useCallback(async () => {
    try {
      setLoadingRemote(true);
      const data = await pedidoService.listarPedidosRemotos();

      if (Array.isArray(data)) {
        const normalized = normalizePedidosForHome(data);
        replacePedidos(normalized);
        setRemoteReady(true);
      }
    } catch (error) {
      console.error("EntregadorHome refreshPedidos error:", error);
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

  const derived = useMemo(() => {
    const base = Array.isArray(pedidos) ? normalizePedidosForHome(pedidos) : [];

    const sorted = [...base].sort((a, b) => {
      const aMine = isPedidoAtivoDoEntregador(a, entregadorId) ? 1 : 0;
      const bMine = isPedidoAtivoDoEntregador(b, entregadorId) ? 1 : 0;
      if (aMine !== bMine) return bMine - aMine;

      const aRoute = a?.status === "saiu_para_entrega" ? 1 : 0;
      const bRoute = b?.status === "saiu_para_entrega" ? 1 : 0;
      if (aRoute !== bRoute) return bRoute - aRoute;

      return getTime(b) - getTime(a);
    });

    const ofertas = sorted
      .filter((p) => isOfertaElegivel(p))
      .sort((a, b) => {
        const aCreated = new Date(a?.createdAt ?? 0).getTime();
        const bCreated = new Date(b?.createdAt ?? 0).getTime();
        return aCreated - bCreated;
      });

    const meusAtivos = sorted
      .filter((p) => isPedidoAtivoDoEntregador(p, entregadorId))
      .sort(
        (a, b) =>
          rankPedido(b, currentPedidoId) - rankPedido(a, currentPedidoId)
      );

    const historicoHoje = sorted.filter(
      (p) =>
        String(p?.entregadorId || "") === String(entregadorId || "") &&
        p?.status === "entregue" &&
        isToday(p?.updatedAt ?? p?.createdAt)
    );

    const pedidoEmRota =
      meusAtivos.find((p) => p?.status === "saiu_para_entrega") ?? null;

    const pedidoEmAndamento =
      pedidoEmRota ??
      meusAtivos.find(
        (p) => String(p?.id ?? "") === String(currentPedidoId || "")
      ) ??
      meusAtivos[0] ??
      null;

    const fila = meusAtivos.filter(
      (p) => String(p?.id ?? "") !== String(pedidoEmAndamento?.id ?? "")
    );

    const ofertaPrincipal = ofertas[0] ?? null;
    const finance = financeService.getDelivererState(entregadorId);

    return {
      ofertas,
      ofertaPrincipal,
      pedidoEmAndamento,
      fila,
      historicoHoje,
      ganhoHoje: historicoHoje.length * 7,
      finance,
    };
  }, [pedidos, entregadorId, currentPedidoId]);

  useEffect(() => {
    if (derived.pedidoEmAndamento?.id) {
      setCurrentPedidoId(String(derived.pedidoEmAndamento.id));
    }
  }, [derived.pedidoEmAndamento?.id, setCurrentPedidoId]);

  function toggleOnline() {
    setOnline(!online);
  }

  function forceOpenPedido(pedidoIdRaw: string, tab: "ofertas" | "andamento") {
    const pedidoId = String(pedidoIdRaw || "").trim();
    if (!pedidoId) return;

    const legacyPath = `/entregador/pedidos/${pedidoId}`;

    setCurrentPedidoId(pedidoId);
    setLastPedidosTab(tab);

    navigate(legacyPath);

    window.setTimeout(() => {
      if (window.location.pathname !== legacyPath) {
        window.history.pushState({}, "", legacyPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }, 80);
  }

  function openOferta(id: string) {
    forceOpenPedido(id, "ofertas");
  }

  function openPedidoAtual(id: string) {
    forceOpenPedido(id, "andamento");
  }

  function openFilaPedido(id: string) {
    forceOpenPedido(id, "andamento");
  }

  return (
    <EntregadorLayout>
      <div style={{ display: "grid", gap: 14 }}>
        <PageHeader
          title="Início"
          subtitle="Fila operacional do entregador"
        />

        <div style={syncLine}>
          Fonte atual: {remoteReady ? "Supabase" : "Aguardando sync"}
          {loadingRemote ? " • sincronizando..." : ""}
        </div>

        <div style={heroCard}>
          <div style={heroTop}>
            <div>
              <div style={heroMini}>Situação atual</div>
              <div style={heroTitle}>{online ? "Online ✅" : "Offline ⛔"}</div>
              <div style={heroSub}>ID: {entregadorId}</div>
            </div>

            <button onClick={toggleOnline} type="button" style={heroAction}>
              {online ? "Ficar offline" : "Ficar online"}
            </button>
          </div>

          <div style={statsGrid}>
            <div style={statCardDark}>
              <div style={statLabel}>Ofertas</div>
              <div style={statValue}>{derived.ofertas.length}</div>
            </div>

            <div style={statCardDark}>
              <div style={statLabel}>Fila ativa</div>
              <div style={statValue}>
                {derived.pedidoEmAndamento ? derived.fila.length + 1 : 0}
              </div>
            </div>

            <div style={statCardDark}>
              <div style={statLabel}>Entregues hoje</div>
              <div style={statValue}>{derived.historicoHoje.length}</div>
            </div>

            <div style={statCardDark}>
              <div style={statLabel}>Saldo pendente</div>
              <div style={statValueMoney}>
                {money(derived.finance.saldoDevedor)}
              </div>
            </div>
          </div>
        </div>

        {derived.finance.bloqueado ? (
          <div style={blockedBanner}>
            Seu saldo pendente está em{" "}
            <strong>{money(derived.finance.saldoDevedor)}</strong>. Você precisa
            regularizar o repasse para continuar aceitando pedidos.
          </div>
        ) : null}

        <div
          style={{
            ...opsGrid,
            gridTemplateColumns: isMobile ? "1fr" : "1.2fr 0.8fr",
          }}
        >
          <div style={mainColumn}>
            <div style={sectionCardStrong}>
              <div style={sectionHeader}>
                <div style={sectionTitle}>Pedido atual</div>
                {derived.pedidoEmAndamento ? (
                  <span style={tagLive}>
                    {derived.pedidoEmAndamento.status === "saiu_para_entrega"
                      ? "Em rota"
                      : "Em andamento"}
                  </span>
                ) : null}
              </div>

              {derived.pedidoEmAndamento ? (
                <>
                  <div
                    style={{
                      ...mainOrderTop,
                      flexDirection: isMobile ? "column" : "row",
                      alignItems: isMobile ? "stretch" : "flex-start",
                    }}
                  >
                    <div>
                      <div style={mainOrderTitle}>
                        Pedido nº{" "}
                        {String(derived.pedidoEmAndamento.id).slice(0, 6)}
                      </div>
                      <div style={mainOrderMeta}>
                        {safeText(derived.pedidoEmAndamento?.clienteNome) ||
                          "Cliente"}{" "}
                        • {statusLabel(derived.pedidoEmAndamento.status)}
                      </div>
                      <div style={mainOrderHint}>
                        {safeText(
                          (derived.pedidoEmAndamento as any)?.enderecoSnapshot
                            ?.neighborhood ??
                            (derived.pedidoEmAndamento as any)?.enderecoSnapshot
                              ?.bairro
                        ) ||
                          safeText(
                            (derived.pedidoEmAndamento as any)?.enderecoSnapshot
                              ?.city ??
                              (derived.pedidoEmAndamento as any)
                                ?.enderecoSnapshot?.cidade
                          ) ||
                          "Sem região"}
                      </div>
                    </div>

                    <div style={mainOrderPrice}>
                      {money(Number((derived.pedidoEmAndamento as any)?.total ?? 0))}
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      openPedidoAtual(String(derived.pedidoEmAndamento.id))
                    }
                    type="button"
                    style={primaryBtn}
                  >
                    Abrir pedido atual
                  </button>
                </>
              ) : (
                <>
                  <div style={emptyTitle}>Nenhum pedido em andamento</div>
                  <div style={emptyText}>
                    Assim que você assumir um pedido, ele aparece aqui como
                    prioridade principal.
                  </div>
                </>
              )}
            </div>

            <div style={sectionCard}>
              <div style={sectionHeader}>
                <div style={sectionTitle}>Fila de pedidos</div>
                <span style={tagNeutral}>{derived.fila.length}</span>
              </div>

              {derived.fila.length === 0 ? (
                <div style={emptyTextSmall}>
                  Sem outros pedidos na fila no momento.
                </div>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {derived.fila.slice(0, 6).map((pedido) => (
                    <button
                      key={pedido.id}
                      onClick={() => openFilaPedido(String(pedido.id))}
                      type="button"
                      style={{
                        ...queueCardBtn,
                        flexDirection: isMobile ? "column" : "row",
                        alignItems: isMobile ? "stretch" : "center",
                      }}
                    >
                      <div style={{ minWidth: 0, textAlign: "left" }}>
                        <div style={queueTitle}>
                          Pedido nº {String(pedido.id).slice(0, 6)}
                        </div>
                        <div style={queueMeta}>
                          {safeText((pedido as any)?.clienteNome) || "Cliente"} •{" "}
                          {statusLabel(pedido.status)}
                        </div>
                      </div>

                      <div style={queuePrice}>
                        {money(Number((pedido as any)?.total ?? 0))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={sideColumn}>
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <div style={sectionTitle}>Nova oferta</div>
                <span style={tagOrange}>{derived.ofertas.length}</span>
              </div>

              {derived.ofertaPrincipal ? (
                <>
                  <div style={offerTitle}>
                    Pedido nº {String(derived.ofertaPrincipal.id).slice(0, 6)}
                  </div>

                  <div style={offerMeta}>
                    {safeText((derived.ofertaPrincipal as any)?.clienteNome) ||
                      "Cliente"}
                  </div>

                  <div style={offerMeta}>
                    Esperando há {ageLabel(derived.ofertaPrincipal)}
                  </div>

                  <div style={offerMetaStrong}>
                    {money(Number((derived.ofertaPrincipal as any)?.total ?? 0))}
                  </div>

                  <button
                    onClick={() =>
                      openOferta(String(derived.ofertaPrincipal.id))
                    }
                    type="button"
                    style={ghostBtnOrange}
                  >
                    Abrir oferta
                  </button>
                </>
              ) : (
                <div style={emptyTextSmall}>Nenhuma oferta nova agora.</div>
              )}
            </div>

            <div style={sectionCard}>
              <div style={sectionHeader}>
                <div style={sectionTitle}>Resumo do dia</div>
              </div>

              <div style={summaryRow}>
                <span style={summaryLabel}>Entregas concluídas</span>
                <strong style={summaryValue}>
                  {derived.historicoHoje.length}
                </strong>
              </div>

              <div style={summaryRow}>
                <span style={summaryLabel}>Ganho do dia</span>
                <strong style={summaryValue}>
                  {money(derived.ganhoHoje)}
                </strong>
              </div>

              <div style={summaryRow}>
                <span style={summaryLabel}>Saldo pendente</span>
                <strong style={summaryValue}>
                  {money(derived.finance.saldoDevedor)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </EntregadorLayout>
  );
}

const syncLine: CSSProperties = {
  fontSize: "12px",
  fontWeight: 900,
  color: "#64748B",
};

const heroCard: CSSProperties = {
  background: "linear-gradient(135deg,#0F172A 0%, #111827 55%, #1F2937 100%)",
  borderRadius: "24px",
  padding: "16px",
  color: "#fff",
  boxShadow: "0 18px 44px rgba(0,0,0,0.20)",
};

const heroTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const heroMini: CSSProperties = {
  fontSize: "12px",
  fontWeight: 900,
  opacity: 0.82,
  textTransform: "uppercase",
};

const heroTitle: CSSProperties = {
  marginTop: "6px",
  fontSize: "26px",
  fontWeight: 950,
};

const heroSub: CSSProperties = {
  marginTop: "6px",
  fontSize: "13px",
  opacity: 0.82,
};

const heroAction: CSSProperties = {
  height: "44px",
  minWidth: "150px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.10)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const statsGrid: CSSProperties = {
  marginTop: "14px",
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
};

const statCardDark: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "18px",
  padding: "12px",
};

const statLabel: CSSProperties = {
  fontSize: "12px",
  fontWeight: 900,
  opacity: 0.82,
};

const statValue: CSSProperties = {
  marginTop: "6px",
  fontSize: "22px",
  fontWeight: 950,
};

const statValueMoney: CSSProperties = {
  marginTop: "6px",
  fontSize: "18px",
  fontWeight: 950,
};

const blockedBanner: CSSProperties = {
  background: "rgba(185,28,28,0.08)",
  border: "1px solid rgba(185,28,28,0.16)",
  borderRadius: "16px",
  padding: "12px",
  color: "#7F1D1D",
  fontWeight: 900,
  fontSize: "13px",
  lineHeight: 1.5,
};

const opsGrid: CSSProperties = {
  display: "grid",
  gap: "14px",
};

const mainColumn: CSSProperties = {
  display: "grid",
  gap: "14px",
};

const sideColumn: CSSProperties = {
  display: "grid",
  gap: "14px",
};

const sectionCardStrong: CSSProperties = {
  background: "#fff",
  borderRadius: "24px",
  padding: "16px",
  border: "2px solid rgba(228,79,42,0.14)",
  boxShadow: "0 14px 32px rgba(228,79,42,0.08)",
};

const sectionCard: CSSProperties = {
  background: "#fff",
  borderRadius: "24px",
  padding: "16px",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const sectionHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  alignItems: "center",
};

const sectionTitle: CSSProperties = {
  fontSize: "16px",
  fontWeight: 950,
  color: "#111827",
};

const tagLive: CSSProperties = {
  padding: "6px 10px",
  borderRadius: "999px",
  background: "rgba(22,163,74,0.10)",
  color: "#166534",
  fontWeight: 900,
  fontSize: "12px",
};

const tagNeutral: CSSProperties = {
  minWidth: "28px",
  height: "28px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "#F1F5F9",
  color: "#111827",
  fontWeight: 950,
  fontSize: "12px",
};

const tagOrange: CSSProperties = {
  minWidth: "28px",
  height: "28px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "rgba(228,79,42,0.10)",
  color: "#E44F2A",
  fontWeight: 950,
  fontSize: "12px",
};

const mainOrderTop: CSSProperties = {
  marginTop: "12px",
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
};

const mainOrderTitle: CSSProperties = {
  fontSize: "19px",
  fontWeight: 950,
  color: "#111827",
};

const mainOrderMeta: CSSProperties = {
  marginTop: "6px",
  fontSize: "13px",
  color: "#475569",
};

const mainOrderHint: CSSProperties = {
  marginTop: "6px",
  fontSize: "12.5px",
  color: "#64748B",
};

const mainOrderPrice: CSSProperties = {
  fontSize: "16px",
  fontWeight: 950,
  color: "#111827",
  whiteSpace: "nowrap",
};

const primaryBtn: CSSProperties = {
  marginTop: "14px",
  width: "100%",
  height: "46px",
  borderRadius: "16px",
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 26px rgba(228,79,42,0.20)",
};

const emptyTitle: CSSProperties = {
  marginTop: "12px",
  fontSize: "17px",
  fontWeight: 950,
  color: "#111827",
};

const emptyText: CSSProperties = {
  marginTop: "6px",
  fontSize: "13px",
  color: "#64748B",
  lineHeight: 1.5,
};

const emptyTextSmall: CSSProperties = {
  marginTop: "12px",
  fontSize: "13px",
  color: "#64748B",
  lineHeight: 1.5,
};

const queueCardBtn: CSSProperties = {
  width: "100%",
  textAlign: "left",
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  padding: "14px",
  borderRadius: "18px",
  border: "1px solid rgba(15,23,42,0.06)",
  background: "#F8FAFC",
  cursor: "pointer",
};

const queueTitle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 950,
  color: "#111827",
};

const queueMeta: CSSProperties = {
  marginTop: "6px",
  fontSize: "13px",
  color: "#64748B",
};

const queuePrice: CSSProperties = {
  fontSize: "14px",
  fontWeight: 950,
  color: "#111827",
  whiteSpace: "nowrap",
};

const offerTitle: CSSProperties = {
  marginTop: "12px",
  fontSize: "17px",
  fontWeight: 950,
  color: "#111827",
};

const offerMeta: CSSProperties = {
  marginTop: "6px",
  fontSize: "13px",
  color: "#64748B",
  lineHeight: 1.45,
};

const offerMetaStrong: CSSProperties = {
  marginTop: "8px",
  fontSize: "15px",
  color: "#111827",
  fontWeight: 950,
};

const ghostBtnOrange: CSSProperties = {
  marginTop: "14px",
  width: "100%",
  height: "44px",
  borderRadius: "16px",
  border: "1px solid rgba(228,79,42,0.20)",
  background: "rgba(228,79,42,0.06)",
  color: "#E44F2A",
  fontWeight: 950,
  cursor: "pointer",
};

const summaryRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  paddingTop: "12px",
  paddingBottom: "12px",
  borderBottom: "1px solid rgba(15,23,42,0.06)",
};

const summaryLabel: CSSProperties = {
  color: "#64748B",
  fontWeight: 800,
  fontSize: "13px",
};

const summaryValue: CSSProperties = {
  color: "#111827",
  fontWeight: 950,
  fontSize: "14px",
};