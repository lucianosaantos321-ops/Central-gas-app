import { createClient } from "@supabase/supabase-js";

const EMBEDDED_FALLBACK_URL = "https://gywmqhqiqldulzgxmjjs.supabase.co";
const EMBEDDED_FALLBACK_PUBLISHABLE_KEY =
  "sb_publishable_sxQCNvp72plz_0vDKPicAA_qt0tviAp";

function safeGetEnv(key: string) {
  const value = import.meta.env[key as keyof ImportMetaEnv];
  return typeof value === "string" ? value.trim() : "";
}

function parseBooleanEnv(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

const ALLOW_RUNTIME_STORAGE_CONFIG =
  import.meta.env.DEV ||
  parseBooleanEnv(safeGetEnv("VITE_ALLOW_RUNTIME_STORAGE_SUPABASE_CONFIG"));

const ALLOW_EMBEDDED_SUPABASE_FALLBACK =
  import.meta.env.DEV ||
  parseBooleanEnv(safeGetEnv("VITE_ALLOW_EMBEDDED_SUPABASE_FALLBACK"));

function safeGetLocal(key: string) {
  try {
    return localStorage.getItem(key)?.trim() || "";
  } catch {
    return "";
  }
}

const configuredSupabaseUrl =
  safeGetEnv("VITE_SUPABASE_URL") ||
  (ALLOW_RUNTIME_STORAGE_CONFIG ? safeGetLocal("cg_supabase_url") : "") ||
  (ALLOW_EMBEDDED_SUPABASE_FALLBACK ? EMBEDDED_FALLBACK_URL : "");

const configuredSupabaseAnonKey =
  safeGetEnv("VITE_SUPABASE_ANON_KEY") ||
  safeGetEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  (ALLOW_RUNTIME_STORAGE_CONFIG ? safeGetLocal("cg_supabase_anon_key") : "") ||
  (ALLOW_RUNTIME_STORAGE_CONFIG ? safeGetLocal("cg_supabase_publishable_key") : "") ||
  (ALLOW_EMBEDDED_SUPABASE_FALLBACK ? EMBEDDED_FALLBACK_PUBLISHABLE_KEY : "");

if (!configuredSupabaseUrl || !configuredSupabaseAnonKey) {
  throw new Error(
    "SUPABASE_CONFIG_MISSING: configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para este ambiente."
  );
}

export const supabaseUrl = configuredSupabaseUrl;
export const supabaseAnonKey = configuredSupabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
