import { usePedidoStore } from "../store/usePedidoStore";

type Oferta = {
  pedidoId: string;
  createdAt: number;
  expiresAt: number;
};

const TEMPO_OFERTA = 10000;
const TEMPO_GLOBAL = 30000;

let ofertas: Oferta[] = [];

export function iniciarFluxoEntrega(pedidoId: string) {
  const now = Date.now();

  const oferta: Oferta = {
    pedidoId,
    createdAt: now,
    expiresAt: now + TEMPO_OFERTA,
  };

  ofertas.push(oferta);

  window.dispatchEvent(
    new CustomEvent("cg_nova_oferta", {
      detail: { pedidoId },
    })
  );

  setTimeout(() => {
    const store = usePedidoStore.getState();
    const pedido = store.pedidos.find((p) => p.id === pedidoId);

    if (!pedido) return;

    if (!pedido.entregadorId) {
      window.dispatchEvent(
        new CustomEvent("cg_oferta_expirada", {
          detail: { pedidoId },
        })
      );
    }
  }, TEMPO_OFERTA);

  setTimeout(() => {
    const store = usePedidoStore.getState();
    const pedido = store.pedidos.find((p) => p.id === pedidoId);

    if (!pedido) return;

    if (!pedido.entregadorId) {
      window.dispatchEvent(
        new CustomEvent("cg_pedido_manual", {
          detail: { pedidoId },
        })
      );
    }
  }, TEMPO_GLOBAL);
}