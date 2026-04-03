import type { CupomCampanha, Pedido } from "../types";

const STORAGE_KEY = "cg_coupon_campaigns_v1";

function now() {
  return new Date().toISOString();
}

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `cup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function defaultCoupons(): CupomCampanha[] {
  const createdAt = now();

  return [
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
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function safeRead(): CupomCampanha[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCoupons();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultCoupons();

    return parsed.map((item: any) => ({
      id: String(item?.id || uid()),
      codigo: String(item?.codigo || "").toUpperCase(),
      titulo: String(item?.titulo || "Campanha"),
      descricao: item?.descricao ? String(item.descricao) : "",
      tipo:
        item?.tipo === "percentual" || item?.tipo === "frete" ? item.tipo : "fixo",
      valor: Number(item?.valor ?? 0),
      ativo: Boolean(item?.ativo),
      usoMaximo:
        item?.usoMaximo == null ? null : Number(item.usoMaximo),
      usados: Number(item?.usados ?? 0),
      minimoPedido:
        item?.minimoPedido == null ? null : Number(item.minimoPedido),
      createdAt: String(item?.createdAt || now()),
      updatedAt: String(item?.updatedAt || now()),
    }));
  } catch {
    return defaultCoupons();
  }
}

function safeWrite(items: CupomCampanha[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export type CouponValidationResult =
  | {
      ok: true;
      coupon: CupomCampanha;
      desconto: number;
      taxaEntregaFinal: number;
      subtotal: number;
      totalOriginal: number;
      totalFinal: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export const couponAdminService = {
  getAll(): CupomCampanha[] {
    const items = safeRead();
    if (!items.length) {
      const seeded = defaultCoupons();
      safeWrite(seeded);
      return seeded;
    }
    return items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },

  getByCode(code: string): CupomCampanha | null {
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return null;
    return this.getAll().find((item) => item.codigo === normalized) ?? null;
  },

  validateForCheckout(input: {
    code: string;
    subtotal: number;
    taxaEntrega: number;
  }): CouponValidationResult {
    const code = String(input.code || "").trim().toUpperCase();
    const subtotal = Number(input.subtotal || 0);
    const taxaEntrega = Number(input.taxaEntrega || 0);
    const totalOriginal = subtotal + taxaEntrega;

    if (!code) {
      return { ok: false, message: "Informe um código de cupom." };
    }

    const coupon = this.getByCode(code);
    if (!coupon) {
      return { ok: false, message: "Cupom não encontrado." };
    }

    if (!coupon.ativo) {
      return { ok: false, message: "Esse cupom está inativo." };
    }

    if (coupon.usoMaximo != null && coupon.usados >= coupon.usoMaximo) {
      return { ok: false, message: "Esse cupom atingiu o limite de uso." };
    }

    if (coupon.minimoPedido != null && subtotal < coupon.minimoPedido) {
      return {
        ok: false,
        message: `Pedido mínimo para esse cupom: R$ ${Number(coupon.minimoPedido).toFixed(2).replace(".", ",")}.`,
      };
    }

    let desconto = 0;
    let taxaEntregaFinal = taxaEntrega;

    if (coupon.tipo === "fixo") {
      desconto = Math.min(Number(coupon.valor || 0), totalOriginal);
    } else if (coupon.tipo === "percentual") {
      desconto = totalOriginal * (Number(coupon.valor || 0) / 100);
      desconto = Math.min(desconto, totalOriginal);
    } else if (coupon.tipo === "frete") {
      desconto = taxaEntrega;
      taxaEntregaFinal = 0;
    }

    desconto = Math.max(0, Number(desconto.toFixed(2)));
    const totalFinal = Math.max(0, Number((totalOriginal - desconto).toFixed(2)));

    return {
      ok: true,
      coupon,
      desconto,
      taxaEntregaFinal,
      subtotal,
      totalOriginal,
      totalFinal,
      message: `Cupom ${coupon.codigo} aplicado com sucesso.`,
    };
  },

  registerUse(id: string) {
    const items = this.getAll();
    const updated = items.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        usados: Number(item.usados || 0) + 1,
        updatedAt: now(),
      };
    });

    safeWrite(updated);
    return updated.find((item) => item.id === id) ?? null;
  },

  getMetrics(pedidos: Pedido[]) {
    const coupons = this.getAll();
    const orders = Array.isArray(pedidos) ? pedidos : [];

    const rows = coupons.map((coupon) => {
      const linkedOrders = orders.filter(
        (p) => String(p?.cupomId || "") === coupon.id || String(p?.cupomCodigo || "") === coupon.codigo
      );

      const pedidosCompletos = linkedOrders.filter((p) => p?.status === "entregue");
      const pedidosCancelados = linkedOrders.filter((p) => p?.status === "cancelado");

      const descontoTotal = linkedOrders.reduce(
        (acc, p) => acc + Number(p?.descontoAplicado || 0),
        0
      );

      const faturamentoBruto = linkedOrders.reduce(
        (acc, p) => acc + Number(p?.total || 0),
        0
      );

      return {
        ...coupon,
        pedidosVinculados: linkedOrders.length,
        pedidosEntregues: pedidosCompletos.length,
        pedidosCancelados: pedidosCancelados.length,
        descontoTotal,
        faturamentoBruto,
        ticketMedio:
          linkedOrders.length > 0 ? faturamentoBruto / linkedOrders.length : 0,
      };
    });

    return rows.sort((a, b) => b.pedidosVinculados - a.pedidosVinculados);
  },

  create(input: {
    codigo: string;
    titulo: string;
    descricao?: string | null;
    tipo: "fixo" | "percentual" | "frete";
    valor: number;
    ativo?: boolean;
    usoMaximo?: number | null;
    minimoPedido?: number | null;
  }) {
    const items = this.getAll();
    const createdAt = now();

    const next: CupomCampanha = {
      id: uid(),
      codigo: String(input.codigo || "").trim().toUpperCase(),
      titulo: String(input.titulo || "Campanha").trim(),
      descricao: input.descricao?.trim() || "",
      tipo: input.tipo,
      valor: Number(input.valor || 0),
      ativo: input.ativo ?? false,
      usoMaximo: input.usoMaximo == null ? null : Number(input.usoMaximo),
      usados: 0,
      minimoPedido:
        input.minimoPedido == null ? null : Number(input.minimoPedido),
      createdAt,
      updatedAt: createdAt,
    };

    safeWrite([next, ...items]);
    return next;
  },

  update(
    id: string,
    patch: Partial<Omit<CupomCampanha, "id" | "createdAt" | "updatedAt">>
  ) {
    const items = this.getAll();
    const updated = items.map((item) => {
      if (item.id !== id) return item;

      return {
        ...item,
        ...patch,
        codigo:
          patch.codigo !== undefined
            ? String(patch.codigo || "").trim().toUpperCase()
            : item.codigo,
        valor:
          patch.valor !== undefined ? Number(patch.valor || 0) : item.valor,
        usoMaximo:
          patch.usoMaximo !== undefined
            ? patch.usoMaximo == null
              ? null
              : Number(patch.usoMaximo)
            : item.usoMaximo,
        minimoPedido:
          patch.minimoPedido !== undefined
            ? patch.minimoPedido == null
              ? null
              : Number(patch.minimoPedido)
            : item.minimoPedido,
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
    const item = this.getAll().find((x) => x.id === id);
    if (!item) return null;
    return this.update(id, { ativo: !item.ativo });
  },
};