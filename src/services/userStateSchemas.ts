export type UserStateNamespace =
  | "client_profile"
  | "client_addresses"
  | "client_gas_tank"
  | "deliverer_profile";

export type ClientProfileDocument = {
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  nascimento: string;
  documento: string;
  referralCode: string;
  notifsPedido: boolean;
  notifsGas: boolean;
  notifsPromos: boolean;
  updatedAt: string;
};

export type AddressDocumentItem = {
  id: string;
  label: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  complement?: string;
  reference?: string;
  phone?: string;
  lat?: number | null;
  lng?: number | null;
  isDefault?: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type ClientAddressesDocument = {
  items: AddressDocumentItem[];
  primaryId: string;
  updatedAt: string;
};

export type GasTankStateDocument = {
  current_level: number;
  estimated_days: number;
  start_date: string;
  finish_date?: string;
  last_updated: string;
  last_alert_level: "none" | "low" | "critical";
  last_delivery_order_id?: string | null;
};

export type GasEstimateSetupDocument = {
  configured: boolean;
  initial_level?: number;
  average_duration_days?: number;
  days_since_last_exchange?: number;
  last_exchange_date?: string;
  updated_at: string;
};

export type ClientGasTankDocument = {
  state: GasTankStateDocument;
  setup: GasEstimateSetupDocument;
  updatedAt: string;
};

export type DelivererProfileDocument = {
  nome: string;
  telefone: string;
  cidade: string;
  veiculo: string;
  placa: string;
  pixInfo: string;
  updatedAt: string;
};

const CLIENT_PROFILE_DOC_KEY = "cg_user_profile_state_v2";
const CLIENT_ADDRESSES_DOC_KEY = "cg_user_addresses_state_v2";
const CLIENT_GAS_TANK_DOC_KEY = "cg_user_gastank_state_v2";
const DELIVERER_PROFILE_DOC_KEY = "cg_deliverer_profile_state_v2";

const LEGACY_ADDRESSES_KEY = "cg_addresses_v1";
const LEGACY_PRIMARY_ADDRESS_KEY = "cg_primary_address_id_v1";
const LEGACY_GAS_TANK_KEY = "cg_gastank_v1";
const LEGACY_GAS_SETUP_KEY = "cg_gastank_setup_v1";

function now() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function timeOf(value: unknown) {
  const parsed = Date.parse(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeGetRaw(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeGetText(key: string, fallback = "") {
  const raw = safeGetRaw(key);
  return raw && raw.trim() ? raw : fallback;
}

function safeSetRaw(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
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

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getDefaultClientProfile(): ClientProfileDocument {
  return {
    nome: "Cliente",
    telefone: "",
    email: "",
    cpf: "",
    nascimento: "",
    documento: "",
    referralCode: "",
    notifsPedido: true,
    notifsGas: true,
    notifsPromos: false,
    updatedAt: "",
  };
}

function getDefaultClientAddresses(): ClientAddressesDocument {
  return {
    items: [],
    primaryId: "",
    updatedAt: "",
  };
}

function getDefaultClientGasTank(): ClientGasTankDocument {
  return {
    state: {
      current_level: 72,
      estimated_days: 12,
      start_date: now(),
      finish_date: now(),
      last_updated: now(),
      last_alert_level: "none",
      last_delivery_order_id: null,
    },
    setup: {
      configured: false,
      initial_level: 72,
      average_duration_days: 30,
      days_since_last_exchange: 0,
      last_exchange_date: now(),
      updated_at: now(),
    },
    updatedAt: "",
  };
}

function getDefaultDelivererProfile(): DelivererProfileDocument {
  return {
    nome: "Entregador",
    telefone: "61",
    cidade: "Guara / DF",
    veiculo: "",
    placa: "",
    pixInfo: "PIX do app sera informado pelo ADM.",
    updatedAt: "",
  };
}

export function getDefaultUserDocumentPayload(namespace: UserStateNamespace) {
  switch (namespace) {
    case "client_profile":
      return getDefaultClientProfile();
    case "client_addresses":
      return getDefaultClientAddresses();
    case "client_gas_tank":
      return getDefaultClientGasTank();
    case "deliverer_profile":
      return getDefaultDelivererProfile();
  }
}

function normalizeAddressItem(item: unknown): AddressDocumentItem | null {
  const id = normalizeText((item as any)?.id);
  if (!id) return null;

  const createdAt = normalizeText((item as any)?.createdAt) || now();
  const updatedAt = normalizeText((item as any)?.updatedAt) || createdAt;

  const latRaw = (item as any)?.lat;
  const lngRaw = (item as any)?.lng;
  const latValue =
    latRaw === null || latRaw === undefined || String(latRaw).trim() === ""
      ? null
      : Number(latRaw);
  const lngValue =
    lngRaw === null || lngRaw === undefined || String(lngRaw).trim() === ""
      ? null
      : Number(lngRaw);

  return {
    id,
    label: normalizeText((item as any)?.label),
    street: normalizeText((item as any)?.street),
    number: normalizeText((item as any)?.number),
    neighborhood: normalizeText((item as any)?.neighborhood),
    city: normalizeText((item as any)?.city),
    complement: normalizeText((item as any)?.complement) || undefined,
    reference: normalizeText((item as any)?.reference) || undefined,
    phone: normalizeText((item as any)?.phone) || undefined,
    lat: Number.isFinite(latValue) ? latValue : null,
    lng: Number.isFinite(lngValue) ? lngValue : null,
    isDefault: Boolean((item as any)?.isDefault),
    createdAt,
    updatedAt,
  };
}

function addressDocTime(value: ClientAddressesDocument | null | undefined) {
  const root = timeOf(value?.updatedAt);
  const itemTimes = Array.isArray(value?.items)
    ? value!.items.map((item) => timeOf(item.updatedAt ?? item.createdAt))
    : [];
  return Math.max(root, ...itemTimes, 0);
}

function simpleDocTime(value: { updatedAt?: string } | null | undefined) {
  return timeOf(value?.updatedAt);
}

function readLegacyClientProfile(): ClientProfileDocument {
  return {
    nome: safeGetText("cg_user_name", "Cliente"),
    telefone: safeGetText("cg_user_phone", ""),
    email: safeGetText("cg_user_email", ""),
    cpf: safeGetText("cg_user_cpf", ""),
    nascimento: safeGetText("cg_user_birth", ""),
    documento: safeGetText("cg_user_doc_note", ""),
    referralCode: safeGetText("cg_ref_code", ""),
    notifsPedido: safeGetText("cg_notifs_pedido", "1") === "1",
    notifsGas: safeGetText("cg_notifs_gas", "1") === "1",
    notifsPromos: safeGetText("cg_notifs_promos", "0") === "1",
    updatedAt: "",
  };
}

function readLegacyClientAddresses(): ClientAddressesDocument {
  const parsed = parseJson<unknown[]>(safeGetRaw(LEGACY_ADDRESSES_KEY));
  const items = Array.isArray(parsed)
    ? parsed.map(normalizeAddressItem).filter(Boolean) as AddressDocumentItem[]
    : [];
  const primaryId = safeGetText(LEGACY_PRIMARY_ADDRESS_KEY, "");

  return {
    items,
    primaryId,
    updatedAt: "",
  };
}

function readLegacyClientGasTank(): ClientGasTankDocument {
  const base = getDefaultClientGasTank();
  const state = parseJson<Partial<GasTankStateDocument>>(safeGetRaw(LEGACY_GAS_TANK_KEY));
  const setup = parseJson<Partial<GasEstimateSetupDocument>>(safeGetRaw(LEGACY_GAS_SETUP_KEY));

  return {
    state: {
      current_level: clamp(Number(state?.current_level ?? base.state.current_level), 0, 100),
      estimated_days: Math.max(0, Number(state?.estimated_days ?? base.state.estimated_days)),
      start_date: normalizeText(state?.start_date) || base.state.start_date,
      finish_date: normalizeText((state as any)?.finish_date) || (base.state as any).finish_date,
      last_updated: normalizeText(state?.last_updated) || base.state.last_updated,
      last_alert_level:
        state?.last_alert_level === "low" || state?.last_alert_level === "critical"
          ? state.last_alert_level
          : "none",
      last_delivery_order_id:
        normalizeText(state?.last_delivery_order_id) || null,
    },
    setup: {
      configured: Boolean(setup?.configured),
      initial_level: clamp(Number(setup?.initial_level ?? base.setup.initial_level), 0, 100),
      average_duration_days: Math.max(
        1,
        Number((setup as any)?.average_duration_days ?? (base.setup as any).average_duration_days ?? 30)
      ),
      days_since_last_exchange: Math.max(
        0,
        Number((setup as any)?.days_since_last_exchange ?? (base.setup as any).days_since_last_exchange ?? 0)
      ),
      last_exchange_date:
        normalizeText((setup as any)?.last_exchange_date) || (base.setup as any).last_exchange_date,
      updated_at: normalizeText(setup?.updated_at) || base.setup.updated_at,
    },
    updatedAt: "",
  };
}

function readLegacyDelivererProfile(): DelivererProfileDocument {
  return {
    nome: safeGetText("cg_deliverer_name", "Entregador"),
    telefone: safeGetText("cg_deliverer_phone", "61"),
    cidade: safeGetText("cg_deliverer_city", "Guara / DF"),
    veiculo: safeGetText("cg_deliverer_vehicle", ""),
    placa: safeGetText("cg_deliverer_plate", ""),
    pixInfo: safeGetText("cg_admin_pix_info", "PIX do app sera informado pelo ADM."),
    updatedAt: "",
  };
}

export function readLocalUserDocumentPayload(namespace: UserStateNamespace) {
  switch (namespace) {
    case "client_profile": {
      const parsed = parseJson<ClientProfileDocument>(safeGetRaw(CLIENT_PROFILE_DOC_KEY));
      return parsed ?? readLegacyClientProfile();
    }
    case "client_addresses": {
      const parsed = parseJson<ClientAddressesDocument>(safeGetRaw(CLIENT_ADDRESSES_DOC_KEY));
      return parsed ?? readLegacyClientAddresses();
    }
    case "client_gas_tank": {
      const parsed = parseJson<ClientGasTankDocument>(safeGetRaw(CLIENT_GAS_TANK_DOC_KEY));
      return parsed ?? readLegacyClientGasTank();
    }
    case "deliverer_profile": {
      const parsed = parseJson<DelivererProfileDocument>(safeGetRaw(DELIVERER_PROFILE_DOC_KEY));
      return parsed ?? readLegacyDelivererProfile();
    }
  }
}

function writeLegacyAddresses(items: AddressDocumentItem[], primaryId: string) {
  const normalized = items.map((item) => ({
    ...item,
    isDefault: item.id === primaryId,
  }));
  safeSetRaw(LEGACY_ADDRESSES_KEY, JSON.stringify(normalized));
  if (primaryId) {
    safeSetRaw(LEGACY_PRIMARY_ADDRESS_KEY, primaryId);
  } else {
    safeRemove(LEGACY_PRIMARY_ADDRESS_KEY);
  }
}

export function writeLocalUserDocumentPayload(
  namespace: UserStateNamespace,
  payload: unknown
) {
  switch (namespace) {
    case "client_profile": {
      const base = getDefaultClientProfile();
      const next: ClientProfileDocument = {
        ...base,
        ...(payload as Partial<ClientProfileDocument>),
        nome: normalizeText((payload as any)?.nome) || base.nome,
        telefone: normalizeText((payload as any)?.telefone),
        email: normalizeText((payload as any)?.email),
        cpf: normalizeText((payload as any)?.cpf),
        nascimento: normalizeText((payload as any)?.nascimento),
        documento: normalizeText((payload as any)?.documento),
        referralCode: normalizeText((payload as any)?.referralCode),
        notifsPedido: Boolean((payload as any)?.notifsPedido ?? base.notifsPedido),
        notifsGas: Boolean((payload as any)?.notifsGas ?? base.notifsGas),
        notifsPromos: Boolean((payload as any)?.notifsPromos ?? base.notifsPromos),
        updatedAt: normalizeText((payload as any)?.updatedAt) || now(),
      };

      safeSetRaw(CLIENT_PROFILE_DOC_KEY, JSON.stringify(next));
      safeSetRaw("cg_user_name", next.nome);
      safeSetRaw("cg_user_phone", next.telefone);
      safeSetRaw("cg_user_email", next.email);
      safeSetRaw("cg_user_cpf", next.cpf);
      safeSetRaw("cg_user_birth", next.nascimento);
      safeSetRaw("cg_user_doc_note", next.documento);
      safeSetRaw("cg_cliente_nome", next.nome);
      safeSetRaw("cg_cliente_telefone", onlyDigits(next.telefone));
      if (next.referralCode) {
        safeSetRaw("cg_ref_code", next.referralCode);
      } else {
        safeRemove("cg_ref_code");
      }
      safeSetRaw("cg_notifs_pedido", next.notifsPedido ? "1" : "0");
      safeSetRaw("cg_notifs_gas", next.notifsGas ? "1" : "0");
      safeSetRaw("cg_notifs_promos", next.notifsPromos ? "1" : "0");
      return;
    }
    case "client_addresses": {
      const base = getDefaultClientAddresses();
      const incoming = payload as Partial<ClientAddressesDocument>;
      const items = Array.isArray(incoming?.items)
        ? incoming.items.map(normalizeAddressItem).filter(Boolean) as AddressDocumentItem[]
        : base.items;
      const primaryCandidate = normalizeText(incoming?.primaryId);
      const primaryId =
        items.some((item) => item.id === primaryCandidate)
          ? primaryCandidate
          : items[0]?.id ?? "";
      const next: ClientAddressesDocument = {
        items,
        primaryId,
        updatedAt: normalizeText(incoming?.updatedAt) || now(),
      };

      safeSetRaw(CLIENT_ADDRESSES_DOC_KEY, JSON.stringify(next));
      writeLegacyAddresses(next.items, next.primaryId);
      return;
    }
    case "client_gas_tank": {
      const base = getDefaultClientGasTank();
      const incoming = payload as Partial<ClientGasTankDocument>;
      const next: ClientGasTankDocument = {
        state: {
          ...base.state,
          ...(incoming?.state ?? {}),
          current_level: clamp(
            Number(incoming?.state?.current_level ?? base.state.current_level),
            0,
            100
          ),
          estimated_days: Math.max(
            0,
            Number(incoming?.state?.estimated_days ?? base.state.estimated_days)
          ),
          start_date:
            normalizeText(incoming?.state?.start_date) || base.state.start_date,
          finish_date:
            normalizeText((incoming?.state as any)?.finish_date) || (base.state as any).finish_date,
          last_updated:
            normalizeText(incoming?.state?.last_updated) || base.state.last_updated,
          last_alert_level:
            incoming?.state?.last_alert_level === "low" ||
            incoming?.state?.last_alert_level === "critical"
              ? incoming.state.last_alert_level
              : "none",
          last_delivery_order_id:
            normalizeText(incoming?.state?.last_delivery_order_id) || null,
        },
        setup: {
          ...base.setup,
          ...(incoming?.setup ?? {}),
          configured: Boolean(incoming?.setup?.configured ?? base.setup.configured),
          initial_level: clamp(
            Number(incoming?.setup?.initial_level ?? base.setup.initial_level),
            0,
            100
          ),
          average_duration_days: Math.max(
            1,
            Number((incoming?.setup as any)?.average_duration_days ?? (base.setup as any).average_duration_days ?? 30)
          ),
          days_since_last_exchange: Math.max(
            0,
            Number((incoming?.setup as any)?.days_since_last_exchange ?? (base.setup as any).days_since_last_exchange ?? 0)
          ),
          last_exchange_date:
            normalizeText((incoming?.setup as any)?.last_exchange_date) || (base.setup as any).last_exchange_date,
          updated_at:
            normalizeText(incoming?.setup?.updated_at) || base.setup.updated_at,
        },
        updatedAt:
          normalizeText(incoming?.updatedAt) ||
          normalizeText(incoming?.state?.last_updated) ||
          normalizeText(incoming?.setup?.updated_at) ||
          now(),
      };

      safeSetRaw(CLIENT_GAS_TANK_DOC_KEY, JSON.stringify(next));
      safeSetRaw(LEGACY_GAS_TANK_KEY, JSON.stringify(next.state));
      safeSetRaw(LEGACY_GAS_SETUP_KEY, JSON.stringify(next.setup));
      return;
    }
    case "deliverer_profile": {
      const base = getDefaultDelivererProfile();
      const next: DelivererProfileDocument = {
        ...base,
        ...(payload as Partial<DelivererProfileDocument>),
        nome: normalizeText((payload as any)?.nome) || base.nome,
        telefone: normalizeText((payload as any)?.telefone) || base.telefone,
        cidade: normalizeText((payload as any)?.cidade) || base.cidade,
        veiculo: normalizeText((payload as any)?.veiculo),
        placa: normalizeText((payload as any)?.placa),
        pixInfo: normalizeText((payload as any)?.pixInfo) || base.pixInfo,
        updatedAt: normalizeText((payload as any)?.updatedAt) || now(),
      };

      safeSetRaw(DELIVERER_PROFILE_DOC_KEY, JSON.stringify(next));
      safeSetRaw("cg_deliverer_name", next.nome);
      safeSetRaw("cg_deliverer_phone", next.telefone);
      safeSetRaw("cg_deliverer_city", next.cidade);
      safeSetRaw("cg_deliverer_vehicle", next.veiculo);
      safeSetRaw("cg_deliverer_plate", next.placa);
      safeSetRaw("cg_admin_pix_info", next.pixInfo);
      return;
    }
  }
}

export function mergeUserDocumentPayload(
  namespace: UserStateNamespace,
  localValue: unknown,
  remoteValue: unknown
) {
  if (namespace === "client_addresses") {
    const localDoc = (localValue as ClientAddressesDocument | null) ?? getDefaultClientAddresses();
    const remoteDoc = (remoteValue as ClientAddressesDocument | null) ?? getDefaultClientAddresses();
    const map = new Map<string, AddressDocumentItem>();

    const apply = (items: AddressDocumentItem[]) => {
      for (const rawItem of items) {
        const item = normalizeAddressItem(rawItem);
        if (!item) continue;
        const existing = map.get(item.id);
        if (!existing) {
          map.set(item.id, item);
          continue;
        }

        const existingTime = timeOf(existing.updatedAt ?? existing.createdAt);
        const incomingTime = timeOf(item.updatedAt ?? item.createdAt);
        map.set(item.id, incomingTime >= existingTime ? item : existing);
      }
    };

    apply(Array.isArray(localDoc.items) ? localDoc.items : []);
    apply(Array.isArray(remoteDoc.items) ? remoteDoc.items : []);

    const items = Array.from(map.values()).sort((a, b) => {
      const aTime = timeOf(a.updatedAt ?? a.createdAt);
      const bTime = timeOf(b.updatedAt ?? b.createdAt);
      return bTime - aTime;
    });

    const remotePrimary = normalizeText(remoteDoc.primaryId);
    const localPrimary = normalizeText(localDoc.primaryId);
    const localDocMillis = addressDocTime(localDoc);
    const remoteDocMillis = addressDocTime(remoteDoc);
    const primaryCandidates =
      remoteDocMillis > localDocMillis
        ? [remotePrimary, localPrimary]
        : [localPrimary, remotePrimary];
    const primaryId =
      primaryCandidates.find(
        (candidate) => candidate && items.some((item) => item.id === candidate)
      ) ||
      items[0]?.id ||
      "";

    const updatedAtMillis = Math.max(localDocMillis, remoteDocMillis, 0);

    return {
      items: items.map((item) => ({
        ...item,
        isDefault: item.id === primaryId,
      })),
      primaryId,
      updatedAt: updatedAtMillis > 0 ? new Date(updatedAtMillis).toISOString() : now(),
    } satisfies ClientAddressesDocument;
  }

  if (namespace === "client_gas_tank") {
    const localDoc = (localValue as ClientGasTankDocument | null) ?? getDefaultClientGasTank();
    const remoteDoc = (remoteValue as ClientGasTankDocument | null) ?? getDefaultClientGasTank();
    const localStateTime = Math.max(
      timeOf(localDoc.state?.last_updated),
      timeOf(localDoc.updatedAt),
      0
    );
    const remoteStateTime = Math.max(
      timeOf(remoteDoc.state?.last_updated),
      timeOf(remoteDoc.updatedAt),
      0
    );
    const localSetupTime = Math.max(
      timeOf(localDoc.setup?.updated_at),
      timeOf(localDoc.updatedAt),
      0
    );
    const remoteSetupTime = Math.max(
      timeOf(remoteDoc.setup?.updated_at),
      timeOf(remoteDoc.updatedAt),
      0
    );
    const updatedAtMillis = Math.max(
      localStateTime,
      remoteStateTime,
      localSetupTime,
      remoteSetupTime,
      0
    );

    return clone({
      state:
        remoteStateTime > localStateTime ? remoteDoc.state : localDoc.state,
      setup:
        remoteSetupTime > localSetupTime ? remoteDoc.setup : localDoc.setup,
      updatedAt:
        updatedAtMillis > 0 ? new Date(updatedAtMillis).toISOString() : now(),
    } satisfies ClientGasTankDocument);
  }

  if (namespace === "deliverer_profile") {
    const localDoc = (localValue as DelivererProfileDocument | null) ?? getDefaultDelivererProfile();
    const remoteDoc = (remoteValue as DelivererProfileDocument | null) ?? getDefaultDelivererProfile();
    return clone(simpleDocTime(remoteDoc) >= simpleDocTime(localDoc) ? remoteDoc : localDoc);
  }

  const localDoc = (localValue as ClientProfileDocument | null) ?? getDefaultClientProfile();
  const remoteDoc = (remoteValue as ClientProfileDocument | null) ?? getDefaultClientProfile();
  return clone(simpleDocTime(remoteDoc) >= simpleDocTime(localDoc) ? remoteDoc : localDoc);
}

export function payloadEquals(a: unknown, b: unknown) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function hasMeaningfulUserDocument(
  namespace: UserStateNamespace,
  payload: unknown
) {
  if (namespace === "client_addresses") {
    return Array.isArray((payload as ClientAddressesDocument | null)?.items)
      && ((payload as ClientAddressesDocument).items.length > 0);
  }

  if (namespace === "client_gas_tank") {
    const doc = payload as ClientGasTankDocument | null;
    if (!doc) return false;
    return (
      Boolean(doc.setup?.configured) ||
      Math.abs(Number(doc.state?.current_level ?? 72) - 72) > 0.01 ||
      Boolean(normalizeText(doc.state?.last_delivery_order_id))
    );
  }

  if (namespace === "deliverer_profile") {
    const doc = payload as DelivererProfileDocument | null;
    if (!doc) return false;
    return Boolean(
      normalizeText(doc.nome) ||
      normalizeText(doc.telefone) ||
      normalizeText(doc.cidade) ||
      normalizeText(doc.veiculo) ||
      normalizeText(doc.placa) ||
      normalizeText(doc.pixInfo)
    );
  }

  const doc = payload as ClientProfileDocument | null;
  if (!doc) return false;
  return Boolean(
    normalizeText(doc.nome) ||
    normalizeText(doc.telefone) ||
    normalizeText(doc.email) ||
    normalizeText(doc.cpf) ||
    normalizeText(doc.nascimento) ||
    normalizeText(doc.documento) ||
    normalizeText(doc.referralCode) ||
    doc.notifsPedido ||
    doc.notifsGas ||
    doc.notifsPromos
  );
}

export function applyIdentityToUserDocument(
  namespace: UserStateNamespace,
  payload: unknown,
  identity: { nome?: string | null; telefone?: string | null }
) {
  if (namespace === "client_profile") {
    const base = payload as ClientProfileDocument;
    return {
      ...base,
      nome: normalizeText(identity.nome) || base.nome,
      telefone: normalizeText(identity.telefone) || base.telefone,
    } satisfies ClientProfileDocument;
  }

  if (namespace === "deliverer_profile") {
    const base = payload as DelivererProfileDocument;
    return {
      ...base,
      nome: normalizeText(identity.nome) || base.nome,
      telefone: normalizeText(identity.telefone) || base.telefone,
    } satisfies DelivererProfileDocument;
  }

  return payload;
}
