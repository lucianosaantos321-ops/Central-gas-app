import { supabase } from "./supabase";
import { saveClientProfilePatch } from "./remoteUserStateService";
import {
  readLocalUserDocumentPayload,
  type ClientProfileDocument,
} from "./userStateSchemas";
import { useAuthStore } from "../store/useAuthStore";

export type ClientAccessSession = {
  authUserId: string;
  phone: string;
  email: string;
  fullName: string;
  cpf: string;
  loggedAt: string;
};

export type ClientRegisterInput = {
  fullName: string;
  birthDate?: string;
  cpf: string;
  whatsapp: string;
  email?: string;
  password: string;
  confirmPassword?: string;
};

const SESSION_KEY = "cg_client_access_session";
const BIOMETRIC_OPT_IN_KEY = "cg_client_biometric_opt_in";
const RECOVERY_PREF_KEY = "cg_client_recovery_pref";

function now() {
  return new Date().toISOString();
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePhone(value: unknown) {
  return onlyDigits(value).slice(0, 11);
}

function isValidPhone(value: string) {
  const digits = normalizePhone(value);
  return digits.length === 10 || digits.length === 11;
}

function buildClientAuthEmail(phone: string) {
  const digits = normalizePhone(phone);
  return digits ? `cliente.${digits}@centralgas.local` : "";
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function normalizeAuthError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "Não foi possível validar sua conta.";

  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalized.includes("user already registered") ||
    normalized.includes("already registered")
  ) {
    return "Ja existe uma conta com esse numero de celular.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Não foi possível concluir seu acesso agora. Tente novamente em instantes.";
  }

  if (
    normalized.includes("password should be at least 6") ||
    normalized.includes("password should be at least") ||
    normalized.includes("weak password") ||
    normalized.includes("password")
  ) {
    return "Crie uma senha com pelo menos 6 caracteres.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Número de celular ou senha inválidos.";
  }

  if (normalized.includes("cpf_already_bound")) {
    return "Esse CPF já está vinculado a outra conta.";
  }

  if (normalized.includes("profile_role_conflict")) {
    return "Essa conta já está vinculada a outro tipo de acesso.";
  }

  return message;
}

function isAlreadyRegisteredError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "";

  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return (
    normalized.includes("user already registered") ||
    normalized.includes("already registered")
  );
}

function saveSession(session: ClientAccessSession) {
  safeWrite(SESSION_KEY, session);
}

export function saveClientAccessSession(session: ClientAccessSession) {
  saveSession(session);
}

export function getClientAccessSession() {
  return safeRead<ClientAccessSession | null>(SESSION_KEY, null);
}

export function clearClientAccessSession() {
  safeRemove(SESSION_KEY);
}

function isBiometryApiAvailable() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

function readClientProfile() {
  return readLocalUserDocumentPayload("client_profile") as ClientProfileDocument;
}

export const clientAccessService = {
  isBiometryApiAvailable,

  getBiometricPreference() {
    return safeRead<boolean>(BIOMETRIC_OPT_IN_KEY, false);
  },

  setBiometricPreference(enabled: boolean) {
    safeWrite(BIOMETRIC_OPT_IN_KEY, Boolean(enabled));
  },

  getRecoveryPreference() {
    return safeRead<"email" | "whatsapp">(RECOVERY_PREF_KEY, "email");
  },

  setRecoveryPreference(channel: "email" | "whatsapp") {
    safeWrite(RECOVERY_PREF_KEY, channel);
  },

  async register(input: ClientRegisterInput) {
    const phone = normalizePhone(input.whatsapp);
    const authEmail = buildClientAuthEmail(phone);
    const password = String(input.password || "").trim();
    const confirmPassword = String(input.confirmPassword || "").trim();
    const fullName = normalizeText(input.fullName);
    const cpf = onlyDigits(input.cpf);
    const whatsapp = normalizeText(input.whatsapp);
    const birthDate = normalizeText(input.birthDate);
    const email = normalizeText(input.email);

    if (!fullName) throw new Error("Informe seu nome completo.");
    if (cpf.length !== 11) throw new Error("Informe um CPF válido.");
    if (!isValidPhone(phone)) throw new Error("Informe um celular válido com DDD.");
    if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    if (confirmPassword && confirmPassword !== password) {
      throw new Error("Confirme a senha exatamente igual.");
    }

    await useAuthStore.getState().signOut().catch(() => null);

    const signUpResult = await supabase.auth.signUp({
      email: authEmail,
      password,
    });

    if (signUpResult.error) {
      if (!isAlreadyRegisteredError(signUpResult.error)) {
        throw new Error(normalizeAuthError(signUpResult.error));
      }

      const signInResult = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });
      if (signInResult.error || !signInResult.data.session?.user) {
        throw new Error(
          normalizeAuthError(signInResult.error ?? "Não foi possível abrir sua sessão.")
        );
      }
    } else if (!signUpResult.data.session?.user) {
      const signInResult = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });
      if (signInResult.error || !signInResult.data.session?.user) {
        throw new Error(
          normalizeAuthError(signInResult.error ?? "Não foi possível abrir sua sessão.")
        );
      }
    }

    await useAuthStore.getState().ensureRole("cliente");

    const { data, error } = await supabase.rpc("upsert_current_client_identity", {
      p_nome: fullName,
      p_telefone: whatsapp,
      p_cpf: cpf,
      p_birth_date: birthDate || null,
      p_email: email || null,
    });

    if (error) {
      throw new Error(normalizeAuthError(error));
    }

    saveClientProfilePatch({
      nome: fullName,
      telefone: whatsapp,
      cpf,
      email,
      nascimento: birthDate,
    });

    const authUserId = normalizeText((data as { auth_user_id?: unknown } | null)?.auth_user_id);
    const session: ClientAccessSession = {
      authUserId,
      phone,
      email,
      fullName,
      cpf,
      loggedAt: now(),
    };
    saveSession(session);
    await useAuthStore.getState().refreshProfile().catch(() => null);
    return session;
  },

  async signIn(phoneInput: string, passwordInput: string) {
    const phone = normalizePhone(phoneInput);
    const authEmail = buildClientAuthEmail(phone);
    const password = String(passwordInput || "").trim();

    if (!isValidPhone(phone) || !password) {
      throw new Error("Informe celular com DDD e senha.");
    }

    await useAuthStore.getState().signOut().catch(() => null);

    const result = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });
    if (result.error || !result.data.session?.user) {
      throw new Error(
        normalizeAuthError(result.error ?? "Número de celular ou senha inválidos.")
      );
    }

    const profile = await useAuthStore.getState().ensureRole("cliente");
    const clientProfile = readClientProfile();
    const session: ClientAccessSession = {
      authUserId: profile?.authUserId ?? result.data.session.user.id,
      phone: normalizePhone(profile?.phone) || phone,
      email: normalizeText(clientProfile.email),
      fullName: normalizeText(profile?.displayName) || normalizeText(clientProfile.nome),
      cpf: normalizeText(clientProfile.cpf),
      loggedAt: now(),
    };
    saveSession(session);
    return session;
  },

  async signOut() {
    clearClientAccessSession();
    await useAuthStore.getState().signOut();
  },

  async updatePassword(nextPasswordInput: string, confirmPasswordInput: string) {
    const nextPassword = String(nextPasswordInput || "").trim();
    const confirmPassword = String(confirmPasswordInput || "").trim();

    if (nextPassword.length < 6) {
      throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
    }

    if (nextPassword !== confirmPassword) {
      throw new Error("Confirme a nova senha exatamente igual.");
    }

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user || data.session.user.is_anonymous) {
      throw new Error("Entre na sua conta para atualizar a senha.");
    }

    const updateResult = await supabase.auth.updateUser({
      password: nextPassword,
    });

    if (updateResult.error) {
      throw new Error(normalizeAuthError(updateResult.error));
    }

    const currentSession = getClientAccessSession();
    if (currentSession) {
      saveSession({
        ...currentSession,
        loggedAt: now(),
      });
    }

    return true;
  },

  async requestPasswordReset(phoneInput: string, channel: "email" | "whatsapp") {
    const phone = normalizePhone(phoneInput);
    if (!isValidPhone(phone)) {
      throw new Error("Informe um celular válido com DDD para recuperar sua senha.");
    }

    this.setRecoveryPreference(channel);

    throw new Error(
      "A recuperacao fora da conta depende do atendimento da Central. Fale com o suporte pelo WhatsApp."
    );
  },
};
