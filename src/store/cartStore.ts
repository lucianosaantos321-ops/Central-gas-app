import { create } from "zustand";

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  clearCart: () => void;
  getTotal: () => number;
}

const STORAGE_KEY = "central_gas_cart";

export const useCartStore = create<CartState>((set, get) => ({
  items: JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"),

  addItem: (item) => {
    const items = get().items;
    const found = items.find(i => i.productId === item.productId);

    let updated: CartItem[];

    if (found) {
      updated = items.map(i =>
        i.productId === item.productId
          ? { ...i, quantity: i.quantity + 1 }
          : i
      );
    } else {
      updated = [...items, { ...item, quantity: 1 }];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    set({ items: updated });
  },

  clearCart: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ items: [] });
  },

  getTotal: () =>
    get().items.reduce((s, i) => s + i.price * i.quantity, 0),
}));
