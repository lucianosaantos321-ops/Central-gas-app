import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Layout from "../layout";
import PageHeader from "../components/PageHeader";
import { emitToast } from "../services/realtimeBus";
import {
  deleteAddress,
  getAddresses,
  getPrimaryAddressId,
  setPrimaryAddress,
  type Address,
} from "../services/addressStore";

function safeText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function addressLine(address: Partial<Address> | null | undefined) {
  const street = safeText(address?.street);
  const number = safeText(address?.number);
  const neighborhood = safeText(address?.neighborhood);
  const city = safeText(address?.city);
  const parts1 = [street, number].filter(Boolean).join(", ");
  const parts2 = [neighborhood, city].filter(Boolean).join(" | ");
  return [parts1, parts2].filter(Boolean).join("\n");
}

function readReturnTo(state: unknown) {
  if (typeof state !== "object" || state === null) return "";
  if (!("returnTo" in state)) return "";
  return String((state as { returnTo?: unknown }).returnTo ?? "").trim();
}

export default function MyAddresses() {
  const navigate = useNavigate();
  const location = useLocation();
  const preferredReturnTo = readReturnTo(location.state);
  const addAddressState =
    preferredReturnTo === "/checkout"
      ? { returnTo: "/checkout" }
      : { returnTo: "/my-addresses" };

  const [list, setList] = useState<Address[]>(() => {
    try {
      const current = getAddresses();
      return Array.isArray(current) ? current : [];
    } catch {
      return [];
    }
  });
  const [primaryId, setPrimaryIdState] = useState(() => {
    try {
      return getPrimaryAddressId();
    } catch {
      return "";
    }
  });

  function refresh() {
    try {
      const current = getAddresses();
      setList(Array.isArray(current) ? current : []);
      setPrimaryIdState(getPrimaryAddressId());
    } catch {
      setList([]);
      setPrimaryIdState("");
    }
  }

  useEffect(() => {
    refresh();

    const onStorage = () => refresh();
    const onFocus = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const hasAny = list.length > 0;

  const sorted = useMemo(() => {
    const currentPrimaryId = safeText(primaryId);
    return [...list].sort((a, b) => {
      const aScore = a.id === currentPrimaryId ? 1 : 0;
      const bScore = b.id === currentPrimaryId ? 1 : 0;
      if (aScore !== bScore) return bScore - aScore;
      const aUpdated = new Date(a.updatedAt ?? a.createdAt).getTime();
      const bUpdated = new Date(b.updatedAt ?? b.createdAt).getTime();
      return bUpdated - aUpdated;
    });
  }, [list, primaryId]);

  function goToCreateAddress() {
    navigate("/add-address", { state: addAddressState });
  }

  function goToEditAddress(addressId: string) {
    navigate("/add-address", {
      state: {
        ...addAddressState,
        editAddressId: addressId,
      },
    });
  }

  function goToCheckoutWithAddress(addressId: string) {
    setPrimaryAddress(addressId);
    setPrimaryIdState(addressId);
    refresh();
    navigate("/checkout");
  }

  function makePrimary(addressId: string) {
    const changed = setPrimaryAddress(addressId);
    if (!changed) {
      emitToast(
        "Endereco nao encontrado",
        "Nao consegui definir esse endereco como principal.",
        "warning"
      );
      return;
    }
    setPrimaryIdState(addressId);
    refresh();
    emitToast(
      "Endereco principal atualizado",
      "Esse endereco sera usado como padrao no checkout.",
      "success"
    );
  }

  function removeAddress(address: Address) {
    const label = safeText(address.label) || "este endereco";
    const confirmed = window.confirm(`Excluir "${label}"? Essa acao nao pode ser desfeita.`);
    if (!confirmed) return;
    deleteAddress(address.id);
    refresh();
  }

  const footerTarget = preferredReturnTo === "/checkout" ? "/checkout" : "/conta";
  const footerLabel = preferredReturnTo === "/checkout" ? "Voltar para Checkout" : "Voltar para Conta";

  return (
    <Layout>
      <div style={{ paddingBottom: 96 }}>
        <PageHeader
          title="Meus Enderecos"
          subtitle="Gerencie onde voce quer receber o gas"
        />

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
            Entrega rapida comeca com endereco certo
          </div>

          <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13, lineHeight: 1.5 }}>
            Cadastre o endereco completo para o entregador abrir rota com 1 clique.
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button onClick={goToCreateAddress} style={btnPrimaryLight} type="button">
              + Adicionar endereco
            </button>

            <button onClick={() => navigate("/checkout")} style={btnGhostDark} type="button">
              Ir para Checkout
            </button>
          </div>
        </div>

        {!hasAny ? (
          <div style={card}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Nenhum endereco ainda</div>
            <div style={{ marginTop: 10, color: "#666", lineHeight: 1.5 }}>
              Voce ainda nao cadastrou enderecos. Cadastre agora para finalizar pedidos sem dor de cabeca.
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <button onClick={goToCreateAddress} style={btnPrimaryDark} type="button">
                Cadastrar meu primeiro endereco
              </button>

              <button onClick={() => navigate("/loja")} style={btnGhost} type="button">
                Voltar para Loja
              </button>
            </div>
          </div>
        ) : (
          <>
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
                Enderecos cadastrados ({sorted.length})
              </div>

              <button onClick={goToCreateAddress} style={btnSmall} type="button">
                + Adicionar
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {sorted.map((address) => {
                const label = safeText(address.label) || "Endereco";
                const line = addressLine(address);
                const isPrimary = address.id === primaryId;

                return (
                  <div key={address.id} style={addressCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 900, fontSize: 15, color: "#111" }}>{label}</div>
                          {isPrimary ? <span style={tagDefault}>Principal</span> : <span style={tag}>Salvo</span>}
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
                          {line || "Endereco incompleto"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, color: "#666" }}>ID</div>
                        <div style={{ fontWeight: 900, fontSize: 12, color: "#111" }}>
                          {address.id.slice(0, 6)}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          onClick={() => goToCheckoutWithAddress(address.id)}
                          style={btnGhostFlex}
                          type="button"
                        >
                          Usar no Checkout
                        </button>

                        <button
                          onClick={() => goToEditAddress(address.id)}
                          style={btnGhostFlex}
                          type="button"
                        >
                          Editar endereco
                        </button>
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          onClick={() => makePrimary(address.id)}
                          style={{
                            ...(isPrimary ? btnDisabledGhost : btnGhostFlex),
                            opacity: isPrimary ? 0.7 : 1,
                            cursor: isPrimary ? "default" : "pointer",
                          }}
                          type="button"
                          disabled={isPrimary}
                        >
                          {isPrimary ? "Endereco principal" : "Definir como principal"}
                        </button>

                        <button
                          onClick={() => removeAddress(address)}
                          style={btnDangerGhost}
                          type="button"
                        >
                          Excluir endereco
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14 }}>
              <button onClick={() => navigate(footerTarget)} style={btnGhost} type="button">
                {footerLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const card: CSSProperties = {
  marginTop: 14,
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 6px 18px rgba(0,0,0,.04)",
};

const addressCard: CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 6px 18px rgba(0,0,0,.04)",
};

const tag: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.06)",
  border: "1px solid rgba(17,24,39,0.10)",
  color: "#111827",
};

const tagDefault: CSSProperties = {
  ...tag,
  background: "rgba(228,79,42,0.10)",
  border: "1px solid rgba(228,79,42,0.22)",
  color: "#E44F2A",
};

const btnPrimaryLight: CSSProperties = {
  flex: 1,
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const btnGhostDark: CSSProperties = {
  flex: 1,
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "transparent",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnPrimaryDark: CSSProperties = {
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

const btnGhost: CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  color: "#111",
  fontWeight: 900,
  cursor: "pointer",
};

const btnGhostFlex: CSSProperties = {
  flex: 1,
  minWidth: 180,
  height: 44,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  color: "#111",
  fontWeight: 900,
  cursor: "pointer",
};

const btnDisabledGhost: CSSProperties = {
  ...btnGhostFlex,
  background: "rgba(0,0,0,0.03)",
};

const btnDangerGhost: CSSProperties = {
  flex: 1,
  minWidth: 180,
  height: 44,
  borderRadius: 14,
  border: "1px solid rgba(185,28,28,0.16)",
  background: "rgba(185,28,28,0.04)",
  color: "#991B1B",
  fontWeight: 900,
  cursor: "pointer",
};

const btnSmall: CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

