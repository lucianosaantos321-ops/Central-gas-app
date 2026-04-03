import type { Product } from "../products";

export type OrderStatus =
  | "created"
  | "pending_assignment"
  | "assigned"
  | "in_transit"
  | "delivered"
  | "completed"
  | "cancelled"
  | "scheduled";

export type OrderItem = {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
};

export type OrderAddress = {
  street: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  complement?: string;
  reference?: string;
  latitude?: number;
  longitude?: number;
};

export type Order = {
  id: string;
  customer_id: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: "entrega";
  status: OrderStatus;
  address: OrderAddress;
  notes?: string;
  created_at: string;
};

export function buildOrder(params: {
  customer_id: string;
  products: Product[];
  cart: Record<string, number>;
  address: OrderAddress;
}): Order {
  const items: OrderItem[] = params.products
    .filter((p) => params.cart[p.id] > 0)
    .map((p) => ({
      product_id: p.id,
      name: p.name,
      price: p.price,
      quantity: params.cart[p.id],
    }));

  const subtotal = items.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );

  return {
    id: crypto.randomUUID(),
    customer_id: params.customer_id,
    items,
    subtotal,
    discount: 0,
    total: subtotal,
    payment_method: "entrega",
    status: "created",
    address: params.address,
    created_at: new Date().toISOString(),
  };
}
