import Layout from "../layout";
import PageHeader from "../components/PageHeader";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  syncGasTank,
  setGasLevel,
  resetAfterDelivery,
  getGasTankConfig,
  type GasTankState,
} from "../services/gasTank";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function Monitorar() {
  const navigate = useNavigate();
  const cfg = useMemo(() => getGasTankConfig(), []);

  const [tank, setTank] = useState<GasTankState>(() => syncGasTank());

  const nivel = tank.current_level;

  const statusLabel = useMemo(() => {
    if (nivel >= 70) return "Cheio";
    if (nivel >= 35) return "Médio";
    if (nivel >= 15) return "Baixo";
    return "Crítico";
  }, [nivel]);

  const aviso = useMemo(() => {
    if (nivel >= 35) return "Tudo certo por enquanto.";
    if (nivel >= 15) return "Atenção: considere pedir gás em breve.";
    return "Urgente: seu nível está crítico. Peça agora para não ficar sem gás.";
  }, [nivel]);

  const statusTint = useMemo(() => {
    if (nivel >= 70) return { bg: "rgba(67,160,71,0.10)", fg: "#2E7D32" };
    if (nivel >= 35) return { bg: "rgba(251,140,0,0.10)", fg: "#EF6C00" };
    if (nivel >= 15) return { bg: "rgba(255,152,0,0.12)", fg: "#F57C00" };
    return { bg: "rgba(228,79,42,0.12)", fg: "#E44F2A" };
  }, [nivel]);

  function refresh() {
    setTank(syncGasTank());
  }

  function updateLevelAbsolute(next: number) {
    setTank(setGasLevel(next));
  }

  function bump(delta: number) {
    updateLevelAbsolute(clamp(nivel + delta, 0, 100));
  }

  function reset() {
    const ok = confirm("Confirmar reset para 100%? (botijão novo)");
    if (!ok) return;
    setTank(resetAfterDelivery());
  }

  const fillGrad =
    "linear-gradient(180deg, rgba(247,162,18,0.90), rgba(228,79,42,0.95))";
  const barGrad =
    "linear-gradient(90deg, rgba(247,162,18,0.90), rgba(228,79,42,0.95))";

  return (
    <Layout>
      <div style={{ paddingBottom: 96 }}>
        <PageHeader
          title="Monitoramento de Gás"
          subtitle="Estimativa automática (pode variar conforme uso)"
        />

        {/* Card principal */}
        <div
          style={{
            background: "#fff",
            padding: 16,
            borderRadius: 18,
            marginTop: 16,
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 6px 18px rgba(0,0,0,.04)",
          }}
        >
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {/* Botijão */}
            <div
              style={{
                width: 120,
                height: 160,
                borderRadius: 18,
                border: "2px solid rgba(228,79,42,0.35)",
                position: "relative",
                overflow: "hidden",
                background: "#fafafa",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: `${clamp(nivel, 0, 100)}%`,
                  background: fillGrad,
                  transition: "height 250ms ease",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  padding: 10,
                  color: "#111",
                  fontWeight: 900,
                  textAlign: "center",
                }}
              >
                {nivel.toFixed(0)}%
              </div>
            </div>

            {/* Info */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "inline-flex",
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 900,
                  background: statusTint.bg,
                  color: statusTint.fg,
                }}
              >
                Status: {statusLabel}
              </div>

              <p style={{ marginTop: 10, fontWeight: 900, marginBottom: 6 }}>
                Estimativa: {tank.estimated_days} dias restantes
              </p>

              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${clamp(nivel, 0, 100)}%`,
                    background: barGrad,
                    transition: "width 250ms ease",
                  }}
                />
              </div>

              <p style={{ marginTop: 10, color: "#444", marginBottom: 0 }}>
                {aviso}
              </p>

              <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
                Consumo: ~{cfg.daily_consumption_percent}% ao dia • Atualizado em{" "}
                {new Date(tank.last_updated).toLocaleString("pt-BR")}
              </div>
            </div>
          </div>

          {/* Controles premium */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px dashed rgba(0,0,0,0.12)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 14 }}>
              Ajuste manual (se necessário)
            </div>

            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(nivel)}
              onChange={(e) => updateLevelAbsolute(Number(e.target.value))}
              style={{ width: "100%", marginTop: 10 }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button style={btnGhost} onClick={() => bump(-10)} type="button">
                -10%
              </button>
              <button style={btnGhost} onClick={() => bump(10)} type="button">
                +10%
              </button>
              <button style={btnPrimary} onClick={() => navigate("/loja")} type="button">
                Pedir agora
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button
                style={btnSoft}
                onClick={refresh}
                type="button"
                title="Recalcular consumo desde a última atualização"
              >
                Recalcular agora
              </button>

              <button
                style={btnDanger}
                onClick={reset}
                type="button"
                title="Resetar para 100% (botijão novo)"
              >
                Troquei o botijão (100%)
              </button>
            </div>
          </div>
        </div>

        {/* Aviso premium */}
        <div
          style={{
            marginTop: 14,
            background: "rgba(228,79,42,0.08)",
            border: "1px solid rgba(228,79,42,0.20)",
            borderRadius: 18,
            padding: 14,
            color: "#6b2a16",
          }}
        >
          <div style={{ fontWeight: 900 }}>Como calculamos?</div>
          <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
            Essa é uma estimativa local (sem sensores). O app reduz o nível
            automaticamente com base no tempo e permite ajuste manual quando você
            achar necessário.
          </div>
        </div>
      </div>
    </Layout>
  );
}

const btnGhost: React.CSSProperties = {
  flex: 1,
  height: 42,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  flex: 1,
  height: 42,
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F7A212)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 26px rgba(228,79,42,0.22)",
};

const btnSoft: React.CSSProperties = {
  flex: 1,
  height: 44,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(0,0,0,0.03)",
  fontWeight: 900,
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  flex: 1,
  height: 44,
  borderRadius: 14,
  border: "1px solid rgba(228,79,42,0.25)",
  background: "rgba(228,79,42,0.10)",
  color: "#E44F2A",
  fontWeight: 900,
  cursor: "pointer",
};