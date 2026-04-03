import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Layout from "../layout";
import { createAddress } from "../services/addressStore";

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function maskPhoneBR(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function isValidBRPhone(raw: string) {
  const d = onlyDigits(raw);
  return d.length === 10 || d.length === 11;
}

export default function AddAddress() {
  const navigate = useNavigate();
  const location = useLocation();
  const checkoutState = location.state;

  const [label, setLabel] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");

  const [phone, setPhone] = useState("");

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
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

  function getMyLocation() {
    if (!navigator.geolocation) {
      alert("Seu navegador não suporta localização.");
      return;
    }

    setGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGettingLocation(false);
      },
      (err) => {
        setGettingLocation(false);
        if (err.code === 1) {
          alert("Permissão de localização negada. Ative a localização do navegador para usar essa função.");
        } else {
          alert("Não foi possível obter sua localização agora. Tente novamente.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function clearLocation() {
    setLat(null);
    setLng(null);
  }

  function save() {
    if (!trimmed.label || !trimmed.street) {
      alert("Preencha pelo menos o apelido e a rua do endereço.");
      return;
    }
    if (!phoneOk) {
      alert("Informe um WhatsApp válido com DDD (10 ou 11 dígitos).");
      return;
    }

    createAddress({
      label: trimmed.label,
      street: trimmed.street,
      number: trimmed.number,
      neighborhood: trimmed.neighborhood,
      city: trimmed.city,
      phone: onlyDigits(trimmed.phone),
      lat,
      lng,
    });

    // volta ao checkout e mantém state
    navigate("/checkout", { replace: true, state: checkoutState });
  }

  const hasLocation = Number.isFinite(lat as any) && Number.isFinite(lng as any);

  return (
    <Layout>
      <div style={{ padding: "8px 0 96px" }}>
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              border: "1px solid rgba(0,0,0,0.08)",
              background: "#fff",
              borderRadius: 12,
              padding: "10px 12px",
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
            aria-label="Voltar"
            type="button"
          >
            ← Voltar
          </button>

          <h2 style={{ margin: "12px 0 6px", fontSize: 22, lineHeight: 1.2 }}>Novo endereço</h2>
          <p style={{ margin: 0, opacity: 0.75, fontSize: 14 }}>
            Informe os dados para salvar e usar nas próximas compras.
          </p>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 16,
            padding: 14,
            boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
          }}
        >
          <Field
            label="Apelido do endereço"
            hint="Ex: Casa, Trabalho, Mãe"
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
            <Field label="Bairro" placeholder="Centro" value={neighborhood} onChange={setNeighborhood} inputMode="text" />
          </div>

          <div style={{ height: 12 }} />

          <Field label="Cidade" placeholder="Sua cidade" value={city} onChange={setCity} inputMode="text" />

          <div style={{ height: 12 }} />

          <Field
            label="WhatsApp (com DDD)"
            hint="Obrigatório"
            placeholder="Ex: (61) 99999-8888"
            value={phone}
            onChange={(v) => setPhone(maskPhoneBR(v))}
            required
            inputMode="tel"
          />

          {!phoneOk && trimmed.phone.length > 0 && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(176,0,32,0.08)",
                color: "#B00020",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Informe um número válido com DDD (10 ou 11 dígitos).
            </div>
          )}

          <div style={{ height: 14 }} />

          <div
            style={{
              padding: 12,
              borderRadius: 14,
              background: "rgba(0,0,0,0.03)",
              fontSize: 13,
              lineHeight: 1.35,
              opacity: 0.9,
            }}
          >
            📍 <strong>Localização exata (opcional)</strong>
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              Ajuda o entregador a abrir sua rota no Waze/Maps com 1 clique.
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <button
                onClick={getMyLocation}
                disabled={gettingLocation}
                style={{
                  width: "100%",
                  border: "2px solid #E44F2A",
                  borderRadius: 16,
                  padding: "12px 14px",
                  fontSize: 15,
                  fontWeight: 900,
                  cursor: gettingLocation ? "not-allowed" : "pointer",
                  background: "#fff",
                  color: "#E44F2A",
                  opacity: gettingLocation ? 0.7 : 1,
                }}
                type="button"
              >
                {gettingLocation ? "Obtendo localização..." : "Usar minha localização"}
              </button>

              {hasLocation && (
                <div
                  style={{
                    borderRadius: 14,
                    padding: 12,
                    border: "1px solid rgba(0,0,0,0.08)",
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 900, color: "#2E7D32" }}>Localização capturada ✅</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                    Lat: {lat?.toFixed(6)} • Lng: {lng?.toFixed(6)}
                  </div>

                  <button
                    onClick={clearLocation}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      border: "1px solid rgba(0,0,0,0.10)",
                      borderRadius: 14,
                      padding: "10px 12px",
                      background: "#fff",
                      fontWeight: 800,
                      cursor: "pointer",
                      color: "#444",
                    }}
                    type="button"
                  >
                    Remover localização
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ height: 14 }} />

          <div
            style={{
              padding: 12,
              borderRadius: 14,
              background: "rgba(0,0,0,0.03)",
              fontSize: 13,
              lineHeight: 1.35,
              opacity: 0.85,
            }}
          >
            💡 Dica: o <strong>apelido</strong> ajuda você a escolher rápido no finalizar pedido.
          </div>

          <div style={{ height: 14 }} />

          <button
            onClick={save}
            disabled={!canSave}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 16,
              padding: "14px 16px",
              fontSize: 16,
              fontWeight: 700,
              cursor: canSave ? "pointer" : "not-allowed",
              opacity: canSave ? 1 : 0.55,
              background: "linear-gradient(90deg, #E44F2A, #F7A212)",
              color: "#fff",
              boxShadow: "0 10px 26px rgba(228,79,42,0.25)",
            }}
            type="button"
          >
            Salvar endereço
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
  onChange: (v: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
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
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        style={{
          width: "100%",
          height: 48,
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.10)",
          padding: "0 14px",
          fontSize: 16,
          outline: "none",
          background: "#fff",
        }}
      />
    </div>
  );
}