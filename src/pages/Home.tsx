import Layout from "../layout";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { usePedidoStore } from "../store/usePedidoStore";
import { useRemoteSyncStore } from "../store/useRemoteSyncStore";
import { getAddresses, getPrimaryAddress } from "../services/addressStore";
import {
  describeGasForecast,
  getGasEstimateSetup,
  getGasTank,
  setGasUsageProfile,
  syncGasTank,
} from "../services/gasTank";
import { productCatalogService } from "../services/productCatalogService";
import {
  cardStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionCardStyle,
  ui,
} from "../styles/ui";
import {
  readLocalUserDocumentPayload,
  type ClientProfileDocument,
} from "../services/userStateSchemas";
import { clientNotificationCenter } from "../services/clientNotificationCenter";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function statusLabel(status?: string) {
  switch (status) {
    case "criado":
      return "Criado";
    case "confirmado":
      return "Confirmado";
    case "buscando_entregador":
      return "Buscando entregador";
    case "preparando":
      return "Preparando";
    case "saiu_para_entrega":
      return "Saiu para entrega";
    case "entregue":
      return "Entregue";
    default:
      return status ? status : "-";
  }
}

function statusDescription(status?: string) {
  switch (status) {
    case "criado":
      return "Pedido criado e aguardando processamento";
    case "confirmado":
      return "Pedido confirmado pela loja";
    case "buscando_entregador":
      return "Buscando entregador disponível na sua região";
    case "preparando":
      return "Preparando para sair";
    case "saiu_para_entrega":
      return "Seu pedido está a caminho";
    case "entregue":
      return "Pedido entregue com sucesso";
    default:
      return "Sem atualização no momento";
  }
}

function gasLabel(level: number) {
  if (level >= 70) return "Cheio";
  if (level >= 35) return "Medio";
  if (level >= 15) return "Baixo";
  return "Critico";
}

function gasStatusTone(level: number) {
  if (level >= 70) {
    return {
      fill: "linear-gradient(90deg,#22C55E,#16A34A)",
      pillBg: "rgba(34,197,94,0.12)",
      pillFg: "#166534",
    };
  }
  if (level >= 35) {
    return {
      fill: "linear-gradient(90deg,#F59E0B,#EA580C)",
      pillBg: "rgba(245,158,11,0.12)",
      pillFg: "#B45309",
    };
  }
  return {
    fill: "linear-gradient(90deg,#FB7185,#DC2626)",
    pillBg: "rgba(220,38,38,0.12)",
    pillFg: "#B91C1C",
  };
}

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Home() {
  const navigate = useNavigate();
  const initialSetup = useMemo(() => getGasEstimateSetup(), []);

  const pedidosState = usePedidoStore((s) => s.pedidos);
  const pedidos = Array.isArray(pedidosState) ? pedidosState : [];
  const adicionar = usePedidoStore((s) => s.adicionarAoCarrinho);
  const publicVersion = useRemoteSyncStore((s) => s.publicVersion);

  const nome = useMemo(() => {
    const profile = readLocalUserDocumentPayload(
      "client_profile"
    ) as ClientProfileDocument;
    return profile.nome || "Cliente";
  }, [publicVersion]);
  const [addresses, setAddresses] = useState(() => getAddresses());
  const primaryAddress = useMemo(() => {
    return getPrimaryAddress() ?? addresses[0] ?? null;
  }, [addresses]);

  const [tank, setTank] = useState(() => getGasTank());
  const [estimateSetup, setEstimateSetup] = useState(() => initialSetup);
  const [averageMonths, setAverageMonths] = useState(() =>
    Math.floor(initialSetup.average_duration_days / 30)
  );
  const [averageDays, setAverageDays] = useState(
    () => initialSetup.average_duration_days % 30
  );
  const [lastExchangeDays, setLastExchangeDays] = useState(
    () => initialSetup.days_since_last_exchange
  );
  const [notificationVersion, setNotificationVersion] = useState(0);

  useEffect(() => {
    return clientNotificationCenter.subscribe(() =>
      setNotificationVersion((value) => value + 1)
    );
  }, []);

  useEffect(() => {
    setTank(syncGasTank());
    const setup = getGasEstimateSetup();
    setEstimateSetup(setup);
    setAverageMonths(Math.floor(setup.average_duration_days / 30));
    setAverageDays(setup.average_duration_days % 30);
    setLastExchangeDays(setup.days_since_last_exchange);
  }, [pedidos]);

  useEffect(() => {
    const refreshAddresses = () => setAddresses(getAddresses());
    refreshAddresses();
    window.addEventListener("storage", refreshAddresses);
    window.addEventListener("focus", refreshAddresses);
    return () => {
      window.removeEventListener("storage", refreshAddresses);
      window.removeEventListener("focus", refreshAddresses);
    };
  }, []);

  const activeOrder = useMemo(() => {
    const active = pedidos
      .filter((p: any) => p?.status !== "entregue")
      .sort(
        (a: any, b: any) =>
          new Date(b?.updatedAt ?? b?.createdAt ?? 0).getTime() -
          new Date(a?.updatedAt ?? a?.createdAt ?? 0).getTime()
      );
    return active[0] ?? null;
  }, [pedidos]);

  const gasForecast = describeGasForecast();
  const gasLevel = clamp(tank.current_level, 0, 100);
  const estimatedDays = tank.estimated_days;
  const gasTone = gasStatusTone(gasLevel);
  const unreadNotifications = useMemo(
    () => clientNotificationCenter.getUnreadCount(),
    [notificationVersion]
  );

  const products = useMemo(
    () =>
      productCatalogService
        .getActive()
        .slice(0, 3)
        .map((item) => ({
          id: item.id,
          name: item.nome,
          price: Number(item.preco || 0),
          badge: item.badge || "Produto",
        })),
    [publicVersion]
  );

  function saveInitialEstimate() {
    const averageDurationDays = Math.max(
      1,
      averageMonths * 30 + Math.max(0, Number(averageDays || 0))
    );
    const elapsed = clamp(
      Number(lastExchangeDays || 0),
      0,
      averageDurationDays
    );
    setTank(
      setGasUsageProfile({
        averageDurationDays,
        daysSinceLastExchange: elapsed,
      })
    );
    setEstimateSetup(getGasEstimateSetup());
  }

  return (
    <Layout>
      <div style={{ paddingBottom: 96 }}>
        <div style={topRow}>
          <div style={topAddress}>
            {primaryAddress?.label || "Central Gás"}
          </div>
          <button
            onClick={() => navigate("/notificacoes")}
            type="button"
            style={bellBtn}
            aria-label="Abrir notificações"
          >
            <BellIcon />
            {unreadNotifications > 0 ? (
              <span style={bellBadge}>
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            ) : null}
          </button>
        </div>

        <div style={heroCard}>
          <div style={heroGlowA} />
          <div style={heroGlowB} />

          <div style={{ position: "relative" }}>
            <div style={heroMini}>
              {greeting()}, {nome}
            </div>
            <div style={addressCard}>
              <div style={{ minWidth: 0 }}>
                <div style={addressLabel}>Entregar em</div>
                <div style={addressValue}>
                  {primaryAddress?.label || "Adicionar endereço"}
                </div>
              </div>

                <button
                  onClick={() =>
                    primaryAddress
                      ? navigate("/my-addresses")
                      : navigate("/add-address", { state: { returnTo: "/" } })
                  }
                  style={heroWhiteBtn}
                  type="button"
                >
                {primaryAddress ? "Trocar" : "Cadastrar"}
              </button>
            </div>

            <div style={heroActionRow}>
              <button
                onClick={() => navigate("/loja")}
                style={heroPrimaryBtn}
                type="button"
              >
                Pedir agora
              </button>

              <button
                onClick={() => navigate("/orders")}
                style={heroGhostBtn}
                type="button"
              >
                Ver pedidos
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {!estimateSetup.configured ? (
            <div style={setupCard}>
              <div style={setupTitle}>Configure a duração média do seu gás</div>
              <div style={setupText}>
                O app calcula a estimativa com base em quanto tempo seu gás
                costuma durar e há quantos dias foi a última troca.
              </div>

              <div style={setupQuestion}>Quantos dias o seu gás costuma durar?</div>
              <div style={durationGrid}>
                <label style={durationField}>
                  <span style={durationLabel}>Meses</span>
                  <input
                    type="number"
                    min={0}
                    value={averageMonths}
                    onChange={(e) => setAverageMonths(Math.max(0, Number(e.target.value || 0)))}
                    style={durationInput}
                  />
                </label>
                <label style={durationField}>
                  <span style={durationLabel}>Dias</span>
                  <input
                    type="number"
                    min={0}
                    value={averageDays}
                    onChange={(e) => setAverageDays(Math.max(0, Number(e.target.value || 0)))}
                    style={durationInput}
                  />
                </label>
              </div>

              <div style={setupQuestion}>Há quantos dias foi sua última troca de gás?</div>
              <input
                type="number"
                min={0}
                value={lastExchangeDays}
                onChange={(e) => setLastExchangeDays(Math.max(0, Number(e.target.value || 0)))}
                style={singleSetupInput}
              />

              <div style={setupValue}>
                Estimativa inicial calculada: {gasForecast.level.toFixed(0)}%
              </div>
              <div style={setupText}>
                Fim previsto em{" "}
                <strong>{new Date(gasForecast.finishDate).toLocaleDateString("pt-BR")}</strong>
                {" "}com cerca de <strong>{gasForecast.daysRemaining} dias</strong> restantes.
              </div>

              <button onClick={saveInitialEstimate} type="button" style={saveSetupBtn}>
                Salvar configuração
              </button>
            </div>
          ) : null}

          <StatusCard
            title={activeOrder ? "Pedido em andamento" : "Pronto para pedir"}
            subtitle={
              activeOrder
                ? `${statusLabel(activeOrder.status)} | ${statusDescription(activeOrder.status)}`
                : "Monte seu pedido e acompanhe cada etapa pelo app."
            }
            right={
              activeOrder ? (
                <span style={pillStyle("#E44F2A")}>Ver</span>
              ) : (
                <span style={pillStyle("#E44F2A")}>Loja</span>
              )
            }
            onClick={() =>
              activeOrder ? navigate(`/orders/${activeOrder.id}`) : navigate("/loja")
            }
            highlighted={Boolean(activeOrder)}
          />

          <div onClick={() => navigate("/monitorar")} style={gasCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={gasTitle}>Seu botijão</div>
                <div style={gasLine}>
                  Nível estimado: <strong>{gasLevel.toFixed(0)}%</strong> |{" "}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: gasTone.pillBg,
                      color: gasTone.pillFg,
                      fontWeight: 900,
                    }}
                  >
                    {gasLabel(gasLevel)}
                  </span>
                </div>
                <div style={gasLineStrong}>
                  Restam cerca de <strong>{estimatedDays} dias</strong>
                </div>
                <div style={gasLineSmall}>
                  Próxima troca prevista para{" "}
                  <strong>{new Date(tank.finish_date).toLocaleDateString("pt-BR")}</strong>
                </div>
                <div style={gasLineSmall}>
                  Média informada: <strong>{estimateSetup.average_duration_days} dias</strong> | última
                  troca há <strong>{estimateSetup.days_since_last_exchange} dias</strong>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={pillStyle("#E44F2A")}>Monitorar</span>
              </div>
            </div>

            <div style={gasTrack}>
              <div
                style={{
                  ...gasFill,
                  width: `${clamp(gasLevel, 0, 100)}%`,
                  background: gasTone.fill,
                }}
              />
            </div>

            <div style={gasFootnote}>
              Depois que o pedido é concluído, o nível volta para 100% automaticamente.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Pedir rápido</div>
          <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
            Adicione o produto e ajuste a quantidade dentro do carrinho.
          </div>

          {products.map((p) => (
            <div key={p.id} style={productCard}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <p style={{ margin: 0, fontWeight: 900, fontSize: 16 }}>{p.name}</p>
                    <span style={badge}>{p.badge}</span>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 14, fontWeight: 900 }}>
                    {money(p.price)}
                  </div>
                </div>

              </div>

              <button
                onClick={() =>
                  adicionar({
                    produtoId: p.id,
                    nome: p.name,
                    quantidade: 1,
                    precoUnitario: p.price,
                  })
                }
                style={addBtn}
                type="button"
              >
                Adicionar ao carrinho
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Ações rápidas</div>
          <div style={quickGrid}>
            <ActionTile title="Endereços" desc="Salvar e usar" onClick={() => navigate("/my-addresses")} />
            <ActionTile title="Monitorar" desc="Nível e estimativa" onClick={() => navigate("/monitorar")} />
            <ActionTile title="Pedidos" desc="Acompanhar" onClick={() => navigate("/orders")} />
            <ActionTile title="Conta" desc="Configurações" onClick={() => navigate("/conta")} />
          </div>
        </div>

        <div style={tipCard}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Dica rápida</div>
          <div style={{ marginTop: 8, color: "#475569", lineHeight: 1.55 }}>
            Quando o entregador concluir uma troca, o nível do botijão é
            atualizado automaticamente no app.
          </div>
          <button onClick={() => navigate("/monitorar")} style={tipBtn} type="button">
            Abrir monitoramento
          </button>
        </div>

      </div>
    </Layout>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 9.5a6 6 0 1 0-12 0c0 7-3 7-3 8.5h18c0-1.5-3-1.5-3-8.5Z"
        stroke="#111827"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.8 21a2.4 2.4 0 0 0 4.4 0"
        stroke="#111827"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusCard({
  title,
  subtitle,
  right,
  onClick,
  highlighted,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
  onClick?: () => void;
  highlighted?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        ...statusCard,
        border: highlighted
          ? "2px solid rgba(228,79,42,0.24)"
          : "1px solid rgba(0,0,0,0.08)",
        boxShadow: highlighted ? ui.shadow.orange : statusCard.boxShadow,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <div style={{ marginTop: 6, color: "#666", lineHeight: 1.5 }}>{subtitle}</div>
        </div>
        {right}
      </div>
    </div>
  );
}

function ActionTile({
  title,
  desc,
  onClick,
}: {
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={actionTile} type="button">
      <div style={{ fontWeight: 900, fontSize: 15 }}>{title}</div>
      <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>{desc}</div>
      <div style={{ marginTop: 12, color: "#E44F2A", fontWeight: 900 }}>Abrir ›</div>
    </button>
  );
}

function pillStyle(color: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    color,
    background:
      color === "#999" ? "rgba(0,0,0,0.06)" : "rgba(228,79,42,0.10)",
    border:
      color === "#999"
        ? "1px solid rgba(0,0,0,0.08)"
        : "1px solid rgba(228,79,42,0.15)",
  };
}

const heroCard: CSSProperties = {
  background: "linear-gradient(90deg,#E44F2A,#F7A212)",
  padding: "18px 16px",
  borderRadius: 22,
  color: "#fff",
  boxShadow: "0 12px 28px rgba(228,79,42,0.18)",
  overflow: "hidden",
  position: "relative",
};

const topRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const topAddress: CSSProperties = {
  minWidth: 0,
  flex: 1,
  textAlign: "center",
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const bellBtn: CSSProperties = {
  position: "relative",
  width: 48,
  height: 48,
  borderRadius: "50%",
  border: "none",
  background: "#fff",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  boxShadow: "0 12px 26px rgba(15,23,42,0.08)",
};

const bellBadge: CSSProperties = {
  position: "absolute",
  top: 4,
  right: 3,
  minWidth: 18,
  height: 18,
  padding: "0 5px",
  borderRadius: 999,
  background: "#E44F2A",
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  fontWeight: 950,
  border: "2px solid #fff",
};

const heroGlowA: CSSProperties = {
  position: "absolute",
  right: -60,
  top: -60,
  width: 160,
  height: 160,
  borderRadius: 999,
  background: "rgba(255,255,255,0.16)",
};

const heroGlowB: CSSProperties = {
  position: "absolute",
  left: -70,
  bottom: -70,
  width: 160,
  height: 160,
  borderRadius: 999,
  background: "rgba(255,255,255,0.10)",
};

const heroMini: CSSProperties = {
  fontSize: 12,
  opacity: 0.92,
  fontWeight: 800,
};

const addressCard: CSSProperties = {
  marginTop: 12,
  background: "rgba(255,255,255,0.16)",
  border: "1px solid rgba(255,255,255,0.28)",
  borderRadius: 18,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const addressLabel: CSSProperties = {
  fontSize: 12,
  opacity: 0.9,
  fontWeight: 800,
};

const addressValue: CSSProperties = {
  marginTop: 4,
  fontWeight: 900,
  fontSize: 13,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const heroWhiteBtn: CSSProperties = {
  background: "#fff",
  color: "#E44F2A",
  border: "none",
  padding: "10px 12px",
  borderRadius: 14,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const heroActionRow: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 12,
  flexWrap: "wrap",
};

const heroPrimaryBtn: CSSProperties = {
  ...primaryButtonStyle({
    flex: 1,
    padding: "12px 14px",
    minHeight: 50,
    borderRadius: 18,
    color: "#fff",
    boxShadow: "0 14px 28px rgba(255,255,255,0.12)",
  }),
};

const heroGhostBtn: CSSProperties = {
  ...secondaryButtonStyle({
    flex: 1,
    background: "rgba(255,255,255,.18)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.35)",
    padding: "12px 14px",
    minHeight: 50,
  }),
};

const setupCard: CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "2px solid rgba(228,79,42,0.16)",
  boxShadow: "0 10px 26px rgba(228,79,42,.08)",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  overflow: "hidden",
};

const setupTitle: CSSProperties = {
  fontWeight: 900,
  fontSize: 16,
  color: "#111827",
};

const setupText: CSSProperties = {
  marginTop: 6,
  color: "#666",
  fontSize: 13,
  lineHeight: 1.5,
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

const setupQuestion: CSSProperties = {
  marginTop: 14,
  fontWeight: 900,
  fontSize: 14,
  color: "#111827",
};

const setupValue: CSSProperties = {
  marginTop: 8,
  fontWeight: 900,
  color: "#E44F2A",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

const durationGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))",
  gap: 8,
  marginTop: 12,
};

const durationField: CSSProperties = {
  display: "grid",
  gap: 6,
};

const durationLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#64748B",
};

const durationInput: CSSProperties = {
  height: 46,
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  padding: "0 12px",
  boxSizing: "border-box",
};

const singleSetupInput: CSSProperties = {
  marginTop: 10,
  width: "100%",
  height: 48,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  padding: "0 14px",
  boxSizing: "border-box",
};

const saveSetupBtn: CSSProperties = {
  marginTop: 14,
  width: "100%",
  minHeight: 48,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(135deg,#F15A2B 0%, #FFA300 100%)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const statusCard: CSSProperties = {
  ...sectionCardStyle({
    padding: 16,
    borderRadius: 20,
  }),
  cursor: "pointer",
};

const gasCard: CSSProperties = {
  ...sectionCardStyle({
    padding: 16,
    borderRadius: 20,
  }),
  cursor: "pointer",
  userSelect: "none",
};

const gasTitle: CSSProperties = {
  fontWeight: 900,
  fontSize: 16,
};

const gasLine: CSSProperties = {
  marginTop: 6,
  color: "#666",
  fontSize: 13,
};

const gasLineStrong: CSSProperties = {
  marginTop: 6,
  color: "#444",
  fontSize: 13,
};

const gasLineSmall: CSSProperties = {
  marginTop: 6,
  color: "#64748B",
  fontSize: 12,
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

const gasTrack: CSSProperties = {
  marginTop: 12,
  height: 10,
  borderRadius: 999,
  background: "rgba(0,0,0,0.08)",
  overflow: "hidden",
};

const gasFill: CSSProperties = {
  height: "100%",
  transition: "width 260ms ease, background 260ms ease",
};

const gasFootnote: CSSProperties = {
  marginTop: 10,
  color: "#666",
  fontSize: 12,
  lineHeight: 1.5,
};

const productCard: CSSProperties = {
  ...cardStyle({
  padding: 16,
  borderRadius: 18,
  marginTop: 12,
  }),
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const badge: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  color: "#E44F2A",
  background: "rgba(228,79,42,0.10)",
};

const addBtn: CSSProperties = {
  ...primaryButtonStyle({
    marginTop: 14,
    width: "100%",
    minHeight: 46,
    fontSize: 13.5,
  }),
};

const quickGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const actionTile: CSSProperties = {
  ...cardStyle({
    borderRadius: 20,
    padding: 16,
  }),
  textAlign: "left",
  cursor: "pointer",
};

const tipCard: CSSProperties = {
  marginTop: 18,
  ...sectionCardStyle({
    padding: 16,
    borderRadius: 20,
  }),
};

const tipBtn: CSSProperties = {
  ...primaryButtonStyle({
    marginTop: 14,
    width: "100%",
    minHeight: 48,
  }),
};
