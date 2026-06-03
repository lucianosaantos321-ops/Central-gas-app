import { supabase } from "./supabase";

export type DelivererVehicleType = "carro" | "moto";
export type DelivererApplicationStatus = "pending" | "approved" | "rejected";

export type DelivererUploadInfo = {
  name: string;
  size: number;
  type: string;
  dataUrl?: string | null;
};

export type DelivererApplication = {
  id: string;
  authUserId: string;
  status: DelivererApplicationStatus;
  adminNotes: string | null;
  delivererId: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  fullName: string;
  whatsapp: string;
  cpf: string;
  rg: string;
  birthDate: string;
  address: string;
  email: string;
  password?: string;
  cnhUpload: DelivererUploadInfo | null;
  vehicleType: DelivererVehicleType;
  vehicleBrand: string;
  vehicleModel: string;
  plate: string;
  renavam: string;
  crlvUpload: DelivererUploadInfo | null;
};

export type DelivererAccessSession = {
  applicationId: string;
  authUserId: string;
  email: string;
  fullName: string;
  delivererId: string | null;
  status: DelivererApplicationStatus;
  createdAt: string;
};

type DelivererApplicationInput = {
  fullName: string;
  whatsapp: string;
  cpf: string;
  rg: string;
  birthDate: string;
  address: string;
  email: string;
  password: string;
  cnhUpload: DelivererUploadInfo | null;
  vehicleType: DelivererVehicleType;
  vehicleBrand: string;
  vehicleModel: string;
  plate: string;
  renavam: string;
  crlvUpload: DelivererUploadInfo | null;
};

type RemoteApplicationRow = {
  auth_user_id: string;
  status: DelivererApplicationStatus;
  admin_notes?: string | null;
  deliverer_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  approved_at?: string | null;
  full_name?: string | null;
  whatsapp?: string | null;
  cpf?: string | null;
  rg?: string | null;
  birth_date?: string | null;
  address?: string | null;
  email?: string | null;
  cnh_upload?: DelivererUploadInfo | null;
  vehicle_type?: DelivererVehicleType | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  plate?: string | null;
  renavam?: string | null;
  crlv_upload?: DelivererUploadInfo | null;
};

const APPLICATIONS_KEY = "cg_deliverer_applications";
const SESSION_KEY = "cg_deliverer_access_session";
const BIOMETRIC_OPT_IN_KEY = "cg_deliverer_biometric_opt_in";
const RECOVERY_PREF_KEY = "cg_deliverer_recovery_pref";
const REMOTE_AVAILABILITY_TTL_MS = 60_000;

let remoteAvailabilityCache:
  | {
      value: boolean;
      expiresAt: number;
    }
  | null = null;

function now() {
  return new Date().toISOString();
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

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function createDelivererId() {
  return `d_${Math.floor(100000 + Math.random() * 900000)}`;
}

function readFallbackAll() {
  const items = safeRead<DelivererApplication[]>(APPLICATIONS_KEY, []);
  return Array.isArray(items) ? items : [];
}

function writeFallbackAll(items: DelivererApplication[]) {
  safeWrite(APPLICATIONS_KEY, items);
}

function toSession(item: DelivererApplication): DelivererAccessSession {
  return {
    applicationId: item.id,
    authUserId: item.authUserId,
    email: item.email,
    fullName: item.fullName,
    delivererId: item.delivererId,
    status: item.status,
    createdAt: now(),
  };
}

function hydrateLegacyDelivererState(item: DelivererApplication | null) {
  if (!item) return;

  try {
    localStorage.setItem("cg_deliverer_name", item.fullName);
    localStorage.setItem("cg_deliverer_phone", item.whatsapp);
    localStorage.setItem("cg_deliverer_city", item.address);
    localStorage.setItem(
      "cg_deliverer_vehicle",
      `${item.vehicleBrand} ${item.vehicleModel}`.trim()
    );
    localStorage.setItem("cg_deliverer_plate", item.plate.toUpperCase());
    if (item.delivererId) {
      localStorage.setItem("cg_deliverer_id", item.delivererId);
    }
  } catch {
    // ignore
  }
}

function normalizeRemoteApplication(row: RemoteApplicationRow | null | undefined): DelivererApplication | null {
  if (!row?.auth_user_id) return null;

  return {
    id: normalizeText(row.auth_user_id),
    authUserId: normalizeText(row.auth_user_id),
    status: (normalizeText(row.status) as DelivererApplicationStatus) || "pending",
    adminNotes: normalizeText(row.admin_notes) || null,
    delivererId: normalizeText(row.deliverer_id) || null,
    createdAt: normalizeText(row.created_at) || now(),
    updatedAt: normalizeText(row.updated_at) || normalizeText(row.created_at) || now(),
    approvedAt: normalizeText(row.approved_at) || null,
    fullName: normalizeText(row.full_name),
    whatsapp: normalizeText(row.whatsapp),
    cpf: normalizeText(row.cpf),
    rg: normalizeText(row.rg),
    birthDate: normalizeText(row.birth_date),
    address: normalizeText(row.address),
    email: normalizeEmail(row.email),
    cnhUpload: row.cnh_upload ?? null,
    vehicleType: row.vehicle_type === "carro" ? "carro" : "moto",
    vehicleBrand: normalizeText(row.vehicle_brand),
    vehicleModel: normalizeText(row.vehicle_model),
    plate: normalizeText(row.plate).toUpperCase(),
    renavam: normalizeText(row.renavam),
    crlvUpload: row.crlv_upload ?? null,
  };
}

function fallbackFindByEmail(email: string) {
  const target = normalizeEmail(email);
  if (!target) return null;
  return (
    readFallbackAll().find((item) => normalizeEmail(item.email) === target) ?? null
  );
}

function syncFallbackSession(item: DelivererApplication | null) {
  if (!item) {
    clearDelivererAccessSession();
    return null;
  }

  const session = toSession(item);
  safeWrite(SESSION_KEY, session);
  if (item.status === "approved") {
    hydrateLegacyDelivererState(item);
  }
  return session;
}

function normalizeAuthError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "Falha no acesso do entregador.";

  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalized.includes("user already registered") ||
    normalized.includes("already registered")
  ) {
    return "Ja existe uma conta com esse e-mail.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Nao foi possivel concluir seu acesso agora. Tente novamente em instantes.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Email ou senha invalidos.";
  }

  if (
    normalized.includes("deliverer_applications") ||
    normalized.includes("upsert_current_deliverer_application") ||
    normalized.includes("schema cache")
  ) {
    return "Nao foi possivel concluir o cadastro agora. Tente novamente em instantes.";
  }

  if (normalized.includes("cpf_already_bound")) {
    return "Ja existe um cadastro com esse CPF.";
  }

  if (normalized.includes("profile_role_conflict")) {
    return "Essa conta ja esta vinculada a outro tipo de acesso.";
  }

  return message;
}

async function withActiveSession<T>(work: () => Promise<T>) {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    return await work();
  }
  throw new Error("AUTH_REQUIRED");
}

async function ensureRemoteAvailable() {
  if (remoteAvailabilityCache && remoteAvailabilityCache.expiresAt > Date.now()) {
    return remoteAvailabilityCache.value;
  }

  try {
    const { error } = await supabase
      .from("deliverer_applications")
      .select("auth_user_id", { head: true, count: "exact" })
      .limit(1);

    const available = !error;
    remoteAvailabilityCache = {
      value: available,
      expiresAt: Date.now() + REMOTE_AVAILABILITY_TTL_MS,
    };
    return available;
  } catch {
    remoteAvailabilityCache = {
      value: false,
      expiresAt: Date.now() + REMOTE_AVAILABILITY_TTL_MS,
    };
    return false;
  }
}

async function signOutSupabaseIfNeeded() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    await supabase.auth.signOut();
  }
}

async function signInEmailPassword(email: string, password: string) {
  const response = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (response.error) {
    throw new Error(normalizeAuthError(response.error));
  }
  if (!response.data.session?.user) {
    throw new Error("Nao foi possivel abrir sua sessao.");
  }
  return response.data.session;
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

async function signUpEmailPassword(email: string, password: string) {
  const response = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });
  if (response.error) {
    throw new Error(normalizeAuthError(response.error));
  }

  if (response.data.session?.user) {
    return response.data.session;
  }

  try {
    return await signInEmailPassword(email, password);
  } catch (error) {
    throw new Error(normalizeAuthError(error));
  }
}

async function fetchRemoteApplications() {
  const { data, error } = await withActiveSession(async () => {
    return await supabase
      .from("deliverer_applications")
      .select("*")
      .order("updated_at", { ascending: false });
  });

  if (error) {
    throw new Error(error.message);
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeRemoteApplication(row as RemoteApplicationRow))
    .filter(Boolean) as DelivererApplication[];
}

async function fetchRemoteApplicationById(id: string) {
  const target = normalizeText(id);
  if (!target) return null;

  const { data, error } = await withActiveSession(async () => {
    return await supabase
      .from("deliverer_applications")
      .select("*")
      .eq("auth_user_id", target)
      .maybeSingle();
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizeRemoteApplication((data as RemoteApplicationRow | null) ?? null);
}

async function fetchRemoteCurrentApplication() {
  const { data } = await supabase.auth.getSession();
  const authUserId = normalizeText(data.session?.user?.id);
  if (!authUserId) return null;
  return await fetchRemoteApplicationById(authUserId);
}

function fallbackSignIn(email: string, password: string) {
  const item = fallbackFindByEmail(email);
  if (!item || item.password !== String(password || "")) {
    throw new Error("Email ou senha invalidos.");
  }
  syncFallbackSession(item);
  return item;
}

function fallbackApprove(id: string, adminNotes?: string | null) {
  const target = normalizeText(id);
  const items = readFallbackAll();
  const next = items.map((item) =>
    item.id !== target
      ? item
      : {
          ...item,
          status: "approved" as const,
          adminNotes: normalizeText(adminNotes) || null,
          delivererId: item.delivererId || createDelivererId(),
          approvedAt: now(),
          updatedAt: now(),
        }
  );
  writeFallbackAll(next);
  const approved = next.find((item) => item.id === target) ?? null;
  const session = getDelivererAccessSession();
  if (approved && session?.applicationId === approved.id) {
    syncFallbackSession(approved);
  }
  return approved;
}

function fallbackReject(id: string, adminNotes?: string | null) {
  const target = normalizeText(id);
  const items = readFallbackAll();
  const next = items.map((item) =>
    item.id !== target
      ? item
      : {
          ...item,
          status: "rejected" as const,
          adminNotes: normalizeText(adminNotes) || null,
          updatedAt: now(),
        }
  );
  writeFallbackAll(next);
  const rejected = next.find((item) => item.id === target) ?? null;
  const session = getDelivererAccessSession();
  if (rejected && session?.applicationId === rejected.id) {
    syncFallbackSession(rejected);
  }
  return rejected;
}

export function getDelivererAccessSession() {
  return safeRead<DelivererAccessSession | null>(SESSION_KEY, null);
}

export function clearDelivererAccessSession() {
  safeRemove(SESSION_KEY);
}

export async function fileToUploadInfo(file: File | null): Promise<DelivererUploadInfo | null> {
  if (!file) return null;

  const base: DelivererUploadInfo = {
    name: file.name,
    size: Number(file.size || 0),
    type: file.type || "application/octet-stream",
    dataUrl: null,
  };

  if (file.size > 600_000) {
    return base;
  }

  return await new Promise<DelivererUploadInfo>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        ...base,
        dataUrl: typeof reader.result === "string" ? reader.result : null,
      });
    };
    reader.onerror = () => resolve(base);
    reader.readAsDataURL(file);
  });
}

export const delivererAccessService = {
  isBiometryApiAvailable() {
    return typeof window !== "undefined" && "PublicKeyCredential" in window;
  },

  getBiometricPreference() {
    return safeRead<boolean>(BIOMETRIC_OPT_IN_KEY, false);
  },

  setBiometricPreference(enabled: boolean) {
    safeWrite(BIOMETRIC_OPT_IN_KEY, Boolean(enabled));
  },

  getRecoveryPreference() {
    return safeRead<"email" | "whatsapp">(RECOVERY_PREF_KEY, "whatsapp");
  },

  setRecoveryPreference(channel: "email" | "whatsapp") {
    safeWrite(RECOVERY_PREF_KEY, channel);
  },

  async listApplications() {
    if (await ensureRemoteAvailable()) {
      try {
        return await fetchRemoteApplications();
      } catch (error) {
        throw new Error(normalizeAuthError(error));
      }
    }

    const fallback = readFallbackAll().sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
    );

    if (fallback.length > 0) {
      return fallback;
    }

    throw new Error(
      "Os cadastros de entregador ainda nao estao sincronizando com o servidor. Confira a migration de identidade e o login do ADM."
    );
  },

  async getApplication(id: string) {
    if (await ensureRemoteAvailable()) {
      return await fetchRemoteApplicationById(id);
    }

    const target = normalizeText(id);
    if (!target) return null;
    return readFallbackAll().find((item) => item.id === target) ?? null;
  },

  async findByEmail(email: string) {
    const target = normalizeEmail(email);
    if (!target) return null;

    if (await ensureRemoteAvailable()) {
      const all = await fetchRemoteApplications();
      return all.find((item) => normalizeEmail(item.email) === target) ?? null;
    }

    return fallbackFindByEmail(target);
  },

  async register(input: DelivererApplicationInput) {
    const email = normalizeEmail(input.email);
    if (!email) throw new Error("Informe um email valido.");
    if (String(input.password || "").trim().length < 4) {
      throw new Error("A senha precisa ter pelo menos 4 digitos.");
    }

    await signOutSupabaseIfNeeded();

    let session;
    try {
      session = await signUpEmailPassword(email, input.password);
    } catch (error) {
      if (!isAlreadyRegisteredError(error)) {
        throw error;
      }
      session = await signInEmailPassword(email, input.password);
    }

    try {
      const { data, error } = await supabase.rpc("upsert_current_deliverer_application", {
        p_full_name: input.fullName,
        p_whatsapp: input.whatsapp,
        p_cpf: onlyDigits(input.cpf),
        p_rg: input.rg,
        p_birth_date: normalizeText(input.birthDate) || null,
        p_address: input.address,
        p_email: email,
        p_cnh_upload: input.cnhUpload ?? null,
        p_vehicle_type: input.vehicleType,
        p_vehicle_brand: input.vehicleBrand,
        p_vehicle_model: input.vehicleModel,
        p_plate: input.plate.toUpperCase(),
        p_renavam: input.renavam,
        p_crlv_upload: input.crlvUpload ?? null,
      });

      if (error) {
        throw new Error(normalizeAuthError(error));
      }

      const item = normalizeRemoteApplication((data as RemoteApplicationRow | null) ?? null);
      if (!item) {
        throw new Error("Nao foi possivel concluir o cadastro do entregador.");
      }

      const nextSession = syncFallbackSession(item);
      return { item, session: nextSession, authSession: session };
    } catch (error) {
      throw new Error(
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel enviar o cadastro do entregador ao servidor."
      );
    }
  },

  async signIn(email: string, password: string) {
    await signOutSupabaseIfNeeded();
    const authSession = await signInEmailPassword(email, password);
    if (await ensureRemoteAvailable()) {
      const item = await fetchRemoteCurrentApplication();
      if (!item) {
        throw new Error(
          "Essa conta existe, mas o cadastro do entregador ainda nao foi sincronizado com o servidor. Entre novamente no cadastro e envie os dados para aprovacao."
        );
      }
      const session = syncFallbackSession(item);
      return { item, session, authSession };
    }

    const item = fallbackSignIn(email, password);
    return { item, session: syncFallbackSession(item), authSession };
  },

  async signOut() {
    clearDelivererAccessSession();
    await signOutSupabaseIfNeeded();
  },

  async approve(id: string, adminNotes?: string | null) {
    if (!(await ensureRemoteAvailable())) {
      return fallbackApprove(id, adminNotes);
    }

    const { data, error } = await supabase.rpc("approve_deliverer_application", {
      p_auth_user_id: id,
      p_admin_notes: normalizeText(adminNotes) || null,
      p_deliverer_id: null,
    });

    if (error) {
      throw new Error(normalizeAuthError(error));
    }

    const approved = normalizeRemoteApplication((data as RemoteApplicationRow | null) ?? null);
    const session = getDelivererAccessSession();
    if (approved && session?.applicationId === approved.id) {
      syncFallbackSession(approved);
    }
    return approved;
  },

  async reject(id: string, adminNotes?: string | null) {
    if (!(await ensureRemoteAvailable())) {
      return fallbackReject(id, adminNotes);
    }

    const { data, error } = await supabase.rpc("reject_deliverer_application", {
      p_auth_user_id: id,
      p_admin_notes:
        normalizeText(adminNotes) || "Ajuste os dados e envie novamente.",
    });

    if (error) {
      throw new Error(normalizeAuthError(error));
    }

    const rejected = normalizeRemoteApplication((data as RemoteApplicationRow | null) ?? null);
    const session = getDelivererAccessSession();
    if (rejected && session?.applicationId === rejected.id) {
      syncFallbackSession(rejected);
    }
    return rejected;
  },

  async activateSession() {
    if (await ensureRemoteAvailable()) {
      const item = await fetchRemoteCurrentApplication();
      if (item) {
        syncFallbackSession(item);
        return item;
      }
      clearDelivererAccessSession();
      return null;
    }

    const session = getDelivererAccessSession();
    if (!session?.applicationId) return null;
    const item =
      readFallbackAll().find((entry) => entry.id === session.applicationId) ?? null;
    if (item) {
      syncFallbackSession(item);
    }
    return item;
  },
};
