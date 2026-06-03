import EntregadorLayout from "../../layouts/EntregadorLayout";
import PageHeader from "../../components/PageHeader";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useEntregadorStore } from "../../store/useEntregadorStore";
import { useRemoteSyncStore } from "../../store/useRemoteSyncStore";
import { financeService } from "../../services/financeService";
import { money } from "../../utils/delivererHelpers";
import { useEffectiveEntregadorId } from "../../hooks/useEffectiveEntregadorId";
import {
  primaryButtonStyle,
  sectionCardStyle,
  ui,
} from "../../styles/ui";
import { saveDelivererProfilePatch } from "../../services/remoteUserStateService";
import { emitToast } from "../../services/realtimeBus";
import {
  delivererAccessService,
  getDelivererAccessSession,
  type DelivererApplication,
} from "../../services/delivererAccessService";
import {
  buildCentralSupportLink,
  formatCentralSupportPhone,
} from "../../utils/centralSupport";

function safeGet(key: string, fallback = "") {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v : fallback;
  } catch {
    return fallback;
  }
}

function useViewportWidth() {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return width;
}

export default function EntregadorConta() {
  const entregadorId = useEffectiveEntregadorId();
  const publicVersion = useRemoteSyncStore((s) => s.publicVersion);
  const financeVersion = useRemoteSyncStore((s) => s.financeVersion);
  const online = useEntregadorStore((s) => s.isOnline);
  const ensureEntregadorId = useEntregadorStore((s) => s.ensureEntregadorId);
  const hydrateOnlineStatus = useEntregadorStore((s) => s.hydrateOnlineStatus);
  const viewportWidth = useViewportWidth();
  const isCompact = viewportWidth < 420;
  const isTwoColumn = viewportWidth >= 640;
  const isOverviewSplit = viewportWidth >= 700;

  const [nome, setNome] = useState(() => safeGet("cg_deliverer_name", "Entregador"));
  const [telefone, setTelefone] = useState(() => safeGet("cg_deliverer_phone", "61"));
  const [veiculo, setVeiculo] = useState(() => safeGet("cg_deliverer_vehicle", ""));
  const [placa, setPlaca] = useState(() => safeGet("cg_deliverer_plate", ""));
  const [cidade, setCidade] = useState(() => safeGet("cg_deliverer_city", "Guara / DF"));
  const [pixInfo, setPixInfo] = useState(() =>
    safeGet("cg_admin_pix_info", "Os dados de repasse serao informados pelo ADM.")
  );
  const [applicant, setApplicant] = useState<DelivererApplication | null>(null);
  const [loadingApplicant, setLoadingApplicant] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(() =>
    delivererAccessService.getBiometricPreference()
  );
  const [recoveryPreference, setRecoveryPreference] = useState<
    "email" | "whatsapp"
  >(() => delivererAccessService.getRecoveryPreference());
  const centralSupportLink = useMemo(
    () =>
      buildCentralSupportLink({
        role: "entregador",
        name: nome,
        phone: telefone,
        context: "Suporte da conta do entregador",
      }),
    [nome, telefone]
  );

  const financeState = useMemo(
    () => financeService.getDelivererState(entregadorId),
    [entregadorId, publicVersion, financeVersion]
  );

  useEffect(() => {
    ensureEntregadorId();
    void hydrateOnlineStatus();
  }, [ensureEntregadorId, hydrateOnlineStatus]);

  useEffect(() => {
    let active = true;

    async function loadApplicant() {
      setLoadingApplicant(true);
      try {
        const session = getDelivererAccessSession();
        if (!session?.applicationId) {
          if (active) setApplicant(null);
          return;
        }

        const nextApplicant = await delivererAccessService.getApplication(
          session.applicationId
        );
        if (active) {
          setApplicant(nextApplicant);
        }
      } catch {
        if (active) {
          setApplicant(null);
        }
      } finally {
        if (active) {
          setLoadingApplicant(false);
        }
      }
    }

    void loadApplicant();
    return () => {
      active = false;
    };
  }, []);

  const initials = useMemo(() => {
    const clean = (nome || "Entregador").trim();
    const parts = clean.split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }, [nome]);

  const overviewGridStyle = useMemo<CSSProperties>(
    () => ({
      display: "grid",
      gap: 14,
      alignItems: "start",
      gridTemplateColumns: isOverviewSplit
        ? "minmax(0, 1.2fr) minmax(250px, 0.8fr)"
        : "1fr",
    }),
    [isOverviewSplit]
  );

  const stackedCardsStyle = useMemo<CSSProperties>(
    () => ({
      display: "grid",
      gap: 14,
      alignContent: "start",
    }),
    []
  );

  const pairedSectionGridStyle = useMemo<CSSProperties>(
    () => ({
      display: "grid",
      gap: 14,
      alignItems: "start",
      gridTemplateColumns: isOverviewSplit ? "repeat(2, minmax(0, 1fr))" : "1fr",
    }),
    [isOverviewSplit]
  );

  const formGridStyle = useMemo<CSSProperties>(
    () => ({
      ...fieldsGrid,
      gridTemplateColumns: isTwoColumn ? "repeat(2, minmax(0, 1fr))" : "1fr",
      alignItems: "start",
    }),
    [isTwoColumn]
  );

  function persist(
    patch: Parameters<typeof saveDelivererProfilePatch>[0],
    value: string,
    setter: (v: string) => void
  ) {
    setter(value);
    saveDelivererProfilePatch(patch);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      emitToast("Copiado", "Informação copiada com sucesso.", "success");
    } catch {
      emitToast("Falha ao copiar", "Não consegui copiar essa informação.", "warning");
    }
  }

  function toggleBiometric() {
    const next = !biometricEnabled;
    setBiometricEnabled(next);
    delivererAccessService.setBiometricPreference(next);
    emitToast(
      next ? "Digital ativada" : "Digital desativada",
      next
        ? "A preferencia de acesso rapido ficou salva neste aparelho."
        : "A preferencia de digital foi desligada neste aparelho.",
      "success"
    );
  }

  function changeRecovery(channel: "email" | "whatsapp") {
    setRecoveryPreference(channel);
    delivererAccessService.setRecoveryPreference(channel);
  }

  return (
    <EntregadorLayout>
      <div style={{ display: "grid", gap: 14 }}>
        <PageHeader title="Conta" subtitle="Perfil, cadastro e repasse" />

        <div style={overviewGridStyle}>
          <div style={{ ...heroCard, alignItems: isCompact ? "flex-start" : "center" }}>
            <div style={avatar}>{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={profileName}>{nome || "Entregador"}</div>
              <div style={profileMeta}>ID: {entregadorId}</div>
              <div style={profileMeta}>Status: {online ? "Disponivel" : "Offline"}</div>
            </div>
          </div>

          <div style={stackedCardsStyle}>
            <div style={darkCard}>
              <div style={darkTitle}>Resumo financeiro</div>
              <Row label="Comissão do app" value={money(financeState.saldoDevedor)} />
              <Row
                label="Limite de bloqueio"
                value={money(financeState.limiteBloqueio)}
              />
              <Row
                label="Situação"
                value={financeState.bloqueado ? "Bloqueado" : "Normal"}
              />
            </div>

            <div style={sectionCard}>
              <div style={sectionTitle}>Atalhos</div>
              <button
                onClick={() => (window.location.href = "/entregador/ganhos")}
                style={primaryBtn}
                type="button"
              >
                Abrir ganhos
              </button>
            </div>
          </div>
        </div>

        <div style={pairedSectionGridStyle}>
          <div style={sectionCard}>
            <div style={sectionTitle}>Cadastro principal</div>
            <div style={formGridStyle}>
              <label style={fieldWrap}>
                <span style={fieldLabel}>Nome</span>
                <input
                  value={nome}
                  onChange={(e) => persist({ nome: e.target.value }, e.target.value, setNome)}
                  style={fieldInput}
                />
              </label>
              <label style={fieldWrap}>
                <span style={fieldLabel}>Telefone</span>
                <input
                  value={telefone}
                  onChange={(e) =>
                    persist({ telefone: e.target.value }, e.target.value, setTelefone)
                  }
                  style={fieldInput}
                />
              </label>
              <label style={{ ...fieldWrap, ...(isTwoColumn ? fullSpanStyle : null) }}>
                <span style={fieldLabel}>Cidade base</span>
                <input
                  value={cidade}
                  onChange={(e) =>
                    persist({ cidade: e.target.value }, e.target.value, setCidade)
                  }
                  style={fieldInput}
                />
              </label>
              {loadingApplicant ? (
                <div style={{ ...loadingBox, ...(isTwoColumn ? fullSpanStyle : null) }}>
                  Carregando cadastro documental...
                </div>
              ) : applicant ? (
                <>
                  <ReadOnlyField label="Email de acesso" value={applicant.email} />
                  <ReadOnlyField label="CPF" value={applicant.cpf} />
                  <ReadOnlyField label="RG" value={applicant.rg} />
                  <ReadOnlyField label="Nascimento" value={applicant.birthDate} />
                  <ReadOnlyField
                    label="Endereço completo"
                    value={applicant.address}
                    fullWidth={isTwoColumn}
                  />
                  <ReadOnlyField
                    label="Status do cadastro"
                    value={
                      applicant.status === "approved"
                        ? "Aprovado"
                        : applicant.status === "rejected"
                        ? "Ajuste solicitado"
                        : "Em analise"
                    }
                  />
                </>
              ) : (
                <div style={{ ...emptyBox, ...(isTwoColumn ? fullSpanStyle : null) }}>
                  Nenhum cadastro documental sincronizado neste momento.
                </div>
              )}
            </div>
          </div>

          <div style={sectionCard}>
            <div style={sectionTitle}>Veículo</div>
            <div style={formGridStyle}>
              <label style={fieldWrap}>
                <span style={fieldLabel}>Modelo</span>
                <input
                  value={veiculo}
                  onChange={(e) =>
                    persist({ veiculo: e.target.value }, e.target.value, setVeiculo)
                  }
                  style={fieldInput}
                />
              </label>
              <label style={fieldWrap}>
                <span style={fieldLabel}>Placa</span>
                <input
                  value={placa}
                  onChange={(e) =>
                    persist(
                      { placa: e.target.value.toUpperCase() },
                      e.target.value.toUpperCase(),
                      setPlaca
                    )
                  }
                  style={fieldInput}
                />
              </label>
              {applicant ? (
                <>
                  <ReadOnlyField label="Tipo" value={applicant.vehicleType} />
                  <ReadOnlyField label="Marca" value={applicant.vehicleBrand} />
                  <ReadOnlyField label="Modelo cadastrado" value={applicant.vehicleModel} />
                  <ReadOnlyField label="RENAVAM" value={applicant.renavam} />
                  <ReadOnlyField
                    label="CNH enviada"
                    value={applicant.cnhUpload?.name || "Não enviado"}
                    fullWidth={isTwoColumn}
                  />
                  <ReadOnlyField
                    label="CRLV digital enviado"
                    value={applicant.crlvUpload?.name || "Não enviado"}
                    fullWidth={isTwoColumn}
                  />
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div style={pairedSectionGridStyle}>
          <div style={sectionCard}>
            <div style={sectionTitle}>Acesso e recuperação</div>
            <div style={supportGrid}>
              <div
                style={{
                  ...toggleRow,
                  alignItems: isCompact ? "stretch" : "center",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={toggleTitle}>Entrar com digital</div>
                  <div style={toggleHint}>Ative para entrar mais rápido neste aparelho.</div>
                </div>
                <button
                  onClick={toggleBiometric}
                  style={{
                    ...toggleBtn,
                    marginLeft: isCompact ? 0 : "auto",
                    background: biometricEnabled
                      ? "rgba(228,79,42,0.15)"
                      : "rgba(0,0,0,0.05)",
                  }}
                  type="button"
                >
                  <span
                    style={{
                      ...toggleThumb,
                      left: biometricEnabled ? 26 : 4,
                      background: biometricEnabled ? "#E44F2A" : "#bbb",
                    }}
                  />
                </button>
              </div>

              <label style={fieldWrap}>
                <span style={fieldLabel}>Canal de recuperação</span>
                <select
                  value={recoveryPreference}
                  onChange={(e) =>
                    changeRecovery(e.target.value as "email" | "whatsapp")
                  }
                  style={fieldInput}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                </select>
              </label>

              <div style={helperBox}>
                Se precisar recuperar a senha, escolha o canal preferido e fale
                com o atendimento.
              </div>
            </div>
          </div>

          <div style={darkCard}>
            <div style={darkTitle}>Repasse e Pix</div>
            <textarea
              value={pixInfo}
              onChange={(e) =>
                persist({ pixInfo: e.target.value }, e.target.value, setPixInfo)
              }
              style={pixBox}
            />
            <div style={pixActions}>
              <button onClick={() => copyText(pixInfo)} style={primaryBtn} type="button">
                Receber via Pix
              </button>
              <button onClick={() => copyText(pixInfo)} style={secondaryBtn} type="button">
                Copiar dados
              </button>
            </div>
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Central de ajuda</div>
          <div style={helperBox}>
            WhatsApp da Central: <strong>{formatCentralSupportPhone()}</strong>
          </div>
          <a
            href={centralSupportLink}
            target="_blank"
            rel="noreferrer"
            style={helpLinkBtn}
          >
            Falar com suporte no WhatsApp
          </a>
          <div style={helpItem}>Perfil e dados do entregador</div>
          <div style={helpItem}>Regras de bloqueio por comissão do app</div>
          <div style={helpItem}>Repasse e comprovação de Pix</div>
        </div>
      </div>
    </EntregadorLayout>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <div style={row}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ReadOnlyField(props: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div style={{ ...readOnlyWrap, ...(props.fullWidth ? fullSpanStyle : null) }}>
      <span style={fieldLabel}>{props.label}</span>
      <div style={readOnlyValue}>{props.value}</div>
    </div>
  );
}

const heroCard: CSSProperties = {
  background: "linear-gradient(135deg,#0F172A 0%, #111827 100%)",
  borderRadius: ui.radius.section,
  padding: "clamp(14px, 3vw, 18px)",
  display: "flex",
  gap: "clamp(12px, 3vw, 14px)",
  alignItems: "center",
  flexWrap: "wrap",
  color: "#fff",
  boxShadow: ui.shadow.dark,
};
const avatar: CSSProperties = {
  width: "clamp(56px, 14vw, 74px)",
  height: "clamp(56px, 14vw, 74px)",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  fontWeight: 950,
  fontSize: "clamp(18px, 4vw, 24px)",
  color: "#fff",
  flexShrink: 0,
};
const profileName: CSSProperties = {
  fontSize: "clamp(18px, 5vw, 24px)",
  fontWeight: 950,
  color: "#fff",
};
const profileMeta: CSSProperties = {
  marginTop: 4,
  fontSize: "clamp(11px, 2.5vw, 13px)",
  opacity: 0.84,
  color: "#E5E7EB",
};
const darkCard: CSSProperties = {
  background: "linear-gradient(135deg,#0F172A 0%, #111827 100%)",
  borderRadius: ui.radius.section,
  padding: "clamp(14px, 3vw, 18px)",
  color: "#fff",
  boxShadow: ui.shadow.dark,
};
const darkTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#fff",
};
const row: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "clamp(10px, 3vw, 12px)",
  marginTop: "clamp(10px, 2.5vw, 12px)",
  color: "#E5E7EB",
  flexWrap: "wrap",
};
const sectionCard: CSSProperties = {
  ...sectionCardStyle(),
};
const sectionTitle: CSSProperties = {
  fontSize: "clamp(14px, 3.5vw, 16px)",
  fontWeight: 950,
  color: "#111827",
};
const fieldsGrid: CSSProperties = {
  marginTop: "clamp(10px, 2.5vw, 12px)",
  display: "grid",
  gap: "clamp(10px, 2.5vw, 12px)",
};
const fieldWrap: CSSProperties = {
  display: "grid",
  gap: 6,
};
const fieldLabel: CSSProperties = {
  fontSize: "clamp(12px, 2.5vw, 13px)",
  fontWeight: 900,
  color: "#111827",
};
const fieldInput: CSSProperties = {
  height: "clamp(42px, 10vw, 46px)",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  padding: "0 clamp(10px, 2vw, 14px)",
  fontWeight: 800,
  color: "#111827",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  fontSize: "clamp(14px, 3vw, 15px)",
};
const readOnlyWrap: CSSProperties = {
  display: "grid",
  gap: 6,
};
const fullSpanStyle: CSSProperties = {
  gridColumn: "1 / -1",
};
const readOnlyValue: CSSProperties = {
  minHeight: "clamp(42px, 10vw, 46px)",
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#F8FAFC",
  padding: "clamp(10px, 2vw, 12px) clamp(12px, 3vw, 14px)",
  fontWeight: 800,
  color: "#111827",
  lineHeight: 1.45,
  fontSize: "clamp(14px, 3vw, 15px)",
  overflowWrap: "anywhere",
};
const pixBox: CSSProperties = {
  marginTop: "clamp(10px, 2.5vw, 12px)",
  width: "100%",
  minHeight: "clamp(100px, 24vw, 130px)",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.08)",
  padding: "clamp(10px, 2vw, 14px)",
  fontWeight: 700,
  color: "#fff",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
  fontSize: "clamp(14px, 3vw, 15px)",
};
const pixActions: CSSProperties = {
  marginTop: "clamp(10px, 2vw, 12px)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
  gap: "clamp(8px, 2vw, 10px)",
};
const primaryBtn: CSSProperties = {
  ...primaryButtonStyle({ width: "100%", minHeight: 46 }),
};
const secondaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#FFFFFF",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: ui.shadow.soft,
  transition: "transform .2s ease, box-shadow .2s ease",
};
const helpLinkBtn: CSSProperties = {
  ...primaryBtn,
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
};
const helpItem: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
  color: "#334155",
  fontWeight: 700,
};
const supportGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 12,
};
const toggleRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "clamp(10px, 2vw, 12px)",
  alignItems: "center",
  flexWrap: "wrap",
};
const toggleTitle: CSSProperties = {
  fontWeight: 900,
  color: "#111827",
};
const toggleHint: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
};
const toggleBtn: CSSProperties = {
  width: "clamp(44px, 12vw, 52px)",
  height: "clamp(26px, 8vw, 30px)",
  borderRadius: 999,
  border: "none",
  position: "relative",
  cursor: "pointer",
};
const toggleThumb: CSSProperties = {
  position: "absolute",
  top: 4,
  width: 22,
  height: 22,
  borderRadius: "50%",
  transition: "all .2s ease",
};
const helperBox: CSSProperties = {
  borderRadius: 16,
  padding: "clamp(10px, 2vw, 12px)",
  background: "rgba(228,79,42,0.06)",
  border: "1px solid rgba(228,79,42,0.12)",
  color: "#7C2D12",
  lineHeight: 1.55,
  fontSize: "clamp(12px, 2.5vw, 13px)",
};
const loadingBox: CSSProperties = {
  borderRadius: 16,
  padding: 12,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
  color: "#475569",
  lineHeight: 1.45,
};
const emptyBox: CSSProperties = {
  borderRadius: 16,
  padding: 12,
  background: "#FFFBEB",
  border: "1px solid rgba(245,158,11,0.16)",
  color: "#92400E",
  lineHeight: 1.45,
};
