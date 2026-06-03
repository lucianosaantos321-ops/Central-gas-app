import type { ProdutoLoja } from "../types";
import { queueRemoteDocumentSave } from "./remoteAppStateService";
import {
  getDefaultProductCatalog,
  normalizeProductCatalog,
} from "./productCatalogDefaults";

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
  return getDefaultProductCatalog(now());
}

function safeRead() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = defaultProducts();
      return {
        items: seeded,
        changed: true,
        hasStoredValue: false,
      };
    }

    const parsed = JSON.parse(raw);
    const items = normalizeProductCatalog(parsed);
    return {
      items,
      changed: JSON.stringify(parsed) !== JSON.stringify(items),
      hasStoredValue: true,
    };
  } catch {
    const seeded = defaultProducts();
    return {
      items: seeded,
      changed: true,
      hasStoredValue: false,
    };
  }
}

function safeWrite(items: ProdutoLoja[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeProductCatalog(items)));
  } catch {
    // ignore
  }
}

export const productCatalogService = {
  getAll(): ProdutoLoja[] {
    const { items, changed, hasStoredValue } = safeRead();

    if (!hasStoredValue) {
      const seeded = defaultProducts();
      safeWrite(seeded);
      queueRemoteDocumentSave("product_catalog", seeded);
      return seeded;
    }

    if (changed) {
      safeWrite(items);
      queueRemoteDocumentSave("product_catalog", items);
    }

    return items;
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
    destaque?: boolean;
    ordem?: number | null;
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
      destaque: Boolean(input.destaque),
      ordem:
        input.ordem == null || !Number.isFinite(Number(input.ordem))
          ? items.length * 10 + 100
          : Number(input.ordem),
      ativo: input.ativo ?? true,
      createdAt,
      updatedAt: createdAt,
    };

    const updated = normalizeProductCatalog([next, ...items]);
    safeWrite(updated);
    queueRemoteDocumentSave("product_catalog", updated);
    return updated.find((item) => item.id === next.id) ?? next;
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
        ordem:
          patch.ordem !== undefined
            ? Number.isFinite(Number(patch.ordem))
              ? Number(patch.ordem)
              : item.ordem ?? null
            : item.ordem ?? null,
        destaque:
          patch.destaque !== undefined ? Boolean(patch.destaque) : Boolean(item.destaque),
        updatedAt: now(),
      };
    });

    const normalized = normalizeProductCatalog(updated);
    safeWrite(normalized);
    queueRemoteDocumentSave("product_catalog", normalized);
    return normalized.find((item) => item.id === id) ?? null;
  },

  remove(id: string) {
    const items = normalizeProductCatalog(
      this.getAll().filter((item) => item.id !== id)
    );
    safeWrite(items);
    queueRemoteDocumentSave("product_catalog", items);
    return true;
  },

  toggleActive(id: string) {
    const item = this.getById(id);
    if (!item) return null;
    return this.update(id, { ativo: !item.ativo });
  },

  seedIfEmpty() {
    const { hasStoredValue } = safeRead();
    if (!hasStoredValue) {
      const seeded = defaultProducts();
      safeWrite(seeded);
      queueRemoteDocumentSave("product_catalog", seeded);
    }
  },
};
