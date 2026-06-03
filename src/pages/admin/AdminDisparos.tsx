import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { adminAuditTrailService } from "../../services/adminAuditTrailService";
import { adminSupportService } from "../../services/adminSupportService";
import { emitToast } from "../../services/realtimeBus";

type TargetRole = "cliente" | "entregador";
type QuickTemplate = "cupom" | "relampago" | "info" | "pedido";

const routeOptions = [
  { label: "Loja", value: "/loja", hint: "Cliente abre direto nos produtos" },
  { label: "Meus pedidos", value: "/orders", hint: "Cliente acompanha pedidos" },
  { label: "Enderecos", value: "/my-addresses", hint: "Cliente revisa entrega" },
  { label: "Conta", value: "/conta", hint: "Cliente atualiza cadastro" },
  { label: "Entregador", value: "/entregador", hint: "Entregador abre a operacao" },
];

const templates: Record<
  QuickTemplate,
  { title: string; body: string; route: string; targetRole: TargetRole }
> = {
  cupom: {
    title: "Cupom liberado",
    body: "Use seu cupom no app e economize no proximo pedido de gas.",
    route: "/loja",
    targetRole: "cliente",
  },
  relampago: {
    title: "Promocao relampago",
    body: "Oferta por tempo limitado. Abra o app agora e aproveite.",
    route: "/loja",
    targetRole: "cliente",
  },
  info: {
    title: "Aviso da Central Gas",
    body: "Temos uma informacao importante para voce no app.",
    route: "/conta",
    targetRole: "cliente",
  },
  pedido: {
    title: "Operacao Central Gas",
    body: "Verifique os pedidos e avisos operacionais disponiveis.",
    route: "/entregador",
    targetRole: "entregador",
  },
};

function askReason(actionLabel: string) {
  const confirmed = window.confirm(`Confirmar: ${actionLabel}?`);
  if (!confirmed) return null;

  const reason = window.prompt(
    "Informe o motivo do disparo:",
    "Campanha comercial pelo ADM"
  );

  if (!reason?.trim()) {
    emitToast("Motivo obrigatorio", "Informe o motivo para registrar o disparo.", "warning");
    return null;
  }

  return reason.trim();
}

export default function AdminDisparos() {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    targetRole: "cliente" as TargetRole,
    title: "Cupom liberado",
    body: "Use seu cupom no app e economize no proximo pedido de gas.",
    route: "/loja",
    campaignTag: "cupom",
    dedupeKey: "",
  });

  const selectedRoute = useMemo(
    () => routeOptions.find((item) => item.value === form.route) ?? null,
    [form.route]
  );

  function applyTemplate(key: QuickTemplate) {
    const template = templates[key];
    setForm((current) => ({
      ...current,
      ...template,
      campaignTag: key,
    }));
  }

  async function sendBroadcast() {
    if (busy) return;

    if (!form.title.trim() || !form.body.trim()) {
      emitToast("Mensagem incompleta", "Informe titulo e texto do disparo.", "warning");
      return;
    }

    const reason = askReason(
      form.targetRole === "cliente"
        ? "disparar notificacao para clientes"
        : "disparar notificacao para entregadores"
    );
    if (!reason) return;

    try {
      setBusy(true);
      await adminSupportService.sendPushTest({
        recipientRole: form.targetRole,
        title: form.title.trim(),
        body: form.body.trim(),
        route: form.route.trim() || null,
        eventType:
          form.targetRole === "cliente"
            ? "admin_client_broadcast"
            : "admin_deliverer_broadcast",
        channelId:
          form.targetRole === "cliente"
            ? "cg_cliente_operacao_v5"
            : "cg_entregador_ofertas_v6",
        dedupeKey: form.dedupeKey.trim() || null,
        payload: {
          origem: "admin_disparos",
          campanha: form.campaignTag.trim() || null,
          route: form.route.trim() || null,
        },
      });

      await adminAuditTrailService.logAction({
        category: "admin_notificacoes",
        event: "broadcast_push_sent",
        message: "Disparo em massa enviado pelo ADM.",
        entityType: "notificacao",
        entityId: form.targetRole,
        reason,
        before: null,
        after: {
          targetRole: form.targetRole,
          title: form.title.trim(),
          body: form.body.trim(),
          route: form.route.trim() || null,
          campaignTag: form.campaignTag.trim() || null,
        },
      });

      emitToast("Disparo enviado", "A notificacao entrou na fila de push.", "success");
    } catch (error) {
      emitToast(
        "Falha no disparo",
        error instanceof Error ? error.message : "Nao foi possivel enviar a notificacao.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout
      title="Disparos"
      subtitle="Notificacoes em massa para trazer clientes ao app com cupons, promocoes e avisos."
    >
      <div style={topGrid}>
        <MetricCard label="Destino" value={form.targetRole === "cliente" ? "Clientes" : "Entregadores"} />
        <MetricCard label="Clique abre" value={selectedRoute?.label ?? (form.route || "Sem rota")} />
        <MetricCard label="Tipo" value={form.campaignTag || "Campanha"} />
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionTitle}>Modelos rapidos</div>
          <div style={templateGrid}>
            <TemplateButton label="Cupom" onClick={() => applyTemplate("cupom")} />
            <TemplateButton label="Relampago" onClick={() => applyTemplate("relampago")} />
            <TemplateButton label="Aviso" onClick={() => applyTemplate("info")} />
            <TemplateButton label="Entregador" onClick={() => applyTemplate("pedido")} />
          </div>

          <div style={formGrid}>
            <Field label="Publico">
              <select
                value={form.targetRole}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetRole: event.target.value as TargetRole,
                    route: event.target.value === "entregador" ? "/entregador" : "/loja",
                  }))
                }
                style={fieldInput}
              >
                <option value="cliente">Clientes</option>
                <option value="entregador">Entregadores</option>
              </select>
            </Field>

            <Field label="Titulo da notificacao">
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                style={fieldInput}
                maxLength={80}
              />
            </Field>

            <Field label="Mensagem">
              <textarea
                value={form.body}
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                style={fieldTextArea}
                maxLength={180}
              />
            </Field>

            <Field label="Para onde o cliente vai ao tocar">
              <select
                value={form.route}
                onChange={(event) => setForm((current) => ({ ...current, route: event.target.value }))}
                style={fieldInput}
              >
                {routeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label} - {item.value}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Identificador da campanha">
              <input
                value={form.campaignTag}
                onChange={(event) =>
                  setForm((current) => ({ ...current, campaignTag: event.target.value }))
                }
                style={fieldInput}
                placeholder="cupom_maio"
              />
            </Field>

            <Field label="Chave anti-duplicidade">
              <input
                value={form.dedupeKey}
                onChange={(event) =>
                  setForm((current) => ({ ...current, dedupeKey: event.target.value }))
                }
                style={fieldInput}
                placeholder="Opcional"
              />
            </Field>

            <button onClick={() => void sendBroadcast()} type="button" style={primaryBtn} disabled={busy}>
              {busy ? "Enviando..." : "Enviar disparo"}
            </button>
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Previa no celular</div>
          <div style={phonePreview}>
            <div style={phoneTop}>Central Gas</div>
            <div style={pushCard}>
              <div style={pushTitle}>{form.title || "Titulo"}</div>
              <div style={pushBody}>{form.body || "Mensagem da notificacao"}</div>
              <div style={pushRoute}>Ao tocar: {form.route || "sem rota"}</div>
            </div>
          </div>

          <div style={detailsGrid}>
            {routeOptions.slice(0, 4).map((item) => (
              <div key={item.value} style={detailBox}>
                <div style={detailTitle}>{item.label}</div>
                <div style={detailText}>{item.hint}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div style={metricCard}>
      <div style={metricLabel}>{props.label}</div>
      <div style={metricValue}>{props.value}</div>
    </div>
  );
}

function TemplateButton(props: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={props.onClick} style={templateBtn}>
      {props.label}
    </button>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{props.label}</span>
      {props.children}
    </label>
  );
}

const topGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const metricCard: CSSProperties = {
  background: "#fff",
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 12px 26px rgba(15,23,42,0.06)",
};

const metricLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const metricValue: CSSProperties = {
  marginTop: 8,
  fontSize: 20,
  fontWeight: 950,
  color: "#111827",
};

const contentGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1.05fr 0.95fr",
  gap: 14,
};

const sectionCard: CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const sectionTitle: CSSProperties = {
  fontSize: 17,
  fontWeight: 950,
  color: "#111827",
};

const templateGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

const templateBtn: CSSProperties = {
  minHeight: 40,
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "#F8FAFC",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const formGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 10,
};

const fieldWrap: CSSProperties = {
  display: "grid",
  gap: 7,
};

const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#111827",
};

const fieldInput: CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.12)",
  padding: "0 12px",
  boxSizing: "border-box",
  fontWeight: 800,
  outline: "none",
};

const fieldTextArea: CSSProperties = {
  ...fieldInput,
  minHeight: 110,
  height: "auto",
  padding: 12,
  resize: "vertical",
};

const primaryBtn: CSSProperties = {
  height: 48,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 12px 26px rgba(228,79,42,0.18)",
};

const phonePreview: CSSProperties = {
  marginTop: 14,
  borderRadius: 24,
  background: "#111827",
  padding: 16,
  color: "#fff",
};

const phoneTop: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "rgba(255,255,255,0.72)",
};

const pushCard: CSSProperties = {
  marginTop: 14,
  borderRadius: 18,
  padding: 14,
  background: "#fff",
  color: "#111827",
};

const pushTitle: CSSProperties = {
  fontWeight: 950,
  fontSize: 15,
};

const pushBody: CSSProperties = {
  marginTop: 6,
  color: "#475569",
  lineHeight: 1.45,
  fontSize: 13,
  fontWeight: 700,
};

const pushRoute: CSSProperties = {
  marginTop: 10,
  fontSize: 12,
  color: "#E44F2A",
  fontWeight: 900,
};

const detailsGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const detailBox: CSSProperties = {
  borderRadius: 16,
  background: "#F8FAFC",
  padding: 12,
  border: "1px solid rgba(15,23,42,0.06)",
};

const detailTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 950,
  color: "#111827",
};

const detailText: CSSProperties = {
  marginTop: 5,
  color: "#64748B",
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 700,
};
