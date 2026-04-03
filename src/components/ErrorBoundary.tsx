import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage: string;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error: any): State {
    return {
      hasError: true,
      errorMessage: error?.message ? String(error.message) : "Erro inesperado na tela.",
    };
  }

  componentDidCatch(error: any, info: any) {
    console.error("ErrorBoundary capturou um erro:", error, info);
  }

  reloadPage = () => {
    window.location.reload();
  };

  goClient = () => {
    window.location.href = "/";
  };

  goDeliverer = () => {
    try {
      localStorage.setItem("cg_is_entregador", "1");
    } catch {
      // ignore
    }
    window.location.href = "/entregador";
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg,#0F172A 0%, #111827 48%, #1F2937 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            background: "#fff",
            borderRadius: 24,
            padding: 20,
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 18px 48px rgba(0,0,0,0.20)",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 950, color: "#111827" }}>Ops, deu erro na tela</div>

          <div style={{ marginTop: 10, color: "#666", lineHeight: 1.5 }}>
            O aplicativo capturou o erro para evitar tela branca silenciosa.
          </div>

          {this.state.errorMessage ? (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 16,
                background: "rgba(17,24,39,0.04)",
                border: "1px solid rgba(17,24,39,0.08)",
                color: "#111827",
                fontSize: 13,
                lineHeight: 1.45,
                wordBreak: "break-word",
              }}
            >
              <strong>Erro:</strong> {this.state.errorMessage}
            </div>
          ) : null}

          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <button
              onClick={this.reloadPage}
              type="button"
              style={btnPrimary}
            >
              Recarregar
            </button>

            <button
              onClick={this.goDeliverer}
              type="button"
              style={btnGhost}
            >
              Voltar entregador
            </button>

            <button
              onClick={this.goClient}
              type="button"
              style={btnGhost}
            >
              Ir cliente
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const btnPrimary: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#111827,#374151)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
};

const btnGhost: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  color: "#111",
  fontWeight: 950,
  cursor: "pointer",
};