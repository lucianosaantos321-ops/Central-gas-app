import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../layout";
import PageHeader from "../components/PageHeader";
import { getAddresses } from "../services/addressStore";
import type { Address } from "../services/addressStore";

function safeText(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function addressLine(a: any) {
  const street = safeText(a?.street);
  const number = safeText(a?.number);
  const neighborhood = safeText(a?.neighborhood);
  const city = safeText(a?.city);
  const parts1 = [street, number].filter(Boolean).join(", ");
  const parts2 = [neighborhood, city].filter(Boolean).join(" • ");
  return [parts1, parts2].filter(Boolean).join("\n");
}

export default function MyAddresses() {
  const navigate = useNavigate();

  const [list, setList] = useState<Address[]>(() => {
    try {
      const v = getAddresses();
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  });

  function refresh() {
    try {
      const v = getAddresses();
      setList(Array.isArray(v) ? v : []);
    } catch {
      setList([]);
    }
  }

  useEffect(() => {
    refresh();

    // se algum lugar alterar storage, reflete aqui
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAny = list.length > 0;

  const sorted = useMemo(() => {
    // tenta manter o primeiro como principal se tiver isDefault (se não tiver, só mantém ordem)
    const arr = [...list];
    const hasDefault = arr.some((x: any) => Boolean((x as any)?.isDefault));
    if (!hasDefault) return arr;
    return arr.sort((a: any, b: any) => Number(Boolean(b?.isDefault)) - Number(Boolean(a?.isDefault)));
  }, [list]);

  return (
    <Layout>
      <div style={{ paddingBottom: 96 }}>
        <PageHeader
          title="Meus Endereços"
          subtitle="Gerencie onde você quer receber o gás"
        />

        {/* HERO / CTA */}
        <div
          style={{
            marginTop: 14,
            background: "linear-gradient(90deg,#111827,#1F2937)",
            color: "#fff",
            borderRadius: 22,
            padding: 16,
            boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            Entrega rápida começa com endereço certo
          </div>

          <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13, lineHeight: 1.5 }}>
            Cadastre seu endereço completo para o entregador abrir rota com 1 clique.
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button
              onClick={() => navigate("/add-address")}
              style={btnPrimaryLight}
              type="button"
            >
              + Adicionar endereço
            </button>

            <button
              onClick={() => navigate("/checkout")}
              style={btnGhostDark}
              type="button"
            >
              Ir para Checkout
            </button>
          </div>
        </div>

        {/* LIST / EMPTY */}
        {!hasAny ? (
          <div style={card}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Nenhum endereço ainda</div>
            <div style={{ marginTop: 10, color: "#666", lineHeight: 1.5 }}>
              Você ainda não cadastrou endereços. Cadastre agora para finalizar pedidos sem dor de cabeça.
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <button
                onClick={() => navigate("/add-address")}
                style={btnPrimaryDark}
                type="button"
              >
                Cadastrar meu primeiro endereço
              </button>

              <button
                onClick={() => navigate("/loja")}
                style={btnGhost}
                type="button"
              >
                Voltar para Loja
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header lista */}
            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 900, color: "#111" }}>
                Endereços cadastrados ({sorted.length})
              </div>

              <button
                onClick={() => navigate("/add-address")}
                style={btnSmall}
                type="button"
              >
                + Adicionar
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {sorted.map((a: any) => {
                const label = safeText(a?.label) || "Endereço";
                const line = addressLine(a);

                return (
                  <div key={String(a?.id)} style={addressCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 900, fontSize: 15, color: "#111" }}>
                            {label}
                          </div>

                          {a?.isDefault ? (
                            <span style={tagDefault}>Principal</span>
                          ) : (
                            <span style={tag}>Salvo</span>
                          )}
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            color: "#444",
                            fontSize: 13,
                            lineHeight: 1.45,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {line || "Endereço incompleto"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, color: "#666" }}>ID</div>
                        <div style={{ fontWeight: 900, fontSize: 12, color: "#111" }}>
                          {String(a?.id ?? "").slice(0, 6)}
                        </div>
                      </div>
                    </div>

                    {/* ações (sem deletar aqui porque seu addressStore pode ter API diferente) */}
                    <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                      <button
                        onClick={() => navigate("/checkout")}
                        style={btnGhost}
                        type="button"
                      >
                        Usar no Checkout
                      </button>

                      <button
                        onClick={() => {
                          // tela de add pode virar "editar" futuramente; por enquanto só orienta.
                          alert("Edição: próximo passo. Por enquanto, adicione um novo endereço (em breve edição).");
                        }}
                        style={btnGhost}
                        type="button"
                      >
                        Editar (em breve)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => navigate("/conta")}
                style={btnGhost}
                type="button"
              >
                Voltar para Conta
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const card: React.CSSProperties = {
  marginTop: 14,
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 6px 18px rgba(0,0,0,.04)",
};

const addressCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 6px 18px rgba(0,0,0,.04)",
};

const tag: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.06)",
  border: "1px solid rgba(17,24,39,0.10)",
  color: "#111827",
};

const tagDefault: React.CSSProperties = {
  ...tag,
  background: "rgba(228,79,42,0.10)",
  border: "1px solid rgba(228,79,42,0.22)",
  color: "#E44F2A",
};

const btnPrimaryLight: React.CSSProperties = {
  flex: 1,
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const btnGhostDark: React.CSSProperties = {
  flex: 1,
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "transparent",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnPrimaryDark: React.CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#111827,#374151)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
};

const btnGhost: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  color: "#111",
  fontWeight: 900,
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};