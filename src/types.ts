export * from "./types/pedido";

export interface ProdutoLoja {
  id: string;
  nome: string;
  preco: number;
  imagem?: string | null;
  categoria?: string | null;
  descricao?: string | null;
  unidade?: string | null;
  badge?: string | null;
  destaque?: boolean;
  ordem?: number | null;
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
  usoUnicoPorCliente?: boolean;
  primeiraCompraApenas?: boolean;
  expiraEm?: string | null;
  usados: number;
  minimoPedido?: number | null;
  createdAt: string;
  updatedAt: string;
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
