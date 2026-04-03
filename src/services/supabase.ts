import { createClient } from "@supabase/supabase-js";

const FALLBACK_URL = "https://gywmqhqiqldulzgxmjjs.supabase.co";
const FALLBACK_PUBLISHABLE_KEY =
  "sb_publishable_sxQCNvp72plz_0vDKPicAA_qt0tviAp";

function safeGetLocal(key: string) {
  try {
    return localStorage.getItem(key)?.trim() || "";
  } catch {
    return "";
  }
}

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  safeGetLocal("cg_supabase_url") ||
  FALLBACK_URL;

const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  safeGetLocal("cg_supabase_anon_key") ||
  safeGetLocal("cg_supabase_publishable_key") ||
  FALLBACK_PUBLISHABLE_KEY;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
