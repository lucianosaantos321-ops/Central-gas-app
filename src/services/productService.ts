import type { ProdutoLoja } from "../types";

const STORAGE_KEY = "cg_products_v1";

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

function genId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `prod_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }
}

function normalizeProduct(input: Partial<ProdutoLoja>): ProdutoLoja {
  const timestamp = now();

  return {
    id: String(input.id || genId()),
    nome: String(input.nome || "Produto"),
    preco: Number(input.preco || 0),
    imagem: input.imagem ?? null,
    categoria: input.categoria ?? "gas",
    descricao: input.descricao ?? null,
    unidade: input.unidade ?? "un",
    badge: input.badge ?? null,
    ativo: input.ativo ?? true,
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

const DEFAULT_PRODUCTS: ProdutoLoja[] = [
  normalizeProduct({
    id: "p13",
    nome: "Botijao P13",
    preco: 120,
    categoria: "gas",
    descricao: "Botijao residencial mais vendido.",
    unidade: "un",
    badge: "Mais vendido",
    ativo: true,
  }),
  normalizeProduct({
    id: "p20",
    nome: "Botijao P20",
    preco: 180,
    categoria: "gas",
    descricao: "Capacidade intermediaria para uso residencial e comercial leve.",
    unidade: "un",
    badge: "",
    ativo: true,
  }),
  normalizeProduct({
    id: "p45",
    nome: "Botijao P45",
    preco: 350,
    categoria: "gas",
    descricao: "Alta capacidade para uso comercial.",
    unidade: "un",
    badge: "Alta capacidade",
    ativo: true,
  }),
];

function ensureSeed() {
  const current = safeRead<ProdutoLoja[]>(STORAGE_KEY, []);
  if (!Array.isArray(current) || current.length === 0) {
    safeWrite(STORAGE_KEY, DEFAULT_PRODUCTS);
  }
}

export const productService = {
  listAll(): ProdutoLoja[] {
    ensureSeed();
    const items = safeRead<ProdutoLoja[]>(STORAGE_KEY, []);
    if (!Array.isArray(items)) return [...DEFAULT_PRODUCTS];
    return items
      .map((item) => normalizeProduct(item))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },

  listActive(): ProdutoLoja[] {
    return this.listAll().filter((item) => item.ativo);
  },

  getById(id: string): ProdutoLoja | null {
    return this.listAll().find((item) => item.id === id) ?? null;
  },

  saveAll(items: ProdutoLoja[]) {
    const normalized = (Array.isArray(items) ? items : []).map((item) =>
      normalizeProduct(item)
    );
    safeWrite(STORAGE_KEY, normalized);
    return normalized;
  },

  upsert(input: Partial<ProdutoLoja>) {
    const current = this.listAll();
    const index = current.findIndex((item) => item.id === input.id);

    if (index >= 0) {
      const prev = current[index];
      current[index] = normalizeProduct({
        ...prev,
        ...input,
        createdAt: prev.createdAt,
      });
      this.saveAll(current);
      return current[index];
    }

    const created = normalizeProduct(input);
    current.push(created);
    this.saveAll(current);
    return created;
  },

  remove(id: string) {
    const next = this.listAll().filter((item) => item.id !== id);
    this.saveAll(next);
    return next;
  },

  toggleActive(id: string) {
    const current = this.listAll().map((item) =>
      item.id === id
        ? normalizeProduct({
            ...item,
            ativo: !item.ativo,
            createdAt: item.createdAt,
          })
        : item
    );

    this.saveAll(current);
    return current.find((item) => item.id === id) ?? null;
  },
};
