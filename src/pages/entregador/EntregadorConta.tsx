import EntregadorLayout from "../../layouts/EntregadorLayout";
import PageHeader from "../../components/PageHeader";
import { useMemo, useState, type CSSProperties } from "react";
import { useEntregadorStore } from "../../store/useEntregadorStore";
import { financeService } from "../../services/financeService";
import { money } from "../../utils/delivererHelpers";

function safeGet(key: string, fallback = "") {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export default function EntregadorConta() {
  const entregadorId = useEntregadorStore((s) => s.entregadorId);
  const online = useEntregadorStore((s) => s.online);

  const [nome, setNome] = useState(() => safeGet("cg_deliverer_name", "Entregador"));
  const [telefone, setTelefone] = useState(() => safeGet("cg_deliverer_phone", "61"));
  const [veiculo, setVeiculo] = useState(() => safeGet("cg_deliverer_vehicle", ""));
  const [placa, setPlaca] = useState(() => safeGet("cg_deliverer_plate", ""));
  const [cidade, setCidade] = useState(() => safeGet("cg_deliverer_city", "Guará / DF"));
  const [pixInfo, setPixInfo] = useState(() => safeGet("cg_admin_pix_info", "PIX do app será informado pelo ADM."));

  const initials = useMemo(() => {
    const clean = (nome || "Entregador").trim();
    const parts = clean.split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }, [nome]);

  const financeState = useMemo(() => financeService.getDelivererState(entregadorId), [entregadorId]);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Informação copiada ✅");
    } catch {
      alert("Não consegui copiar.");
    }
  }

  return (
    <EntregadorLayout>
      <div style={{ display: "grid", gap: 14 }}>
        <PageHeader
          title="Conta"
          subtitle="Perfil, operação e financeiro do entregador"
        />

        <div style={heroCard}>
          <div style={avatar}>{initials}</div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={profileName}>{nome || "Entregador"}</div>
            <div style={profileMeta}>ID: {entregadorId}</div>
            <div style={profileMeta}>Status: {online ? "Online" : "Offline"}</div>
            <div style={profileMeta}>Cidade base: {cidade || "Não informado"}</div>
          </div>
        </div>

        <div
          style={{
            ...financeAlert,
            background: financeState.bloqueado
              ? "rgba(185,28,28,0.08)"
              : "rgba(245,158,11,0.10)",
            border: financeState.bloqueado
              ? "1px solid rgba(185,28,28,0.16)"
              : "1px solid rgba(245,158,11,0.20)",
            color: financeState.bloqueado ? "#7F1D1D" : "#92400E",
          }}
        >
          <strong>Saldo pendente:</strong> {money(financeState.saldoDevedor)}
          <br />
          {financeState.bloqueado
            ? "Você está bloqueado até regularizar o pagamento via Pix."
            : `Evite atingir o limite de bloqueio de ${money(financeState.limiteBloqueio)}.`}
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Meu perfil</div>

          <div style={fieldsGrid}>
            <label style={fieldWrap}>
              <span style={fieldLabel}>Nome</span>
              <input
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  safeSet("cg_deliverer_name", e.target.value);
                }}
                placeholder="Seu nome"
                style={fieldInput}
              />
            </label>

            <label style={fieldWrap}>
              <span style={fieldLabel}>Telefone (WhatsApp)</span>
              <input
                value={telefone}
                onChange={(e) => {
                  setTelefone(e.target.value);
                  safeSet("cg_deliverer_phone", e.target.value);
                }}
                placeholder="Ex.: 61999999999"
                style={fieldInput}
              />
            </label>

            <label style={fieldWrap}>
              <span style={fieldLabel}>Cidade / área principal</span>
              <input
                value={cidade}
                onChange={(e) => {
                  setCidade(e.target.value);
                  safeSet("cg_deliverer_city", e.target.value);
                }}
                placeholder="Ex.: Guará / DF"
                style={fieldInput}
              />
            </label>
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Veículo</div>

          <div style={fieldsGrid}>
            <label style={fieldWrap}>
              <span style={fieldLabel}>Modelo / descrição</span>
              <input
                value={veiculo}
                onChange={(e) => {
                  setVeiculo(e.target.value);
                  safeSet("cg_deliverer_vehicle", e.target.value);
                }}
                placeholder="Ex.: Moto CG 160"
                style={fieldInput}
              />
            </label>

            <label style={fieldWrap}>
              <span style={fieldLabel}>Placa</span>
              <input
                value={placa}
                onChange={(e) => {
                  const upper = e.target.value.toUpperCase();
                  setPlaca(upper);
                  safeSet("cg_deliverer_plate", upper);
                }}
                placeholder="ABC1D23"
                style={fieldInput}
              />
            </label>
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Repasse / Pix do app</div>

          <div style={{ marginTop: 12, color: "#475569", lineHeight: 1.6 }}>
            Quando houver saldo pendente, regularize o repasse para continuar operando normalmente.
          </div>

          <textarea
            value={pixInfo}
            onChange={(e) => {
              setPixInfo(e.target.value);
              safeSet("cg_admin_pix_info", e.target.value);
            }}
            style={pixBox}
          />

          <button
            onClick={() => copyText(pixInfo)}
            style={copyBtn}
            type="button"
          >
            Copiar informação do Pix
          </button>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Resumo operacional</div>

          <div style={summaryGrid}>
            <div style={summaryItem}>
              <div style={summaryLabel}>Status</div>
              <div style={summaryValue}>{online ? "Online" : "Offline"}</div>
            </div>

            <div style={summaryItem}>
              <div style={summaryLabel}>Identificação</div>
              <div style={summaryValue}>{entregadorId}</div>
            </div>

            <div style={summaryItem}>
              <div style={summaryLabel}>Veículo</div>
              <div style={summaryValue}>{veiculo || "Não informado"}</div>
            </div>

            <div style={summaryItem}>
              <div style={summaryLabel}>Placa</div>
              <div style={summaryValue}>{placa || "Não informada"}</div>
            </div>
          </div>
        </div>

        <div style={obsCard}>
          <div style={sectionTitle}>Observação</div>
          <div style={sectionText}>
            Cancelamentos feitos pelo entregador ficam auditáveis. Entregas concluídas geram comissão fixa do app.
          </div>
        </div>
      </div>
    </EntregadorLayout>
  );
}

const heroCard: CSSProperties = {
  background: "linear-gradient(135deg,#0F172A 0%, #111827 55%, #1F2937 100%)",
  borderRadius: 24,
  padding: 16,
  display: "flex",
  gap: 14,
  alignItems: "center",
  color: "#fff",
  boxShadow: "0 16px 40px rgba(0,0,0,0.20)",
};

const avatar: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  fontWeight: 950,
  fontSize: 22,
  color: "#fff",
  flexShrink: 0,
};

const profileName: CSSProperties = {
  fontSize: 22,
  fontWeight: 950,
  color: "#fff",
};

const profileMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  opacity: 0.84,
  color: "#E5E7EB",
};

const financeAlert: CSSProperties = {
  borderRadius: 20,
  padding: 14,
  lineHeight: 1.6,
  fontWeight: 800,
};

const sectionCard: CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const obsCard: CSSProperties = {
  background: "rgba(228,79,42,0.05)",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(228,79,42,0.14)",
};

const sectionTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const sectionText: CSSProperties = {
  marginTop: 12,
  fontSize: 14,
  color: "#475569",
  lineHeight: 1.6,
};

const fieldsGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 12,
};

const fieldWrap: CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#111827",
};

const fieldInput: CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  padding: "0 14px",
  fontWeight: 800,
  color: "#111827",
  outline: "none",
};

const pixBox: CSSProperties = {
  marginTop: 12,
  width: "100%",
  minHeight: 110,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  padding: 14,
  fontWeight: 700,
  color: "#111827",
  outline: "none",
  resize: "vertical",
};

const copyBtn: CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(228,79,42,0.22)",
  background: "rgba(228,79,42,0.06)",
  color: "#E44F2A",
  fontWeight: 950,
  cursor: "pointer",
};

const summaryGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const summaryItem: CSSProperties = {
  background: "#F8FAFC",
  borderRadius: 18,
  padding: 12,
  border: "1px solid rgba(15,23,42,0.06)",
};

const summaryLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const summaryValue: CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  fontWeight: 900,
  color: "#111827",
  wordBreak: "break-word",
};