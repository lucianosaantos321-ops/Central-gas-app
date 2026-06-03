import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PasswordInput from "../components/PasswordInput";
import Layout from "../layout";
import { useRemoteSyncStore } from "../store/useRemoteSyncStore";
import { getAddresses } from "../services/addressStore";
import {
  getGasEstimateSetup,
  setGasUsageProfile,
  syncGasTank,
} from "../services/gasTank";
import { saveClientProfilePatch } from "../services/remoteUserStateService";
import {
  clearClientAccessSession,
  clientAccessService,
  getClientAccessSession,
  saveClientAccessSession,
  type ClientAccessSession,
} from "../services/clientAccessService";
import { supabase } from "../services/supabase";
import {
  buildCentralSupportLink,
  formatCentralSupportPhone,
} from "../utils/centralSupport";
import {
  readLocalUserDocumentPayload,
  type ClientProfileDocument,
} from "../services/userStateSchemas";

function safeGet(key: string, fallback: string) {
  try {
    const value = localStorage.getItem(key);
    return value && value.trim() ? value : fallback;
  } catch {
    return fallback;
  }
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CG";
  const a = parts[0]?.[0] ?? "C";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "G" : "G";
  return (a + b).toUpperCase();
}

function normalizeDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function maskCpf(value: string) {
  const digits = normalizeDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function maskPhone(value: string) {
  const digits = normalizeDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

type ModalState =
  | null
  | {
      title: string;
      body: string;
      cta?: string;
      onCta?: () => void;
    };

type AccessMode = "login" | "register";
type RegisterStep = 0 | 1 | 2 | 3 | 4 | 5;

type RegisterState = {
  fullName: string;
  birthDate: string;
  cpf: string;
  whatsapp: string;
  email: string;
  password: string;
  confirmPassword: string;
};

function normalizeReturnTo(value: unknown) {
  const target = String(value || "").trim();
  if (!target.startsWith("/")) return "/";
  if (target.startsWith("/admin") || target.startsWith("/entregador")) return "/";
  if (target === "/conta") return "/";
  return target || "/";
}

export default function ContaCliente() {
  const navigate = useNavigate();
  const location = useLocation();
  const publicVersion = useRemoteSyncStore((s) => s.publicVersion);
  const initialClientProfile = useMemo(
    () =>
      readLocalUserDocumentPayload("client_profile") as ClientProfileDocument,
    []
  );
  const [notifsPedido, setNotifsPedido] = useState(
    Boolean(initialClientProfile.notifsPedido ?? true)
  );
  const [notifsGas, setNotifsGas] = useState(
    Boolean(initialClientProfile.notifsGas ?? true)
  );

  const [nome, setNome] = useState(() => initialClientProfile.nome || "Cliente");
  const [telefone, setTelefone] = useState(() =>
    maskPhone(initialClientProfile.telefone || "")
  );
  const [email, setEmail] = useState(() => initialClientProfile.email || "");
  const [cpf, setCpf] = useState(() => maskCpf(initialClientProfile.cpf || ""));
  const [nascimento, setNascimento] = useState(
    () => initialClientProfile.nascimento || ""
  );

  const initialGasSetup = useMemo(() => getGasEstimateSetup(), []);
  const [averageMonths, setAverageMonths] = useState(() =>
    Math.floor(initialGasSetup.average_duration_days / 30)
  );
  const [averageDays, setAverageDays] = useState(
    () => initialGasSetup.average_duration_days % 30
  );
  const [daysSinceLastExchange, setDaysSinceLastExchange] = useState(
    () => initialGasSetup.days_since_last_exchange
  );
  const [gasConfigured, setGasConfigured] = useState(
    () => initialGasSetup.configured
  );

  const referralCode = useMemo(() => {
    if (initialClientProfile.referralCode) return initialClientProfile.referralCode;
    const existing = safeGet("cg_ref_code", "");
    if (existing) return existing;
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `CG${rand}`;
  }, [initialClientProfile.referralCode]);
  const returnTo = useMemo(
    () =>
      normalizeReturnTo(
        (location.state as { returnTo?: unknown } | null)?.returnTo
      ),
    [location.state]
  );

  const initials = getInitials(nome);
  const [modal, setModal] = useState<ModalState>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("login");
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [registerStep, setRegisterStep] = useState<RegisterStep>(0);
  const [loginPhone, setLoginPhone] = useState(() =>
    maskPhone(initialClientProfile.telefone || "")
  );
  const [loginPassword, setLoginPassword] = useState("");
  const [registerForm, setRegisterForm] = useState<RegisterState>(() => ({
    fullName: initialClientProfile.nome || "",
    birthDate: initialClientProfile.nascimento || "",
    cpf: maskCpf(initialClientProfile.cpf || ""),
    whatsapp: maskPhone(initialClientProfile.telefone || ""),
    email: initialClientProfile.email || "",
    password: "",
    confirmPassword: "",
  }));
  const [accessSession, setAccessSession] = useState<ClientAccessSession | null>(
    () => getClientAccessSession()
  );
  const [passwordForm, setPasswordForm] = useState({
    nextPassword: "",
    confirmPassword: "",
  });
  const loginPhoneEditedRef = useRef(false);
  const registerEditedRef = useRef(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showPasswordEditor, setShowPasswordEditor] = useState(false);
  const [isEditingGasSetup, setIsEditingGasSetup] = useState(false);
  const [profileError, setProfileError] = useState("");
  const centralSupportLink = useMemo(
    () =>
      buildCentralSupportLink({
        role: "cliente",
        name: accessSession?.fullName || nome,
        phone: accessSession?.phone || telefone,
        context: "Suporte da conta do cliente",
      }),
    [accessSession?.fullName, accessSession?.phone, nome, telefone]
  );

  function openSoon(
    title: string,
    body: string,
    cta?: string,
    onCta?: () => void
  ) {
    setModal({ title, body, cta, onCta });
  }

  function updateRegister<K extends keyof RegisterState>(
    key: K,
    value: RegisterState[K]
  ) {
    registerEditedRef.current = true;
    setRegisterForm((current) => ({ ...current, [key]: value }));
  }

  function openLoginFlow() {
    setAccessError("");
    setAccessMode("login");
  }

  function openRegisterFlow(step: RegisterStep = 0) {
    setAccessError("");
    setAccessMode("register");
    setRegisterStep(step);
  }

  function validateRegisterStep(step: RegisterStep) {
    switch (step) {
      case 0:
        return registerForm.fullName.trim()
          ? ""
          : "Informe seu nome completo para continuar.";
      case 1:
        return registerForm.birthDate
          ? ""
          : "Informe sua data de nascimento.";
      case 2:
        return normalizeDigits(registerForm.cpf).length === 11
          ? ""
          : "Informe um CPF válido.";
      case 3:
        return normalizeDigits(registerForm.whatsapp).length >= 10
          ? ""
          : "Informe um celular com DDD.";
      case 4:
        return registerForm.email.trim() &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email.trim())
          ? "Informe um e-mail válido ou deixe em branco."
          : "";
      case 5:
        if (String(registerForm.password || "").trim().length < 6) {
          return "Crie uma senha com pelo menos 6 caracteres.";
        }
        if (registerForm.password !== registerForm.confirmPassword) {
          return "Confirme a senha exatamente igual.";
        }
        return "";
      default:
        return "";
    }
  }

  function goToNextRegisterStep() {
    const issue = validateRegisterStep(registerStep);
    if (issue) {
      setAccessError(issue);
      return;
    }

    setAccessError("");
    setRegisterStep((current) => Math.min(current + 1, 5) as RegisterStep);
  }

  function goToPreviousRegisterStep() {
    setAccessError("");
    setRegisterStep((current) => Math.max(current - 1, 0) as RegisterStep);
  }

  function enterClientApp(options?: { requireAddress?: boolean }) {
    if (options?.requireAddress) {
      const hasSavedAddress = getAddresses().length > 0;
      if (!hasSavedAddress) {
        navigate("/add-address", {
          replace: true,
          state: { returnTo },
        });
        return;
      }
    }

    navigate(returnTo, { replace: true });
  }

  function openCentralSupport() {
    if (typeof window === "undefined") return;
    window.open(centralSupportLink, "_blank", "noopener,noreferrer");
  }

  function handleForgotPassword() {
    openSoon(
      "Recuperação de senha",
      "Para recuperar o acesso com segurança, fale com a Central no WhatsApp e informe o número usado no cadastro.",
      "Falar com suporte",
      openCentralSupport
    );
  }

  async function copyReferralMessage() {
    const text = [
      "Ganhe R$10 de desconto no seu gás com a Central Gás.",
      `Use meu código ${referralCode} no cadastro. Seu amigo ganha no primeiro pedido e eu também ganho um benefício na indicação.`,
      "Baixe o app aqui:",
      `https://centralgas.app/convite?codigo=${referralCode}`,
    ].join("\n");

    try {
      await navigator.clipboard?.writeText(text);
      openSoon(
        "Mensagem copiada",
        "A mensagem com link e código já ficou pronta para você enviar no WhatsApp."
      );
    } catch {
      openSoon("Não deu para copiar", text);
    }
  }

  function saveGasEstimate() {
    const tank = applyGasEstimateProfile();
    openSoon(
      "Estimativa atualizada",
      `Seu gás está estimado em ${Math.round(
        tank.current_level
      )}% e a previsão de término é ${new Date(tank.finish_date).toLocaleDateString(
        "pt-BR"
      )}.`
    );
  }

  function saveGasEstimateAndClose() {
    saveGasEstimate();
    setIsEditingGasSetup(false);
  }

  function cancelGasEstimateEdit() {
    const setup = getGasEstimateSetup();
    setAverageMonths(Math.floor(setup.average_duration_days / 30));
    setAverageDays(setup.average_duration_days % 30);
    setDaysSinceLastExchange(setup.days_since_last_exchange);
    setGasConfigured(setup.configured);
    setIsEditingGasSetup(false);
  }

  function applyGasEstimateProfile() {
    const averageDurationDays = Math.max(
      1,
      averageMonths * 30 + Math.max(0, Number(averageDays || 0))
    );
    const elapsed = Math.max(
      0,
      Math.min(averageDurationDays, Math.round(daysSinceLastExchange))
    );

    setGasUsageProfile({
      averageDurationDays,
      daysSinceLastExchange: elapsed,
    });

    setGasConfigured(true);
    return syncGasTank();
  }

  function updateBool(key: string, value: boolean, setter: (next: boolean) => void) {
    setter(value);
    if (key === "cg_notifs_pedido") {
      saveClientProfilePatch({ notifsPedido: value });
      return;
    }
    saveClientProfilePatch({ notifsGas: value });
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accessLoading) return;

    const issue = validateRegisterStep(5);
    if (issue) {
      setAccessError(issue);
      return;
    }

    setAccessLoading(true);
    setAccessError("");

    try {
      const session = await clientAccessService.register(registerForm);
      setAccessSession(session);
      setNome(registerForm.fullName);
      setTelefone(registerForm.whatsapp);
      setEmail(registerForm.email);
      setCpf(maskCpf(registerForm.cpf));
      setNascimento(registerForm.birthDate);
      setLoginPhone(registerForm.whatsapp);
      loginPhoneEditedRef.current = false;
      registerEditedRef.current = false;
      setLoginPassword("");
      enterClientApp({ requireAddress: true });
    } catch (error) {
      setAccessError(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível concluir o cadastro agora."
      );
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accessLoading) return;

    setAccessLoading(true);
    setAccessError("");

    try {
      const session = await clientAccessService.signIn(loginPhone, loginPassword);
      const profile = readLocalUserDocumentPayload(
        "client_profile"
      ) as ClientProfileDocument;
      setAccessSession(session);
      setNome(profile.nome || session.fullName || nome);
      setTelefone(maskPhone(profile.telefone || session.phone || telefone));
      setEmail(profile.email || email);
      setCpf(maskCpf(profile.cpf || cpf));
      setLoginPassword("");
      enterClientApp();
    } catch (error) {
      setAccessError(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível entrar agora."
      );
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleLogout() {
    if (accessLoading) return;

    setAccessLoading(true);
    setAccessError("");

    try {
      await clientAccessService.signOut();
      setAccessSession(null);
      setLoginPassword("");
      loginPhoneEditedRef.current = false;
      registerEditedRef.current = false;
      setAccessMode("login");
      openSoon("Conta desconectada", "Voce saiu da sua conta.");
    } catch (error) {
      setAccessError(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível sair da conta agora."
      );
    } finally {
      setAccessLoading(false);
    }
  }

  async function handlePasswordUpdate(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (accessLoading) return;

    setAccessLoading(true);
    setAccessError("");

    try {
      await clientAccessService.updatePassword(
        passwordForm.nextPassword,
        passwordForm.confirmPassword
      );
      setPasswordForm({
        nextPassword: "",
        confirmPassword: "",
      });
      openSoon(
        "Senha atualizada",
        "Sua senha foi atualizada com sucesso neste aparelho."
      );
    } catch (error) {
      setAccessError(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível atualizar sua senha."
      );
    } finally {
      setAccessLoading(false);
    }
  }

  function restoreProfileFromLocal() {
    const profile = readLocalUserDocumentPayload(
      "client_profile"
    ) as ClientProfileDocument;

    setNome(profile.nome || accessSession?.fullName || "Cliente");
    setTelefone(maskPhone(profile.telefone || accessSession?.phone || ""));
    setEmail(profile.email || "");
    setCpf(maskCpf(profile.cpf || accessSession?.cpf || ""));
    setNascimento(profile.nascimento || "");
  }

  function startProfileEdit() {
    setProfileError("");
    setIsEditingProfile(true);
  }

  function cancelProfileEdit() {
    restoreProfileFromLocal();
    setProfileError("");
    setIsEditingProfile(false);
  }

  function saveProfileEdit() {
    const nextName = nome.trim();
    const nextCpf = normalizeDigits(cpf);
    const nextEmail = email.trim();

    if (!nextName) {
      setProfileError("Informe seu nome completo.");
      return;
    }

    if (nextCpf && nextCpf.length !== 11) {
      setProfileError("Informe um CPF válido.");
      return;
    }

    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setProfileError("Informe um e-mail válido.");
      return;
    }

    saveClientProfilePatch({
      nome: nextName,
      email: nextEmail,
      cpf: nextCpf,
      nascimento,
    });

    setNome(nextName);
    setCpf(maskCpf(nextCpf));
    setEmail(nextEmail);
    setProfileError("");
    setIsEditingProfile(false);
    openSoon("Cadastro atualizado", "Seus dados foram salvos com sucesso.");
  }

  useEffect(() => {
    if (!safeGet("cg_ref_code", "") && referralCode) {
      saveClientProfilePatch({ referralCode });
    }
  }, [referralCode]);

  useEffect(() => {
    const profile = readLocalUserDocumentPayload(
      "client_profile"
    ) as ClientProfileDocument;

    setNotifsPedido(Boolean(profile.notifsPedido ?? true));
    setNotifsGas(Boolean(profile.notifsGas ?? true));
    setNome(profile.nome || accessSession?.fullName || "Cliente");
    setTelefone(maskPhone(profile.telefone || accessSession?.phone || ""));
    setEmail(profile.email || "");
    setCpf(maskCpf(profile.cpf || accessSession?.cpf || ""));
    setNascimento(profile.nascimento || "");

    if (!accessSession) {
      if (!loginPhoneEditedRef.current) {
        setLoginPhone(maskPhone(profile.telefone || ""));
      }

      if (!registerEditedRef.current) {
        setRegisterForm((current) => ({
          ...current,
          fullName: current.fullName || profile.nome || "",
          cpf: current.cpf || maskCpf(profile.cpf || ""),
          whatsapp: current.whatsapp || maskPhone(profile.telefone || ""),
        }));
      }
    }
  }, [
    publicVersion,
    accessSession?.authUserId,
    accessSession?.cpf,
    accessSession?.fullName,
    accessSession?.phone,
  ]);

  useEffect(() => {
    let active = true;

    async function validateAccessSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const user = data.session?.user ?? null;
        const hasNonAnonymousSession = Boolean(user && !user.is_anonymous);

        if (!hasNonAnonymousSession) {
          if (accessSession) {
            clearClientAccessSession();
            if (active) {
              setAccessSession(null);
              setAccessMode("login");
            }
          }
          return;
        }

        if (!accessSession && user) {
          const localProfile = readLocalUserDocumentPayload(
            "client_profile"
          ) as ClientProfileDocument;
          const restoredPhone =
            normalizeDigits(
              (user as { phone?: string | null }).phone || ""
            ) || normalizeDigits(localProfile.telefone || "");
          const restoredSession: ClientAccessSession = {
            authUserId: user.id,
            phone: restoredPhone,
            email: user.email || localProfile.email || "",
            fullName: localProfile.nome || "Cliente",
            cpf: normalizeDigits(localProfile.cpf || ""),
            loggedAt: new Date().toISOString(),
          };
          saveClientAccessSession(restoredSession);
          if (active) {
            setAccessSession(restoredSession);
          }
        }
      } catch {
        // ignore session validation hiccups here and keep local UI stable
      }
    }

    void validateAccessSession();
    return () => {
      active = false;
    };
  }, [accessSession]);

  const accountReady = Boolean(accessSession);

  const ToggleRow = ({
    title,
    subtitle,
    value,
    onChange,
  }: {
    title: string;
    subtitle?: string;
    value: boolean;
    onChange: (next: boolean) => void;
  }) => (
    <div style={toggleRow}>
      <div>
        <div style={toggleTitle}>{title}</div>
        {subtitle ? <div style={toggleSubtitle}>{subtitle}</div> : null}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          ...toggleBtn,
          background: value ? "rgba(228,79,42,.15)" : "rgba(0,0,0,0.05)",
        }}
        type="button"
      >
        <span
          style={{
            ...toggleThumb,
            left: value ? 26 : 4,
            background: value ? "#E44F2A" : "#bbb",
          }}
        />
      </button>
    </div>
  );

  const accessFormContent = (
    <form onSubmit={handleRegister} style={formGrid}>
      <div style={accessModeHeader}>
        <div>
          <div style={accessIntroTitle}>Crie sua conta</div>
          <div style={accessIntroText}>
            Responda uma etapa por vez para liberar seu acesso com mais rapidez.
          </div>
        </div>
        <button
          onClick={openLoginFlow}
          type="button"
          style={accessModeLinkBtn}
        >
          Já tenho conta
        </button>
      </div>

      <div style={registerProgressText}>Etapa {registerStep + 1} de 6</div>

      <div style={registerStepCard}>
        {registerStep === 0 ? (
          <>
            <div style={registerStepTitle}>Qual é seu nome completo?</div>
            <div style={registerStepText}>
              Esse nome aparece no seu cadastro e nos pedidos.
            </div>
            <label style={fieldWrap}>
              <span style={fieldLabel}>Nome completo</span>
              <input
                value={registerForm.fullName}
                onChange={(event) => updateRegister("fullName", event.target.value)}
                style={fieldInput}
                placeholder="Seu nome completo"
                autoFocus
              />
            </label>
          </>
        ) : null}

        {registerStep === 1 ? (
          <>
            <div style={registerStepTitle}>Qual é sua data de nascimento?</div>
            <div style={registerStepText}>
              Usamos esse dado para manter seu cadastro organizado.
            </div>
            <label style={fieldWrap}>
              <span style={fieldLabel}>Data de nascimento</span>
              <input
                value={registerForm.birthDate}
                onChange={(event) => updateRegister("birthDate", event.target.value)}
                type="date"
                style={fieldInput}
                autoFocus
              />
            </label>
          </>
        ) : null}

        {registerStep === 2 ? (
          <>
            <div style={registerStepTitle}>Informe seu CPF</div>
            <div style={registerStepText}>
              Cada CPF pode ter apenas uma conta ativa.
            </div>
            <label style={fieldWrap}>
              <span style={fieldLabel}>CPF</span>
              <input
                value={registerForm.cpf}
                onChange={(event) => updateRegister("cpf", maskCpf(event.target.value))}
                style={fieldInput}
                placeholder="000.000.000-00"
                inputMode="numeric"
                autoFocus
              />
            </label>
          </>
        ) : null}

        {registerStep === 3 ? (
          <>
            <div style={registerStepTitle}>Qual é seu celular com WhatsApp?</div>
            <div style={registerStepText}>
              Esse número será usado para entrar na sua conta.
            </div>
            <label style={fieldWrap}>
              <span style={fieldLabel}>Celular com WhatsApp</span>
              <input
                value={registerForm.whatsapp}
                onChange={(event) =>
                  updateRegister("whatsapp", maskPhone(event.target.value))
                }
                inputMode="tel"
                style={fieldInput}
                placeholder="(61) 99999-9999"
                autoFocus
              />
            </label>
          </>
        ) : null}

        {registerStep === 4 ? (
          <>
            <div style={registerStepTitle}>Seu e-mail</div>
            <div style={registerStepText}>
              Opcional. Ele ajuda no suporte da sua conta quando necessário.
            </div>
            <label style={fieldWrap}>
              <span style={fieldLabel}>E-mail opcional</span>
              <input
                value={registerForm.email}
                onChange={(event) => updateRegister("email", event.target.value)}
                type="email"
                style={fieldInput}
                placeholder="voce@email.com"
                autoFocus
              />
            </label>
          </>
        ) : null}

        {registerStep === 5 ? (
          <>
            <div style={registerStepTitle}>Crie uma senha</div>
            <div style={registerStepText}>
              Use pelo menos 6 caracteres para proteger seu acesso.
            </div>
            <div style={fieldsGrid}>
              <PasswordInput
                label="Senha"
                value={registerForm.password}
                onChange={(event) => updateRegister("password", event.target.value)}
                inputStyle={fieldInput}
                labelStyle={fieldLabel}
                wrapStyle={fieldWrap}
                placeholder="Crie sua senha"
                autoComplete="new-password"
                autoFocus
              />

              <PasswordInput
                label="Confirmar senha"
                value={registerForm.confirmPassword}
                onChange={(event) =>
                  updateRegister("confirmPassword", event.target.value)
                }
                inputStyle={fieldInput}
                labelStyle={fieldLabel}
                wrapStyle={fieldWrap}
                placeholder="Repita sua senha"
                autoComplete="new-password"
              />
            </div>
          </>
        ) : null}
      </div>

      {accessError ? <div style={errorBox}>{accessError}</div> : null}

      <div style={registerActionRow}>
        {registerStep > 0 ? (
          <button
            onClick={goToPreviousRegisterStep}
            type="button"
            style={secondaryBtn}
            disabled={accessLoading}
          >
            Voltar
          </button>
        ) : (
          <button
            onClick={openLoginFlow}
            type="button"
            style={secondaryBtn}
            disabled={accessLoading}
          >
            Cancelar
          </button>
        )}

        {registerStep < 5 ? (
          <button
            onClick={goToNextRegisterStep}
            type="button"
            style={primaryBtn}
            disabled={accessLoading}
          >
            Continuar
          </button>
        ) : (
          <button type="submit" style={primaryBtn} disabled={accessLoading}>
            {accessLoading ? "Criando conta..." : "Criar conta"}
          </button>
        )}
      </div>
    </form>
  );

  const loginAccessContent = (
    <form onSubmit={handleLogin} style={formGrid}>
      <div style={accessModeHeader}>
        <div>
          <div style={accessIntroTitle}>Entre na sua conta</div>
          <div style={accessIntroText}>
            Use seu celular e sua senha para continuar de onde parou.
          </div>
        </div>
        <button
          onClick={() => openRegisterFlow(0)}
          type="button"
          style={accessModeLinkBtn}
        >
          Cadastre-se
        </button>
      </div>

      <div style={fieldsGrid}>
        <label style={fieldWrap}>
          <span style={fieldLabel}>Celular com DDD</span>
          <input
            value={loginPhone}
            onChange={(event) => {
              loginPhoneEditedRef.current = true;
              setLoginPhone(maskPhone(event.target.value));
            }}
            inputMode="tel"
            style={fieldInput}
            placeholder="(61) 99999-9999"
          />
        </label>

        <PasswordInput
          label="Senha"
          value={loginPassword}
          onChange={(event) => setLoginPassword(event.target.value)}
          inputStyle={fieldInput}
          labelStyle={fieldLabel}
          wrapStyle={fieldWrap}
          placeholder="Digite sua senha"
          autoComplete="current-password"
        />
      </div>

      {accessError ? <div style={errorBox}>{accessError}</div> : null}

      <button type="submit" style={primaryBtn} disabled={accessLoading}>
        {accessLoading ? "Entrando..." : "Entrar"}
      </button>

      <button
        onClick={handleForgotPassword}
        style={accessTextLinkBtn}
        type="button"
        disabled={accessLoading}
      >
        Esqueci minha senha
      </button>
    </form>
  );

  if (!accountReady) {
    return (
      <>
        <div style={authViewport}>
          <div style={authShell}>
            <div style={authHeroCard}>
              <div style={authBrand}>Central Gás</div>
              <div style={authTitle}>Entre na sua conta</div>
              <div style={authText}>
                Acesse seu cadastro para pedir gás, acompanhar entregas e usar o
                app com mais rapidez.
              </div>
              <div style={authBenefitsRow}>
                <div style={authBenefitChip}>Pedido em poucos toques</div>
                <div style={authBenefitChip}>Acesso com celular</div>
                <div style={authBenefitChip}>Acompanhe seus pedidos</div>
              </div>
            </div>

            <div style={authCard}>
              {accessMode === "login" ? loginAccessContent : accessFormContent}
            </div>
          </div>
        </div>

        {modal ? (
          <div onClick={() => setModal(null)} style={modalBackdrop}>
            <div onClick={(event) => event.stopPropagation()} style={modalCard}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>{modal.title}</div>
              <div style={{ marginTop: 10, color: "#475569", lineHeight: 1.55 }}>
                {modal.body}
              </div>
              <button
                onClick={() => {
                  modal.onCta?.();
                  setModal(null);
                }}
                style={primaryBtn}
                type="button"
              >
                {modal.cta || "Fechar"}
              </button>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <Layout>
      <div style={pageShell}>
        <div style={heroCard}>
          <div style={avatar}>{initials}</div>
          <div style={heroContent}>
            <div style={heroMini}>Minha conta</div>
            <div style={heroName}>{nome || "Cliente"}</div>
            <div style={heroMeta}>{telefone || "Telefone não informado"}</div>
            <div style={heroMeta}>
              {accountReady
                ? email || "Conta conectada"
                : "Crie seu cadastro para acessar o app com segurança."}
            </div>
            <div style={heroStatusPill}>
              {accountReady ? "Conta ativa" : "Acesso não criado"}
            </div>
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Segurança da conta</div>
          <div style={helperText}>
            Seu acesso fica salvo neste aparelho até você sair da conta.
          </div>

          <div style={accessReadyBox}>
            <div style={accessReadyTitle}>Conta protegida</div>
            <div style={accessReadyText}>
              Celular protegido:{" "}
              <strong>
                {maskPhone(accessSession?.phone || telefone || "") || "não informado"}
              </strong>
            </div>
            <div style={accessReadyText}>
              Se precisar trocar o número usado no login, fale com o suporte da
              Central.
            </div>

            <div style={dualActionGrid}>
              <button
                onClick={() => {
                  setAccessError("");
                  setShowPasswordEditor((current) => !current);
                }}
                style={primaryBtn}
                type="button"
                disabled={accessLoading}
              >
                {showPasswordEditor ? "Fechar senha" : "Alterar senha"}
              </button>
              <a
                href={centralSupportLink}
                target="_blank"
                rel="noreferrer"
                style={supportActionLink}
              >
                Falar com suporte
              </a>
              <button
                onClick={() => void handleLogout()}
                style={secondaryBtn}
                type="button"
                disabled={accessLoading}
              >
                Sair da conta
              </button>
            </div>

            {showPasswordEditor ? (
              <form onSubmit={handlePasswordUpdate} style={supportGrid}>
                <div style={fieldsGridTwo}>
                  <PasswordInput
                    label="Nova senha"
                    value={passwordForm.nextPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        nextPassword: event.target.value,
                      }))
                    }
                    inputStyle={fieldInput}
                    labelStyle={fieldLabel}
                    wrapStyle={fieldWrap}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                  />
                  <PasswordInput
                    label="Confirmar nova senha"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                    inputStyle={fieldInput}
                    labelStyle={fieldLabel}
                    wrapStyle={fieldWrap}
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                  />
                </div>

                {accessError ? <div style={errorBox}>{accessError}</div> : null}

                <div style={dualActionGrid}>
                  <button
                    type="submit"
                    style={primaryBtn}
                    disabled={accessLoading}
                  >
                    {accessLoading ? "Atualizando..." : "Salvar nova senha"}
                  </button>
                  <button
                    onClick={() => {
                      setPasswordForm({
                        nextPassword: "",
                        confirmPassword: "",
                      });
                      setAccessError("");
                      setShowPasswordEditor(false);
                    }}
                    style={secondaryBtn}
                    type="button"
                    disabled={accessLoading}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Dados pessoais</div>
          <div style={helperText}>
            Seus dados ficam vinculados à sua conta para facilitar novos pedidos
            e manter seu cadastro organizado.
          </div>

          {!isEditingProfile ? (
            <>
              <div style={profileViewGrid}>
                <div style={profileInfoCard}>
                  <div style={profileInfoLabel}>Nome completo</div>
                  <div style={profileInfoValue}>{nome || "Não informado"}</div>
                </div>
                <div style={profileInfoCard}>
                  <div style={profileInfoLabel}>Celular de acesso</div>
                  <div style={profileInfoValue}>{telefone || "Não informado"}</div>
                </div>
                <div style={profileInfoCard}>
                  <div style={profileInfoLabel}>E-mail</div>
                  <div style={profileInfoValue}>{email || "Não informado"}</div>
                </div>
                <div style={profileInfoCard}>
                  <div style={profileInfoLabel}>CPF</div>
                  <div style={profileInfoValue}>{cpf || "Não informado"}</div>
                </div>
                <div style={profileInfoCard}>
                  <div style={profileInfoLabel}>Data de nascimento</div>
                  <div style={profileInfoValue}>
                    {nascimento
                      ? new Date(`${nascimento}T00:00:00`).toLocaleDateString("pt-BR")
                      : "Não informada"}
                  </div>
                </div>
              </div>

              <div style={securityBox}>
                Para alterar o número usado no login, fale com o suporte da
                Central.
              </div>

              <div style={dualActionGrid}>
                <button onClick={startProfileEdit} style={primaryBtn} type="button">
                  Editar cadastro
                </button>
                <button
                  onClick={() => {
                    setAccessError("");
                    setShowPasswordEditor(true);
                  }}
                  style={secondaryBtn}
                  type="button"
                >
                  Alterar senha
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={fieldsGridTwo}>
                <label style={fieldWrap}>
                  <span style={fieldLabel}>Nome completo</span>
                  <input
                    value={nome}
                    onChange={(event) => setNome(event.target.value)}
                    style={fieldInput}
                  />
                </label>

                <label style={fieldWrap}>
                  <span style={fieldLabel}>Celular de acesso</span>
                  <input
                    value={telefone}
                    readOnly
                    style={{
                      ...fieldInput,
                      background: "#F8FAFC",
                      color: "#64748B",
                      cursor: "not-allowed",
                    }}
                  />
                </label>

                <label style={fieldWrap}>
                  <span style={fieldLabel}>E-mail</span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    style={fieldInput}
                  />
                </label>

                <label style={fieldWrap}>
                  <span style={fieldLabel}>CPF</span>
                  <input
                    value={cpf}
                    onChange={(event) => setCpf(maskCpf(event.target.value))}
                    style={fieldInput}
                    inputMode="numeric"
                  />
                </label>

                <label style={fieldWrap}>
                  <span style={fieldLabel}>Data de nascimento</span>
                  <input
                    type="date"
                    value={nascimento}
                    onChange={(event) => setNascimento(event.target.value)}
                    style={fieldInput}
                  />
                </label>
              </div>

              <div style={securityBox}>
                Para alterar o número usado no login, fale com o suporte da
                Central.
              </div>

              {profileError ? <div style={errorBox}>{profileError}</div> : null}

              <div style={dualActionGrid}>
                <button onClick={saveProfileEdit} style={primaryBtn} type="button">
                  Salvar alterações
                </button>
                <button onClick={cancelProfileEdit} style={secondaryBtn} type="button">
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Preferências</div>
          <div style={helperText}>
            Seus avisos principais ficam organizados entre atualizações do
            pedido e lembretes do nível do gás.
          </div>
          <ToggleRow
            title="Notificações de pedido"
            subtitle="Status, entrega e pedido chegou"
            value={notifsPedido}
            onChange={(value) =>
              updateBool("cg_notifs_pedido", value, setNotifsPedido)
            }
          />
          <ToggleRow
            title="Lembretes de gás"
            subtitle="Avisos quando o nível baixar"
            value={notifsGas}
            onChange={(value) => updateBool("cg_notifs_gas", value, setNotifsGas)}
          />
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Suporte</div>
          <div style={helperText}>
            Se precisar de ajuda com cadastro, acesso, pedidos ou notificações,
            fale direto com a Central no WhatsApp.
          </div>
          <div style={supportInfoBox}>
            WhatsApp da Central: <strong>{formatCentralSupportPhone()}</strong>
          </div>
          <a
            href={centralSupportLink}
            target="_blank"
            rel="noreferrer"
            style={supportActionLink}
          >
            Falar com suporte no WhatsApp
          </a>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Indique e ganhe</div>
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div style={benefitBox}>
              <div style={benefitTitle}>Seu código</div>
              <div style={benefitText}>
                <strong style={{ color: "#E44F2A" }}>{referralCode}</strong>
              </div>
              <button
                onClick={copyReferralMessage}
                style={outlineBtn}
                type="button"
              >
                Copiar mensagem de indicação
              </button>
            </div>
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Duração média do gás</div>
          <div style={helperText}>
            O app calcula automaticamente a estimativa com base na duração
            média e no tempo desde a última troca.
          </div>

          {!isEditingGasSetup ? (
            <>
              <div style={profileViewGrid}>
                <div style={profileInfoCard}>
                  <div style={profileInfoLabel}>Status</div>
                  <div style={profileInfoValue}>
                    {gasConfigured ? "Configuração ativa" : "Configuração pendente"}
                  </div>
                </div>
                <div style={profileInfoCard}>
                  <div style={profileInfoLabel}>Média total</div>
                  <div style={profileInfoValue}>
                    {averageMonths * 30 + averageDays} dias por botijão
                  </div>
                </div>
                <div style={profileInfoCard}>
                  <div style={profileInfoLabel}>Última troca</div>
                  <div style={profileInfoValue}>
                    Há {daysSinceLastExchange} dias
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsEditingGasSetup(true)}
                style={primaryBtn}
                type="button"
              >
                Ajustar duração do gás
              </button>
            </>
          ) : (
            <>
              <div style={fieldsGrid}>
                <div style={inlineFields}>
                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Meses</span>
                    <input
                      value={averageMonths}
                      onChange={(event) =>
                        setAverageMonths(
                          Math.max(0, Number(event.target.value || 0))
                        )
                      }
                      type="number"
                      min={0}
                      style={fieldInput}
                    />
                  </label>

                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Dias</span>
                    <input
                      value={averageDays}
                      onChange={(event) =>
                        setAverageDays(Math.max(0, Number(event.target.value || 0)))
                      }
                      type="number"
                      min={0}
                      style={fieldInput}
                    />
                  </label>
                </div>

                <label style={fieldWrap}>
                  <span style={fieldLabel}>Há quantos dias foi sua última troca?</span>
                  <input
                    value={daysSinceLastExchange}
                    onChange={(event) =>
                      setDaysSinceLastExchange(
                        Math.max(0, Number(event.target.value || 0))
                      )
                    }
                    type="number"
                    min={0}
                    style={fieldInput}
                  />
                </label>
              </div>

              <div style={estimateValue}>
                Configuração {gasConfigured ? "ativa" : "pendente"} | média total de{" "}
                {averageMonths * 30 + averageDays} dias
              </div>

              <div style={dualActionGrid}>
                <button onClick={saveGasEstimateAndClose} style={primaryBtn} type="button">
                  Salvar configuração do gás
                </button>
                <button onClick={cancelGasEstimateEdit} style={secondaryBtn} type="button">
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {modal ? (
        <div onClick={() => setModal(null)} style={modalBackdrop}>
          <div onClick={(event) => event.stopPropagation()} style={modalCard}>
            <div style={{ fontWeight: 950, fontSize: 16 }}>{modal.title}</div>
            <div style={{ marginTop: 10, color: "#475569", lineHeight: 1.55 }}>
              {modal.body}
            </div>
            <button
              onClick={() => {
                modal.onCta?.();
                setModal(null);
              }}
              style={primaryBtn}
              type="button"
            >
              {modal.cta || "Fechar"}
            </button>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

const pageShell: CSSProperties = {
  paddingBottom: "max(80px, 96px)",
  display: "grid",
  gap: 14,
  width: "100%",
  minWidth: 0,
  overflowX: "hidden",
};

const authViewport: CSSProperties = {
  minHeight: "100dvh",
  background:
    "radial-gradient(circle at top, rgba(247,162,18,0.18), transparent 34%), linear-gradient(180deg, #FFF7ED 0%, #F8FAFC 46%, #FFFFFF 100%)",
  padding: "clamp(18px, 5vw, 28px) clamp(14px, 4vw, 18px) max(24px, env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};

const authShell: CSSProperties = {
  width: "min(100%, 560px)",
  margin: "0 auto",
  display: "grid",
  gap: "clamp(14px, 3vw, 18px)",
};

const authHeroCard: CSSProperties = {
  borderRadius: 28,
  padding: "clamp(20px, 6vw, 28px)",
  background: "linear-gradient(135deg,#E44F2A 0%, #F7A212 100%)",
  color: "#fff",
  boxShadow: "0 22px 48px rgba(228,79,42,0.20)",
  display: "grid",
  gap: 10,
};

const authBrand: CSSProperties = {
  fontSize: "clamp(14px, 3vw, 16px)",
  fontWeight: 950,
  letterSpacing: 0.2,
};

const authTitle: CSSProperties = {
  fontSize: "clamp(24px, 7vw, 32px)",
  fontWeight: 950,
  lineHeight: 1.08,
  maxWidth: 420,
};

const authText: CSSProperties = {
  fontSize: "clamp(13px, 3vw, 15px)",
  lineHeight: 1.6,
  opacity: 0.96,
  maxWidth: 420,
};

const authBenefitsRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 2,
};

const authBenefitChip: CSSProperties = {
  minHeight: 30,
  padding: "0 12px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.18)",
  border: "1px solid rgba(255,255,255,0.22)",
  fontSize: "clamp(11px, 2.5vw, 12px)",
  fontWeight: 900,
};

const authCard: CSSProperties = {
  background: "#fff",
  borderRadius: 26,
  padding: "clamp(16px, 4vw, 22px)",
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 16px 34px rgba(15,23,42,0.08)",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  overflow: "hidden",
};

const heroCard: CSSProperties = {
  background: "linear-gradient(135deg,#E44F2A 0%, #F7A212 100%)",
  padding: "clamp(14px, 4vw, 22px) clamp(12px, 3vw, 18px)",
  borderRadius: 24,
  color: "#fff",
  overflow: "hidden",
  boxShadow: "0 10px 26px rgba(228,79,42,0.22)",
  display: "flex",
  gap: "clamp(10px, 2vw, 14px)",
  alignItems: "center",
  flexWrap: "wrap",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const heroContent: CSSProperties = {
  minWidth: 0,
  flex: "1 1 220px",
};

const avatar: CSSProperties = {
  width: "clamp(44px, 10vw, 56px)",
  height: "clamp(44px, 10vw, 56px)",
  borderRadius: 18,
  background: "rgba(255,255,255,.18)",
  border: "1px solid rgba(255,255,255,.30)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  letterSpacing: 1,
  flexShrink: 0,
};

const heroMini: CSSProperties = {
  fontSize: "clamp(11px, 2.5vw, 13px)",
  opacity: 0.92,
  fontWeight: 800,
};

const heroName: CSSProperties = {
  marginTop: 2,
  fontWeight: 900,
  fontSize: "clamp(16px, 4vw, 18px)",
  lineHeight: 1.2,
};

const heroMeta: CSSProperties = {
  marginTop: 4,
  opacity: 0.92,
  fontSize: "clamp(11px, 2.5vw, 13px)",
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const heroStatusPill: CSSProperties = {
  marginTop: 10,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "clamp(26px, 6vw, 30px)",
  padding: "0 clamp(8px, 2vw, 12px)",
  borderRadius: 999,
  background: "rgba(255,255,255,.18)",
  border: "1px solid rgba(255,255,255,.28)",
  fontWeight: 900,
  fontSize: "clamp(10px, 2vw, 12px)",
};

const sectionCard: CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: "clamp(14px, 3vw, 18px)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 6px 18px rgba(0,0,0,.04)",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  overflow: "hidden",
};

const sectionTitle: CSSProperties = {
  fontWeight: 900,
  fontSize: "clamp(14px, 3.5vw, 16px)",
};

const helperText: CSSProperties = {
  marginTop: 8,
  color: "#64748B",
  lineHeight: 1.55,
  fontSize: "clamp(12px, 2.5vw, 13px)",
};

const supportInfoBox: CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 16,
  border: "1px solid rgba(34,197,94,0.18)",
  background: "rgba(240,253,244,0.95)",
  color: "#166534",
  fontWeight: 800,
  lineHeight: 1.5,
};

const accessModeHeader: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const accessModeLinkBtn: CSSProperties = {
  minHeight: 40,
  padding: "0 6px",
  border: "none",
  background: "transparent",
  color: "#E44F2A",
  fontWeight: 950,
  cursor: "pointer",
  fontSize: "clamp(15px, 3.2vw, 17px)",
};

const formGrid: CSSProperties = {
  marginTop: "clamp(10px, 2vw, 14px)",
  display: "grid",
  gap: "clamp(10px, 2vw, 12px)",
};

const accessIntroTitle: CSSProperties = {
  fontSize: "clamp(13px, 2.8vw, 15px)",
  fontWeight: 900,
  color: "#111827",
};

const accessIntroText: CSSProperties = {
  color: "#64748B",
  fontSize: "clamp(12px, 2.5vw, 13px)",
  lineHeight: 1.5,
};

const accessTextLinkBtn: CSSProperties = {
  minHeight: 34,
  border: "none",
  background: "transparent",
  color: "#E44F2A",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: "clamp(12px, 2.5vw, 14px)",
  padding: 0,
  justifySelf: "center",
};

const registerProgressText: CSSProperties = {
  color: "#64748B",
  fontSize: "clamp(12px, 2.4vw, 13px)",
  fontWeight: 800,
};

const registerStepCard: CSSProperties = {
  borderRadius: 20,
  padding: "clamp(14px, 3vw, 18px)",
  border: "1px solid rgba(228,79,42,0.12)",
  background: "rgba(255,247,237,0.96)",
  display: "grid",
  gap: 12,
};

const registerStepTitle: CSSProperties = {
  fontSize: "clamp(18px, 4vw, 22px)",
  lineHeight: 1.15,
  fontWeight: 950,
  color: "#111827",
};

const registerStepText: CSSProperties = {
  color: "#64748B",
  fontSize: "clamp(12px, 2.5vw, 14px)",
  lineHeight: 1.55,
};

const registerActionRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const fieldsGrid: CSSProperties = {
  marginTop: "clamp(10px, 2vw, 12px)",
  display: "grid",
  gap: "clamp(10px, 2vw, 12px)",
};

const fieldsGridTwo: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, clamp(140px, 45vw, 180px)), 1fr))",
  gap: 12,
};

const inlineFields: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, clamp(100px, 40vw, 130px)), 1fr))",
  gap: 12,
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
  minHeight: "clamp(40px, 10vw, 46px)",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#fff",
  padding: "0 clamp(10px, 2vw, 14px)",
  fontWeight: 700,
  color: "#111827",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const securityBox: CSSProperties = {
  borderRadius: 16,
  padding: "clamp(10px, 2vw, 14px)",
  background: "rgba(15,23,42,0.04)",
  color: "#334155",
  lineHeight: 1.55,
  fontWeight: 700,
  fontSize: "clamp(12px, 2.5vw, 13px)",
};

const errorBox: CSSProperties = {
  borderRadius: 16,
  padding: "clamp(10px, 2vw, 14px)",
  background: "rgba(185,28,28,0.08)",
  border: "1px solid rgba(185,28,28,0.16)",
  color: "#7F1D1D",
  fontWeight: 800,
  lineHeight: 1.55,
  fontSize: "clamp(12px, 2.5vw, 13px)",
};

const dualActionGrid: CSSProperties = {
  marginTop: "clamp(10px, 2vw, 12px)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, clamp(150px, 46vw, 190px)), 1fr))",
  gap: 10,
};

const profileViewGrid: CSSProperties = {
  marginTop: "clamp(10px, 2vw, 12px)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, clamp(150px, 46vw, 210px)), 1fr))",
  gap: 12,
};

const profileInfoCard: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#F8FAFC",
  padding: "14px 16px",
  display: "grid",
  gap: 6,
};

const profileInfoLabel: CSSProperties = {
  fontSize: "clamp(11px, 2.2vw, 12px)",
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: 0.2,
};

const profileInfoValue: CSSProperties = {
  fontSize: "clamp(14px, 3vw, 15px)",
  fontWeight: 800,
  color: "#111827",
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const accessReadyBox: CSSProperties = {
  marginTop: "clamp(10px, 2vw, 14px)",
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  padding: "clamp(12px, 2vw, 16px)",
};

const accessReadyTitle: CSSProperties = {
  fontWeight: 950,
  fontSize: "clamp(14px, 3.5vw, 16px)",
  color: "#111827",
};

const accessReadyText: CSSProperties = {
  marginTop: 8,
  color: "#475569",
  lineHeight: 1.55,
  fontWeight: 700,
  wordBreak: "break-word",
  fontSize: "clamp(12px, 2.5vw, 13px)",
};

const supportGrid: CSSProperties = {
  marginTop: "clamp(10px, 2vw, 12px)",
  display: "grid",
  gap: "clamp(10px, 2vw, 12px)",
};

const toggleRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "clamp(8px, 2vw, 12px)",
  alignItems: "flex-start",
  flexWrap: "wrap",
  padding: "clamp(8px, 1.5vw, 12px) 0",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};

const toggleTitle: CSSProperties = {
  fontWeight: 900,
  color: "#111827",
  fontSize: "clamp(13px, 2.8vw, 14px)",
};

const toggleSubtitle: CSSProperties = {
  marginTop: 6,
  color: "#64748B",
  fontSize: "clamp(11px, 2.2vw, 13px)",
};

const toggleBtn: CSSProperties = {
  width: "clamp(44px, 12vw, 52px)",
  height: "clamp(26px, 6vw, 30px)",
  borderRadius: 999,
  border: "none",
  position: "relative",
  cursor: "pointer",
  flexShrink: 0,
};

const toggleThumb: CSSProperties = {
  position: "absolute",
  top: "2px",
  width: "clamp(18px, 5vw, 22px)",
  height: "clamp(18px, 5vw, 22px)",
  borderRadius: "50%",
  transition: "all .2s ease",
};

const primaryBtn: CSSProperties = {
  marginTop: "clamp(10px, 2vw, 14px)",
  width: "100%",
  minHeight: "clamp(40px, 10vw, 46px)",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg,#F15A2B 0%, #FFA300 100%)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: "clamp(14px, 3vw, 16px)",
  boxShadow: "0 14px 28px rgba(228,79,42,0.20)",
  transition: "transform .2s ease, box-shadow .2s ease",
};

const outlineBtn: CSSProperties = {
  marginTop: "clamp(8px, 1.5vw, 12px)",
  width: "100%",
  minHeight: "clamp(38px, 10vw, 44px)",
  borderRadius: 14,
  border: "1px solid rgba(228,79,42,.18)",
  background: "rgba(255,247,237,.96)",
  color: "#E44F2A",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: "clamp(14px, 3vw, 16px)",
};

const secondaryBtn: CSSProperties = {
  width: "100%",
  minHeight: "clamp(40px, 10vw, 46px)",
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: "clamp(14px, 3vw, 16px)",
};

const supportActionLink: CSSProperties = {
  ...primaryBtn,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
};

const benefitBox: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  padding: "clamp(12px, 2vw, 16px)",
};

const benefitTitle: CSSProperties = {
  fontWeight: 900,
  fontSize: "clamp(13px, 3vw, 15px)",
  color: "#111827",
};

const benefitText: CSSProperties = {
  marginTop: 8,
  color: "#475569",
  lineHeight: 1.5,
  fontSize: "clamp(12px, 2.5vw, 13px)",
};

const estimateValue: CSSProperties = {
  marginTop: 10,
  fontWeight: 900,
  color: "#E44F2A",
  lineHeight: 1.45,
  fontSize: "clamp(12px, 2.5vw, 13px)",
};

const modalBackdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.35)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 40,
};

const modalCard: CSSProperties = {
  width: "min(100%, clamp(90vw, 420px, 100%))",
  background: "#fff",
  borderRadius: 22,
  padding: "clamp(14px, 3vw, 18px)",
  boxShadow: "0 20px 44px rgba(15,23,42,.20)",
};
