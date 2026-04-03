export type ClientCampaignSegment =
  | "vip"
  | "recorrentes"
  | "churn"
  | "ausentes"
  | "atencao";

export interface ClientCampaign {
  id: string;
  nome: string;
  segmento: ClientCampaignSegment;
  tituloInterno: string;
  mensagemBase: string;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "cg_client_campaigns_v1";

function now() {
  return new Date().toISOString();
}

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `cc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function seed(): ClientCampaign[] {
  const t = now();

  return [
    {
      id: "cc_vip_001",
      nome: "VIP retorno",
      segmento: "vip",
      tituloInterno: "Campanha para clientes VIP",
      mensagemBase:
        "Cliente premium. Preparar benefício especial, prioridade comercial ou ação de fidelização.",
      ativo: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "cc_churn_001",
      nome: "Reativação churn",
      segmento: "churn",
      tituloInterno: "Campanha de retorno",
      mensagemBase:
        "Cliente sumido há bastante tempo. Preparar oferta de retorno ou ação de recuperação.",
      ativo: true,
      createdAt: t,
      updatedAt: t,
    },
  ];
}

function safeRead(): ClientCampaign[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seed();

    return parsed.map((item: any) => ({
      id: String(item?.id || uid()),
      nome: String(item?.nome || "Campanha"),
      segmento:
        item?.segmento === "vip" ||
        item?.segmento === "recorrentes" ||
        item?.segmento === "churn" ||
        item?.segmento === "ausentes" ||
        item?.segmento === "atencao"
          ? item.segmento
          : "recorrentes",
      tituloInterno: String(item?.tituloInterno || "Campanha"),
      mensagemBase: String(item?.mensagemBase || ""),
      ativo: Boolean(item?.ativo),
      createdAt: String(item?.createdAt || now()),
      updatedAt: String(item?.updatedAt || now()),
    }));
  } catch {
    return seed();
  }
}

function safeWrite(items: ClientCampaign[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export const clientCampaignService = {
  getAll(): ClientCampaign[] {
    const items = safeRead();
    if (!items.length) {
      const base = seed();
      safeWrite(base);
      return base;
    }

    return items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },

  getById(id: string) {
    return this.getAll().find((item) => item.id === id) ?? null;
  },

  create(input: {
    nome: string;
    segmento: ClientCampaignSegment;
    tituloInterno: string;
    mensagemBase: string;
    ativo?: boolean;
  }) {
    const items = this.getAll();
    const t = now();

    const next: ClientCampaign = {
      id: uid(),
      nome: String(input.nome || "").trim(),
      segmento: input.segmento,
      tituloInterno: String(input.tituloInterno || "").trim(),
      mensagemBase: String(input.mensagemBase || "").trim(),
      ativo: input.ativo ?? true,
      createdAt: t,
      updatedAt: t,
    };

    safeWrite([next, ...items]);
    return next;
  },

  update(
    id: string,
    patch: Partial<Omit<ClientCampaign, "id" | "createdAt" | "updatedAt">>
  ) {
    const items = this.getAll();

    const updated = items.map((item) => {
      if (item.id !== id) return item;

      return {
        ...item,
        ...patch,
        nome: patch.nome !== undefined ? String(patch.nome).trim() : item.nome,
        tituloInterno:
          patch.tituloInterno !== undefined
            ? String(patch.tituloInterno).trim()
            : item.tituloInterno,
        mensagemBase:
          patch.mensagemBase !== undefined
            ? String(patch.mensagemBase).trim()
            : item.mensagemBase,
        updatedAt: now(),
      };
    });

    safeWrite(updated);
    return updated.find((item) => item.id === id) ?? null;
  },

  remove(id: string) {
    const items = this.getAll().filter((item) => item.id !== id);
    safeWrite(items);
    return true;
  },

  toggleActive(id: string) {
    const item = this.getById(id);
    if (!item) return null;
    return this.update(id, { ativo: !item.ativo });
  },
};