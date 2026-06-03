import { useState, type CSSProperties } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import PasswordInput from "../../components/PasswordInput";
import { useAuthStore } from "../../store/useAuthStore";

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const signInAdmin = useAuthStore((s) => s.signInAdmin);
  const loading = useAuthStore((s) => s.loading);
  const profile = useAuthStore((s) => s.profile);
  const error = useAuthStore((s) => s.error);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const redirectTo =
    typeof location.state === "object" && location.state && "from" in location.state
      ? String((location.state as any).from || "/admin")
      : "/admin";

  if (profile?.role === "admin") {
    return <Navigate to={redirectTo} replace />;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");

    if (!email.trim() || !password.trim()) {
      setLocalError("Informe e-mail e senha do admin.");
      return;
    }

    try {
      await signInAdmin(email, password);
      navigate(redirectTo, { replace: true });
    } catch (submitError) {
      setLocalError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : "Nao foi possivel entrar no painel."
      );
    }
  }

  return (
    <div style={page}>
      <div style={glowTop} />
      <div style={glowBottom} />

      <div style={card}>
        <div style={eyebrow}>Central Gas | Seguranca ADM</div>
        <div style={title}>Login do painel</div>
        <div style={subtitle}>
          O acesso administrativo exige autenticacao valida e permissao ativa de administrador.
        </div>

        <form onSubmit={onSubmit} style={form}>
          <label style={fieldWrap}>
            <span style={fieldLabel}>E-mail</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="username"
              style={fieldInput}
              placeholder="admin@empresa.com"
            />
          </label>

          <PasswordInput
            label="Senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            inputStyle={fieldInput}
            labelStyle={fieldLabel}
            wrapStyle={fieldWrap}
            placeholder="Sua senha"
          />

          {localError || error ? <div style={errorBox}>{localError || error}</div> : null}

          <button type="submit" style={primaryBtn} disabled={loading}>
            {loading ? "Entrando..." : "Entrar no painel"}
          </button>
        </form>
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(228,79,42,0.10), transparent 26%), radial-gradient(circle at bottom right, rgba(245,158,11,0.10), transparent 24%), #F6F7FB",
  display: "grid",
  placeItems: "center",
  padding: 16,
  boxSizing: "border-box",
  position: "relative",
  overflow: "hidden",
};

const glowTop: CSSProperties = {
  position: "absolute",
  top: -120,
  left: -110,
  width: 320,
  height: 320,
  borderRadius: "50%",
  background: "rgba(228,79,42,0.10)",
  filter: "blur(44px)",
};

const glowBottom: CSSProperties = {
  position: "absolute",
  bottom: -140,
  right: -100,
  width: 340,
  height: 340,
  borderRadius: "50%",
  background: "rgba(245,158,11,0.10)",
  filter: "blur(48px)",
};

const card: CSSProperties = {
  width: "min(100%, 430px)",
  background: "rgba(255,255,255,0.94)",
  borderRadius: 28,
  padding: 22,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 24px 54px rgba(15,23,42,0.12)",
  position: "relative",
  zIndex: 1,
};

const eyebrow: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  color: "#E44F2A",
};

const title: CSSProperties = {
  marginTop: 10,
  fontSize: 24,
  fontWeight: 950,
  color: "#111827",
};

const subtitle: CSSProperties = {
  marginTop: 10,
  color: "#475569",
  lineHeight: 1.6,
  fontSize: 14.5,
  fontWeight: 700,
};

const form: CSSProperties = {
  marginTop: 22,
  display: "grid",
  gap: 14,
};

const fieldWrap: CSSProperties = {
  display: "grid",
  gap: 8,
};

const fieldLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#111827",
};

const fieldInput: CSSProperties = {
  height: 52,
  borderRadius: 18,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#EEF4FF",
  padding: "0 16px",
  fontWeight: 800,
  color: "#111827",
  outline: "none",
  boxSizing: "border-box",
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

const primaryBtn: CSSProperties = {
  marginTop: 4,
  height: 56,
  borderRadius: 20,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 950,
  fontSize: 16,
  cursor: "pointer",
  boxShadow: "0 18px 36px rgba(228,79,42,0.20)",
  opacity: 1,
};
