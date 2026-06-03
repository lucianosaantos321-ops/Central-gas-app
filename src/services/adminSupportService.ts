import { delivererService } from "./delivererService";
import { flushPushDispatch } from "./remotePushDispatchService";
import { clientAdminService } from "./clientAdminService";
import { delivererAdminService } from "./delivererAdminService";
import { supabase } from "./supabase";
import type { StatusPedido } from "../types";
import type {
  AddressDocumentItem,
  ClientGasTankDocument,
  ClientProfileDocument,
  DelivererProfileDocument,
  UserStateNamespace,
} from "./userStateSchemas";

type UserProfileRole = "cliente" | "entregador" | "admin";

type UserProfileRow = {
  auth_user_id: string;
  role: UserProfileRole;
  display_name: string | null;
  phone: string | null;
  cpf: string | null;
  birth_date: string | null;
  email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type UserStateRow = {
  auth_user_id: string;
  namespace: UserStateNamespace;
  payload: unknown;
  updated_at: string | null;
};

type PushDeviceRow = {
  installation_id: string;
  auth_user_id: string;
  role: "cliente" | "entregador" | "admin";
  deliverer_id: string | null;
  platform: string;
  app_variant: string;
  token_provider: string;
  push_token: string;
  enabled: boolean;
  last_seen_at: string | null;
  last_registered_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type DelivererApplicationRow = {
  auth_user_id: string;
  status: "pending" | "approved" | "rejected";
  admin_notes: string | null;
  deliverer_id: string | null;
  full_name: string | null;
  whatsapp: string | null;
  cpf: string | null;
  rg: string | null;
  birth_date: string | null;
  address: string | null;
  email: string | null;
  cnh_upload: Record<string, unknown> | null;
  vehicle_type: "carro" | "moto" | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  plate: string | null;
  renavam: string | null;
  crlv_upload: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  approved_at: string | null;
};

type DelivererPresenceRow = {
  id: string;
  nome: string | null;
  telefone: string | null;
  online: boolean;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminClientDirectoryRow = {
  authUserId: string;
  name: string;
  phone: string;
  email: string;
  cpf: string;
  birthDate: string;
  createdAt: string;
  updatedAt: string;
  profile: ClientProfileDocument;
  addresses: AddressDocumentItem[];
  primaryAddressId: string;
  gasTank: ClientGasTankDocument;
  pushDevices: PushDeviceRow[];
  adminStatus: "normal" | "atencao" | "bloqueado";
  adminNotes: string | null;
  adminUpdatedAt: string | null;
};

export type AdminDelivererDirectoryRow = {
  authUserId: string;
  delivererId: string;
  status: "pending" | "approved" | "rejected";
  name: string;
  phone: string;
  email: string;
  cpf: string;
  rg: string;
  birthDate: string;
  address: string;
  vehicleType: string;
  vehicleBrand: string;
  vehicleModel: string;
  plate: string;
  renavam: string;
  cnhUpload: DelivererApplicationRow["cnh_upload"];
  crlvUpload: DelivererApplicationRow["crlv_upload"];
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string;
  online: boolean;
  lastSeenAt: string;
  pushDevices: PushDeviceRow[];
  profile: DelivererProfileDocument;
  manualBlocked: boolean;
  manualBlockReason: string | null;
  manualUpdatedAt: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function now() {
  return new Date().toISOString();
}

function asClientProfile(payload: unknown): ClientProfileDocument {
  const item = payload as Partial<ClientProfileDocument> | null | undefined;
  return {
    nome: normalizeText(item?.nome) || "Cliente",
    telefone: normalizeText(item?.telefone),
    email: normalizeText(item?.email),
    cpf: normalizeText(item?.cpf),
    nascimento: normalizeText(item?.nascimento),
    documento: normalizeText(item?.documento),
    referralCode: normalizeText(item?.referralCode),
    notifsPedido: item?.notifsPedido !== false,
    notifsGas: item?.notifsGas !== false,
    notifsPromos: Boolean(item?.notifsPromos),
    updatedAt: normalizeText(item?.updatedAt) || "",
  };
}

function asAddressesDocument(payload: unknown) {
  const item = payload as
    | { items?: AddressDocumentItem[]; primaryId?: string; updatedAt?: string }
    | null
    | undefined;

  return {
    items: Array.isArray(item?.items) ? item!.items : [],
    primaryId: normalizeText(item?.primaryId),
    updatedAt: normalizeText(item?.updatedAt),
  };
}

function asGasTankDocument(payload: unknown): ClientGasTankDocument {
  const item = payload as Partial<ClientGasTankDocument> | null | undefined;
  const state = item?.state as Record<string, unknown> | undefined;
  const setup = item?.setup as Record<string, unknown> | undefined;

  return {
    state: {
      current_level: Number(state?.current_level ?? 72),
      estimated_days: Number(state?.estimated_days ?? 0),
      start_date: normalizeText(state?.start_date),
      finish_date: normalizeText(state?.finish_date),
      last_updated: normalizeText(state?.last_updated) || now(),
      last_alert_level:
        state?.last_alert_level === "critical" || state?.last_alert_level === "low"
          ? (state.last_alert_level as "low" | "critical")
          : "none",
      last_delivery_order_id: normalizeText(state?.last_delivery_order_id) || null,
    },
    setup: {
      configured: Boolean(setup?.configured),
      initial_level: Number(setup?.initial_level ?? 100),
      average_duration_days: Number(setup?.average_duration_days ?? 30),
      days_since_last_exchange: Number(setup?.days_since_last_exchange ?? 0),
      last_exchange_date: normalizeText(setup?.last_exchange_date),
      updated_at: normalizeText(setup?.updated_at) || now(),
    },
    updatedAt: normalizeText(item?.updatedAt) || now(),
  };
}

function asDelivererProfile(payload: unknown): DelivererProfileDocument {
  const item = payload as Partial<DelivererProfileDocument> | null | undefined;
  return {
    nome: normalizeText(item?.nome) || "Entregador",
    telefone: normalizeText(item?.telefone),
    cidade: normalizeText(item?.cidade),
    veiculo: normalizeText(item?.veiculo),
    placa: normalizeText(item?.placa),
    pixInfo: normalizeText(item?.pixInfo),
    updatedAt: normalizeText(item?.updatedAt) || "",
  };
}

async function readUserStates(
  authUserIds: string[],
  namespaces: UserStateNamespace[]
) {
  if (!authUserIds.length || !namespaces.length) {
    return [] as UserStateRow[];
  }

  const { data, error } = await supabase
    .from("user_state_documents")
    .select("auth_user_id, namespace, payload, updated_at")
    .in("auth_user_id", authUserIds)
    .in("namespace", namespaces);

  if (error) {
    throw new Error(error.message || "Nao foi possivel carregar os documentos do usuario.");
  }

  return (Array.isArray(data) ? data : []) as UserStateRow[];
}

async function readPushDevicesByUsers(authUserIds: string[]) {
  if (!authUserIds.length) return [] as PushDeviceRow[];

  const { data, error } = await supabase
    .from("push_devices")
    .select("*")
    .in("auth_user_id", authUserIds)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Nao foi possivel carregar os dispositivos push.");
  }

  return (Array.isArray(data) ? data : []) as PushDeviceRow[];
}

function groupStates(rows: UserStateRow[]) {
  const byUser = new Map<string, Partial<Record<UserStateNamespace, unknown>>>();

  for (const row of rows) {
    const current = byUser.get(row.auth_user_id) ?? {};
    current[row.namespace] = row.payload;
    byUser.set(row.auth_user_id, current);
  }

  return byUser;
}

function groupPushDevices(rows: PushDeviceRow[]) {
  const byUser = new Map<string, PushDeviceRow[]>();

  for (const row of rows) {
    const list = byUser.get(row.auth_user_id) ?? [];
    list.push(row);
    byUser.set(row.auth_user_id, list);
  }

  return byUser;
}

async function upsertUserStateDocument(
  authUserId: string,
  namespace: UserStateNamespace,
  payload: unknown
) {
  const { error } = await supabase.from("user_state_documents").upsert(
    {
      auth_user_id: authUserId,
      namespace,
      payload,
    },
    {
      onConflict: "auth_user_id,namespace",
    }
  );

  if (error) {
    throw new Error(error.message || "Nao foi possivel atualizar o documento do usuario.");
  }
}

async function invokeAdminSupportAction(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-support", {
    body: {
      action,
      payload,
    },
  });

  if (error) {
    throw new Error(error.message || "Falha ao executar a acao segura do ADM.");
  }

  const body = data as { ok?: boolean; error?: string } | null;
  if (body && body.ok === false) {
    throw new Error(body.error || "Falha ao executar a acao segura do ADM.");
  }

  return data;
}

export const adminSupportService = {
  async listClients() {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("auth_user_id, role, display_name, phone, cpf, birth_date, email, created_at, updated_at")
      .eq("role", "cliente")
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Nao foi possivel carregar os clientes.");
    }

    const profiles = (Array.isArray(data) ? data : []) as UserProfileRow[];
    const ids = profiles.map((item) => item.auth_user_id).filter(Boolean);
    const [stateRows, pushRows] = await Promise.all([
      readUserStates(ids, ["client_profile", "client_addresses", "client_gas_tank"]),
      readPushDevicesByUsers(ids),
    ]);

    const docsByUser = groupStates(stateRows);
    const pushByUser = groupPushDevices(pushRows);

    return profiles.map((profile) => {
      const docs = docsByUser.get(profile.auth_user_id) ?? {};
      const profileDoc = asClientProfile(docs.client_profile);
      const addressesDoc = asAddressesDocument(docs.client_addresses);
      const gasDoc = asGasTankDocument(docs.client_gas_tank);
      const admin = clientAdminService.get(`auth:${profile.auth_user_id}`);

      return {
        authUserId: profile.auth_user_id,
        name:
          normalizeText(profile.display_name) ||
          normalizeText(profileDoc.nome) ||
          "Cliente",
        phone:
          normalizeText(profile.phone) ||
          normalizeText(profileDoc.telefone),
        email:
          normalizeText(profile.email) ||
          normalizeText(profileDoc.email),
        cpf: normalizeText(profile.cpf) || normalizeText(profileDoc.cpf),
        birthDate:
          normalizeText(profile.birth_date) ||
          normalizeText(profileDoc.nascimento),
        createdAt: normalizeText(profile.created_at),
        updatedAt: normalizeText(profile.updated_at),
        profile: profileDoc,
        addresses: addressesDoc.items,
        primaryAddressId: addressesDoc.primaryId,
        gasTank: gasDoc,
        pushDevices: pushByUser.get(profile.auth_user_id) ?? [],
        adminStatus: admin.status,
        adminNotes: admin.notes,
        adminUpdatedAt: admin.updatedAt,
      } satisfies AdminClientDirectoryRow;
    });
  },

  async updateClientIdentity(
    authUserId: string,
    patch: {
      name?: string;
      cpf?: string;
      email?: string;
      birthDate?: string;
      phone?: string;
    }
  ) {
    const nextPhone = normalizeText(patch.phone);
    const nextProfilePatch: Partial<ClientProfileDocument> = {};
    const dbPatch: Record<string, string | null> = {};

    if ("name" in patch) {
      dbPatch.display_name = normalizeText(patch.name) || null;
      nextProfilePatch.nome = normalizeText(patch.name);
    }
    if ("cpf" in patch) {
      dbPatch.cpf = normalizeText(patch.cpf) || null;
      nextProfilePatch.cpf = normalizeText(patch.cpf);
    }
    if ("email" in patch) {
      dbPatch.email = normalizeText(patch.email) || null;
      nextProfilePatch.email = normalizeText(patch.email);
    }
    if ("birthDate" in patch) {
      dbPatch.birth_date = normalizeText(patch.birthDate) || null;
      nextProfilePatch.nascimento = normalizeText(patch.birthDate);
    }
    if ("phone" in patch) {
      dbPatch.phone = nextPhone || null;
      nextProfilePatch.telefone = nextPhone;
    }

    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase
        .from("user_profiles")
        .update(dbPatch)
        .eq("auth_user_id", authUserId);

      if (error) {
        throw new Error(error.message || "Nao foi possivel atualizar os dados do cliente.");
      }
    }

    const rows = await readUserStates([authUserId], ["client_profile"]);
    const current = asClientProfile(rows[0]?.payload);
    const nextPayload: ClientProfileDocument = {
      ...current,
      ...nextProfilePatch,
      updatedAt: now(),
    };
    await upsertUserStateDocument(authUserId, "client_profile", nextPayload);
    return nextPayload;
  },

  async updateClientProfileDoc(
    authUserId: string,
    patch: Partial<ClientProfileDocument>
  ) {
    const rows = await readUserStates([authUserId], ["client_profile"]);
    const current = asClientProfile(rows[0]?.payload);
    const payload: ClientProfileDocument = {
      ...current,
      ...patch,
      updatedAt: now(),
    };
    await upsertUserStateDocument(authUserId, "client_profile", payload);
    return payload;
  },

  async updateClientAddresses(
    authUserId: string,
    input: {
      items: AddressDocumentItem[];
      primaryId: string;
    }
  ) {
    const payload = {
      items: Array.isArray(input.items) ? input.items : [],
      primaryId: normalizeText(input.primaryId),
      updatedAt: now(),
    };
    await upsertUserStateDocument(authUserId, "client_addresses", payload);
    return payload;
  },

  async updateClientGasTank(
    authUserId: string,
    patch: Partial<ClientGasTankDocument>
  ) {
    const rows = await readUserStates([authUserId], ["client_gas_tank"]);
    const current = asGasTankDocument(rows[0]?.payload);
    const payload: ClientGasTankDocument = {
      ...current,
      ...patch,
      state: {
        ...current.state,
        ...(patch.state ?? {}),
      },
      setup: {
        ...current.setup,
        ...(patch.setup ?? {}),
      },
      updatedAt: now(),
    };
    await upsertUserStateDocument(authUserId, "client_gas_tank", payload);
    return payload;
  },

  setClientStatus(authUserId: string, status: "normal" | "atencao" | "bloqueado") {
    return clientAdminService.setStatus(`auth:${authUserId}`, status);
  },

  setClientNotes(authUserId: string, notes: string | null) {
    return clientAdminService.setNotes(`auth:${authUserId}`, notes);
  },

  async resetClientPassword(authUserId: string, nextPassword: string) {
    return invokeAdminSupportAction("reset_password", {
      authUserId,
      nextPassword,
    });
  },

  async updateClientLoginPhone(authUserId: string, phone: string) {
    const normalizedPhone = onlyDigits(phone).slice(0, 11);
    const result = await invokeAdminSupportAction("update_client_login_phone", {
      authUserId,
      phone: normalizedPhone,
    });

    await this.updateClientIdentity(authUserId, {
      phone: normalizedPhone,
    });

    return result;
  },

  async listDeliverers() {
    const [applicationsRes, pushRes, presenceRes] = await Promise.all([
      supabase
        .from("deliverer_applications")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase
        .from("push_devices")
        .select("*")
        .eq("role", "entregador")
        .order("updated_at", { ascending: false }),
      supabase
        .from("entregadores")
        .select("id, nome, telefone, online, last_seen_at, created_at, updated_at"),
    ]);

    if (applicationsRes.error) {
      throw new Error(applicationsRes.error.message || "Nao foi possivel carregar os entregadores.");
    }
    if (pushRes.error) {
      throw new Error(pushRes.error.message || "Nao foi possivel carregar os dispositivos do entregador.");
    }
    if (presenceRes.error) {
      throw new Error(presenceRes.error.message || "Nao foi possivel carregar o status online do entregador.");
    }

    const applications = (Array.isArray(applicationsRes.data) ? applicationsRes.data : []) as DelivererApplicationRow[];
    const ids = applications.map((item) => item.auth_user_id).filter(Boolean);
    const docs = await readUserStates(ids, ["deliverer_profile"]);
    const docsByUser = groupStates(docs);
    const pushByUser = groupPushDevices((Array.isArray(pushRes.data) ? pushRes.data : []) as PushDeviceRow[]);
    const presenceById = new Map(
      ((Array.isArray(presenceRes.data) ? presenceRes.data : []) as DelivererPresenceRow[]).map((row) => [
        normalizeText(row.id),
        row,
      ] as const)
    );

    return applications.map((item) => {
      const manual = delivererAdminService.getState(item.deliverer_id || "");
      const profile = asDelivererProfile(
        docsByUser.get(item.auth_user_id)?.deliverer_profile
      );
      const presence = presenceById.get(normalizeText(item.deliverer_id));

      return {
        authUserId: item.auth_user_id,
        delivererId: normalizeText(item.deliverer_id),
        status: item.status,
        name: normalizeText(item.full_name) || profile.nome || "Entregador",
        phone: normalizeText(item.whatsapp) || profile.telefone,
        email: normalizeText(item.email),
        cpf: normalizeText(item.cpf),
        rg: normalizeText(item.rg),
        birthDate: normalizeText(item.birth_date),
        address: normalizeText(item.address),
        vehicleType: normalizeText(item.vehicle_type),
        vehicleBrand: normalizeText(item.vehicle_brand),
        vehicleModel: normalizeText(item.vehicle_model),
        plate: normalizeText(item.plate),
        renavam: normalizeText(item.renavam),
        cnhUpload: item.cnh_upload ?? null,
        crlvUpload: item.crlv_upload ?? null,
        adminNotes: normalizeText(item.admin_notes) || null,
        createdAt: normalizeText(item.created_at),
        updatedAt: normalizeText(item.updated_at),
        approvedAt: normalizeText(item.approved_at),
        online: Boolean(presence?.online),
        lastSeenAt: normalizeText(presence?.last_seen_at),
        pushDevices: pushByUser.get(item.auth_user_id) ?? [],
        profile,
        manualBlocked: manual.manualBlocked,
        manualBlockReason: manual.manualBlockReason,
        manualUpdatedAt: manual.updatedAt,
      } satisfies AdminDelivererDirectoryRow;
    });
  },

  async updateDelivererApplication(
    authUserId: string,
    patch: Partial<{
      full_name: string;
      whatsapp: string;
      cpf: string;
      rg: string;
      birth_date: string;
      address: string;
      email: string;
      vehicle_type: string;
      vehicle_brand: string;
      vehicle_model: string;
      plate: string;
      renavam: string;
      admin_notes: string | null;
    }>
  ) {
    const { error } = await supabase
      .from("deliverer_applications")
      .update(patch)
      .eq("auth_user_id", authUserId);

    if (error) {
      throw new Error(error.message || "Nao foi possivel atualizar o cadastro do entregador.");
    }

    return true;
  },

  async updateDelivererProfileDoc(
    authUserId: string,
    patch: Partial<DelivererProfileDocument>
  ) {
    const rows = await readUserStates([authUserId], ["deliverer_profile"]);
    const current = asDelivererProfile(rows[0]?.payload);
    const payload: DelivererProfileDocument = {
      ...current,
      ...patch,
      updatedAt: now(),
    };
    await upsertUserStateDocument(authUserId, "deliverer_profile", payload);
    return payload;
  },

  async updateDelivererEmail(authUserId: string, email: string) {
    return invokeAdminSupportAction("update_auth_email", {
      authUserId,
      email: normalizeText(email),
    });
  },

  async resetDelivererPassword(authUserId: string, nextPassword: string) {
    return invokeAdminSupportAction("reset_password", {
      authUserId,
      nextPassword,
    });
  },

  async forceDelivererOffline(delivererId: string) {
    const id = normalizeText(delivererId);
    if (!id) throw new Error("Informe o ID do entregador.");
    await delivererService.setOnlineStatus(id, false);
    return true;
  },

  async listPushDevices(role?: "cliente" | "entregador" | "admin") {
    let query = supabase
      .from("push_devices")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(400);

    if (role) {
      query = query.eq("role", role);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || "Nao foi possivel carregar os dispositivos push.");
    }

    return (Array.isArray(data) ? data : []) as PushDeviceRow[];
  },

  async disablePushDevice(installationId: string) {
    const { error } = await supabase
      .from("push_devices")
      .update({
        enabled: false,
      })
      .eq("installation_id", installationId);

    if (error) {
      throw new Error(error.message || "Nao foi possivel desativar o token.");
    }

    return true;
  },

  async disableAllPushDevicesForUser(authUserId: string) {
    const { error } = await supabase
      .from("push_devices")
      .update({
        enabled: false,
      })
      .eq("auth_user_id", authUserId);

    if (error) {
      throw new Error(error.message || "Nao foi possivel limpar os dispositivos.");
    }

    return true;
  },

  async listPushQueue(limit = 200) {
    const { data, error } = await supabase
      .from("push_notification_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(Number(limit || 200), 1), 500));

    if (error) {
      throw new Error(error.message || "Nao foi possivel carregar a fila de notificacoes.");
    }

    return Array.isArray(data) ? data : [];
  },

  async sendPushTest(input: {
    recipientAuthUserId?: string | null;
    recipientRole?: "cliente" | "entregador" | "admin" | null;
    recipientDelivererId?: string | null;
    title: string;
    body: string;
    route?: string | null;
    eventType?: string;
    channelId?: string;
    dedupeKey?: string | null;
    payload?: Record<string, unknown>;
  }) {
    const { data, error } = await supabase.rpc("queue_push_notification", {
      p_event_type: normalizeText(input.eventType) || "admin_push_test",
      p_pedido_id: null,
      p_recipient_scope: input.recipientDelivererId
        ? "deliverer"
        : input.recipientRole
        ? "role"
        : "auth_user",
      p_recipient_auth_user_id: input.recipientAuthUserId ?? null,
      p_recipient_role: input.recipientRole ?? null,
      p_recipient_deliverer_id: input.recipientDelivererId ?? null,
      p_title: normalizeText(input.title),
      p_body: normalizeText(input.body),
      p_route: normalizeText(input.route) || null,
      p_channel_id: normalizeText(input.channelId) || "cg_operacao",
      p_group_key: input.recipientRole === "entregador" ? "cg_entregadores" : "cg_clientes",
      p_payload: input.payload ?? {},
      p_dedupe_key: normalizeText(input.dedupeKey) || null,
    });

    if (error) {
      throw new Error(error.message || "Nao foi possivel enfileirar o push.");
    }

    await flushPushDispatch({
      reason: "admin_push_test",
      limit: 30,
      scheduleReminders: false,
    });

    return data;
  },

  async updateOrderRecord(
    orderId: string,
    patch: {
      observacao?: string | null;
      enderecoId?: string | null;
      enderecoSnapshot?: Record<string, unknown> | null;
      clienteNome?: string | null;
      clienteTelefone?: string | null;
    }
  ) {
    return invokeAdminSupportAction("update_order_record", {
      orderId: normalizeText(orderId),
      patch,
    });
  },

  async removeOrderDeliverer(orderId: string) {
    return invokeAdminSupportAction("remove_order_deliverer", {
      orderId: normalizeText(orderId),
    });
  },

  async reopenOrder(orderId: string, nextStatus: StatusPedido) {
    return invokeAdminSupportAction("reopen_order", {
      orderId: normalizeText(orderId),
      nextStatus: normalizeText(nextStatus),
    });
  },

  async listOrderNotifications(orderId: string, limit = 30) {
    const { data, error } = await supabase
      .from("push_notification_queue")
      .select("*")
      .eq("pedido_id", normalizeText(orderId))
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(Number(limit || 30), 1), 200));

    if (error) {
      throw new Error(error.message || "Nao foi possivel carregar as notificacoes deste pedido.");
    }

      return Array.isArray(data) ? data : [];
    },

  async listGasNotifications(authUserId: string, limit = 20) {
    const { data, error } = await supabase
      .from("push_notification_queue")
      .select("*")
      .eq("recipient_auth_user_id", normalizeText(authUserId))
      .like("event_type", "gas_nivel_%")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(Number(limit || 20), 1), 200));

    if (error) {
      throw new Error(
        error.message || "Nao foi possivel carregar o historico de lembretes de gas."
      );
    }

    return Array.isArray(data) ? data : [];
  },

  async clearGasReminderHistory(authUserId: string) {
    return invokeAdminSupportAction("clear_gas_notification_history", {
      authUserId: normalizeText(authUserId),
    });
  },
};
