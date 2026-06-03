import { useNavigate } from "react-router-dom";
import { enableEntregadorMode, clearEntregadorMode } from "../utils/appMode";

export default function ModeGateway() {
  const navigate = useNavigate();

  function entrarCliente() {
    clearEntregadorMode();
    navigate("/");
  }

  function entrarEntregador() {
    enableEntregadorMode();
    navigate("/entregador");
  }

  function entrarAdmin() {
    clearEntregadorMode();
    navigate("/admin/login");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F6F7FB",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          display: "grid",
          gap: 14,
          paddingTop: 24,
          paddingBottom: 24,
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg,#0F172A 0%, #111827 55%, #1F2937 100%)",
            borderRadius: 26,
            padding: 20,
            color: "#fff",
            boxShadow: "0 18px 44px rgba(0,0,0,0.20)",
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 950,
              letterSpacing: -0.5,
            }}
          >
            Central Gás
          </div>

          <div
            style={{
              marginTop: 8,
              fontSize: 14,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.88)",
              fontWeight: 700,
            }}
          >
            Entrada principal do ecossistema. Escolha o modo que deseja testar ou operar.
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: 16,
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 950,
              color: "#111827",
            }}
          >
            Selecionar modo
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gap: 12,
            }}
          >
            <button
              onClick={entrarCliente}
              type="button"
              style={{
                width: "100%",
                textAlign: "left",
                border: "1px solid rgba(0,0,0,0.08)",
                background: "#fff",
                borderRadius: 20,
                padding: 16,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 950,
                  color: "#111827",
                }}
              >
                App Cliente
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "#64748B",
                  lineHeight: 1.5,
                }}
              >
                Fluxo de compra, checkout, pedidos, monitorar e conta.
              </div>
            </button>

            <button
              onClick={entrarEntregador}
              type="button"
              style={{
                width: "100%",
                textAlign: "left",
                border: "1px solid rgba(228,79,42,0.16)",
                background: "rgba(228,79,42,0.04)",
                borderRadius: 20,
                padding: 16,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 950,
                  color: "#111827",
                }}
              >
                App Entregador
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "#64748B",
                  lineHeight: 1.5,
                }}
              >
                Fila operacional, rota, entrega, histórico, ganhos e conta.
              </div>
            </button>

            <button
              onClick={entrarAdmin}
              type="button"
              style={{
                width: "100%",
                textAlign: "left",
                border: "1px solid rgba(15,23,42,0.08)",
                background: "#F8FAFC",
                borderRadius: 20,
                padding: 16,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 950,
                  color: "#111827",
                }}
              >
                Super ADM
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "#64748B",
                  lineHeight: 1.5,
                }}
              >
                Dashboard, produtos, financeiro, auditoria e próximas camadas de controle total.
              </div>
            </button>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: 16,
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 950,
              color: "#111827",
            }}
          >
            Observação técnica
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              color: "#475569",
              lineHeight: 1.6,
            }}
          >
            Essa tela reduz atrito de teste e evita depender de entrar manualmente em rotas soltas.  
            Na próxima fase, ela pode virar splash real ou seletor interno apenas para ambiente de operação.
          </div>
        </div>
      </div>
    </div>
  );
}
