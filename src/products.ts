export type Product = {
  id: string;
  name: string;
  description?: string;
  price: number;
};

export const products: Product[] = [
  {
    id: "gas-13",
    name: "Gas 13kg",
    description: "Botijao residencial",
    price: 120,
  },
  {
    id: "gas-20",
    name: "Gas 20kg",
    description: "Botijao intermediario",
    price: 180,
  },
  {
    id: "gas-45",
    name: "Gas 45kg",
    description: "Botijao industrial",
    price: 350,
  },
];
