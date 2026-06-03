import type { ProdutoLoja } from "../types";

type ProductSeed = Omit<ProdutoLoja, "createdAt" | "updatedAt">;

const CORE_PRODUCT_SEEDS: ProductSeed[] = [
  {
    id: "p13_gas",
    nome: "Botijao P13",
    preco: 120,
    imagem: "",
    categoria: "Gas",
    descricao: "Recarga padrao residencial P13.",
    unidade: "un",
    badge: "Mais pedido",
    destaque: true,
    ordem: 10,
    ativo: true,
  },
  {
    id: "p20_gas",
    nome: "Botijao P20",
    preco: 180,
    imagem: "",
    categoria: "Gas",
    descricao: "Opcao intermediaria para uso residencial e comercial leve.",
    unidade: "un",
    badge: "",
    destaque: false,
    ordem: 20,
    ativo: true,
  },
  {
    id: "p45_gas",
    nome: "Botijao P45",
    preco: 350,
    imagem: "",
    categoria: "Gas",
    descricao: "Alta capacidade para uso comercial.",
    unidade: "un",
    badge: "Alta capacidade",
    destaque: false,
    ordem: 30,
    ativo: true,
  },
];

function now() {
  return new Date().toISOString();
}

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function defaultItem(seed: ProductSeed, timestamp: string): ProdutoLoja {
  return {
    ...seed,
    ativo: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sortCatalog(a: ProdutoLoja, b: ProdutoLoja) {
  const aOrder = Number(a.ordem ?? 9999);
  const bOrder = Number(b.ordem ?? 9999);
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }

  const aCoreIndex = CORE_PRODUCT_SEEDS.findIndex((item) => item.id === a.id);
  const bCoreIndex = CORE_PRODUCT_SEEDS.findIndex((item) => item.id === b.id);

  if (aCoreIndex >= 0 && bCoreIndex >= 0) {
    return aCoreIndex - bCoreIndex;
  }

  if (aCoreIndex >= 0) return -1;
  if (bCoreIndex >= 0) return 1;

  const updatedDiff =
    new Date(b.updatedAt || b.createdAt || 0).getTime() -
    new Date(a.updatedAt || a.createdAt || 0).getTime();

  if (updatedDiff !== 0) return updatedDiff;
  return a.nome.localeCompare(b.nome, "pt-BR");
}

export function getDefaultProductCatalog(timestamp = now()): ProdutoLoja[] {
  return CORE_PRODUCT_SEEDS.map((item) => defaultItem(item, timestamp));
}

export function normalizeProductCatalog(items: unknown): ProdutoLoja[] {
  const timestamp = now();
  if (!Array.isArray(items)) {
    return getDefaultProductCatalog(timestamp);
  }

  const normalized = items
    .map((rawItem) => {
      const raw = rawItem as Partial<ProdutoLoja> | null | undefined;
      const id = safeText(raw?.id);
      if (!id) return null;

      const seedIndex = CORE_PRODUCT_SEEDS.findIndex((item) => item.id === id);
      const seed = seedIndex >= 0 ? CORE_PRODUCT_SEEDS[seedIndex] : null;

      return {
        id,
        nome: safeText(raw?.nome) || safeText(seed?.nome) || "Produto",
        preco: safeNumber(raw?.preco, Number(seed?.preco ?? 0)),
        imagem: safeText(raw?.imagem) || safeText(seed?.imagem) || "",
        categoria: safeText(raw?.categoria) || safeText(seed?.categoria) || "Gas",
        descricao: safeText(raw?.descricao) || safeText(seed?.descricao) || "",
        unidade: safeText(raw?.unidade) || safeText(seed?.unidade) || "un",
        badge: safeText(raw?.badge) || safeText(seed?.badge) || "",
        destaque: Boolean(raw?.destaque ?? seed?.destaque ?? false),
        ordem: safeNumber(
          raw?.ordem,
          Number(seed?.ordem ?? ((seedIndex + 1) * 10 || 9999))
        ),
        ativo: Boolean(raw?.ativo ?? seed?.ativo ?? true),
        createdAt: safeText(raw?.createdAt) || timestamp,
        updatedAt:
          safeText(raw?.updatedAt) || safeText(raw?.createdAt) || timestamp,
      } satisfies ProdutoLoja;
    })
    .filter(Boolean) as ProdutoLoja[];

  return normalized.sort(sortCatalog);
}
