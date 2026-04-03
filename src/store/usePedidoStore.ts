import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Pedido,
  ItemPedido,
  EnderecoSnapshot,
  StatusPedido,
  CanceladoPor,
  DeliveryConfirmationMethod,
} from "../types";
import { pedidoService } from "../services/pedidoService";
import { resetAfterDelivery } from "../services/gasTank";
import { emitToast } from "../services/realtimeBus";
import { iniciarFluxoEntrega } from "../services/entregadorEngine";
import { financeService } from "../services/financeService";
import { adminRulesService } from "../services/adminRulesService";
import { couponAdminService } from "../services/couponAdminService";

interface CancelarPedidoInput {
  pedidoId: string;
  canceladoPor: CanceladoPor;
  motivoCancelamento: string;
  observacaoCancelamento?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface ConfirmarEntregaInput {
  pedidoId: string;
  pin: string;
}

interface CriarPedidoInput {
  clienteId: string;
  tipo: "imediato" | "agendado";
  horarioAgendado?: string | null;
  taxaEntrega: number;
  formaPagamento: "dinheiro" | "pix" | "cartao";
  enderecoId?: string | null;
  enderecoSnapshot?: EnderecoSnapshot | null;
  observacao?: string | null;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  descontoAplicado?: number;
  totalFinal?: number;
  taxaEntregaFinal?: number;
  cupomId?: string | null;
  cupomCodigo?: string | null;
  cupomTitulo?: string | null;
  cupomTipo?: "fixo" | "percentual" | "frete" | null;
}

interface PedidoState {
  carrinho: ItemPedido[];
  pedidos: Pedido[];
  pedidoAtual: Pedido | null;
  adicionarAoCarrinho: (item: ItemPedido) => void;
  aumentarQuantidadeCarrinho: (produtoId: string) => void;
  diminuirQuantidadeCarrinho: (produtoId: string) => void;
  removerDoCarrinho: (produtoId: string) => void;
  limparCarrinho: () => void;
  criarPedido: (dados: CriarPedidoInput) => Pedido | null;
  atribuirEntregador: (pedidoId: string, entregadorId: string) => void;
  atualizarStatus: (pedidoId: string, status: Pedido["status"]) => void;
  cancelarPedido: (input: CancelarPedidoInput) => boolean;
  confirmarEntregaComPin: (input: ConfirmarEntregaInput) => boolean;
  marcarEntregaManual: (pedidoId: string) => boolean;
  replacePedidos: (pedidos: Pedido[]) => void;
  upsertPedidoLocal: (pedido: Pedido) => void;
}

function toastByStatus(status: string) {
  switch (status) {
    case "criado":
      return {
        title: "Pedido criado",
        msg: "Aguarde a confirmação da loja.",
        variant: "info" as const,
      };
    case "confirmado":
      return {
        title: "Pedido confirmado ✅",
        msg: "Seu pedido foi recebido com sucesso.",
        variant: "success" as const,
      };
    case "buscando_entregador":
      return {
        title: "Buscando entregador",
        msg: "Estamos localizando um entregador disponível.",
        variant: "info" as const,
      };
    case "preparando":
      return {
        title: "Preparando",
        msg: "Seu pedido foi aceito e está sendo preparado para sair.",
        variant: "info" as const,
      };
    case "saiu_para_entrega":
      return {
        title: "Saiu para entrega 🚚",
        msg: "O entregador está a caminho.",
        variant: "info" as const,
      };
    case "entregue":
      return {
        title: "Pedido entregue ✅",
        msg: "Obrigado! Seu gás foi atualizado para 100%.",
        variant: "success" as const,
      };
    case "cancelado":
      return {
        title: "Pedido cancelado",
        msg: "Esse caso poderá passar por auditoria.",
        variant: "warning" as const,
      };
    default:
      return {
        title: "Status atualizado",
        msg: `Novo status: ${status}`,
        variant: "info" as const,
      };
  }
}

function canAutoPrepare(current: StatusPedido) {
  return (
    current === "criado" ||
    current === "confirmado" ||
    current === "buscando_entregador"
  );
}

function safeText(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizePin(value: string) {
  return safeText(value).replace(/\D/g, "");
}

function shouldAuditCancellation(
  pedido: Pedido,
  canceladoPor: CanceladoPor
) {
  if (canceladoPor === "entregador") {
    return Boolean(
      pedido.entregadorId ||
        pedido.status === "preparando" ||
        pedido.status === "saiu_para_entrega"
    );
  }

  if (canceladoPor === "cliente") {
    return (
      pedido.status === "preparando" ||
      pedido.status === "saiu_para_entrega"
    );
  }

  return false;
}

function computeCancelamentoSuspeito(args: {
  canceladoPor: CanceladoPor;
  statusAnterior: StatusPedido;
  motivoCancelamento: string;
}) {
  const { canceladoPor, statusAnterior, motivoCancelamento } = args;
  const motivo = safeText(motivoCancelamento).toLowerCase();

  if (canceladoPor === "entregador") return true;

  if (
    canceladoPor === "cliente" &&
    (statusAnterior === "saiu_para_entrega" ||
      statusAnterior === "preparando")
  ) {
    return true;
  }

  return (
    motivo.includes("cliente ausente") ||
    motivo.includes("não estava") ||
    motivo.includes("nao estava") ||
    motivo.includes("comprou de outro") ||
    motivo.includes("comprou do concorrente") ||
    motivo.includes("sem contato") ||
    motivo.includes("não atendeu") ||
    motivo.includes("nao atendeu")
  );
}

function patchPedidoFields(pedido: Pedido, patch: Partial<Pedido>): Pedido {
  return {
    ...pedido,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function getPedidoSortTime(pedido: Pedido) {
  const updated = new Date(pedido.updatedAt ?? pedido.createdAt ?? 0).getTime();
  return Number.isFinite(updated) ? updated : 0;
}

function sortPedidos(pedidos: Pedido[]) {
  return [...pedidos].sort(
    (a, b) => getPedidoSortTime(b) - getPedidoSortTime(a)
  );
}

function upsertPedidoInList(list: Pedido[], pedido: Pedido) {
  const exists = list.some(
    (item) => String(item.id) === String(pedido.id)
  );

  if (!exists) {
    return sortPedidos([pedido, ...list]);
  }

  return sortPedidos(
    list.map((item) =>
      String(item.id) === String(pedido.id) ? pedido : item
    )
  );
}

function syncFinanceSnapshot(pedidos: Pedido[]) {
  try {
    financeService.syncDeliveredOrders(pedidos);
  } catch (error) {
    console.error("syncFinanceSnapshot error:", error);
  }
}

function syncPedidoSafely(pedido: Pedido | null | undefined) {
  if (!pedido) return;

  try {
    pedidoService.syncPedido(pedido);
  } catch (error) {
    console.error("syncPedidoSafely error:", error);
  }
}

function gerarComissaoSeNecessario(pedido: Pedido): Pedido {
  if (
    pedido.status !== "entregue" ||
    !pedido.entregadorId ||
    pedido.comissaoGerada
  ) {
    return pedido;
  }

  const valorComissao = Number(
    pedido.comissaoApp ??
      adminRulesService.getRules().comissaoPorEntrega ??
      10
  );

  financeService.addComissao(pedido.entregadorId, pedido.id, valorComissao);

  return patchPedidoFields(pedido, {
    comissaoGerada: true,
    comissaoGeradaEm: new Date().toISOString(),
    comissaoApp: valorComissao,
  });
}

function pickPedidoAtual(
  pedidos: Pedido[],
  previousPedidoAtual: Pedido | null
): Pedido | null {
  if (!Array.isArray(pedidos) || pedidos.length === 0) return null;

  if (previousPedidoAtual?.id) {
    const found = pedidos.find(
      (item) => String(item.id) === String(previousPedidoAtual.id)
    );
    if (found) return found;
  }

  return pedidos[0] ?? null;
}

export const usePedidoStore = create<PedidoState>()(
  persist(
    (set, get) => ({
      carrinho: [],
      pedidos: [],
      pedidoAtual: null,

      adicionarAoCarrinho: (item) =>
        set((state) => {
          const existente = state.carrinho.find(
            (i) => i.produtoId === item.produtoId
          );

          if (existente) {
            return {
              carrinho: state.carrinho.map((i) =>
                i.produtoId === item.produtoId
                  ? { ...i, quantidade: i.quantidade + item.quantidade }
                  : i
              ),
            };
          }

          return { carrinho: [...state.carrinho, item] };
        }),

      aumentarQuantidadeCarrinho: (produtoId) =>
        set((state) => ({
          carrinho: state.carrinho.map((i) =>
            i.produtoId === produtoId
              ? { ...i, quantidade: Number(i.quantidade || 0) + 1 }
              : i
          ),
        })),

      diminuirQuantidadeCarrinho: (produtoId) =>
        set((state) => ({
          carrinho: state.carrinho
            .map((i) =>
              i.produtoId === produtoId
                ? { ...i, quantidade: Number(i.quantidade || 0) - 1 }
                : i
            )
            .filter((i) => Number(i.quantidade || 0) > 0),
        })),

      removerDoCarrinho: (produtoId) =>
        set((state) => ({
          carrinho: state.carrinho.filter(
            (i) => i.produtoId !== produtoId
          ),
        })),

      limparCarrinho: () => set({ carrinho: [] }),

      criarPedido: (dados) => {
        const { carrinho } = get();

        if (carrinho.length === 0) {
          emitToast(
            "Carrinho vazio",
            "Adicione um botijão antes de finalizar.",
            "warning"
          );
          return null;
        }

        const subtotal = carrinho.reduce(
          (acc, item) => acc + item.precoUnitario * item.quantidade,
          0
        );

        const taxaEntregaBase = Number(dados.taxaEntrega || 0);
        const taxaEntregaFinal =
          dados.taxaEntregaFinal !== undefined
            ? Number(dados.taxaEntregaFinal || 0)
            : taxaEntregaBase;
        const descontoAplicado = Number(dados.descontoAplicado || 0);

        const total =
          dados.totalFinal !== undefined
            ? Number(dados.totalFinal || 0)
            : Math.max(0, subtotal + taxaEntregaFinal - descontoAplicado);

        const rules = adminRulesService.getRules();

        const pedidoBase = pedidoService.criarPedido({
          clienteId: dados.clienteId,
          entregadorId: null,
          enderecoId: dados.enderecoId ?? null,
          enderecoSnapshot: dados.enderecoSnapshot ?? null,
          observacao: dados.observacao ?? null,
          tipo: dados.tipo,
          horarioAgendado: dados.horarioAgendado || null,
          itens: carrinho,
          subtotal,
          taxaEntrega: taxaEntregaFinal,
          descontoAplicado,
          total,
          formaPagamento: dados.formaPagamento,
          clienteNome: dados.clienteNome ?? null,
          clienteTelefone: dados.clienteTelefone ?? null,
          cupomId: dados.cupomId ?? null,
          cupomCodigo: dados.cupomCodigo ?? null,
          cupomTitulo: dados.cupomTitulo ?? null,
          cupomTipo: dados.cupomTipo ?? null,
        });

        const pedidoComComissaoBase = patchPedidoFields(pedidoBase, {
          comissaoApp: Number(rules.comissaoPorEntrega || 10),
          comissaoGerada: false,
          comissaoGeradaEm: null,
        });

        syncPedidoSafely(pedidoComComissaoBase);

        const novoPedido = pedidoService.atualizarStatus(
          pedidoComComissaoBase,
          "buscando_entregador"
        );

        set((state) => {
          const pedidos = sortPedidos([novoPedido, ...state.pedidos]);
          syncFinanceSnapshot(pedidos);

          return {
            pedidos,
            pedidoAtual: novoPedido,
            carrinho: [],
          };
        });

        if (dados.cupomId) {
          couponAdminService.registerUse(dados.cupomId);
        }

        iniciarFluxoEntrega(novoPedido.id);
        emitToast(
          "Pedido enviado ✅",
          "Estamos buscando um entregador.",
          "success"
        );

        return novoPedido;
      },

      atribuirEntregador: (pedidoId, entregadorId) =>
        set((state) => {
          const alvo = state.pedidos.find(
            (p) => String(p.id) === String(pedidoId)
          );

          if (!alvo) return state;

          if (financeService.isBloqueado(entregadorId)) {
            emitToast(
              "Entregador bloqueado",
              "Saldo pendente acima do limite. Regularize o repasse para continuar.",
              "warning"
            );
            return state;
          }

          if (
            alvo.entregadorId &&
            String(alvo.entregadorId) !== String(entregadorId)
          ) {
            emitToast(
              "Indisponível",
              "Outro entregador já aceitou este pedido.",
              "warning"
            );
            return state;
          }

          const now = new Date().toISOString();
          const shouldPrepare = canAutoPrepare(alvo.status);
          const nextStatus: StatusPedido = shouldPrepare
            ? "preparando"
            : alvo.status;

          let pedidoSincronizado: Pedido | null = null;

          const pedidosAtualizados = state.pedidos.map((p) => {
            if (String(p.id) !== String(pedidoId)) return p;

            const historicoBase = Array.isArray(p.historico)
              ? p.historico
              : [];

            const historicoNext =
              shouldPrepare && p.status !== "preparando"
                ? [
                    ...historicoBase,
                    { status: "preparando" as const, data: now },
                  ]
                : historicoBase;

            const atualizado: Pedido = {
              ...p,
              entregadorId,
              status: nextStatus,
              historico: historicoNext,
              updatedAt: now,
            };

            pedidoSincronizado = atualizado;
            return atualizado;
          });

          const pedidoAtualAtualizado =
            state.pedidoAtual?.id === pedidoId
              ? (() => {
                  const historicoBase = Array.isArray(
                    state.pedidoAtual?.historico
                  )
                    ? state.pedidoAtual.historico
                    : [];

                  const historicoNext =
                    shouldPrepare &&
                    state.pedidoAtual?.status !== "preparando"
                      ? [
                          ...historicoBase,
                          { status: "preparando" as const, data: now },
                        ]
                      : historicoBase;

                  return {
                    ...state.pedidoAtual,
                    entregadorId,
                    status: nextStatus,
                    historico: historicoNext,
                    updatedAt: now,
                  } as Pedido;
                })()
              : state.pedidoAtual;

          if (
            !pedidoSincronizado &&
            pedidoAtualAtualizado &&
            String(pedidoAtualAtualizado.id) === String(pedidoId)
          ) {
            pedidoSincronizado = pedidoAtualAtualizado;
          }

          syncPedidoSafely(pedidoSincronizado);

          const pedidos = sortPedidos(pedidosAtualizados);
          syncFinanceSnapshot(pedidos);

          const t = toastByStatus(nextStatus);
          emitToast(t.title, t.msg, t.variant);

          return {
            pedidos,
            pedidoAtual: pedidoAtualAtualizado,
          };
        }),

      atualizarStatus: (pedidoId, status) =>
        set((state) => {
          const pedidosAtualizados = state.pedidos.map((p) => {
            if (String(p.id) !== String(pedidoId)) return p;

            let updated = pedidoService.atualizarStatus(p, status);
            updated = gerarComissaoSeNecessario(updated);
            syncPedidoSafely(updated);
            return updated;
          });

          let pedidoAtualAtualizado =
            state.pedidoAtual?.id === pedidoId
              ? pedidoService.atualizarStatus(state.pedidoAtual, status)
              : state.pedidoAtual;

          if (pedidoAtualAtualizado?.id === pedidoId) {
            pedidoAtualAtualizado =
              gerarComissaoSeNecessario(pedidoAtualAtualizado);
            syncPedidoSafely(pedidoAtualAtualizado);
          }

          const pedidos = sortPedidos(pedidosAtualizados);
          syncFinanceSnapshot(pedidos);

          const t = toastByStatus(String(status));
          emitToast(t.title, t.msg, t.variant);

          if (status === "entregue") {
            resetAfterDelivery();
          }

          return {
            pedidos,
            pedidoAtual: pedidoAtualAtualizado,
          };
        }),

      cancelarPedido: (input) => {
        const { pedidos, pedidoAtual } = get();

        const alvo = pedidos.find((p) => p.id === input.pedidoId);

        if (!alvo) {
          emitToast("Erro", "Pedido não encontrado.", "warning");
          return false;
        }

        if (alvo.status === "entregue") {
          emitToast(
            "Bloqueado",
            "Pedido já entregue não pode ser cancelado.",
            "warning"
          );
          return false;
        }

        if (alvo.status === "cancelado") {
          emitToast(
            "Aviso",
            "Esse pedido já está cancelado.",
            "info"
          );
          return false;
        }

        const now = new Date().toISOString();
        const motivo = safeText(input.motivoCancelamento);
        const obs = safeText(input.observacaoCancelamento);

        const auditavel =
          shouldAuditCancellation(alvo, input.canceladoPor) ||
          input.canceladoPor === "cliente" ||
          input.canceladoPor === "entregador";

        const suspeito = computeCancelamentoSuspeito({
          canceladoPor: input.canceladoPor,
          statusAnterior: alvo.status,
          motivoCancelamento: motivo,
        });

        const updatedPedido = patchPedidoFields(
          pedidoService.atualizarStatus(alvo, "cancelado"),
          {
            canceladoPor: input.canceladoPor,
            motivoCancelamento: motivo || "Sem motivo informado",
            observacaoCancelamento: obs || null,
            canceladoEm: now,
            cancelamentoAuditavel: auditavel || suspeito,
            cancelamentoSuspeito: suspeito,
            cancelamentoLat: Number.isFinite(Number(input.lat))
              ? Number(input.lat)
              : null,
            cancelamentoLng: Number.isFinite(Number(input.lng))
              ? Number(input.lng)
              : null,
          }
        );

        syncPedidoSafely(updatedPedido);

        set({
          pedidos: pedidos.map((p) =>
            p.id === input.pedidoId ? updatedPedido : p
          ),
          pedidoAtual:
            pedidoAtual?.id === input.pedidoId
              ? updatedPedido
              : pedidoAtual,
        });

        emitToast(
          "Pedido cancelado ⚠️",
          suspeito
            ? "Cancelamento registrado e enviado para auditoria."
            : input.canceladoPor === "entregador"
            ? "Esse cancelamento será auditado e poderemos entrar em contato com o cliente."
            : "Seu pedido foi cancelado.",
          "warning"
        );

        return true;
      },

      confirmarEntregaComPin: (input) => {
        const pinInformado = normalizePin(input.pin);

        if (!pinInformado) {
          emitToast("PIN inválido", "Informe um PIN válido.", "warning");
          return false;
        }

        const { pedidos, pedidoAtual } = get();
        const alvo = pedidos.find((p) => p.id === input.pedidoId);

        if (!alvo) {
          emitToast("Erro", "Pedido não encontrado.", "warning");
          return false;
        }

        if (alvo.status !== "saiu_para_entrega") {
          emitToast(
            "Bloqueado",
            "O PIN só pode ser validado quando o pedido estiver em rota.",
            "warning"
          );
          return false;
        }

        const pinSalvo = normalizePin(alvo.deliveryPin || "");

        if (!pinSalvo || pinSalvo !== pinInformado) {
          emitToast(
            "PIN inválido",
            "O PIN informado não confere.",
            "warning"
          );
          return false;
        }

        let updatedPedido = pedidoService.atualizarStatus(alvo, "entregue");

        updatedPedido = patchPedidoFields(updatedPedido, {
          pinVerified: true,
          pinVerifiedAt: new Date().toISOString(),
          deliveryConfirmationMethod: "pin" as DeliveryConfirmationMethod,
        });

        updatedPedido = gerarComissaoSeNecessario(updatedPedido);
        syncPedidoSafely(updatedPedido);

        set({
          pedidos: pedidos.map((p) =>
            p.id === input.pedidoId ? updatedPedido : p
          ),
          pedidoAtual:
            pedidoAtual?.id === input.pedidoId
              ? updatedPedido
              : pedidoAtual,
        });

        resetAfterDelivery();

        emitToast(
          "Entrega confirmada ✅",
          "PIN validado com sucesso. Comissão do app registrada.",
          "success"
        );

        return true;
      },

      marcarEntregaManual: (pedidoId) => {
        const { pedidos, pedidoAtual } = get();
        const alvo = pedidos.find((p) => p.id === pedidoId);

        if (!alvo) {
          emitToast("Erro", "Pedido não encontrado.", "warning");
          return false;
        }

        if (
          alvo.status !== "saiu_para_entrega" &&
          alvo.status !== "preparando"
        ) {
          emitToast(
            "Bloqueado",
            "Entrega manual só pode ser registrada em pedido ativo.",
            "warning"
          );
          return false;
        }

        let updatedPedido = pedidoService.atualizarStatus(alvo, "entregue");

        updatedPedido = patchPedidoFields(updatedPedido, {
          deliveryConfirmationMethod: "manual" as DeliveryConfirmationMethod,
          pinVerified: false,
          pinVerifiedAt: null,
        });

        updatedPedido = gerarComissaoSeNecessario(updatedPedido);
        syncPedidoSafely(updatedPedido);

        set({
          pedidos: pedidos.map((p) =>
            p.id === pedidoId ? updatedPedido : p
          ),
          pedidoAtual:
            pedidoAtual?.id === pedidoId
              ? updatedPedido
              : pedidoAtual,
        });

        resetAfterDelivery();

        emitToast(
          "Entrega manual",
          "Entrega manual registrada para auditoria.",
          "warning"
        );

        return true;
      },

      replacePedidos: (pedidos) =>
        set((state) => {
          const ordered = sortPedidos(
            Array.isArray(pedidos) ? pedidos : []
          );

          syncFinanceSnapshot(ordered);

          return {
            pedidos: ordered,
            pedidoAtual: pickPedidoAtual(ordered, state.pedidoAtual),
          };
        }),

      upsertPedidoLocal: (pedido) =>
        set((state) => {
          const pedidos = upsertPedidoInList(state.pedidos, pedido);
          syncFinanceSnapshot(pedidos);

          return {
            pedidos,
            pedidoAtual:
              state.pedidoAtual?.id === pedido.id
                ? pedido
                : state.pedidoAtual ?? pedidos[0] ?? null,
          };
        }),
    }),
    {
      name: "cg_pedido_store_v1",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persistedState: any) => {
        return {
          carrinho: Array.isArray(persistedState?.carrinho)
            ? persistedState.carrinho
            : [],
          pedidos: [],
          pedidoAtual: null,
        };
      },
      partialize: (state) => ({
        carrinho: state.carrinho,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        syncFinanceSnapshot(state.pedidos || []);
      },
    }
  )
);