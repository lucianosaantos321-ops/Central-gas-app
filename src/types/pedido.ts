export type StatusPedido =
  | "criado"
  | "confirmado"
  | "buscando_entregador"
  | "preparando"
  | "saiu_para_entrega"
  | "entregue"
  | "cancelado";

export type TipoPedido = "imediato" | "agendado";

export type FormaPagamento = "dinheiro" | "pix" | "cartao";

export type CanceladoPor = "cliente" | "entregador" | "sistema" | "adm";

export type DeliveryConfirmationMethod = "pin" | "manual" | "none";

export interface ItemPedido {
  produtoId: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  imagem?: string | null;
  categoria?: string | null;
  descricao?: string | null;
  unidade?: string | null;
}

export interface EnderecoSnapshot {
  id?: string | null;
  label?: string | null;
  nome?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  complemento?: string | null;
  referencia?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface HistoricoPedidoItem {
  status: StatusPedido;
  data: string;
}

export interface Pedido {
  id: string;
  clienteId: string;
  entregadorId: string | null;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  status: StatusPedido;
  historico: HistoricoPedidoItem[];
  tipo: TipoPedido;
  horarioAgendado?: string | null;
  itens: ItemPedido[];
  subtotal: number;
  taxaEntrega: number;
  descontoAplicado?: number;
  total: number;
  formaPagamento: FormaPagamento;
  cupomId?: string | null;
  cupomCodigo?: string | null;
  cupomTitulo?: string | null;
  cupomTipo?: "fixo" | "percentual" | "frete" | null;
  enderecoId?: string | null;
  enderecoSnapshot?: EnderecoSnapshot | null;
  observacao?: string | null;
  createdAt: string;
  updatedAt: string;
  deliveryPin?: string | null;
  pinVerified?: boolean;
  pinVerifiedAt?: string | null;
  deliveryConfirmationMethod?: DeliveryConfirmationMethod;
  canceladoPor?: CanceladoPor | null;
  motivoCancelamento?: string | null;
  observacaoCancelamento?: string | null;
  canceladoEm?: string | null;
  cancelamentoAuditavel?: boolean;
  cancelamentoSuspeito?: boolean;
  cancelamentoLat?: number | null;
  cancelamentoLng?: number | null;
  comissaoApp?: number | null;
  comissaoGerada?: boolean;
  comissaoGeradaEm?: string | null;
}
