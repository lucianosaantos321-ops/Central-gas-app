import type { ProdutoLoja } from "../types";

const STORAGE_KEY = "cg_product_catalog_v1";

function now() {
  return new Date().toISOString();
}

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function defaultProducts(): ProdutoLoja[] {
  const createdAt = now();

  return [
    {
      id: "p13_gas",
      nome: "Botijão P13",
      preco: 120,
      imagem: "",
      categoria: "Gás",
      descricao: "Recarga padrão residencial P13.",
      unidade: "un",
      badge: "Mais pedido",
      ativo: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "p20_gas",
      nome: "Botijão P20",
      preco: 195,
      imagem: "",
      categoria: "Gás",
      descricao: "Modelo maior para uso específico.",
      unidade: "un",
      badge: "",
      ativo: false,
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function safeRead(): ProdutoLoja[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProducts();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultProducts();

    return parsed.map((item: any) => ({
      id: String(item?.id || uid()),
      nome: String(item?.nome || "Produto"),
      preco: Number(item?.preco ?? 0),
      imagem: item?.imagem ? String(item.imagem) : "",
      categoria: item?.categoria ? String(item.categoria) : "",
      descricao: item?.descricao ? String(item.descricao) : "",
      unidade: item?.unidade ? String(item.unidade) : "un",
      badge: item?.badge ? String(item.badge) : "",
      ativo: Boolean(item?.ativo),
      createdAt: String(item?.createdAt || now()),
      updatedAt: String(item?.updatedAt || now()),
    }));
  } catch {
    return defaultProducts();
  }
}

function safeWrite(items: ProdutoLoja[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export const productCatalogService = {
  getAll(): ProdutoLoja[] {
    const items = safeRead();
    if (!items.length) {
      const seeded = defaultProducts();
      safeWrite(seeded);
      return seeded;
    }
    return items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },

  getActive(): ProdutoLoja[] {
    return this.getAll().filter((item) => item.ativo);
  },

  getById(id: string): ProdutoLoja | null {
    return this.getAll().find((item) => item.id === id) ?? null;
  },

  create(input: {
    nome: string;
    preco: number;
    imagem?: string | null;
    categoria?: string | null;
    descricao?: string | null;
    unidade?: string | null;
    badge?: string | null;
    ativo?: boolean;
  }) {
    const items = this.getAll();
    const createdAt = now();

    const next: ProdutoLoja = {
      id: uid(),
      nome: String(input.nome || "Produto").trim(),
      preco: Number(input.preco || 0),
      imagem: input.imagem?.trim() || "",
      categoria: input.categoria?.trim() || "",
      descricao: input.descricao?.trim() || "",
      unidade: input.unidade?.trim() || "un",
      badge: input.badge?.trim() || "",
      ativo: input.ativo ?? true,
      createdAt,
      updatedAt: createdAt,
    };

    safeWrite([next, ...items]);
    return next;
  },

  update(
    id: string,
    patch: Partial<Omit<ProdutoLoja, "id" | "createdAt" | "updatedAt">>
  ) {
    const items = this.getAll();
    const updated = items.map((item) => {
      if (item.id !== id) return item;

      return {
        ...item,
        ...patch,
        preco:
          patch.preco !== undefined ? Number(patch.preco || 0) : item.preco,
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

  seedIfEmpty() {
    const items = safeRead();
    if (!items.length) {
      safeWrite(defaultProducts());
    }
  },
};