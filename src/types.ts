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

export interface ProdutoLoja {
  id: string;
  nome: string;
  preco: number;
  imagem?: string | null;
  categoria?: string | null;
  descricao?: string | null;
  unidade?: string | null;
  badge?: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CupomCampanha {
  id: string;
  codigo: string;
  titulo: string;
  descricao?: string | null;
  tipo: "fixo" | "percentual" | "frete";
  valor: number;
  ativo: boolean;
  usoMaximo?: number | null;
  usados: number;
  minimoPedido?: number | null;
  createdAt: string;
  updatedAt: string;
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

  comissaoApp?: number;
  comissaoGerada?: boolean;
  comissaoGeradaEm?: string | null;
}

export interface AdminRuleState {
  comissaoPorEntrega: number;
  limiteBloqueioSaldo: number;
  updatedAt: string;
}

export interface FinanceHistoryItem {
  tipo: "comissao" | "pagamento" | "ajuste";
  valor: number;
  pedidoId?: string;
  observacao?: string | null;
  data: string;
}

export interface DelivererFinancialState {
  entregadorId: string;
  saldoDevedor: number;
  limiteBloqueio: number;
  bloqueado: boolean;
  updatedAt: string;
  historico: FinanceHistoryItem[];
}