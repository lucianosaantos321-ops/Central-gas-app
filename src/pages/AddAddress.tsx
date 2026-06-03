import { useMemo, useState, type CSSProperties, type HTMLAttributes } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Layout from "../layout";
import {
  createAddress,
  getAddresses,
  getPrimaryAddressId,
  setPrimaryAddress,
  updateAddress,
  type Address,
} from "../services/addressStore";
import { emitToast } from "../services/realtimeBus";

function onlyDigits(value: string) {
  return (value || "").replace(/\D/g, "");
}

function maskPhoneBR(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidBRPhone(raw: string) {
  const digits = onlyDigits(raw);
  return digits.length === 10 || digits.length === 11;
}

function readStringField(value: unknown) {
  return String(value ?? "").trim();
}

function readFlowState(rawState: unknown): {
  returnTo: string;
  editAddressId: string;
} {
  if (typeof rawState !== "object" || rawState === null) {
    return { returnTo: "/my-addresses", editAddressId: "" };
  }

  const state = rawState as {
    returnTo?: unknown;
    editAddressId?: unknown;
  };

  const returnTo = readStringField(state.returnTo) || "/my-addresses";
  const editAddressId = readStringField(state.editAddressId);
  return { returnTo, editAddressId };
}

export default function AddAddress() {
  const navigate = useNavigate();
  const location = useLocation();
  const flowState = useMemo(() => readFlowState(location.state), [location.state]);
  const existingAddress = useMemo(() => {
    if (!flowState.editAddressId) return null;
    return getAddresses().find((item) => item.id === flowState.editAddressId) ?? null;
  }, [flowState.editAddressId]);

  const isEditing = Boolean(existingAddress);
  const returnTo = flowState.returnTo || "/my-addresses";
  const currentPrimaryId = useMemo(() => getPrimaryAddressId(), []);
  const hasNoAddresses = useMemo(() => getAddresses().length === 0, []);

  const [label, setLabel] = useState(() => existingAddress?.label ?? "");
  const [street, setStreet] = useState(() => existingAddress?.street ?? "");
  const [number, setNumber] = useState(() => existingAddress?.number ?? "");
  const [neighborhood, setNeighborhood] = useState(() => existingAddress?.neighborhood ?? "");
  const [city, setCity] = useState(() => existingAddress?.city ?? "");
  const [phone, setPhone] = useState(() => maskPhoneBR(existingAddress?.phone ?? ""));
  const [lat, setLat] = useState<number | null>(() => existingAddress?.lat ?? null);
  const [lng, setLng] = useState<number | null>(() => existingAddress?.lng ?? null);
  const [setAsPrimary, setSetAsPrimary] = useState(() => {
    if (existingAddress) return existingAddress.id === currentPrimaryId;
    return hasNoAddresses;
  });
  const [gettingLocation, setGettingLocation] = useState(false);

  const trimmed = useMemo(
    () => ({
      label: label.trim(),
      street: street.trim(),
      number: number.trim(),
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      phone: phone.trim(),
    }),
    [label, street, number, neighborhood, city, phone]
  );

  const phoneOk = isValidBRPhone(trimmed.phone);
  const canSave = trimmed.label.length > 0 && trimmed.street.length > 0 && phoneOk;
  const hasLocation = Number.isFinite(lat as number) && Number.isFinite(lng as number);

  function goBack() {
    navigate(returnTo);
  }

  function getMyLocation() {
    if (!navigator.geolocation) {
      emitToast("Localização indisponível", "Seu navegador não suporta localização.", "warning");
      return;
    }

    setGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setGettingLocation(false);
      },
      (error) => {
        setGettingLocation(false);
        if (error.code === 1) {
          emitToast(
            "Permissão negada",
            "Ative a localização do navegador para usar essa função.",
            "warning"
          );
          return;
        }
        emitToast("Falha ao localizar", "Não foi possível obter sua localização agora.", "error");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function clearLocation() {
    setLat(null);
    setLng(null);
  }

  function buildPayload(): Omit<Address, "id" | "createdAt" | "updatedAt"> {
    return {
      label: trimmed.label,
      street: trimmed.street,
      number: trimmed.number,
      neighborhood: trimmed.neighborhood,
      city: trimmed.city,
      phone: onlyDigits(trimmed.phone),
      lat,
      lng,
    };
  }

  function save() {
    if (!trimmed.label || !trimmed.street) {
      emitToast("Endereço incompleto", "Preencha pelo menos o apelido e a rua do endereço.", "warning");
      return;
    }

    if (!phoneOk) {
      emitToast("WhatsApp inválido", "Informe um WhatsApp válido com DDD.", "warning");
      return;
    }

    let savedAddress: Address | null = null;

    if (existingAddress) {
      savedAddress = updateAddress(existingAddress.id, buildPayload());
    } else {
      savedAddress = createAddress(buildPayload());
    }

    if (savedAddress && setAsPrimary) {
      setPrimaryAddress(savedAddress.id);
    }

    emitToast(
      isEditing ? "Endereço atualizado" : "Endereço salvo",
      setAsPrimary
        ? "Esse endereço foi salvo como principal."
        : isEditing
        ? "As alterações foram salvas com sucesso."
        : "O novo endereço já pode ser usado no checkout.",
      "success"
    );
    navigate(returnTo, { replace: true });
  }

  return (
    <Layout>
      <div style={{ padding: "8px 0 96px" }}>
        <div style={{ marginBottom: 12 }}>
          <button onClick={goBack} style={backBtn} aria-label="Voltar" type="button">
            ← Voltar
          </button>

          <h2 style={{ margin: "12px 0 6px", fontSize: 22, lineHeight: 1.2 }}>
            {isEditing ? "Editar endereço" : "Novo endereço"}
          </h2>
          <p style={{ margin: 0, opacity: 0.75, fontSize: 14 }}>
            {isEditing
              ? "Atualize os dados para usar esse endereço com mais rapidez."
              : "Informe os dados para salvar e usar nas próximas compras."}
          </p>
        </div>

        <div style={formCard}>
          <Field
            label="Apelido do endereço"
            hint="Ex.: Casa, Trabalho, Mãe"
            placeholder="Casa, Trabalho..."
            value={label}
            onChange={setLabel}
            required
            autoFocus
            inputMode="text"
          />

          <div style={{ height: 12 }} />

          <Field
            label="Rua / Avenida"
            placeholder="Rua Exemplo"
            value={street}
            onChange={setStreet}
            required
            inputMode="text"
          />

          <div style={{ height: 12 }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Número" placeholder="123" value={number} onChange={setNumber} inputMode="numeric" />
            <Field
              label="Bairro"
              placeholder="Centro"
              value={neighborhood}
              onChange={setNeighborhood}
              inputMode="text"
            />
          </div>

          <div style={{ height: 12 }} />

          <Field label="Cidade" placeholder="Sua cidade" value={city} onChange={setCity} inputMode="text" />

          <div style={{ height: 12 }} />

          <Field
            label="WhatsApp (com DDD)"
            hint="Obrigatório"
            placeholder="Ex: (61) 99999-8888"
            value={phone}
            onChange={(value) => setPhone(maskPhoneBR(value))}
            required
            inputMode="tel"
          />

          {!phoneOk && trimmed.phone.length > 0 ? (
            <div style={errorBox}>Informe um número válido com DDD (10 ou 11 dígitos).</div>
          ) : null}

          <div style={{ height: 14 }} />

          <div style={tipCard}>
            <strong>Localização exata (opcional)</strong>
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              Ajuda o entregador a abrir a rota no Waze ou no Maps com um toque.
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <button
                onClick={getMyLocation}
                disabled={gettingLocation}
                style={{
                  ...geoBtn,
                  cursor: gettingLocation ? "not-allowed" : "pointer",
                  opacity: gettingLocation ? 0.7 : 1,
                }}
                type="button"
              >
                {gettingLocation ? "Obtendo localização..." : "Usar minha localização"}
              </button>

              {hasLocation ? (
                <div style={locationBox}>
                  <div style={{ fontWeight: 900, color: "#2E7D32" }}>Localização capturada</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                    Lat: {lat?.toFixed(6)} • Lng: {lng?.toFixed(6)}
                  </div>

                  <button onClick={clearLocation} style={secondaryInlineBtn} type="button">
                    Remover localização
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ height: 14 }} />

          <label style={toggleRow}>
            <input
              type="checkbox"
              checked={setAsPrimary}
              onChange={(event) => setSetAsPrimary(event.target.checked)}
            />
            <span>
              Definir como endereço principal
            </span>
          </label>

          <div style={{ height: 14 }} />

          <div style={hintCard}>
            Dica: o <strong>apelido</strong> ajuda você a escolher rápido no checkout.
          </div>

          <div style={{ height: 14 }} />

          <button
            onClick={save}
            disabled={!canSave}
            style={{
              ...primaryBtn,
              cursor: canSave ? "pointer" : "not-allowed",
              opacity: canSave ? 1 : 0.55,
            }}
            type="button"
          >
            {isEditing ? "Salvar alterações" : "Salvar endereço"}
          </button>
        </div>
      </div>
    </Layout>
  );
}

function Field(props: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const { label, hint, placeholder, value, onChange, required, autoFocus, inputMode } = props;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {label} {required ? <span style={{ color: "#E44F2A" }}>*</span> : null}
        </div>
        {hint ? <div style={{ fontSize: 12, opacity: 0.65 }}>{hint}</div> : null}
      </div>

      <div style={{ height: 8 }} />

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        style={inputStyle}
      />
    </div>
  );
}

const backBtn: CSSProperties = {
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const formCard: CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  padding: "0 14px",
  fontSize: 16,
  outline: "none",
  background: "#fff",
};

const errorBox: CSSProperties = {
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(176,0,32,0.08)",
  color: "#B00020",
  fontSize: 13,
  fontWeight: 700,
};

const tipCard: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "rgba(0,0,0,0.03)",
  fontSize: 13,
  lineHeight: 1.35,
  opacity: 0.9,
};

const hintCard: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "rgba(0,0,0,0.03)",
  fontSize: 13,
  lineHeight: 1.35,
  opacity: 0.85,
};

const toggleRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 12,
  borderRadius: 14,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.08)",
  fontSize: 14,
  fontWeight: 800,
  color: "#111827",
};

const geoBtn: CSSProperties = {
  width: "100%",
  border: "2px solid #E44F2A",
  borderRadius: 16,
  padding: "12px 14px",
  fontSize: 15,
  fontWeight: 900,
  background: "#fff",
  color: "#E44F2A",
};

const locationBox: CSSProperties = {
  borderRadius: 14,
  padding: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
};

const secondaryInlineBtn: CSSProperties = {
  marginTop: 10,
  width: "100%",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 14,
  padding: "10px 12px",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  color: "#444",
};

const primaryBtn: CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 16,
  padding: "14px 16px",
  fontSize: 16,
  fontWeight: 700,
  background: "linear-gradient(90deg, #E44F2A, #F7A212)",
  color: "#fff",
  boxShadow: "0 10px 26px rgba(228,79,42,0.25)",
};
