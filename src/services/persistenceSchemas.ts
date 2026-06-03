import { getDefaultProductCatalog, normalizeProductCatalog } from "./productCatalogDefaults";

export type AppDocumentNamespace =
  | "admin_rules"
  | "product_catalog"
  | "coupon_campaigns"
  | "client_campaigns"
  | "client_admin_controls"
  | "deliverer_admin_controls";

export type AppDocumentScope = "public" | "admin";

type AppDocumentConfig = {
  namespace: AppDocumentNamespace;
  scope: AppDocumentScope;
  storageKey: string;
  fallback: unknown;
};

function now() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function timeOf(value: unknown) {
  const parsed = Date.parse(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeId(value: unknown) {
  return String(value ?? "").trim();
}

function safeGetLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function mergeArrayById(localValue: unknown, remoteValue: unknown) {
  const map = new Map<string, any>();

  const apply = (items: unknown) => {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      const id = normalizeId((item as any)?.id);
      if (!id) continue;

      const existing = map.get(id);
      if (!existing) {
        map.set(id, item);
        continue;
      }

      const existingTime = timeOf((existing as any)?.updatedAt ?? (existing as any)?.createdAt);
      const incomingTime = timeOf((item as any)?.updatedAt ?? (item as any)?.createdAt);
      map.set(id, incomingTime >= existingTime ? item : existing);
    }
  };

  apply(localValue);
  apply(remoteValue);

  return Array.from(map.values()).sort((a, b) => {
    const aTime = timeOf((a as any)?.updatedAt ?? (a as any)?.createdAt);
    const bTime = timeOf((b as any)?.updatedAt ?? (b as any)?.createdAt);
    return bTime - aTime;
  });
}

function mergeMapPayload(
  localValue: unknown,
  remoteValue: unknown,
  keyName: "byClientKey" | "byDeliverer"
) {
  const localMap =
    localValue &&
    typeof localValue === "object" &&
    typeof (localValue as any)[keyName] === "object"
      ? (localValue as any)[keyName]
      : {};

  const remoteMap =
    remoteValue &&
    typeof remoteValue === "object" &&
    typeof (remoteValue as any)[keyName] === "object"
      ? (remoteValue as any)[keyName]
      : {};

  const merged: Record<string, any> = {};
  const keys = new Set([
    ...Object.keys(localMap || {}),
    ...Object.keys(remoteMap || {}),
  ]);

  for (const key of keys) {
    const localItem = localMap?.[key];
    const remoteItem = remoteMap?.[key];

    if (!localItem) {
      merged[key] = remoteItem;
      continue;
    }

    if (!remoteItem) {
      merged[key] = localItem;
      continue;
    }

    const localTime = timeOf(localItem?.updatedAt);
    const remoteTime = timeOf(remoteItem?.updatedAt);
    merged[key] = remoteTime >= localTime ? remoteItem : localItem;
  }

  return { [keyName]: merged };
}

function mergeAdminRules(localValue: unknown, remoteValue: unknown) {
  const localTime = timeOf((localValue as any)?.updatedAt);
  const remoteTime = timeOf((remoteValue as any)?.updatedAt);

  if (remoteTime === 0 && localTime === 0) {
    return clone(APP_DOCUMENT_CONFIG_BY_NAMESPACE.admin_rules.fallback);
  }

  if (remoteTime >= localTime) {
    return remoteValue ?? localValue ?? clone(APP_DOCUMENT_CONFIG_BY_NAMESPACE.admin_rules.fallback);
  }

  return localValue ?? remoteValue ?? clone(APP_DOCUMENT_CONFIG_BY_NAMESPACE.admin_rules.fallback);
}

export const APP_DOCUMENT_CONFIGS: AppDocumentConfig[] = [
  {
    namespace: "admin_rules",
    scope: "public",
    storageKey: "cg_admin_rules_v1",
    fallback: {
      comissaoPorEntrega: 10,
      limiteBloqueioSaldo: 300,
      updatedAt: now(),
    },
  },
  {
    namespace: "product_catalog",
    scope: "public",
    storageKey: "cg_product_catalog_v1",
    fallback: getDefaultProductCatalog(),
  },
  {
    namespace: "coupon_campaigns",
    scope: "public",
    storageKey: "cg_coupon_campaigns_v1",
    fallback: [
      {
        id: "cup_bemvindo10",
        codigo: "BEMVINDO10",
        titulo: "Cupom de boas-vindas",
        descricao: "Base inicial para futuras campanhas.",
        tipo: "fixo",
        valor: 10,
        ativo: false,
        usoMaximo: null,
        usados: 0,
        minimoPedido: 0,
        createdAt: now(),
        updatedAt: now(),
      },
    ],
  },
  {
    namespace: "client_campaigns",
    scope: "admin",
    storageKey: "cg_client_campaigns_v1",
    fallback: [
      {
        id: "cc_vip_001",
        nome: "VIP retorno",
        segmento: "vip",
        tituloInterno: "Campanha para clientes VIP",
        mensagemBase:
          "Cliente valioso. Preparar beneficio especial, prioridade comercial ou acao de fidelizacao.",
        ativo: true,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: "cc_churn_001",
        nome: "Reativacao churn",
        segmento: "churn",
        tituloInterno: "Campanha de retorno",
        mensagemBase:
          "Cliente sumido ha bastante tempo. Preparar oferta de retorno ou acao de recuperacao.",
        ativo: true,
        createdAt: now(),
        updatedAt: now(),
      },
    ],
  },
  {
    namespace: "client_admin_controls",
    scope: "admin",
    storageKey: "cg_admin_client_control_v1",
    fallback: {
      byClientKey: {},
    },
  },
  {
    namespace: "deliverer_admin_controls",
    scope: "admin",
    storageKey: "cg_admin_deliverer_control_v1",
    fallback: {
      byDeliverer: {},
    },
  },
];

export const APP_DOCUMENT_CONFIG_BY_NAMESPACE = APP_DOCUMENT_CONFIGS.reduce(
  (acc, config) => {
    acc[config.namespace] = config;
    return acc;
  },
  {} as Record<AppDocumentNamespace, AppDocumentConfig>
);

export function getAppDocumentNamespaces(
  scopes: AppDocumentScope[]
): AppDocumentNamespace[] {
  return APP_DOCUMENT_CONFIGS.filter((config) => scopes.includes(config.scope)).map(
    (config) => config.namespace
  );
}

export function getDefaultDocumentPayload(namespace: AppDocumentNamespace) {
  return clone(APP_DOCUMENT_CONFIG_BY_NAMESPACE[namespace].fallback);
}

export function readLocalDocumentPayload(namespace: AppDocumentNamespace) {
  const config = APP_DOCUMENT_CONFIG_BY_NAMESPACE[namespace];
  const raw = safeGetLocal(config.storageKey);

  if (!raw) {
    return getDefaultDocumentPayload(namespace);
  }

  try {
    const parsed = JSON.parse(raw);
    if (namespace === "product_catalog") {
      return normalizeProductCatalog(parsed);
    }
    return parsed;
  } catch {
    return getDefaultDocumentPayload(namespace);
  }
}

export function writeLocalDocumentPayload(
  namespace: AppDocumentNamespace,
  payload: unknown
) {
  const config = APP_DOCUMENT_CONFIG_BY_NAMESPACE[namespace];
  const nextPayload =
    namespace === "product_catalog"
      ? normalizeProductCatalog(payload)
      : payload ?? config.fallback;
  safeSetLocal(config.storageKey, JSON.stringify(nextPayload));
}

export function mergeDocumentPayload(
  namespace: AppDocumentNamespace,
  localValue: unknown,
  remoteValue: unknown
) {
  if (namespace === "admin_rules") {
    return mergeAdminRules(localValue, remoteValue);
  }

  if (namespace === "product_catalog") {
    if (Array.isArray(remoteValue)) {
      return normalizeProductCatalog(remoteValue);
    }

    if (Array.isArray(localValue)) {
      return normalizeProductCatalog(localValue);
    }

    return getDefaultProductCatalog();
  }

  if (
    namespace === "coupon_campaigns" ||
    namespace === "client_campaigns"
  ) {
    return mergeArrayById(localValue, remoteValue);
  }

  if (namespace === "client_admin_controls") {
    return mergeMapPayload(localValue, remoteValue, "byClientKey");
  }

  return mergeMapPayload(localValue, remoteValue, "byDeliverer");
}

export function payloadEquals(a: unknown, b: unknown) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
