import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  delivererAccessService,
  fileToUploadInfo,
  getDelivererAccessSession,
  type DelivererApplication,
  type DelivererVehicleType,
} from "../../services/delivererAccessService";
import PasswordInput from "../../components/PasswordInput";
import { emitToast } from "../../services/realtimeBus";
import { disableRemotePushDevice } from "../../services/remotePushService";

type Props = {
  onApproved?: () => void;
};

type AccessMode = "login" | "register";

type RegisterFormState = {
  fullName: string;
  whatsapp: string;
  cpf: string;
  rg: string;
  birthDate: string;
  address: string;
  email: string;
  password: string;
  vehicleType: DelivererVehicleType;
  vehicleBrand: string;
  vehicleModel: string;
  plate: string;
  renavam: string;
};

const DEFAULT_FORM: RegisterFormState = {
  fullName: "",
  whatsapp: "",
  cpf: "",
  rg: "",
  birthDate: "",
  address: "",
  email: "",
  password: "",
  vehicleType: "moto",
  vehicleBrand: "",
  vehicleModel: "",
  plate: "",
  renavam: "",
};

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

function maskPlate(value: string) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 7);
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function FormHeader(props: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div style={sectionHead}>
      <div style={sectionEyebrow}>{props.eyebrow}</div>
      <div style={sectionTitle}>{props.title}</div>
      <div style={sectionText}>{props.text}</div>
    </div>
  );
}

function SectionBlock(props: {
  title: string;
  text?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={formSection}>
      <div style={sectionTitle}>{props.title}</div>
      {props.text ? <div style={sectionText}>{props.text}</div> : null}
      <div style={sectionContent}>{props.children}</div>
    </div>
  );
}

function FileUploadField(props: {
  label: string;
  helper: string;
  file: File | null;
  accept: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <label style={uploadCard}>
      <input
        type="file"
        accept={props.accept}
        onChange={(event) => props.onChange(event.target.files?.[0] ?? null)}
        style={hiddenFileInput}
      />

      <div style={uploadHeader}>
        <div style={{ minWidth: 0 }}>
          <div style={uploadTitle}>{props.label}</div>
          <div style={uploadDescription}>{props.helper}</div>
        </div>
        <span
          style={{
            ...uploadStatus,
            ...(props.file ? uploadStatusReady : null),
          }}
        >
          {props.file ? "Arquivo pronto" : "Selecionar"}
        </span>
      </div>

      <div style={uploadActionRow}>
        <span style={uploadButton}>Escolher arquivo</span>
        <span style={uploadFileName}>
          {props.file?.name || "Nenhum arquivo selecionado"}
        </span>
      </div>

      <div style={uploadMeta}>
        {props.file
          ? `Tamanho: ${formatFileSize(props.file.size)}`
          : "Formatos aceitos: JPG, PNG, PDF ou WEBP"}
      </div>
    </label>
  );
}

export default function EntregadorAcesso(props: Props) {
  const { onApproved } = props;
  const [mode, setMode] = useState<AccessMode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [form, setForm] = useState<RegisterFormState>(DEFAULT_FORM);
  const [cnhFile, setCnhFile] = useState<File | null>(null);
  const [crlvFile, setCrlvFile] = useState<File | null>(null);
  const [currentApplicant, setCurrentApplicant] =
    useState<DelivererApplication | null>(null);
  const applicantPrefillKeyRef = useRef("");
  const loginEditedRef = useRef(false);
  const registerEditedRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadApplicant() {
      const session = getDelivererAccessSession();
      if (!session?.applicationId) {
        if (active) setCurrentApplicant(null);
        void disableRemotePushDevice();
        return;
      }

      try {
        const item = await delivererAccessService.getApplication(session.applicationId);
        if (active) {
          setCurrentApplicant(item);
        }
      } catch {
        if (active) {
          setCurrentApplicant(null);
        }
      }
    }

    void loadApplicant();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentApplicant) return;

    const prefillKey =
      currentApplicant.id || currentApplicant.authUserId || currentApplicant.email || "";
    if (applicantPrefillKeyRef.current === prefillKey) return;
    applicantPrefillKeyRef.current = prefillKey;

    if (!registerEditedRef.current) {
      setForm({
        fullName: currentApplicant.fullName || "",
        whatsapp: maskPhone(currentApplicant.whatsapp || ""),
        cpf: maskCpf(currentApplicant.cpf || ""),
        rg: currentApplicant.rg || "",
        birthDate: currentApplicant.birthDate || "",
        address: currentApplicant.address || "",
        email: currentApplicant.email || "",
        password: "",
        vehicleType: currentApplicant.vehicleType || "moto",
        vehicleBrand: currentApplicant.vehicleBrand || "",
        vehicleModel: currentApplicant.vehicleModel || "",
        plate: currentApplicant.plate || "",
        renavam: normalizeDigits(currentApplicant.renavam || ""),
      });
    }

    if (!loginEditedRef.current) {
      setLoginEmail(currentApplicant.email || "");
    }
  }, [currentApplicant]);

  const canOpenApp = currentApplicant?.status === "approved";
  const hasSession = Boolean(getDelivererAccessSession()?.applicationId);

  const pendingMessage = useMemo(() => {
    if (!currentApplicant) return "";
    if (currentApplicant.status === "approved") {
      return "Seu cadastro foi aprovado. Agora você já pode entrar no app operacional.";
    }
    if (currentApplicant.status === "rejected") {
      return (
        currentApplicant.adminNotes ||
        "O ADM pediu ajuste dos dados. Revise seu cadastro e envie novamente."
      );
    }
    return "Seu cadastro foi recebido e está aguardando a análise do administrador.";
  }, [currentApplicant]);

  const statusLabel = useMemo(() => {
    if (!currentApplicant) return "";
    if (currentApplicant.status === "approved") return "Aprovado";
    if (currentApplicant.status === "rejected") return "Ajuste solicitado";
    return "Em analise";
  }, [currentApplicant]);

  function updateForm<K extends keyof RegisterFormState>(
    key: K,
    value: RegisterFormState[K]
  ) {
    registerEditedRef.current = true;
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const result = await delivererAccessService.signIn(loginEmail, loginPassword);
      setCurrentApplicant(result.item);
      setMode("login");

      if (result.item.status === "approved") {
        emitToast("Acesso liberado", "Entrando no app do entregador.", "success");
        onApproved?.();
      } else {
        emitToast(
          "Cadastro localizado",
          "Sua conta foi aberta e o app mostrou o status da analise.",
          "success"
        );
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : "Não foi possível entrar agora."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCadastro(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const cnhUpload = await fileToUploadInfo(cnhFile);
      const crlvUpload = await fileToUploadInfo(crlvFile);

      const result = await delivererAccessService.register({
        fullName: form.fullName,
        whatsapp: form.whatsapp,
        cpf: form.cpf,
        rg: form.rg,
        birthDate: form.birthDate,
        address: form.address,
        email: form.email,
        password: form.password,
        cnhUpload,
        vehicleType: form.vehicleType,
        vehicleBrand: form.vehicleBrand,
        vehicleModel: form.vehicleModel,
        plate: form.plate,
        renavam: form.renavam,
        crlvUpload,
      });

      setCurrentApplicant(result.item);
      setLoginEmail(form.email);
      loginEditedRef.current = false;
      registerEditedRef.current = false;
      setLoginPassword("");
      setMode("login");
      emitToast(
        "Cadastro enviado",
        "Seu cadastro foi recebido e agora aguarda a aprovacao do ADM.",
        "success"
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : "Não foi possível enviar seu cadastro."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleEnterApp() {
    if (loading || !canOpenApp) return;
    setLoading(true);
    setError("");

    try {
      const item = await delivererAccessService.activateSession();
      setCurrentApplicant(item);
      emitToast("Acesso liberado", "Entrando no app do entregador.", "success");
      onApproved?.();
    } catch (activationError) {
      setError(
        activationError instanceof Error && activationError.message
          ? activationError.message
          : "Não foi possível abrir o app agora."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      await disableRemotePushDevice();
      await delivererAccessService.signOut();
      applicantPrefillKeyRef.current = "";
      loginEditedRef.current = false;
      registerEditedRef.current = false;
      setCurrentApplicant(null);
      setMode("login");
      setLoginEmail("");
      setLoginPassword("");
      emitToast("Conta desconectada", "Você saiu desta conta.", "success");
    } catch (logoutError) {
      setError(
        logoutError instanceof Error && logoutError.message
          ? logoutError.message
          : "Não foi possível sair agora."
      );
    } finally {
      setLoading(false);
    }
  }

  if (hasSession && currentApplicant && mode !== "register") {
    return (
      <div style={page}>
        <div style={card}>
          <div style={heroCard}>
            <div style={heroBadge}>Cadastro profissional</div>
            <div style={heroTitle}>Central Gas | Entregador</div>
            <div style={heroSubtitle}>
              Cadastre-se para comecar a receber pedidos de entrega de gas na sua
              região.
            </div>
            <div style={heroHighlights}>
              <span style={heroPill}>Aprovacao do ADM</span>
              <span style={heroPill}>Acesso seguro</span>
              <span style={heroPill}>Operação na sua região</span>
            </div>
          </div>

          <div style={sectionCard}>
            <div style={statusRow}>
              <div style={sectionTitle}>
                {currentApplicant.status === "approved"
                  ? "Cadastro aprovado"
                  : currentApplicant.status === "rejected"
                  ? "Cadastro precisa de ajuste"
                  : "Cadastro em analise"}
              </div>
              <div
                style={{
                  ...statusPill,
                  ...(currentApplicant.status === "approved"
                    ? statusPillApproved
                    : currentApplicant.status === "rejected"
                    ? statusPillRejected
                    : null),
                }}
              >
                {statusLabel}
              </div>
            </div>

            <div style={sectionText}>{pendingMessage}</div>

            <div style={identityBox}>
              <div style={identityTitle}>{currentApplicant.fullName}</div>
              <div style={identityMeta}>{currentApplicant.email}</div>
              <div style={identityMeta}>
                {currentApplicant.vehicleType.toUpperCase()} •{" "}
                {currentApplicant.vehicleBrand} {currentApplicant.vehicleModel} •{" "}
                {currentApplicant.plate}
              </div>
            </div>

            <div style={actionGrid}>
              {canOpenApp ? (
                <button
                  onClick={() => {
                    void handleEnterApp();
                  }}
                  style={primaryBtn}
                  type="button"
                  disabled={loading}
                >
                  {loading ? "Abrindo..." : "Entrar no app do entregador"}
                </button>
              ) : currentApplicant.status === "rejected" ? (
                <button
                  onClick={() => setMode("register")}
                  style={primaryBtn}
                  type="button"
                  disabled={loading}
                >
                  Refazer cadastro
                </button>
              ) : null}

              <button
                onClick={() => {
                  void handleSignOut();
                }}
                style={secondaryBtn}
                type="button"
                disabled={loading}
              >
                {loading ? "Saindo..." : "Sair desta conta"}
              </button>
            </div>
          </div>

          {error ? <div style={errorBox}>{error}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        <div style={heroCard}>
          <div style={heroBadge}>Cadastro profissional</div>
          <div style={heroTitle}>Central Gas | Entregador</div>
          <div style={heroSubtitle}>
            Cadastre-se para comecar a receber pedidos de entrega de gas na sua
            região.
          </div>
          <div style={heroHighlights}>
            <span style={heroPill}>Cadastro online</span>
            <span style={heroPill}>Aprovacao do ADM</span>
            <span style={heroPill}>Pedidos na sua região</span>
          </div>
        </div>

        <div style={modeRow}>
          <button
            onClick={() => setMode("login")}
            type="button"
            style={{ ...modeBtn, ...(mode === "login" ? modeBtnActive : null) }}
            disabled={loading}
          >
            Entrar
          </button>
          <button
            onClick={() => setMode("register")}
            type="button"
            style={{ ...modeBtn, ...(mode === "register" ? modeBtnActive : null) }}
            disabled={loading}
          >
            Cadastro
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} style={formGrid}>
            <FormHeader
              eyebrow="Acesso"
              title="Entrar na sua conta"
              text="Use o e-mail e a senha cadastrados. Depois do primeiro login, o app continua conectado neste aparelho até você sair."
            />

            <div style={sectionGridSingle}>
              <label style={fieldWrap}>
                <span style={fieldLabel}>E-mail de acesso</span>
                <input
                  value={loginEmail}
                  onChange={(event) => {
                    loginEditedRef.current = true;
                    setLoginEmail(event.target.value);
                  }}
                  style={fieldInput}
                  type="email"
                  autoComplete="username"
                  placeholder="voce@exemplo.com"
                />
              </label>

              <PasswordInput
                label="Senha"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                inputStyle={fieldInput}
                labelStyle={fieldLabel}
                wrapStyle={fieldWrap}
                autoComplete="current-password"
                placeholder="Digite sua senha de acesso"
              />
            </div>

            {error ? <div style={errorBox}>{error}</div> : null}

            <div style={submitBlock}>
              <button type="submit" style={primaryBtn} disabled={loading}>
                {loading ? "Entrando..." : "Entrar no app do entregador"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleCadastro} style={formGrid}>
            <FormHeader
              eyebrow="Novo cadastro"
              title="Comece seu cadastro de entregador"
              text="Preencha os dados abaixo para enviar sua solicitacao. O cadastro continua com aprovacao do ADM antes da liberacao completa."
            />

            <div style={sectionGridSingle}>
              <SectionBlock
                title="Dados pessoais"
                text="Essas informacoes ajudam a validar seu perfil e agilizam a aprovacao."
              >
                <div style={gridTwo}>
                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Nome completo</span>
                    <input
                      value={form.fullName}
                      onChange={(event) => updateForm("fullName", event.target.value)}
                      style={fieldInput}
                      placeholder="Seu nome completo"
                    />
                  </label>

                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Celular com WhatsApp</span>
                    <input
                      value={form.whatsapp}
                      onChange={(event) =>
                        updateForm("whatsapp", maskPhone(event.target.value))
                      }
                      style={fieldInput}
                      inputMode="tel"
                      placeholder="(61) 99999-9999"
                    />
                  </label>

                  <label style={fieldWrap}>
                    <span style={fieldLabel}>CPF</span>
                    <input
                      value={form.cpf}
                      onChange={(event) =>
                        updateForm("cpf", maskCpf(event.target.value))
                      }
                      style={fieldInput}
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                    />
                  </label>

                  <label style={fieldWrap}>
                    <span style={fieldLabel}>RG</span>
                    <input
                      value={form.rg}
                      onChange={(event) => updateForm("rg", event.target.value)}
                      style={fieldInput}
                      placeholder="Numero do RG"
                    />
                  </label>

                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Data de nascimento</span>
                    <input
                      value={form.birthDate}
                      onChange={(event) => updateForm("birthDate", event.target.value)}
                      style={fieldInput}
                      type="date"
                    />
                  </label>

                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Endereco completo</span>
                    <input
                      value={form.address}
                      onChange={(event) => updateForm("address", event.target.value)}
                      style={fieldInput}
                      placeholder="Rua, numero, bairro e cidade"
                    />
                  </label>
                </div>
              </SectionBlock>

              <SectionBlock
                title="Acesso da conta"
                text="Esse acesso sera usado para entrar no app depois que seu cadastro estiver aprovado."
              >
                <div style={gridTwo}>
                  <label style={fieldWrap}>
                    <span style={fieldLabel}>E-mail de acesso</span>
                    <input
                      value={form.email}
                      onChange={(event) => updateForm("email", event.target.value)}
                      style={fieldInput}
                      type="email"
                      autoComplete="email"
                      placeholder="voce@exemplo.com"
                    />
                  </label>

                  <div style={fieldWrap}>
                    <PasswordInput
                      label="Crie sua senha de acesso"
                      value={form.password}
                      onChange={(event) => updateForm("password", event.target.value)}
                      inputStyle={fieldInput}
                      labelStyle={fieldLabel}
                      wrapStyle={fieldWrap}
                      autoComplete="new-password"
                      placeholder="Defina uma senha para entrar no app"
                    />
                    <span style={fieldHelp}>
                      Use pelo menos 4 caracteres. Se preferir, combine letras e
                      numeros.
                    </span>
                  </div>
                </div>
              </SectionBlock>

              <SectionBlock
                title="Veículo de operação"
                text="Informe o veiculo que sera usado para receber e entregar pedidos."
              >
                <div style={gridTwo}>
                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Tipo de veiculo</span>
                    <select
                      value={form.vehicleType}
                      onChange={(event) =>
                        updateForm(
                          "vehicleType",
                          event.target.value as DelivererVehicleType
                        )
                      }
                      style={fieldInput}
                    >
                      <option value="moto">Moto</option>
                      <option value="carro">Carro</option>
                    </select>
                  </label>

                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Marca</span>
                    <input
                      value={form.vehicleBrand}
                      onChange={(event) =>
                        updateForm("vehicleBrand", event.target.value)
                      }
                      style={fieldInput}
                      placeholder="Honda, Fiat, Yamaha..."
                    />
                  </label>

                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Modelo</span>
                    <input
                      value={form.vehicleModel}
                      onChange={(event) =>
                        updateForm("vehicleModel", event.target.value)
                      }
                      style={fieldInput}
                      placeholder="Modelo do veiculo"
                    />
                  </label>

                  <label style={fieldWrap}>
                    <span style={fieldLabel}>Placa</span>
                    <input
                      value={form.plate}
                      onChange={(event) => updateForm("plate", maskPlate(event.target.value))}
                      style={fieldInput}
                      placeholder="ABC1D23"
                    />
                  </label>

                  <label style={fieldWrap}>
                    <span style={fieldLabel}>RENAVAM</span>
                    <input
                      value={form.renavam}
                      onChange={(event) =>
                        updateForm("renavam", normalizeDigits(event.target.value))
                      }
                      style={fieldInput}
                      inputMode="numeric"
                      placeholder="Numero do RENAVAM"
                    />
                  </label>
                </div>
              </SectionBlock>

              <SectionBlock
                title="Documentos obrigatórios"
                text="Envie arquivos legiveis para facilitar a analise do seu cadastro."
              >
                <div style={gridTwo}>
                  <FileUploadField
                    label="CNH"
                    helper="Envie a CNH digital ou uma foto nitida do documento."
                    file={cnhFile}
                    accept=".jpg,.jpeg,.png,.pdf,.webp"
                    onChange={setCnhFile}
                  />

                  <FileUploadField
                    label="CRLV digital"
                    helper="Envie o CRLV do veiculo usado nas entregas."
                    file={crlvFile}
                    accept=".jpg,.jpeg,.png,.pdf,.webp"
                    onChange={setCrlvFile}
                  />
                </div>
              </SectionBlock>
            </div>

            {error ? <div style={errorBox}>{error}</div> : null}

            <div style={submitBlock}>
              <button type="submit" style={primaryBtn} disabled={loading}>
                {loading ? "Enviando cadastro..." : "Enviar cadastro"}
              </button>
              <div style={submitNote}>
                Ao enviar, seu cadastro segue para a analise do ADM antes da
                liberacao dos pedidos.
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(228,79,42,0.12), transparent 24%), radial-gradient(circle at bottom right, rgba(245,158,11,0.10), transparent 22%), linear-gradient(180deg, #FFF7ED 0%, #F8FAFC 44%, #FFFFFF 100%)",
  padding: "clamp(14px, 4vw, 24px)",
  boxSizing: "border-box",
};

const card: CSSProperties = {
  width: "min(100%, 840px)",
  margin: "0 auto",
  display: "grid",
  gap: 16,
};

const heroCard: CSSProperties = {
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.96) 0%, rgba(255,247,237,0.98) 100%)",
  borderRadius: 28,
  padding: "clamp(18px, 5vw, 28px)",
  color: "#111827",
  boxShadow: "0 24px 50px rgba(228,79,42,0.12)",
  border: "1px solid rgba(228,79,42,0.10)",
  display: "grid",
  gap: 10,
};

const heroBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "fit-content",
  minHeight: 30,
  padding: "0 12px",
  borderRadius: 999,
  background: "rgba(228,79,42,0.10)",
  color: "#C2410C",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const heroTitle: CSSProperties = {
  fontSize: "clamp(24px, 6vw, 32px)",
  fontWeight: 950,
  color: "#111827",
  lineHeight: 1.08,
};

const heroSubtitle: CSSProperties = {
  lineHeight: 1.6,
  color: "#475569",
  fontSize: "clamp(14px, 3vw, 16px)",
  maxWidth: 560,
};

const heroHighlights: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 2,
};

const heroPill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 34,
  padding: "0 12px",
  borderRadius: 999,
  background: "#FFFFFF",
  border: "1px solid rgba(15,23,42,0.08)",
  color: "#334155",
  fontSize: 12.5,
  fontWeight: 800,
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const modeRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  padding: 6,
  borderRadius: 22,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.05)",
};

const modeBtn: CSSProperties = {
  minHeight: 48,
  borderRadius: 16,
  border: "1px solid transparent",
  background: "transparent",
  color: "#475569",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 15,
};

const modeBtnActive: CSSProperties = {
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  boxShadow: "0 16px 30px rgba(228,79,42,0.16)",
};

const formGrid: CSSProperties = {
  background: "rgba(255,255,255,0.96)",
  borderRadius: 28,
  padding: "clamp(16px, 4vw, 24px)",
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 16px 38px rgba(15,23,42,0.08)",
  display: "grid",
  gap: 16,
};

const sectionCard: CSSProperties = {
  background: "rgba(255,255,255,0.96)",
  borderRadius: 28,
  padding: "clamp(16px, 4vw, 24px)",
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 16px 38px rgba(15,23,42,0.08)",
  display: "grid",
  gap: 14,
};

const sectionHead: CSSProperties = {
  display: "grid",
  gap: 6,
};

const sectionEyebrow: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#E44F2A",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

const sectionTitle: CSSProperties = {
  fontSize: "clamp(18px, 4vw, 20px)",
  fontWeight: 950,
  color: "#111827",
  lineHeight: 1.2,
};

const sectionText: CSSProperties = {
  color: "#64748B",
  lineHeight: 1.6,
  fontSize: "clamp(13px, 2.8vw, 14px)",
};

const sectionGridSingle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const formSection: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: "clamp(14px, 3vw, 18px)",
  borderRadius: 22,
  background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFD 100%)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const sectionContent: CSSProperties = {
  display: "grid",
  gap: 12,
};

const gridTwo: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  gap: 12,
  alignItems: "start",
};

const fieldWrap: CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 0,
};

const fieldLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#111827",
};

const fieldInput: CSSProperties = {
  width: "100%",
  minWidth: 0,
  minHeight: 52,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#FCFCFD",
  padding: "0 14px",
  boxSizing: "border-box",
  color: "#111827",
  fontWeight: 700,
  fontSize: 15,
  outline: "none",
};

const fieldHelp: CSSProperties = {
  fontSize: 12.5,
  color: "#64748B",
  lineHeight: 1.45,
};

const uploadCard: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "linear-gradient(180deg, #FFFDFB 0%, #FFFFFF 100%)",
  boxSizing: "border-box",
  cursor: "pointer",
};

const hiddenFileInput: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const uploadHeader: CSSProperties = {
  display: "flex",
  gap: 10,
  justifyContent: "space-between",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const uploadTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "#111827",
};

const uploadDescription: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  lineHeight: 1.45,
  color: "#64748B",
};

const uploadStatus: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  background: "rgba(15,23,42,0.05)",
  color: "#475569",
  fontSize: 12,
  fontWeight: 800,
  flexShrink: 0,
};

const uploadStatusReady: CSSProperties = {
  background: "rgba(22,163,74,0.12)",
  color: "#166534",
};

const uploadActionRow: CSSProperties = {
  display: "grid",
  gap: 8,
};

const uploadButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "fit-content",
  minHeight: 40,
  padding: "0 14px",
  borderRadius: 14,
  background: "rgba(228,79,42,0.10)",
  color: "#C2410C",
  fontSize: 13,
  fontWeight: 900,
};

const uploadFileName: CSSProperties = {
  color: "#111827",
  fontWeight: 700,
  fontSize: 13.5,
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const uploadMeta: CSSProperties = {
  color: "#64748B",
  fontSize: 12.5,
  lineHeight: 1.45,
};

const submitBlock: CSSProperties = {
  display: "grid",
  gap: 8,
};

const submitNote: CSSProperties = {
  textAlign: "center",
  color: "#64748B",
  fontSize: 12.5,
  lineHeight: 1.45,
};

const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 52,
  borderRadius: 18,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 950,
  fontSize: 15,
  cursor: "pointer",
  boxShadow: "0 16px 30px rgba(228,79,42,0.16)",
};

const secondaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 50,
  borderRadius: 18,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  fontSize: 15,
  cursor: "pointer",
};

const errorBox: CSSProperties = {
  borderRadius: 18,
  padding: "14px 16px",
  background: "rgba(185,28,28,0.06)",
  border: "1px solid rgba(185,28,28,0.12)",
  color: "#991B1B",
  fontWeight: 800,
  lineHeight: 1.5,
};

const identityBox: CSSProperties = {
  borderRadius: 20,
  padding: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
  color: "#111827",
  lineHeight: 1.55,
};

const identityTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const identityMeta: CSSProperties = {
  marginTop: 6,
  color: "#64748B",
  fontSize: 13.5,
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const actionGrid: CSSProperties = {
  display: "grid",
  gap: 10,
};

const statusRow: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
};

const statusPill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 32,
  padding: "0 12px",
  borderRadius: 999,
  background: "rgba(245,158,11,0.14)",
  color: "#B45309",
  fontSize: 12.5,
  fontWeight: 900,
};

const statusPillApproved: CSSProperties = {
  background: "rgba(22,163,74,0.12)",
  color: "#166534",
};

const statusPillRejected: CSSProperties = {
  background: "rgba(185,28,28,0.10)",
  color: "#991B1B",
};
