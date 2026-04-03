import Layout from "../layout";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePedidoStore } from "../store/usePedidoStore";
import { getAddresses } from "../services/addressStore";
import { syncGasTank } from "../services/gasTank";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeGet(key: string, fallback = "") {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v : fallback;
  } catch {
    return fallback;
  }
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
      return status ? status : "—";
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
      return "Entregador encontrado • preparando para sair";
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
  if (level >= 35) return "Médio";
  if (level >= 15) return "Baixo";
  return "Crítico";
}

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Home() {
  const navigate = useNavigate();

  const pedidosState = usePedidoStore((s) => s.pedidos);
  const carrinhoState = usePedidoStore((s) => s.carrinho);
  const pedidos = Array.isArray(pedidosState) ? pedidosState : [];
  const carrinho = Array.isArray(carrinhoState) ? carrinhoState : [];
  const adicionar = usePedidoStore((s) => s.adicionarAoCarrinho);
  const remover = usePedidoStore((s) => s.removerDoCarrinho);

  const nome = useMemo(() => safeGet("cg_user_name", "Cliente"), []);
  const addresses = useMemo(() => getAddresses(), []);
  const primaryAddress = addresses[0];

  const activeOrder = useMemo(() => {
    const list = Array.isArray(pedidos) ? pedidos : [];
    const active = list
      .filter((p: any) => p?.status !== "entregue")
      .sort(
        (a: any, b: any) =>
          new Date(b?.updatedAt ?? b?.createdAt ?? 0).getTime() -
          new Date(a?.updatedAt ?? a?.createdAt ?? 0).getTime()
      );
    return active[0] ?? null;
  }, [pedidos]);

  const tank = useMemo(() => syncGasTank(), []);
  const gasLevel = clamp(tank.current_level, 0, 100);
  const estimatedDays = tank.estimated_days;

  const products = [
    { id: "p13", name: "Botijão P13", price: 120, badge: "Mais vendido" },
    { id: "p45", name: "Botijão P45", price: 380, badge: "Alta capacidade" },
  ];

  const subtotal = useMemo(() => {
    return carrinho.reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0);
  }, [carrinho]);

  const qtdNoCarrinho = (produtoId: string) => {
    return carrinho.find((i) => i.produtoId === produtoId)?.quantidade || 0;
  };

  return (
    <Layout>
      <div style={{ paddingBottom: 96 }}>
        <div
          style={{
            background: "linear-gradient(90deg,#E44F2A,#F7A212)",
            padding: "22px 18px",
            borderRadius: 24,
            color: "#fff",
            boxShadow: "0 14px 36px rgba(228,79,42,0.22)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -60,
              top: -60,
              width: 160,
              height: 160,
              borderRadius: 999,
              background: "rgba(255,255,255,0.16)",
              filter: "blur(1px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: -70,
              bottom: -70,
              width: 160,
              height: 160,
              borderRadius: 999,
              background: "rgba(255,255,255,0.10)",
            }}
          />

          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 13, opacity: 0.92, fontWeight: 800 }}>
              {greeting()}, {nome}
            </div>
            <div style={{ marginTop: 6, fontWeight: 900, fontSize: 20 }}>
              Central Gás Guará
            </div>

            <div
              style={{
                marginTop: 12,
                background: "rgba(255,255,255,0.16)",
                border: "1px solid rgba(255,255,255,0.28)",
                borderRadius: 18,
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 800 }}>
                  Entregar em
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontWeight: 900,
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {primaryAddress?.label || "Adicionar endereço"}
                </div>
              </div>

              <button
                onClick={() =>
                  primaryAddress
                    ? navigate("/my-addresses")
                    : navigate("/add-address")
                }
                style={{
                  background: "#fff",
                  color: "#E44F2A",
                  border: "none",
                  padding: "10px 12px",
                  borderRadius: 14,
                  fontWeight: 900,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                type="button"
              >
                {primaryAddress ? "Trocar" : "Cadastrar"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                onClick={() => navigate("/loja")}
                style={{
                  flex: 1,
                  background: "#fff",
                  color: "#E44F2A",
                  border: "none",
                  padding: "12px 14px",
                  borderRadius: 16,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                type="button"
              >
                Pedir agora
              </button>

              <button
                onClick={() => navigate("/orders")}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,.18)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,.35)",
                  padding: "12px 14px",
                  borderRadius: 16,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                type="button"
              >
                Ver pedidos
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <StatusCard
            title="📦 Pedido em andamento"
            subtitle={
              activeOrder
                ? `${statusLabel(activeOrder.status)} • ${statusDescription(activeOrder.status)}`
                : "Nenhum pedido em andamento no momento"
            }
            right={
              activeOrder ? (
                <span style={pillStyle("#E44F2A")}>Ver</span>
              ) : (
                <span style={pillStyle("#999")}>—</span>
              )
            }
            onClick={() =>
              activeOrder
                ? navigate(`/orders/${activeOrder.id}`)
                : navigate("/loja")
            }
          />

          <div
            onClick={() => navigate("/monitorar")}
            style={{
              background: "#fff",
              borderRadius: 22,
              padding: 16,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 6px 18px rgba(0,0,0,.04)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>⛽ Botijão</div>
                <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
                  Estimativa: <strong>{gasLevel.toFixed(0)}%</strong> •{" "}
                  <strong>{gasLabel(gasLevel)}</strong>
                </div>
                <div style={{ marginTop: 6, color: "#444", fontSize: 13 }}>
                  Aproximadamente <strong>{estimatedDays} dias</strong> restantes
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={pillStyle("#E44F2A")}>Monitorar</span>
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                height: 10,
                borderRadius: 999,
                background: "rgba(0,0,0,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${clamp(gasLevel, 0, 100)}%`,
                  background:
                    "linear-gradient(90deg, rgba(247,162,18,0.90), rgba(228,79,42,0.95))",
                }}
              />
            </div>

            <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
              * Estimativa pode variar conforme uso do gás.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Pedir rápido</div>
          <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
            Ajuste a quantidade e finalize pelo carrinho flutuante.
          </div>

          {products.map((p) => {
            const qtd = qtdNoCarrinho(p.id);
            const has = qtd > 0;

            return (
              <div
                key={p.id}
                style={{
                  background: "#fff",
                  padding: 16,
                  borderRadius: 18,
                  marginTop: 12,
                  border: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 6px 18px rgba(0,0,0,.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <p style={{ margin: 0, fontWeight: 900, fontSize: 16 }}>
                        {p.name}
                      </p>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 900,
                          color: "#E44F2A",
                          background: "rgba(228,79,42,0.10)",
                          border: "1px solid rgba(228,79,42,0.18)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.badge}
                      </span>
                    </div>
                    <p style={{ margin: "8px 0 0", color: "#444", fontWeight: 800 }}>
                      {money(p.price)}
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => remover(p.id)}
                      disabled={qtd === 0}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.12)",
                        background: qtd === 0 ? "rgba(0,0,0,0.04)" : "#fff",
                        fontWeight: 900,
                        cursor: qtd === 0 ? "not-allowed" : "pointer",
                      }}
                      title="Remover"
                      type="button"
                    >
                      -
                    </button>

                    <div
                      style={{
                        minWidth: 28,
                        textAlign: "center",
                        fontWeight: 900,
                        color: "#111",
                        fontSize: 16,
                      }}
                    >
                      {qtd}
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
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        border: "none",
                        background: "#E44F2A",
                        color: "#fff",
                        fontWeight: 900,
                        cursor: "pointer",
                        boxShadow: "0 10px 24px rgba(228,79,42,0.22)",
                      }}
                      title="Adicionar"
                      type="button"
                    >
                      +
                    </button>
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
                  style={{
                    width: "100%",
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(228,79,42,0.35)",
                    background: has
                      ? "rgba(228,79,42,0.10)"
                      : "rgba(228,79,42,0.08)",
                    color: "#E44F2A",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                  type="button"
                >
                  Adicionar ao carrinho
                </button>
              </div>
            );
          })}

          {subtotal > 0 && (
            <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
              Subtotal atual no carrinho: <strong>{money(subtotal)}</strong>
            </div>
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>
            Ações rápidas
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <ActionTile title="📍 Endereços" desc="Salvar e usar" onClick={() => navigate("/my-addresses")} />
            <ActionTile title="⛽ Monitorar" desc="Nível e estimativa" onClick={() => navigate("/monitorar")} />
            <ActionTile title="📦 Pedidos" desc="Acompanhar" onClick={() => navigate("/orders")} />
            <ActionTile title="👤 Conta" desc="Configurações" onClick={() => navigate("/conta")} />
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            background: "#fff",
            padding: 16,
            borderRadius: 22,
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 6px 18px rgba(0,0,0,.04)",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16 }}>💡 Dica rápida</div>
          <div style={{ marginTop: 8, fontSize: 14, color: "#444", lineHeight: 1.5 }}>
            Use <strong>Monitorar Gás</strong> para acompanhar o nível e pedir antes
            de acabar. Assim você evita urgência e ganha previsibilidade.
          </div>

          <button
            onClick={() => navigate("/monitorar")}
            style={{
              marginTop: 12,
              width: "100%",
              padding: 14,
              borderRadius: 18,
              background: "linear-gradient(90deg,#E44F2A,#F7A212)",
              color: "#fff",
              border: "none",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 10px 26px rgba(228,79,42,0.18)",
            }}
            type="button"
          >
            Abrir Monitoramento
          </button>
        </div>
      </div>
    </Layout>
  );
}

function StatusCard(props: {
  title: string;
  subtitle: string;
  right: React.ReactNode;
  onClick: () => void;
}) {
  const { title, subtitle, right, onClick } = props;

  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        borderRadius: 22,
        padding: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 6px 18px rgba(0,0,0,.04)",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>{right}</div>
      </div>
    </div>
  );
}

function ActionTile(props: { title: string; desc: string; onClick: () => void }) {
  const { title, desc, onClick } = props;

  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: 14,
        borderRadius: 20,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "#fff",
        cursor: "pointer",
        boxShadow: "0 6px 18px rgba(0,0,0,.04)",
      }}
      type="button"
    >
      <div style={{ fontWeight: 900 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>{desc}</div>
      <div style={{ marginTop: 10, color: "#E44F2A", fontWeight: 900 }}>
        Abrir ›
      </div>
    </button>
  );
}

function pillStyle(color: string): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 999,
    background: `${color}22`,
    color,
    fontWeight: 900,
    fontSize: 12,
    whiteSpace: "nowrap",
  };
}