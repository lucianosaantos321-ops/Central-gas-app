export type StatusPedido =
  | "criado"
  | "confirmado"
  | "preparando"
  | "saiu_para_entrega"
  | "entregue"
  | "cancelado";

export type TipoPedido = "imediato" | "agendado";

export interface ItemPedido {
  produtoId: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
}

export interface HistoricoStatus {
  status: StatusPedido;
  data: string;
}

export interface EnderecoSnapshot {
  label: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  reference?: string;
}

export interface Pedido {
  id: string;
  clienteId: string;
  entregadorId?: string | null;

  // NOVO (BLOCO 2)
  enderecoId?: string | null;
  enderecoSnapshot?: EnderecoSnapshot | null;
  observacao?: string | null;

  status: StatusPedido;
  tipo: TipoPedido;
  horarioAgendado?: string | null;

  itens: ItemPedido[];
  subtotal: number;
  taxaEntrega: number;
  total: number;
  formaPagamento: "dinheiro" | "pix" | "cartao";

  historico: HistoricoStatus[];
  createdAt: string;
  updatedAt: string;
}