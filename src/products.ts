export type Product = {
  id: string;
  name: string;
  description?: string;
  price: number;
};

export const products: Product[] = [
  {
    id: "gas-13",
    name: "Gás 13kg",
    description: "Botijão residencial",
    price: 110,
  },
  {
    id: "gas-45",
    name: "Gás 45kg",
    description: "Botijão industrial",
    price: 420,
  },
];
