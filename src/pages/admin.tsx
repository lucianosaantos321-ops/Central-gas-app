import Layout from "../layout";
import { useOrderStore } from "../store/orderStore";

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function safeText(value: unknown, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export default function AdminPage() {
  const orders = useOrderStore((state) => state.orders);

  return (
    <Layout>
      <h2>Admin — Pedidos</h2>

      {orders.length === 0 && <p>Nenhum pedido.</p>}

      {orders.map((order) => (
        <div
          key={order.id}
          style={{
            background: "#fff",
            padding: 16,
            borderRadius: 12,
            marginTop: 12,
            border: "1px solid #eee",
          }}
        >
          <p>
            <strong>ID:</strong> {order.id}
          </p>

          <p>
            <strong>Status:</strong> {order.status}
          </p>

          <p>
            <strong>Produto:</strong> {order.productName}
          </p>

          <p>
            <strong>Quantidade:</strong> {order.quantity}
          </p>

          <p>
            <strong>Preço:</strong> {money(Number(order.price ?? 0))}
          </p>

          <p>
            <strong>Pagamento:</strong> {safeText(order.payment_method)}
          </p>

          <p>
            <strong>Endereço:</strong> {safeText(order.address?.street)}
          </p>

          {order.scheduledAt ? (
            <p>
              <strong>Agendado:</strong> {new Date(order.scheduledAt).toLocaleString("pt-BR")}
            </p>
          ) : null}

          <p>
            <strong>Criado em:</strong> {new Date(order.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
      ))}
    </Layout>
  );
}