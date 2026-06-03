import { flushRemoteLogs, appLogger } from "./appLogger";
import { supabase } from "./supabase";

export type AdminAuditLogRow = {
  id: string;
  created_at: string;
  level: string;
  category: string;
  event: string;
  message: string | null;
  route: string | null;
  app_variant: string | null;
  platform: string | null;
  deliverer_id: string | null;
  installation_id: string | null;
  auth_user_id: string | null;
  role: string | null;
  details: Record<string, unknown> | null;
};

export type AdminAuditLogInput = {
  category: string;
  event: string;
  message: string;
  entityType: "cliente" | "entregador" | "pedido" | "produto" | "notificacao" | "gas" | "suporte";
  entityId: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  extra?: Record<string, unknown>;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeJson(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
}

function matchesEntity(
  row: AdminAuditLogRow,
  entityType?: string,
  entityId?: string
) {
  const details = row.details ?? {};
  const detailType = normalizeText(details.entityType);
  const detailId = normalizeText(details.entityId);

  if (entityType && detailType !== normalizeText(entityType)) return false;
  if (entityId && detailId !== normalizeText(entityId)) return false;
  return true;
}

export const adminAuditTrailService = {
  async logAction(input: AdminAuditLogInput) {
    appLogger.audit(
      normalizeText(input.category) || "admin_support",
      normalizeText(input.event) || "admin_action",
      normalizeText(input.message) || "Ação administrativa executada.",
      {
        entityType: input.entityType,
        entityId: normalizeText(input.entityId),
        reason: normalizeText(input.reason) || null,
        before: safeJson(input.before),
        after: safeJson(input.after),
        ...(input.extra ?? {}),
      }
    );

    await flushRemoteLogs();
    return true;
  },

  async listRecent(filters?: {
    category?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
    search?: string;
  }) {
    const limit = Math.min(Math.max(Number(filters?.limit ?? 80), 1), 300);
    const category = normalizeText(filters?.category);
    const search = normalizeText(filters?.search).toLowerCase();

    let query = supabase
      .from("operational_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || "Nao foi possivel carregar a auditoria.");
    }

    const rows = (Array.isArray(data) ? data : []) as AdminAuditLogRow[];

    return rows.filter((row) => {
      if (!matchesEntity(row, filters?.entityType, filters?.entityId)) return false;
      if (!search) return true;

      const haystack = [
        row.category,
        row.event,
        row.message,
        row.auth_user_id,
        row.role,
        row.deliverer_id,
        JSON.stringify(row.details ?? {}),
      ]
        .map((value) => String(value ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  },
};
