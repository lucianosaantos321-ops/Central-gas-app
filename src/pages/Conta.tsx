import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../layout";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CG";
  const a = parts[0]?.[0] ?? "C";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "G" : "G";
  return (a + b).toUpperCase();
}

function safeGet(key: string, fallback: string) {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

type ModalState =
  | null
  | {
      title: string;
      body: string;
      cta?: string;
      onCta?: () => void;
    };

export default function Conta() {
  const navigate = useNavigate();

  // Preferências locais (mock) — futuro: virão do Admin/Supabase
  const [notifsPedido, setNotifsPedido] = useState(
    safeGet("cg_notifs_pedido", "1") === "1"
  );
  const [notifsGas, setNotifsGas] = useState(
    safeGet("cg_notifs_gas", "1") === "1"
  );
  const [notifsPromos, setNotifsPromos] = useState(
    safeGet("cg_notifs_promos", "0") === "1"
  );

  const nome = useMemo(() => safeGet("cg_user_name", "Cliente"), []);
  const telefone = useMemo(() => safeGet("cg_user_phone", ""), []);
  const referralCode = useMemo(() => {
    const existing = safeGet("cg_ref_code", "");
    if (existing) return existing;

    // gera um código simples e salva (mock)
    const rand = Math.floor(100000 + Math.random() * 900000);
    const code = `CG${rand}`;
    safeSet("cg_ref_code", code);
    return code;
  }, []);

  const whatsappSupport = useMemo(() => {
    // FUTURO (Admin): virá de config do sistema
    const w = safeGet("cg_support_whatsapp", "5561999999999"); // padrão mock
    return w.replace(/\D/g, "");
  }, []);

  function toggleNotifsPedido(v: boolean) {
    setNotifsPedido(v);
    safeSet("cg_notifs_pedido", v ? "1" : "0");
  }
  function toggleNotifsGas(v: boolean) {
    setNotifsGas(v);
    safeSet("cg_notifs_gas", v ? "1" : "0");
  }
  function toggleNotifsPromos(v: boolean) {
    setNotifsPromos(v);
    safeSet("cg_notifs_promos", v ? "1" : "0");
  }

  const initials = getInitials(nome);

  const [modal, setModal] = useState<ModalState>(null);

  function openSoon(
    title: string,
    body: string,
    cta?: string,
    onCta?: () => void
  ) {
    setModal({ title, body, cta, onCta });
  }

  async function copyReferralMessage() {
    const text = `Baixe o Central Gás e use meu código ${referralCode}!`;
    try {
      await navigator.clipboard?.writeText(text);
      openSoon(
        "Mensagem copiada ✅",
        "Cole no WhatsApp e envie para seus amigos. Em breve você vai ver seus créditos aqui dentro do app."
      );
    } catch {
      openSoon(
        "Não deu para copiar 😕",
        "Seu navegador bloqueou a cópia automática. Copie manualmente: " + text
      );
    }
  }

  const Card = ({
    title,
    subtitle,
    onClick,
    right,
  }: {
    title: string;
    subtitle?: string;
    onClick?: () => void;
    right?: ReactNode;
  }) => (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        borderRadius: 24,
        padding: 18,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 6px 18px rgba(0,0,0,.04)",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          {subtitle ? (
            <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {right ? (
          <div style={{ color: "#E44F2A", fontWeight: 900 }}>{right}</div>
        ) : (
          <div style={{ color: "#E44F2A", fontWeight: 900 }}>›</div>
        )}
      </div>
    </div>
  );

  const ToggleRow = ({
    title,
    subtitle,
    value,
    onChange,
  }: {
    title: string;
    subtitle?: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
        padding: "12px 0",
        borderTop: "1px dashed rgba(0,0,0,0.12)",
      }}
    >
      <div>
        <div style={{ fontWeight: 900 }}>{title}</div>
        {subtitle ? (
          <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      <button
        onClick={() => onChange(!value)}
        style={{
          width: 52,
          height: 30,
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.12)",
          background: value ? "rgba(228,79,42,.15)" : "rgba(0,0,0,0.05)",
          position: "relative",
          cursor: "pointer",
        }}
        aria-label={title}
        type="button"
      >
        <span
          style={{
            position: "absolute",
            top: 4,
            left: value ? 26 : 4,
            width: 22,
            height: 22,
            borderRadius: 999,
            background: value ? "#E44F2A" : "#bbb",
            transition: "0.18s",
          }}
        />
      </button>
    </div>
  );

  const BenefitBox = ({
    title,
    subtitle,
    actionText,
    onAction,
    locked,
  }: {
    title: string;
    subtitle: ReactNode;
    actionText: string;
    onAction: () => void;
    locked?: boolean;
  }) => (
    <div
      style={{
        background: "#FAFAFA",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 18,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        {locked ? (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 12,
              fontWeight: 900,
              color: "#E44F2A",
              background: "rgba(228,79,42,0.10)",
              padding: "4px 8px",
              borderRadius: 999,
            }}
          >
            🔒 Em breve
          </span>
        ) : null}
      </div>

      <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>{subtitle}</div>

      <button
        onClick={onAction}
        style={{
          marginTop: 10,
          width: "100%",
          padding: 12,
          borderRadius: 16,
          border: locked ? "1px solid rgba(0,0,0,0.10)" : "2px solid #E44F2A",
          background: "#fff",
          color: locked ? "#444" : "#E44F2A",
          fontWeight: 900,
          cursor: "pointer",
        }}
        type="button"
      >
        {actionText}
      </button>
    </div>
  );

  return (
    <Layout>
      <div style={{ paddingBottom: 96 }}>
        {/* HEADER */}
        <div
          style={{
            background: "linear-gradient(90deg,#E44F2A,#F7A212)",
            padding: "22px 18px",
            borderRadius: 24,
            color: "#fff",
            overflow: "hidden",
            boxShadow: "0 10px 26px rgba(228,79,42,0.22)",
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: "rgba(255,255,255,.18)",
                border: "1px solid rgba(255,255,255,.30)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                letterSpacing: 1,
              }}
            >
              {initials}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ opacity: 0.9, fontWeight: 800, fontSize: 13 }}>
                Minha Conta
              </div>
              <div style={{ marginTop: 2, fontWeight: 900, fontSize: 18 }}>
                {nome}
              </div>
              {telefone ? (
                <div style={{ marginTop: 4, opacity: 0.9, fontSize: 13 }}>
                  {telefone}
                </div>
              ) : (
                <div style={{ marginTop: 4, opacity: 0.9, fontSize: 13 }}>
                  Configurações do usuário
                </div>
              )}
            </div>

            <button
              onClick={() => navigate("/")}
              style={{
                background: "rgba(255,255,255,.18)",
                border: "1px solid rgba(255,255,255,.35)",
                color: "#fff",
                padding: "10px 12px",
                borderRadius: 14,
                fontWeight: 900,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              type="button"
            >
              Início
            </button>
          </div>
        </div>

        {/* AÇÕES RÁPIDAS */}
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <Card
            title="Meus pedidos"
            subtitle="Acompanhe histórico e andamento"
            onClick={() => navigate("/orders")}
          />
          <Card
            title="Meus endereços"
            subtitle="Cadastrar, editar e escolher o padrão"
            onClick={() => navigate("/my-addresses")}
          />
          <Card
            title="Monitorar Gás"
            subtitle="Veja o nível estimado e ajustes"
            onClick={() => navigate("/monitorar")}
          />
        </div>

        {/* BENEFÍCIOS */}
        <div
          style={{
            marginTop: 16,
            background: "#fff",
            borderRadius: 24,
            padding: 18,
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16 }}>Benefícios</div>
          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            <BenefitBox
              title="Indique e ganhe"
              subtitle={
                <>
                  Seu código:{" "}
                  <span style={{ color: "#E44F2A", fontWeight: 900 }}>
                    {referralCode}
                  </span>
                  <div style={{ marginTop: 6 }}>
                    Em breve: créditos automáticos por indicação.
                  </div>
                </>
              }
              actionText="Copiar mensagem de indicação"
              onAction={copyReferralMessage}
            />

            <BenefitBox
              title="Fidelidade"
              subtitle={
                <>
                  Em breve você verá seus pontos aqui.
                  <div style={{ marginTop: 6 }}>
                    Pontua somente após pedido concluído.
                  </div>
                </>
              }
              actionText="Ver detalhes"
              locked
              onAction={() =>
                openSoon(
                  "Fidelidade (em breve) 🔒",
                  "Estamos finalizando o programa de pontos. Você vai pontuar somente em pedidos entregues e poderá trocar por descontos.",
                  "Entendi"
                )
              }
            />

            <BenefitBox
              title="Carteira / Créditos"
              subtitle={
                <>
                  Créditos por indicação e promoções.
                  <div style={{ marginTop: 6 }}>
                    Em breve: histórico, saldo e resgates.
                  </div>
                </>
              }
              actionText="Ver carteira"
              locked
              onAction={() =>
                openSoon(
                  "Carteira (em breve) 🔒",
                  "A carteira vai concentrar créditos de indicação e promoções. Assim que ativarmos, tudo aparecerá aqui.",
                  "Entendi"
                )
              }
            />
          </div>
        </div>

        {/* NOTIFICAÇÕES */}
        <div
          style={{
            marginTop: 16,
            background: "#fff",
            borderRadius: 24,
            padding: 18,
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16 }}>Notificações</div>
          <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
            Preferências locais (mock). Futuro: Admin controla campanhas e limites.
          </div>

          <div style={{ marginTop: 12 }}>
            <ToggleRow
              title="Atualizações de pedido"
              subtitle="Confirmado, a caminho, entregue"
              value={notifsPedido}
              onChange={toggleNotifsPedido}
            />
            <ToggleRow
              title="Alerta de gás baixo"
              subtitle="Avisos estratégicos sem spam"
              value={notifsGas}
              onChange={toggleNotifsGas}
            />
            <ToggleRow
              title="Promoções"
              subtitle="Cupons e campanhas (opcional)"
              value={notifsPromos}
              onChange={toggleNotifsPromos}
            />
          </div>
        </div>

        {/* SUPORTE */}
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <Card
            title="Falar no WhatsApp"
            subtitle="Atendimento rápido"
            onClick={() => {
              const msg = encodeURIComponent(
                "Olá! Preciso de ajuda no Central Gás."
              );
              window.open(`https://wa.me/${whatsappSupport}?text=${msg}`, "_blank");
            }}
            right="Abrir"
          />
          <Card
            title="Pedir agora"
            subtitle="Ir direto para a loja"
            onClick={() => navigate("/loja")}
            right="Ir"
          />
        </div>

        {/* RODAPÉ */}
        <div style={{ marginTop: 18, textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: 12 }}>
            Central Gás • Versão{" "}
            <span style={{ color: "#E44F2A", fontWeight: 900 }}>0.1</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            (Admin) configurações avançadas entram depois — sem travar o cliente.
          </div>
        </div>
      </div>

      {/* MODAL */}
      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              borderRadius: 22,
              padding: 16,
              boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{modal.title}</div>
              <button
                onClick={() => setModal(null)}
                style={{
                  marginLeft: "auto",
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
                aria-label="Fechar"
                type="button"
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 10, color: "#444", lineHeight: 1.4 }}>
              {modal.body}
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button
                onClick={() => setModal(null)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 14,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                type="button"
              >
                Fechar
              </button>

              <button
                onClick={() => {
                  const fn = modal.onCta;
                  setModal(null);
                  fn?.();
                }}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 14,
                  border: "none",
                  background: "linear-gradient(90deg,#E44F2A,#F7A212)",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 10px 26px rgba(228,79,42,0.22)",
                }}
                type="button"
              >
                {modal.cta || "Entendi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}