import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { appLogger } from "../services/appLogger";
import { trackMetric } from "../services/appMetrics";
import { supabase, supabaseAnonKey, supabaseUrl } from "../services/supabase";
import { useEntregadorStore } from "./useEntregadorStore";
import { hydrateUserStateForProfile } from "../services/remoteUserStateService";
import {
  readLocalUserDocumentPayload,
  type ClientProfileDocument,
} from "../services/userStateSchemas";
import {
  disableRemotePushDevice,
  syncRemotePushForProfile,
} from "../services/remotePushService";

export type AppRole = "cliente" | "entregador" | "admin";

export type AuthProfile = {
  authUserId: string;
  role: AppRole;
  displayName: string | null;
  phone: string | null;
  delivererId: string | null;
};

type AuthState = {
  initialized: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  error: string;
  stage: string;
  ensureRole: (role: AppRole) => Promise<AuthProfile | null>;
  refreshProfile: () => Promise<AuthProfile | null>;
  signInAdmin: (email: string, password: string) => Promise<AuthProfile>;
  signOut: () => Promise<void>;
};

const SESSION_TIMEOUT_MS = 8000;
const SIGNOUT_TIMEOUT_MS = 4000;
const ANON_TIMEOUT_MS = 8000;
const PROFILE_RPC_TIMEOUT_MS = 15000;
const PROFILE_FETCH_TIMEOUT_MS = 8000;
const ADMIN_SIGNIN_TIMEOUT_MS = 90000;
const ADMIN_PROFILE_FETCH_TIMEOUT_MS = 20000;
const SESSION_STORE_WAIT_MS = 6000;

function safeGet(key: string, fallback = "") {
  try {
    const value = localStorage.getItem(key);
    return value && value.trim() ? value : fallback;
  } catch {
    return fallback;
  }
}

function debugAuth(step: string, details?: unknown) {
  appLogger.debug("auth", step, details);
}

function normalizeAuthError(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "";

  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("email not confirmed")
  ) {
    return "Credenciais de admin invalidas.";
  }

  if (
    normalized.includes("password should be at least 6") ||
    normalized.includes("password should be at least") ||
    normalized.includes("weak password")
  ) {
    return "Crie uma senha com pelo menos 6 caracteres.";
  }

  if (normalized.includes("admin_login_required")) {
    return "Faca login de admin para continuar.";
  }

  if (normalized.includes("admin_forbidden")) {
    return "Sua conta nao tem permissao de admin.";
  }

  if (normalized.includes("admin_signin_timeout")) {
    return "O login do admin demorou demais.";
  }

  if (normalized.includes("admin_profile_fetch_timeout")) {
    return "A leitura do perfil de admin demorou demais.";
  }

  if (normalized.includes("deliverer_id_already_bound")) {
    return "Esse entregador ja esta vinculado a outra conta.";
  }

  if (normalized.includes("deliverer_id_required")) {
    return "O entregador precisa ter um identificador valido.";
  }

  if (normalized.includes("profile_not_ready")) {
    return "A sessao foi criada, mas o perfil ainda nao ficou pronto.";
  }

  if (normalized.includes("profile_role_mismatch")) {
    return "O perfil retornado nao corresponde ao modo atual do app.";
  }

  if (normalized.includes("session_timeout")) {
    return "A leitura da sessao demorou demais.";
  }

  if (normalized.includes("signout_timeout")) {
    return "O app demorou demais para limpar a sessao anterior.";
  }

  if (normalized.includes("anon_session_timeout")) {
    return "A criacao da sessao anonima demorou demais.";
  }

  if (normalized.includes("profile_rpc_timeout")) {
    return "A criacao do perfil no servidor demorou demais.";
  }

  if (normalized.includes("profile_fetch_timeout")) {
    return "A leitura final do perfil demorou demais.";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("fetch") ||
    normalized.includes("offline")
  ) {
    return "Falha de conexao com o servidor.";
  }

  return raw || "Falha ao autenticar.";
}

function isRetryableAuthError(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "";

  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return (
    normalized.includes("session_timeout") ||
    normalized.includes("signout_timeout") ||
    normalized.includes("anon_session_timeout") ||
    normalized.includes("profile_fetch_timeout") ||
    normalized.includes("profile_not_ready") ||
    normalized.includes("network") ||
    normalized.includes("fetch") ||
    normalized.includes("offline")
  );
}

function isNonAnonymousSession(session: Session | null | undefined) {
  return Boolean(session?.user && !session.user.is_anonymous);
}

function normalizePersistedSession(value: unknown): Session | null {
  if (!value || typeof value !== "object") return null;

  const candidate =
    "currentSession" in (value as Record<string, unknown>)
      ? (value as { currentSession?: unknown }).currentSession
      : value;

  if (!candidate || typeof candidate !== "object") return null;

  const accessToken = String(
    (candidate as { access_token?: unknown }).access_token || ""
  ).trim();
  const refreshToken = String(
    (candidate as { refresh_token?: unknown }).refresh_token || ""
  ).trim();
  const user = (candidate as { user?: unknown }).user;

  if (!accessToken || !refreshToken || !user || typeof user !== "object") {
    return null;
  }

  return candidate as Session;
}

function readPersistedSessionFromStorage(requireNonAnonymous = false): Session | null {
  if (typeof window === "undefined") return null;

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.includes("auth-token")) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }

      const session = normalizePersistedSession(parsed);
      if (!session?.user) continue;
      if (requireNonAnonymous && !isNonAnonymousSession(session)) continue;

      debugAuth("readPersistedSessionFromStorage:resolved", {
        key,
        userId: session.user.id,
        anonymous: session.user.is_anonymous ?? null,
      });

      return session;
    }
  } catch {
    // ignore
  }

  return null;
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  errorCode: string,
): Promise<T> {
  let timer: number | null = null;

  return await Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    }),
    new Promise<T>((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error(errorCode));
      }, ms);
    }),
  ]);
}

function syncDelivererId(delivererId: string | null) {
  if (!delivererId) return;
  useEntregadorStore.getState().setEntregadorId(delivererId);
}

function getClientIdentity() {
  const clientProfile = readLocalUserDocumentPayload(
    "client_profile"
  ) as ClientProfileDocument;

  return {
    nome: clientProfile.nome || safeGet("cg_user_name", "") || "Cliente",
    telefone:
      clientProfile.telefone ||
      safeGet("cg_user_phone", "") ||
      safeGet("cg_cliente_telefone", "") ||
      null,
  };
}

function getDelivererIdentity() {
  const store = useEntregadorStore.getState();
  const legacyId = store.ensureEntregadorId();

  return {
    entregadorId: legacyId,
    nome: safeGet("cg_deliverer_name", "Entregador"),
    telefone: safeGet("cg_deliverer_phone", ""),
  };
}

async function fetchProfileForUser(userId: string): Promise<AuthProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("auth_user_id, role, display_name, phone")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  let delivererId: string | null = null;

  if ((data as any).role === "entregador" || (data as any).role === "admin") {
    const delivererRes = await supabase
      .from("deliverer_accounts")
      .select("entregador_id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (delivererRes.error) {
      throw new Error(delivererRes.error.message);
    }

    delivererId = String((delivererRes.data as any)?.entregador_id ?? "").trim() || null;
  }

  return {
    authUserId: String((data as any).auth_user_id),
    role: String((data as any).role) as AppRole,
    displayName:
      typeof (data as any).display_name === "string"
        ? (data as any).display_name
        : null,
    phone:
      typeof (data as any).phone === "string" ? (data as any).phone : null,
    delivererId,
  };
}

function buildRestHeaders(accessToken: string) {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function buildAnonHeaders() {
  return {
    apikey: supabaseAnonKey,
    "Content-Type": "application/json",
  };
}

async function readJsonSafely(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function ensureCurrentProfileViaRest(
  session: Session,
  payload: {
    role: Extract<AppRole, "cliente" | "entregador">;
    entregadorId: string | null;
    nome: string | null;
    telefone: string | null;
  },
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/ensure_current_profile`, {
    method: "POST",
    headers: {
      ...buildRestHeaders(session.access_token),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      p_role: payload.role,
      p_entregador_id: payload.entregadorId,
      p_nome: payload.nome,
      p_telefone: payload.telefone,
    }),
  });

  if (!response.ok) {
    const body = await readJsonSafely(response);
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message?: unknown }).message || "")
        : typeof body === "string"
        ? body
        : `REST_RPC_FAILED_${response.status}`;

    throw new Error(message || `REST_RPC_FAILED_${response.status}`);
  }

  return await readJsonSafely(response);
}

async function fetchProfileForUserViaRest(
  userId: string,
  accessToken: string,
): Promise<AuthProfile | null> {
  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/user_profiles?auth_user_id=eq.${encodeURIComponent(
      userId,
    )}&select=auth_user_id,role,display_name,phone&limit=1`,
    {
      method: "GET",
      headers: {
        ...buildRestHeaders(accessToken),
        Accept: "application/json",
      },
    },
  );

  if (!profileResponse.ok) {
    const body = await readJsonSafely(profileResponse);
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message?: unknown }).message || "")
        : typeof body === "string"
        ? body
        : `REST_PROFILE_FAILED_${profileResponse.status}`;

    throw new Error(message || `REST_PROFILE_FAILED_${profileResponse.status}`);
  }

  const profileRows = (await readJsonSafely(profileResponse)) as
    | Array<Record<string, unknown>>
    | null;
  const data = Array.isArray(profileRows) ? profileRows[0] ?? null : null;

  if (!data) return null;

  let delivererId: string | null = null;

  if (data.role === "entregador" || data.role === "admin") {
    const delivererResponse = await fetch(
      `${supabaseUrl}/rest/v1/deliverer_accounts?auth_user_id=eq.${encodeURIComponent(
        userId,
      )}&select=entregador_id&limit=1`,
      {
        method: "GET",
        headers: {
          ...buildRestHeaders(accessToken),
          Accept: "application/json",
        },
      },
    );

    if (!delivererResponse.ok) {
      const body = await readJsonSafely(delivererResponse);
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? String((body as { message?: unknown }).message || "")
          : typeof body === "string"
          ? body
          : `REST_DELIVERER_FAILED_${delivererResponse.status}`;

      throw new Error(message || `REST_DELIVERER_FAILED_${delivererResponse.status}`);
    }

    const delivererRows = (await readJsonSafely(delivererResponse)) as
      | Array<Record<string, unknown>>
      | null;

    delivererId =
      String(delivererRows?.[0]?.entregador_id ?? "").trim() || null;
  }

  return {
    authUserId: String(data.auth_user_id ?? ""),
    role: String(data.role ?? "") as AppRole,
    displayName: typeof data.display_name === "string" ? data.display_name : null,
    phone: typeof data.phone === "string" ? data.phone : null,
    delivererId,
  };
}

async function signInAdminViaRest(email: string, password: string) {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: buildAnonHeaders(),
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    }
  );

  const body = await readJsonSafely(response);

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null
        ? String(
            (body as { msg?: unknown; message?: unknown; error_description?: unknown })
              .msg ||
              (body as { msg?: unknown; message?: unknown; error_description?: unknown })
                .message ||
              (body as { msg?: unknown; message?: unknown; error_description?: unknown })
                .error_description ||
              ""
          )
        : typeof body === "string"
        ? body
        : `ADMIN_REST_SIGNIN_FAILED_${response.status}`;

    throw new Error(message || `ADMIN_REST_SIGNIN_FAILED_${response.status}`);
  }

  const accessToken =
    typeof body === "object" && body !== null && "access_token" in body
      ? String((body as { access_token?: unknown }).access_token || "")
      : "";
  const refreshToken =
    typeof body === "object" && body !== null && "refresh_token" in body
      ? String((body as { refresh_token?: unknown }).refresh_token || "")
      : "";

  if (!accessToken || !refreshToken) {
    throw new Error("ADMIN_LOGIN_REQUIRED");
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.session ?? null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchProfileForUserWithRetry(
  userId: string,
  attempts = 3,
  accessToken?: string,
) {
  for (let index = 0; index < attempts; index += 1) {
    const profile = accessToken
      ? await fetchProfileForUserViaRest(userId, accessToken)
      : await fetchProfileForUser(userId);
    if (profile) {
      return profile;
    }

    if (index < attempts - 1) {
      await sleep(250);
    }
  }

  return null;
}

let authListenerInstalled = false;
let authListenerRequestVersion = 0;

function installAuthListener(set: (partial: Partial<AuthState>) => void) {
  if (authListenerInstalled) return;
  authListenerInstalled = true;

  supabase.auth.onAuthStateChange((event, session) => {
    const applyAuthState = () => {
      debugAuth("onAuthStateChange", {
        event,
        hasSession: !!session,
        anonymous: session?.user?.is_anonymous ?? null,
        userId: session?.user?.id ?? null,
      });

      set({
        session,
        user: session?.user ?? null,
      });

      if (!session?.user) {
        authListenerRequestVersion += 1;
        set({
          profile: null,
          error: "",
        });
        return;
      }

      if (session.user.is_anonymous) {
        authListenerRequestVersion += 1;
        set({
          error: "",
        });
        return;
      }

      const requestVersion = ++authListenerRequestVersion;

      window.setTimeout(() => {
        void (async () => {
          try {
            const profile = await fetchProfileForUserViaRest(
              session.user.id,
              session.access_token,
            );

            if (requestVersion !== authListenerRequestVersion) {
              return;
            }

            if (profile?.delivererId) {
              syncDelivererId(profile.delivererId);
            }

            set({
              profile,
              error: "",
            });
          } catch (error) {
            if (requestVersion !== authListenerRequestVersion) {
              return;
            }

            set({
              profile: null,
              error: normalizeAuthError(error),
            });
          }
        })();
      }, 0);
    };

    if (typeof window !== "undefined") {
      window.setTimeout(applyAuthState, 0);
      return;
    }

    Promise.resolve().then(applyAuthState);
  });
}

async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }
  return data.session ?? null;
}

async function signOutWithTimeout() {
  await withTimeout(supabase.auth.signOut(), SIGNOUT_TIMEOUT_MS, "SIGNOUT_TIMEOUT");
}

async function ensureAnonymousSession(
  role: Extract<AppRole, "cliente" | "entregador">,
  setStage: (value: string) => void,
  forceFresh = false,
  existingSession: Session | null = null,
) {
  debugAuth("ensureAnonymousSession:start", { role, forceFresh });

  let session = existingSession;

  if (!session?.user) {
    setStage("Lendo sessao atual");
    session = await withTimeout(getCurrentSession(), SESSION_TIMEOUT_MS, "SESSION_TIMEOUT");
  } else {
    debugAuth("ensureAnonymousSession:usingCachedSession", {
      role,
      userId: session.user.id,
      anonymous: session.user.is_anonymous ?? null,
    });
  }

  debugAuth("ensureAnonymousSession:current", {
    hasSession: !!session,
    anonymous: session?.user?.is_anonymous ?? null,
    userId: session?.user?.id ?? null,
  });

  if (forceFresh && session?.user) {
    setStage("Limpando sessao anterior");
    await signOutWithTimeout();
    session = null;
  }

  if (session?.user && !session.user.is_anonymous) {
    setStage("Limpando sessao antiga");
    await signOutWithTimeout();
    session = null;
  }

  if (session?.user?.is_anonymous) {
    debugAuth("ensureAnonymousSession:reuseAnonymous", {
      role,
      userId: session.user.id,
    });
    return session;
  }

  setStage(
    role === "entregador"
      ? "Criando sessao anonima do entregador"
      : "Criando sessao anonima do cliente",
  );

  const { data, error } = await withTimeout(
    supabase.auth.signInAnonymously(),
    ANON_TIMEOUT_MS,
    "ANON_SESSION_TIMEOUT",
  );

  if (error) {
    throw new Error(error.message);
  }

  session = data.session ?? null;

  debugAuth("ensureAnonymousSession:createAnonymous:done", {
    hasSession: !!session,
    anonymous: session?.user?.is_anonymous ?? null,
    userId: session?.user?.id ?? null,
  });

  if (!session?.user) {
    throw new Error("ANON_SESSION_TIMEOUT");
  }

  return session;
}

async function resolveRoleSession(
  role: Extract<AppRole, "cliente" | "entregador">,
  setStage: (value: string) => void,
  forceFresh = false,
  existingSession: Session | null = null,
) {
  let session = existingSession;

  if (!session?.user) {
    setStage("Lendo sessao atual");
    session = await withTimeout(getCurrentSession(), SESSION_TIMEOUT_MS, "SESSION_TIMEOUT");
  }

  if (session?.user && !session.user.is_anonymous) {
    debugAuth("resolveRoleSession:reuseNonAnonymous", {
      role,
      userId: session.user.id,
    });
    return session;
  }

  return await ensureAnonymousSession(role, setStage, forceFresh, session);
}

async function ensureProfileOnce(
  role: Extract<AppRole, "cliente" | "entregador">,
  setStage: (value: string) => void,
  forceFresh = false,
  existingSession: Session | null = null,
) {
  const session = await resolveRoleSession(
    role,
    setStage,
    forceFresh,
    existingSession,
  );

  if (role === "cliente") {
    const identity = getClientIdentity();
    setStage("Garantindo perfil do cliente");

    await withTimeout(
      ensureCurrentProfileViaRest(session, {
        role,
        entregadorId: null,
        nome: identity.nome,
        telefone: identity.telefone,
      }),
      PROFILE_RPC_TIMEOUT_MS,
      "PROFILE_RPC_TIMEOUT",
    );
  } else {
    const identity = getDelivererIdentity();
    setStage("Garantindo perfil do entregador");

    await withTimeout(
      ensureCurrentProfileViaRest(session, {
        role,
        entregadorId: identity.entregadorId,
        nome: identity.nome,
        telefone: identity.telefone,
      }),
      PROFILE_RPC_TIMEOUT_MS,
      "PROFILE_RPC_TIMEOUT",
    );
  }

  debugAuth("ensureProfile:rpcDone", {
    role,
    userId: session.user.id,
  });

  setStage("Carregando perfil final");
  const profile = await withTimeout(
    fetchProfileForUserWithRetry(session.user.id, 3, session.access_token),
    PROFILE_FETCH_TIMEOUT_MS,
    "PROFILE_FETCH_TIMEOUT",
  );

  if (!profile) {
    throw new Error("PROFILE_NOT_READY");
  }

  if (profile.role !== role && !(role === "entregador" && profile.role === "admin")) {
    throw new Error("PROFILE_ROLE_MISMATCH");
  }

  if (profile.delivererId) {
    syncDelivererId(profile.delivererId);
  }

  debugAuth("ensureProfile:profileLoaded", {
    role,
    userId: session.user.id,
    profileRole: profile.role,
    delivererId: profile.delivererId,
  });

  return {
    session,
    profile,
  };
}

async function ensureProfileWithRecovery(
  role: Extract<AppRole, "cliente" | "entregador">,
  setStage: (value: string) => void,
  existingSession: Session | null = null,
) {
  try {
    return await ensureProfileOnce(role, setStage, false, existingSession);
  } catch (error) {
    debugAuth("ensureProfile:firstAttemptFailed", {
      role,
      message: normalizeAuthError(error),
    });

    if (!isRetryableAuthError(error)) {
      throw error;
    }

    setStage("Refazendo sessao e tentando novamente");

    try {
      await signOutWithTimeout();
    } catch {
      // ignore forced cleanup error before retry
    }

    return await ensureProfileOnce(role, setStage, true, null);
  }
}

export const useAuthStore = create<AuthState>((set, get) => {
  installAuthListener(set);

  const setStage = (value: string) => {
    set({ stage: value });
    debugAuth("stage", value);
  };

  const waitForSessionFromStore = async (requireNonAnonymous = false) => {
    const deadline = Date.now() + SESSION_STORE_WAIT_MS;

    while (Date.now() < deadline) {
      const candidate = get().session;
      if (candidate?.user) {
        if (!requireNonAnonymous || isNonAnonymousSession(candidate)) {
          debugAuth("waitForSessionFromStore:resolved", {
            userId: candidate.user.id,
            anonymous: candidate.user.is_anonymous ?? null,
          });
          return candidate;
        }
      }

      await sleep(150);
    }

    return null;
  };

  const resolveCurrentSession = async (requireNonAnonymous = false) => {
    const cachedSession = get().session;
    if (cachedSession?.user) {
      if (!requireNonAnonymous || isNonAnonymousSession(cachedSession)) {
        debugAuth("resolveCurrentSession:cacheHit", {
          userId: cachedSession.user.id,
          anonymous: cachedSession.user.is_anonymous ?? null,
        });
        return cachedSession;
      }
    }

    const persistedSession = readPersistedSessionFromStorage(requireNonAnonymous);
    if (persistedSession?.user) {
      set({
        session: persistedSession,
        user: persistedSession.user,
      });
      return persistedSession;
    }

    try {
      const session = await withTimeout(
        getCurrentSession(),
        SESSION_TIMEOUT_MS,
        "SESSION_TIMEOUT",
      );

      if (session?.user) {
        if (!requireNonAnonymous || isNonAnonymousSession(session)) {
          debugAuth("resolveCurrentSession:getSession", {
            userId: session.user.id,
            anonymous: session.user.is_anonymous ?? null,
          });
          return session;
        }
      }

      const awaitedSession = await waitForSessionFromStore(requireNonAnonymous);
      return awaitedSession ?? session;
    } catch (error) {
      const normalized = normalizeAuthError(error);
      debugAuth("resolveCurrentSession:getSessionFailed", {
        requireNonAnonymous,
        message: normalized,
      });

      if (!String(normalized).includes("leitura da sessao")) {
        throw error;
      }

      const awaitedSession = await waitForSessionFromStore(requireNonAnonymous);
      if (awaitedSession) {
        return awaitedSession;
      }

      throw error;
    }
  };

  return {
    initialized: false,
    loading: false,
    session: null,
    user: null,
    profile: null,
    error: "",
    stage: "",

    ensureRole: async (role) => {
      set({ loading: true, error: "" });
      setStage(role === "entregador" ? "Preparando sessao do entregador" : "Preparando sessao");
      debugAuth("ensureRole:start", { role });

      try {
        const currentState = get();
        const currentSession = currentState.session;
        const currentProfile = currentState.profile;

        if (
          role !== "admin" &&
          currentSession?.user &&
          currentProfile?.role === role
        ) {
          debugAuth("ensureRole:cacheHit", {
            role,
            userId: currentSession.user.id,
            anonymous: currentSession.user.is_anonymous ?? null,
          });

          set({
            initialized: true,
            loading: false,
            session: currentSession,
            user: currentSession.user,
            profile: currentProfile,
            error: "",
            stage: "",
          });
          return currentProfile;
        }

        if (
          role === "admin" &&
          currentSession?.user &&
          !currentSession.user.is_anonymous &&
          currentProfile?.role === "admin"
        ) {
          debugAuth("ensureRole:adminCacheHit", {
            userId: currentSession.user.id,
          });

          set({
            initialized: true,
            loading: false,
            session: currentSession,
            user: currentSession.user,
            profile: currentProfile,
            error: "",
            stage: "",
          });
          return currentProfile;
        }

        if (role === "admin") {
          setStage("Conferindo sessao de admin");
          const session = await resolveCurrentSession(true);

          if (!session?.user || session.user.is_anonymous) {
            set({
              initialized: true,
              loading: false,
              session: session ?? null,
              user: session?.user ?? null,
              profile: null,
              error: "Faca login de admin para continuar.",
              stage: "",
            });
            return null;
          }

          setStage("Carregando perfil de admin");
          const profile = await withTimeout(
            fetchProfileForUserWithRetry(session.user.id, 3, session.access_token),
            ADMIN_PROFILE_FETCH_TIMEOUT_MS,
            "ADMIN_PROFILE_FETCH_TIMEOUT",
          );

          if (profile?.role !== "admin") {
            set({
              initialized: true,
              loading: false,
              session,
              user: session.user,
              profile,
              error: "Sua conta nao tem permissao de admin.",
              stage: "",
            });
            return null;
          }

          set({
            initialized: true,
            loading: false,
            session,
            user: session.user,
            profile,
            error: "",
            stage: "",
          });
          await syncRemotePushForProfile(profile);
          trackMetric("auth_admin_session_ready", {
            authUserId: profile.authUserId,
          });
          return profile;
        }

        const ensured = await ensureProfileWithRecovery(role, setStage, currentSession ?? null);
        await hydrateUserStateForProfile({
          authUserId: ensured.profile.authUserId,
          role: ensured.profile.role === "admin" ? role : ensured.profile.role,
          displayName: ensured.profile.displayName,
          phone: ensured.profile.phone,
        });

        set({
          initialized: true,
          loading: false,
          session: ensured.session,
          user: ensured.session.user,
          profile: ensured.profile,
          error: "",
          stage: "",
        });
        await syncRemotePushForProfile(ensured.profile);
        trackMetric("auth_role_ready", {
          authUserId: ensured.profile.authUserId,
          role: ensured.profile.role,
        });
        return ensured.profile;
      } catch (error) {
        const message = normalizeAuthError(error);

        debugAuth("ensureRole:error", {
          role,
          message,
        });

        set({
          initialized: true,
          loading: false,
          error: message,
        });
        appLogger.error("auth", "ensure_role_failed", error, {
          role,
          normalizedMessage: message,
        });
        throw error;
      }
    },

    refreshProfile: async () => {
      try {
        const session = await resolveCurrentSession(false);
        if (!session?.user) {
          set({
            session: null,
            user: null,
            profile: null,
            error: "",
            stage: "",
          });
          return null;
        }

        const profile = await withTimeout(
          fetchProfileForUserWithRetry(
            session.user.id,
            3,
            session.access_token,
          ),
          isNonAnonymousSession(session)
            ? ADMIN_PROFILE_FETCH_TIMEOUT_MS
            : PROFILE_FETCH_TIMEOUT_MS,
          isNonAnonymousSession(session)
            ? "ADMIN_PROFILE_FETCH_TIMEOUT"
            : "PROFILE_FETCH_TIMEOUT",
        );

        if (profile?.delivererId) {
          syncDelivererId(profile.delivererId);
        }

        if (profile && (profile.role === "cliente" || profile.role === "entregador")) {
          await hydrateUserStateForProfile({
            authUserId: profile.authUserId,
            role: profile.role,
            displayName: profile.displayName,
            phone: profile.phone,
          });
        }

        set({
          session,
          user: session.user,
          profile,
          error: "",
          stage: "",
        });
        await syncRemotePushForProfile(profile);
        if (profile) {
          trackMetric("auth_profile_refreshed", {
            authUserId: profile.authUserId,
            role: profile.role,
          });
        }
        return profile;
      } catch (error) {
        const message = normalizeAuthError(error);
        set({ error: message });
        appLogger.error("auth", "refresh_profile_failed", error, {
          normalizedMessage: message,
        });
        throw new Error(message);
      }
    },

    signInAdmin: async (email, password) => {
      set({ loading: true, error: "" });
      setStage("Entrando como admin");

      try {
        const currentSession = get().session;
        if (currentSession?.user?.is_anonymous) {
          await signOutWithTimeout();
        }

        const sessionFromRest = await withTimeout(
          signInAdminViaRest(email, password),
          ADMIN_SIGNIN_TIMEOUT_MS,
          "ADMIN_SIGNIN_TIMEOUT",
        );

        const session =
          sessionFromRest ??
          (await resolveCurrentSession(true));

        if (!session?.user) {
          throw new Error("ADMIN_LOGIN_REQUIRED");
        }

        setStage("Carregando perfil de admin");
        const profile = await withTimeout(
          fetchProfileForUserWithRetry(session.user.id, 3, session.access_token),
          ADMIN_PROFILE_FETCH_TIMEOUT_MS,
          "ADMIN_PROFILE_FETCH_TIMEOUT",
        );

        if (profile?.role !== "admin") {
          throw new Error("ADMIN_FORBIDDEN");
        }

        set({
          initialized: true,
          loading: false,
          session,
          user: session.user,
          profile,
          error: "",
          stage: "",
        });

        await syncRemotePushForProfile(profile);
        trackMetric("auth_admin_login_success", {
          authUserId: profile.authUserId,
        });

        return profile;
      } catch (error) {
        const message = normalizeAuthError(error);
        set({
          initialized: true,
          loading: false,
          error: message,
        });
        appLogger.error("auth", "sign_in_admin_failed", error, {
          normalizedMessage: message,
          email: email.trim(),
        });
        throw new Error(message);
      }
    },

    signOut: async () => {
      debugAuth("signOut:start");
      try {
        await disableRemotePushDevice();
      } catch (error) {
        appLogger.warn(
          "auth",
          "disable_remote_push_on_signout_failed",
          "Falha ao desativar push no logout.",
          error
        );
      }
      await signOutWithTimeout();
      set({
        initialized: true,
        loading: false,
        session: null,
        user: null,
        profile: null,
        error: "",
        stage: "",
      });
      trackMetric("auth_sign_out");
    },
  };
});
