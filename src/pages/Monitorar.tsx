import Layout from "../layout";
import PageHeader from "../components/PageHeader";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  getGasTank,
  syncGasTank,
  setGasLevel,
  resetAfterDelivery,
  getGasTankConfig,
  type GasTankState,
} from "../services/gasTank";
import {
  cardStyle,
  dangerButtonStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionCardStyle,
  ui,
} from "../styles/ui";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function gasStatus(level: number) {
  if (level >= 70) return "Cheio";
  if (level >= 35) return "Medio";
  if (level >= 15) return "Baixo";
  return "Critico";
}

export default function Monitorar() {
  const navigate = useNavigate();
  const cfg = useMemo(() => getGasTankConfig(), []);
  const [tank, setTank] = useState<GasTankState>(() => getGasTank());

  const nivel = clamp(tank.current_level, 0, 100);
  const statusLabel = gasStatus(nivel);

  const statusTint = useMemo(() => {
    if (nivel >= 70) return { bg: "rgba(34,197,94,0.10)", fg: "#166534" };
    if (nivel >= 35) return { bg: "rgba(245,158,11,0.12)", fg: "#B45309" };
    if (nivel >= 15) return { bg: "rgba(249,115,22,0.12)", fg: "#C2410C" };
    return { bg: "rgba(225,29,72,0.12)", fg: "#BE123C" };
  }, [nivel]);

  const aviso = useMemo(() => {
    if (nivel >= 35) return "Tudo certo por enquanto.";
    if (nivel >= 15) return "Atenção: vale programar seu próximo pedido.";
    return "Nível crítico. Faça um pedido agora para não ficar sem gás.";
  }, [nivel]);

  useEffect(() => {
    setTank(syncGasTank());
  }, []);

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
    const ok = confirm("Confirmar volta para 100%? (botijão novo)");
    if (!ok) return;
    setTank(resetAfterDelivery());
  }

  return (
    <Layout>
      <div style={{ paddingBottom: 96, display: "grid", gap: 14 }}>
        <PageHeader title="Monitoramento do gás" subtitle="Veja a estimativa e ajuste quando precisar" />

        <div style={heroCard}>
          <div>
            <div style={heroTitle}>Nivel atual</div>
            <div style={heroValue}>{nivel.toFixed(0)}%</div>
            <div style={{ ...heroPill, background: statusTint.bg, color: statusTint.fg }}>
              Status: {statusLabel}
            </div>
          </div>

          <div style={tankScene}>
            <div style={tankHandle} />
            <div style={tankBody}>
              <div style={tankTopLine} />
              <div
                style={{
                  ...tankLiquid,
                  height: `${nivel}%`,
                }}
              />
              <div style={tankPercent}>{nivel.toFixed(0)}%</div>
            </div>
            <div style={tankFeet}>
              <span style={tankFoot} />
              <span style={tankFoot} />
            </div>
          </div>
        </div>

        <div style={statsGrid}>
          <div style={statCard}>
            <div style={statLabel}>Previsão</div>
            <div style={statValue}>Cerca de {tank.estimated_days} dias restantes</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Média por botijão</div>
            <div style={statValue}>~{cfg.average_duration_days} dias por botijão</div>
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Situação atual</div>
          <div style={progressTrack}>
            <div style={{ ...progressFill, width: `${nivel}%` }} />
          </div>
          <div style={readingText}>{aviso}</div>
          <div style={timestampText}>
            Fim estimado em {new Date(tank.finish_date).toLocaleDateString("pt-BR")}
          </div>
          <div style={timestampText}>
            Atualizado em {new Date(tank.last_updated).toLocaleString("pt-BR")}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Ajustes rápidos</div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(nivel)}
            onChange={(e) => updateLevelAbsolute(Number(e.target.value))}
            style={{ width: "100%", marginTop: 12 }}
          />

          <div style={actionGrid}>
            <button style={ghostBtn} onClick={() => bump(-10)} type="button">-10%</button>
            <button style={ghostBtn} onClick={() => bump(10)} type="button">+10%</button>
            <button style={primaryBtn} onClick={() => navigate("/loja")} type="button">Pedir agora</button>
          </div>

          <div style={actionGrid}>
            <button style={softBtn} onClick={refresh} type="button">Atualizar estimativa</button>
            <button style={dangerBtn} onClick={reset} type="button">Troquei o gás (100%)</button>
          </div>
        </div>

        <div style={infoCard}>
          <div style={sectionTitle}>Como o app calcula</div>
          <div style={infoText}>
            A estimativa usa o tempo médio que seu gás costuma durar e a data da
            última troca. Quando um pedido é concluído, o nível volta para 100%.
          </div>
        </div>
      </div>
    </Layout>
  );
}

const heroCard: CSSProperties = {
  background: "linear-gradient(135deg,#FFF7ED 0%, #FFFFFF 45%, #FEF2F2 100%)",
  borderRadius: ui.radius.hero,
  padding: 18,
  border: "1px solid rgba(228,79,42,0.12)",
  boxShadow: ui.shadow.orange,
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 14,
  alignItems: "center",
};

const heroTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
};

const heroValue: CSSProperties = {
  marginTop: 8,
  fontSize: 34,
  fontWeight: 950,
  color: "#111827",
};

const heroPill: CSSProperties = {
  marginTop: 10,
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12.5,
};

const tankScene: CSSProperties = {
  width: 136,
  display: "grid",
  justifyItems: "center",
};

const tankHandle: CSSProperties = {
  width: 58,
  height: 18,
  border: "3px solid #1F2937",
  borderBottom: "none",
  borderRadius: "12px 12px 0 0",
  background: "#fff",
};

const tankBody: CSSProperties = {
  width: 124,
  height: 170,
  borderRadius: 34,
  border: "3px solid #1F2937",
  background: "linear-gradient(180deg,#FFFFFF 0%, #FFF7ED 100%)",
  position: "relative",
  overflow: "hidden",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.6)",
};

const tankTopLine: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 78,
  height: 3,
  background: "rgba(31,41,55,0.7)",
  zIndex: 2,
};

const tankLiquid: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  background: "linear-gradient(180deg,#FDBA74 0%, #FB923C 35%, #EA580C 100%)",
  transition: "height 420ms ease, background 320ms ease",
};

const tankPercent: CSSProperties = {
  position: "absolute",
  top: 18,
  left: 0,
  right: 0,
  textAlign: "center",
  fontWeight: 950,
  fontSize: 22,
  color: "#111827",
  zIndex: 3,
};

const tankFeet: CSSProperties = {
  display: "flex",
  gap: 26,
  marginTop: 6,
};

const tankFoot: CSSProperties = {
  width: 18,
  height: 10,
  borderRadius: 6,
  background: "#1F2937",
};

const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const statCard: CSSProperties = {
  ...cardStyle({
    borderRadius: 16,
    padding: 14,
  }),
};

const statLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
};

const statValue: CSSProperties = {
  marginTop: 8,
  fontSize: 18,
  fontWeight: 950,
  color: "#111827",
  lineHeight: 1.25,
};

const sectionCard: CSSProperties = {
  ...sectionCardStyle({
    padding: 16,
    borderRadius: 20,
  }),
};

const sectionTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const progressTrack: CSSProperties = {
  marginTop: 14,
  height: 12,
  borderRadius: 999,
  background: "rgba(15,23,42,0.08)",
  overflow: "hidden",
};

const progressFill: CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg,#F59E0B,#E44F2A)",
  borderRadius: 999,
  transition: "width 360ms ease, background 260ms ease",
};

const readingText: CSSProperties = {
  marginTop: 12,
  color: "#334155",
  lineHeight: 1.55,
  fontSize: 14,
};

const timestampText: CSSProperties = {
  marginTop: 8,
  color: "#64748B",
  fontSize: 12.5,
};

const actionGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 10,
};

const ghostBtn: CSSProperties = {
  ...secondaryButtonStyle({
    minHeight: 44,
    background: "#fff",
    border: "1px solid rgba(15,23,42,0.12)",
    color: "#111827",
  }),
};

const primaryBtn: CSSProperties = {
  ...primaryButtonStyle({
    minHeight: 44,
  }),
};

const softBtn: CSSProperties = {
  gridColumn: "span 1",
  ...secondaryButtonStyle({
    minHeight: 44,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "#F8FAFC",
    color: "#111827",
  }),
};

const dangerBtn: CSSProperties = {
  gridColumn: "span 2",
  ...dangerButtonStyle({
    minHeight: 44,
  }),
};

const infoCard: CSSProperties = {
  background: "rgba(228,79,42,0.06)",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(228,79,42,0.14)",
};

const infoText: CSSProperties = {
  marginTop: 10,
  color: "#7C2D12",
  lineHeight: 1.55,
  fontSize: 13.5,
};
