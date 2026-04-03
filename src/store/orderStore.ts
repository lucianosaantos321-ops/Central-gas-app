import { create } from "zustand";

export type OrderStatus =
  | "novo"
  | "aceito"
  | "em_rota"
  | "entregue"
  | "cancelado";

export interface Order {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  address: any;
  status: OrderStatus;
  payment_method: string;
  scheduledAt?: string;
  createdAt: string;
}

interface OrderState {
  orders: Order[];
  addOrder: (data: Omit<Order, "id" | "status" | "createdAt">) => Order;
  getOrders: () => Order[];
  updateStatus: (id: string, status: OrderStatus) => void;
}

const STORAGE_KEY = "central_gas_orders";

function safeReadOrders(): Order[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWriteOrders(orders: Order[]) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    // ignore
  }
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: safeReadOrders(),

  addOrder: (data) => {
    const order: Order = {
      id: crypto.randomUUID(),
      status: "novo",
      createdAt: new Date().toISOString(),
      ...data,
    };

    const updated = [order, ...get().orders];
    safeWriteOrders(updated);

    set({ orders: updated });
    return order;
  },

  getOrders: () => {
    return get().orders;
  },

  updateStatus: (id, status) => {
    const updated = get().orders.map((order) =>
      order.id === id ? { ...order, status } : order
    );

    safeWriteOrders(updated);
    set({ orders: updated });
  },
}));

export const addOrder = (
  data: Omit<Order, "id" | "status" | "createdAt">
) => useOrderStore.getState().addOrder(data);

export const createOrder = addOrder;

export const repeatOrder = (order: Order) =>
  useOrderStore.getState().addOrder({
    productName: order.productName,
    quantity: order.quantity,
    price: order.price,
    address: order.address,
    payment_method: order.payment_method,
    scheduledAt: order.scheduledAt,
  });

export const getOrders = () => useOrderStore.getState().getOrders();

export const updateOrderStatus = (
  id: string,
  status: OrderStatus
) => useOrderStore.getState().updateStatus(id, status);

export const subscribeOrders = (listener: () => void) => {
  const unsubscribe = useOrderStore.subscribe(() => {
    listener();
  });

  return unsubscribe;
};