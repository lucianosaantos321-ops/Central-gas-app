import EntregadorLayout from "../../layouts/EntregadorLayout";
import PageHeader from "../../components/PageHeader";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePedidoStore } from "../../store/usePedidoStore";
import { emitToast } from "../../services/realtimeBus";
import type {
  Pedido,
  StatusPedido,
} from "../../types";
import { useEntregadorStore } from "../../store/useEntregadorStore";
import { financeService } from "../../services/financeService";
import { pedidoService } from "../../services/pedidoService";
import {
  money,
  safeText,
  formatPhoneBR,
  buildTelLink,
  statusLabel,
  statusPill,
  buildWhatsAppLink,
  buildMapsSearchLink,
  buildMapsDirectionsLink,
  buildWazeDirectionsLink,
  buildWazeSearchLink,
  extractGeoLinkFromObs,
} from "../../utils/delivererHelpers";

async function copyText(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function canGoToPreparing(current: StatusPedido) {
  return (
    current === "criado" ||
    current === "confirmado" ||
    current === "buscando_entregador"
  );
}

function isAllowedTransition(current: StatusPedido, next: StatusPedido) {
  if (next === "preparando") return canGoToPreparing(current);
  if (current === "preparando" && next === "saiu_para_entrega") return true;
  if (current === "saiu_para_entrega" && next === "entregue") return true;
  return false;
}

function safeGet(key: string, fallback = "") {
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

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const ACCEPT_LOCK_KEY = "cg_deliverer_accept_lock";
const ACCEPT_LOCK_TTL_MS = 20_000;

function readAcceptLock(): { pedidoId: string; ts: number } | null {
  const raw = safeGet(ACCEPT_LOCK_KEY, "");
  if (!raw) return null;

  const [pedidoId, tsStr] = raw.split("|");
  const ts = Number(tsStr);

  if (!pedidoId || !Number.isFinite(ts)) return null;
  return { pedidoId, ts };
}

function isLockValid(lock: { pedidoId: string; ts: number } | null) {
  if (!lock) return false;
  const age = Date.now() - lock.ts;
  return age >= 0 && age <= ACCEPT_LOCK_TTL_MS;
}

function rankPedido(p: any, currentPedidoId: string) {
  const isFocus = String(p?.id ?? "") === currentPedidoId ? 10000 : 0;
  const routeBonus = p?.status === "saiu_para_entrega" ? 5000 : 0;
  const created = new Date(p?.createdAt ?? 0).getTime();
  const ageScore = Number.isFinite(created)
    ? Math.max(0, Date.now() - created) / 60000
    : 0;
  return isFocus + routeBonus + ageScore;
}

function normalizePin(value: string) {
  return String(value || "").replace(/\D/g, "").slice(0, 12);
}

function getEnderecoTexto(pedido: Pedido) {
  const snapshot = pedido?.enderecoSnapshot as any;
  if (!snapshot) return "";

  return [
    safeText(snapshot.street ?? snapshot.rua),
    safeText(snapshot.number ?? snapshot.numero),
    safeText(snapshot.complement ?? snapshot.complemento),
    safeText(snapshot.neighborhood ?? snapshot.bairro),
    safeText(snapshot.city ?? snapshot.cidade),
    safeText(snapshot.state ?? snapshot.uf),
  ]
    .filter(Boolean)
    .join(", ");
}

function getBairroOuCidade(pedido: Pedido) {
  const snapshot = pedido?.enderecoSnapshot as any;
  if (!snapshot) return "Sem região";

  return (
    safeText(snapshot.neighborhood ?? snapshot.bairro) ||
    safeText(snapshot.city ?? snapshot.cidade) ||
    "Sem região"
  );
}

function dedupePedidos(list: Pedido[]) {
  const map = new Map<string, Pedido>();

  for (const pedido of list) {
    const id = String(pedido?.id ?? "").trim();
    if (!id) continue;

    const existing = map.get(id);
    if (!existing) {
      map.set(id, pedido);
      continue;
    }

    const existingTime = new Date(
      existing.updatedAt ?? existing.createdAt ?? 0
    ).getTime();
    const incomingTime = new Date(
      pedido.updatedAt ?? pedido.createdAt ?? 0
    ).getTime();

    map.set(id, incomingTime >= existingTime ? pedido : existing);
  }

  return Array.from(map.values());
}

export default function EntregadorPedidoDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  const pedidos = usePedidoStore((s) => s.pedidos);
  const replacePedidos = usePedidoStore((s) => s.replacePedidos);
  const atualizarStatus = usePedidoStore((s) => s.atualizarStatus);
  const atribuirEntregador = usePedidoStore((s) => s.atribuirEntregador);
  const cancelarPedido = usePedidoStore((s) => s.cancelarPedido);
  const confirmarEntregaComPin = usePedidoStore((s) => s.confirmarEntregaComPin);
  const marcarEntregaManual = usePedidoStore((s) => s.marcarEntregaManual);

  const entregadorId = useEntregadorStore((s) => s.entregadorId);
  const online = useEntregadorStore((s) => s.online);
  const ensureEntregadorId = useEntregadorStore((s) => s.ensureEntregadorId);
  const routingPedidoId = useEntregadorStore((s) => s.routingPedidoId);
  const setRoutingPedidoId = useEntregadorStore((s) => s.setRoutingPedidoId);
  const clearRoutingPedidoId = useEntregadorStore((s) => s.clearRoutingPedidoId);
  const currentPedidoId = useEntregadorStore((s) => s.currentPedidoId);
  const setCurrentPedidoId = useEntregadorStore((s) => s.setCurrentPedidoId);
  const clearCurrentPedidoId = useEntregadorStore((s) => s.clearCurrentPedidoId);

  const [loadingRemote, setLoadingRemote] = useState(false);
  const [accepting, setAccepting] = useState(() => {
    const lock = readAcceptLock();
    return isLockValid(lock) && lock!.pedidoId === id;
  });

  const [pinInput, setPinInput] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelObs, setCancelObs] = useState("");
  const [showCancelBox, setShowCancelBox] = useState(false);
  const [showDeliveryBox, setShowDeliveryBox] = useState(false);
  const [manualConfirm, setManualConfirm] = useState(false);

  useEffect(() => {
    ensureEntregadorId();
  }, [ensureEntregadorId]);

  const refreshPedidos = useCallback(async () => {
    try {
      setLoadingRemote(true);
      const data = await pedidoService.listarPedidosRemotos();
      if (Array.isArray(data)) {
        replacePedidos(dedupePedidos(data));
      }
    } catch (error) {
      console.error("EntregadorPedidoDetail refreshPedidos error:", error);
    } finally {
      setLoadingRemote(false);
    }
  }, [replacePedidos]);

  useEffect(() => {
    void refreshPedidos();

    const timer = window.setInterval(() => {
      void refreshPedidos();
    }, 2200);

    return () => window.clearInterval(timer);
  }, [refreshPedidos]);

  const pedido = useMemo(() => {
    return pedidos.find((p) => String(p.id) === String(id)) ?? null;
  }, [pedidos, id]);

  useEffect(() => {
    const lock = readAcceptLock();
    if (lock && (!isLockValid(lock) || (id && lock.pedidoId !== id))) {
      safeRemove(ACCEPT_LOCK_KEY);
      setAccepting(false);
    }
  }, [id]);

  useEffect(() => {
    if (pedido?.id && String(pedido.entregadorId || "") === String(entregadorId || "")) {
      setCurrentPedidoId(String(pedido.id));
    }
  }, [pedido?.id, pedido?.entregadorId, entregadorId, setCurrentPedidoId]);

  if (!pedido) {
    return (
      <EntregadorLayout>
        <div style={{ paddingBottom: 10 }}>
          <PageHeader
            title="Pedido não encontrado"
            subtitle="Esse pedido pode ter sido removido ou o link está incorreto"
          />
          <div style={sectionCard}>
            <div style={{ color: "#666", lineHeight: 1.5 }}>
              Volte para o início e escolha outro pedido.
            </div>
            <button
              onClick={() => navigate("/entregador")}
              style={{ ...primaryBtnDark, marginTop: 12 }}
              type="button"
            >
              Voltar para início
            </button>
          </div>
        </div>
      </EntregadorLayout>
    );
  }

  const pedidoData = pedido;
  const assignedToMe =
    String(pedidoData.entregadorId || "") === String(entregadorId || "");
  const hasDeliverer = Boolean(safeText(pedidoData.entregadorId));
  const financeState = financeService.getDelivererState(entregadorId);
  const isBlockedByDebt = financeState.bloqueado;

  const enderecoTxt = getEnderecoTexto(pedidoData);
  const bairro = getBairroOuCidade(pedidoData);

  const lat = Number(
    (pedidoData.enderecoSnapshot as any)?.lat ??
      (pedidoData.enderecoSnapshot as any)?.latitude ??
      NaN
  );
  const lng = Number(
    (pedidoData.enderecoSnapshot as any)?.lng ??
      (pedidoData.enderecoSnapshot as any)?.longitude ??
      NaN
  );
  const hasLatLng = Number.isFinite(lat) && Number.isFinite(lng);

  const obsGeoLink = extractGeoLinkFromObs(safeText(pedidoData.observacao));

  const mapsLink =
    obsGeoLink ||
    (hasLatLng
      ? buildMapsDirectionsLink(lat, lng)
      : enderecoTxt
      ? buildMapsSearchLink(enderecoTxt)
      : "");

  const wazeLink = hasLatLng
    ? buildWazeDirectionsLink(lat, lng)
    : enderecoTxt
    ? buildWazeSearchLink(enderecoTxt)
    : "";

  const nomeCliente = safeText((pedidoData as any).clienteNome) || "Cliente";
  const phoneCliente = safeText((pedidoData as any).clienteTelefone);
  const phoneClienteFmt = formatPhoneBR(phoneCliente);
  const telLink = buildTelLink(phoneCliente);

  const whatsappLoja =
    safeText((pedidoData as any).whatsappLoja) ||
    safeText((pedidoData as any).whatsapp) ||
    "5561999999999";

  const itens = Array.isArray(pedidoData.itens) ? pedidoData.itens : [];
  const resumoItens = itens.map((item) => `${item.quantidade}x ${item.nome}`).join(", ");

  const msgWhatsCliente = `Olá! Sou o entregador do Central Gás.
Pedido: ${String(pedidoData.id).slice(0, 6)}
Status: ${statusLabel(pedidoData.status)}
Itens: ${resumoItens}
Endereço: ${enderecoTxt || "não informado"}`;

  const msgWhatsLoja = `Olá! Atualização do pedido (${String(pedidoData.id).slice(0, 6)}).
Status atual: ${statusLabel(pedidoData.status)}
Entregador: ${entregadorId}`;

  const whatsappClienteLink = buildWhatsAppLink(phoneCliente, msgWhatsCliente);
  const whatsappLojaLink = buildWhatsAppLink(whatsappLoja, msgWhatsLoja);

  const subtotal = itens.reduce((acc, item) => {
    const q = Number(item.quantidade ?? 0);
    const pu = Number(item.precoUnitario ?? 0);
    return acc + pu * q;
  }, 0);

  const taxaEntrega = Number((pedidoData as any).taxaEntrega ?? 0);
  const total = Number((pedidoData as any).total ?? subtotal + taxaEntrega);

  const pill = statusPill(pedidoData.status);
  const isRoutingThis = routingPedidoId === String(pedidoData.id);
  const isFocusThis =
    currentPedidoId === String(pedidoData.id) && assignedToMe;

  const meusAtivosOrdenados = pedidos
    .filter(
      (p: any) =>
        p?.status !== "entregue" &&
        p?.status !== "cancelado" &&
        String(p?.entregadorId || "") === String(entregadorId || "")
    )
    .sort((a: any, b: any) => rankPedido(b, currentPedidoId) - rankPedido(a, currentPedidoId));

  const nextAfterThis =
    meusAtivosOrdenados.find(
      (p: any) => String(p?.id ?? "") !== String(pedidoData.id)
    ) ?? null;

  function startLock(pedidoId: string) {
    setAccepting(true);
    safeSet(ACCEPT_LOCK_KEY, `${pedidoId}|${Date.now()}`);
  }

  function clearLock() {
    setAccepting(false);
    safeRemove(ACCEPT_LOCK_KEY);
  }

  function guardAssigned() {
    if (!online) {
      emitToast("Offline", "Ative o modo online para operar este pedido.", "warning");
      return false;
    }

    if (isBlockedByDebt) {
      emitToast(
        "Bloqueado",
        `Seu saldo pendente é ${money(financeState.saldoDevedor)}. Regularize o repasse para continuar.`,
        "warning"
      );
      return false;
    }

    if (!assignedToMe) {
      emitToast(
        "Ação bloqueada",
        hasDeliverer
          ? "Esse pedido já está atribuído a outro entregador."
          : "Assuma o pedido antes de avançar.",
        "warning"
      );
      return false;
    }

    if (pedidoData.status === "entregue") {
      emitToast("Pedido concluído", "Este pedido já está entregue.", "info");
      return false;
    }

    if (pedidoData.status === "cancelado") {
      emitToast("Pedido cancelado", "Este pedido já foi cancelado.", "warning");
      return false;
    }

    return true;
  }

  async function onAssumir() {
    if (!online) {
      emitToast("Offline", "Ative o modo online para assumir pedidos.", "warning");
      return;
    }

    if (isBlockedByDebt) {
      emitToast(
        "Bloqueado",
        `Seu saldo pendente é ${money(financeState.saldoDevedor)}. Regularize o repasse para continuar.`,
        "warning"
      );
      return;
    }

    if (pedidoData.status === "entregue" || pedidoData.status === "cancelado") return;

    if (pedidoData.entregadorId && !assignedToMe) {
      emitToast("Indisponível", "Outro entregador já assumiu este pedido.", "warning");
      return;
    }

    if (assignedToMe) {
      emitToast("Tudo certo", "Você já é o entregador deste pedido.", "info");
      return;
    }

    if (accepting) return;

    startLock(pedidoData.id);

    try {
      atribuirEntregador(pedidoData.id, entregadorId);

      if (pedidoData.status === "criado") {
        atualizarStatus(pedidoData.id, "confirmado");
      }

      if (
        pedidoData.status === "criado" ||
        pedidoData.status === "confirmado" ||
        pedidoData.status === "buscando_entregador"
      ) {
        atualizarStatus(pedidoData.id, "preparando");
      }

      setCurrentPedidoId(String(pedidoData.id));
      emitToast("Pedido assumido", "Você assumiu este pedido.", "success");
      await refreshPedidos();
    } finally {
      setTimeout(() => clearLock(), 1200);
    }
  }

  function openRoute(prefer: "maps" | "waze" = "maps") {
    const url = prefer === "waze" ? wazeLink : mapsLink;

    if (!url) {
      emitToast("Sem rota", "Este pedido não tem endereço/rota disponível.", "warning");
      return;
    }

    window.open(url, "_blank", "noreferrer");
    setRoutingPedidoId(String(pedidoData.id));
  }

  function chooseNextActive() {
    if (nextAfterThis?.id) {
      setCurrentPedidoId(String(nextAfterThis.id));
      return;
    }
    clearCurrentPedidoId();
  }

  async function onStartRoute(prefer: "maps" | "waze" = "maps") {
    if (!guardAssigned()) return;

    const current = pedidoData.status as StatusPedido;

    if (current === "criado") {
      atualizarStatus(pedidoData.id, "confirmado");
      atualizarStatus(pedidoData.id, "preparando");
    } else if (current === "confirmado" || current === "buscando_entregador") {
      atualizarStatus(pedidoData.id, "preparando");
    }

    const currentForValidation =
      current === "criado" || current === "confirmado" || current === "buscando_entregador"
        ? "preparando"
        : current;

    if (!isAllowedTransition(currentForValidation, "saiu_para_entrega")) {
      emitToast("Sequência inválida", "Esse pedido ainda não pode entrar em rota.", "warning");
      return;
    }

    atualizarStatus(pedidoData.id, "saiu_para_entrega");
    setCurrentPedidoId(String(pedidoData.id));
    setShowDeliveryBox(true);
    openRoute(prefer);
    emitToast("Rota iniciada", "Pedido marcado como saiu para entrega.", "success");
    await refreshPedidos();
  }

  async function onConfirmDeliveryByPin() {
    if (!guardAssigned()) return;

    const cleanPin = normalizePin(pinInput);
    if (!cleanPin) {
      emitToast("PIN obrigatório", "Digite o PIN informado pelo cliente.", "warning");
      return;
    }

    const ok = confirmarEntregaComPin({
      pedidoId: pedidoData.id,
      pin: cleanPin,
    });

    if (!ok) return;

    clearRoutingPedidoId();
    chooseNextActive();
    setPinInput("");
    setShowDeliveryBox(false);
    await refreshPedidos();
    setTimeout(() => navigate("/entregador"), 350);
  }

  async function onManualFinish() {
    if (!guardAssigned()) return;

    if ((pedidoData.status as StatusPedido) !== "saiu_para_entrega") {
      emitToast("Ação inválida", "A entrega manual só pode ser finalizada após iniciar a rota.", "warning");
      return;
    }

    if (!manualConfirm) {
      setManualConfirm(true);
      emitToast(
        "Confirmação manual",
        "Use isso só quando o cliente realmente não puder informar o PIN. Toque novamente para confirmar.",
        "warning"
      );
      setTimeout(() => setManualConfirm(false), 5000);
      return;
    }

    const ok = marcarEntregaManual(pedidoData.id);
    if (!ok) return;

    clearRoutingPedidoId();
    chooseNextActive();
    setManualConfirm(false);
    setShowDeliveryBox(false);
    emitToast("Entrega concluída", "Entrega manual registrada e sujeita a auditoria.", "success");
    await refreshPedidos();
    setTimeout(() => navigate("/entregador"), 350);
  }

  async function onCancelOrder() {
    if (!guardAssigned()) return;

    if (!cancelReason.trim()) {
      emitToast("Motivo obrigatório", "Informe o motivo do cancelamento.", "warning");
      return;
    }

    const ok = cancelarPedido({
      pedidoId: pedidoData.id,
      canceladoPor: "entregador",
      motivoCancelamento: cancelReason.trim(),
      observacaoCancelamento: cancelObs.trim() || null,
      lat: hasLatLng ? lat : null,
      lng: hasLatLng ? lng : null,
    });

    if (!ok) return;

    clearRoutingPedidoId();
    chooseNextActive();
    setShowCancelBox(false);
    setCancelReason("");
    setCancelObs("");
    await refreshPedidos();
    setTimeout(() => navigate("/entregador"), 350);
  }

  const canAssume =
    online &&
    !isBlockedByDebt &&
    pedidoData.status !== "entregue" &&
    pedidoData.status !== "cancelado" &&
    (!hasDeliverer || assignedToMe);

  const showAssumirButton =
    !assignedToMe &&
    pedidoData.status !== "entregue" &&
    pedidoData.status !== "cancelado";

  return (
    <EntregadorLayout>
      <div style={pageWrap}>
        <PageHeader
          title={`Pedido #${String(pedidoData.id).slice(0, 6)}`}
          subtitle={`${nomeCliente} • ${statusLabel(pedidoData.status)}`}
        />

        <div style={syncLine}>
          Fonte atual: Supabase {loadingRemote ? "• sincronizando..." : ""}
        </div>

        {!online ? <div style={offlineBanner}>Você está offline. Algumas ações estão bloqueadas.</div> : null}
        {isBlockedByDebt ? (
          <div style={blockedBanner}>
            Seu saldo pendente é <strong>{money(financeState.saldoDevedor)}</strong>. Regularize o repasse para continuar operando.
          </div>
        ) : null}
        {isRoutingThis ? <div style={routeBanner}>Este pedido está em rota.</div> : null}
        {isFocusThis ? <div style={focusBanner}>Este pedido está definido como foco da sua fila.</div> : null}
        {pedidoData.status === "cancelado" ? (
          <div style={cancelledBanner}>
            Pedido cancelado • Motivo: {safeText((pedidoData as any).motivoCancelamento) || "Sem motivo"}
          </div>
        ) : null}

        <div style={heroCard}>
          <div style={heroTop}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={heroTitle}>{nomeCliente}</div>
              <div style={heroMeta}>
                {bairro} • {itens.length} item(ns)
              </div>
              <div style={heroMetaSecondary}>
                {assignedToMe
                  ? "Pedido sob sua responsabilidade"
                  : hasDeliverer
                  ? "Outro entregador atribuído"
                  : "Sem entregador"}
              </div>
            </div>

            <div
              style={{
                ...statusBadge,
                background: pill.bg,
                border: `1px solid ${pill.bd}`,
                color: pill.fg,
              }}
            >
              {statusLabel(pedidoData.status)}
            </div>
          </div>

          <div style={heroPriceWrap}>
            <div style={heroPriceLabel}>Total do pedido</div>
            <div style={heroPrice}>{money(total)}</div>
          </div>

          {showAssumirButton ? (
            <button
              onClick={onAssumir}
              style={{
                ...primaryBtnDark,
                marginTop: 14,
                opacity: canAssume && !accepting ? 1 : 0.6,
                cursor: canAssume && !accepting ? "pointer" : "not-allowed",
              }}
              type="button"
              disabled={!canAssume || accepting}
            >
              {accepting ? "Assumindo..." : !online ? "Offline" : isBlockedByDebt ? "Bloqueado" : "Assumir pedido"}
            </button>
          ) : null}
        </div>

        <div style={infoCard}>
          <div style={sectionTitle}>Informações da entrega</div>

          <div style={infoGrid}>
            <InfoBox label="Cliente" value={nomeCliente} />
            <InfoBox label="Telefone" value={phoneClienteFmt || "Não informado"} />
            <InfoBox label="Endereço" value={enderecoTxt || "Não informado"} />
            <InfoBox label="Produtos" value={resumoItens || "Sem itens"} />
          </div>
        </div>

        <div style={compactCard}>
          <div style={sectionTitle}>Ações rápidas</div>

          <div style={smallActionsRow}>
            <a
              href={telLink || undefined}
              style={{
                ...miniActionBtn,
                background: telLink ? "#DBEAFE" : "#E5E7EB",
                color: telLink ? "#1D4ED8" : "#6B7280",
                pointerEvents: telLink ? "auto" : "none",
              }}
            >
              Ligar
            </a>

            <a
              href={whatsappClienteLink || undefined}
              target="_blank"
              rel="noreferrer"
              style={{
                ...miniActionBtn,
                background: whatsappClienteLink ? "#DCFCE7" : "#E5E7EB",
                color: whatsappClienteLink ? "#15803D" : "#6B7280",
                pointerEvents: whatsappClienteLink ? "auto" : "none",
              }}
            >
              WhatsApp
            </a>

            <a
              href={wazeLink || undefined}
              target="_blank"
              rel="noreferrer"
              style={{
                ...miniActionBtn,
                background: wazeLink ? "#DBEAFE" : "#E5E7EB",
                color: wazeLink ? "#0369A1" : "#6B7280",
                pointerEvents: wazeLink ? "auto" : "none",
              }}
            >
              Waze
            </a>

            <a
              href={mapsLink || undefined}
              target="_blank"
              rel="noreferrer"
              style={{
                ...miniActionBtn,
                background: mapsLink ? "#FEE2E2" : "#E5E7EB",
                color: mapsLink ? "#DC2626" : "#6B7280",
                pointerEvents: mapsLink ? "auto" : "none",
              }}
            >
              Maps
            </a>
          </div>

          <div style={supportRow}>
            <button
              onClick={async () => {
                if (!phoneCliente) return;
                const ok = await copyText(phoneCliente);
                emitToast(
                  ok ? "Copiado ✅" : "Falhou",
                  ok ? "Telefone copiado." : "Não consegui copiar.",
                  ok ? "success" : "warning"
                );
              }}
              style={ghostBtn}
              type="button"
              disabled={!phoneCliente}
            >
              Copiar telefone
            </button>

            <a href={whatsappLojaLink} target="_blank" rel="noreferrer" style={ghostLinkBtn}>
              WhatsApp da loja
            </a>
          </div>
        </div>

        {assignedToMe && pedidoData.status !== "entregue" && pedidoData.status !== "cancelado" ? (
          <div style={actionCard}>
            <div style={sectionTitle}>Fluxo principal</div>

            {(pedidoData.status === "criado" ||
              pedidoData.status === "confirmado" ||
              pedidoData.status === "buscando_entregador" ||
              pedidoData.status === "preparando") && (
              <button onClick={() => onStartRoute("maps")} type="button" style={slideBtnDark}>
                Arrastar / iniciar rota
              </button>
            )}

            {pedidoData.status === "saiu_para_entrega" && (
              <>
                <button
                  onClick={() => setShowDeliveryBox((v) => !v)}
                  type="button"
                  style={slideBtnGreen}
                >
                  Finalizar entrega
                </button>

                {!showDeliveryBox ? (
                  <div style={helperText}>
                    Abra a área de finalização para validar o PIN ou concluir manualmente em caso excepcional.
                  </div>
                ) : (
                  <div style={deliveryBox}>
                    <div style={deliveryTitle}>Confirmação da entrega</div>
                    <div style={deliveryText}>
                      O cliente deve informar o PIN de segurança. Só use confirmação manual em caso real e excepcional.
                    </div>

                    <label style={fieldWrap}>
                      <span style={fieldLabel}>PIN do cliente</span>
                      <input
                        value={pinInput}
                        onChange={(e) => setPinInput(normalizePin(e.target.value))}
                        style={fieldInput}
                        placeholder="Digite o PIN"
                        inputMode="numeric"
                      />
                    </label>

                    <button onClick={onConfirmDeliveryByPin} type="button" style={confirmPinBtn}>
                      Confirmar com PIN
                    </button>

                    <button onClick={onManualFinish} type="button" style={manualBtn}>
                      {manualConfirm ? "Confirmar entrega manual" : "Finalizar manualmente"}
                    </button>
                  </div>
                )}
              </>
            )}

            <button
              onClick={() => setShowCancelBox((v) => !v)}
              type="button"
              style={cancelTriggerBtn}
            >
              Cancelar pedido
            </button>

            {showCancelBox && (
              <div style={cancelBox}>
                <div style={deliveryTitle}>Cancelar pedido</div>
                <div style={deliveryText}>
                  Cancelamentos feitos pelo entregador ficam auditáveis e podem gerar contato com o cliente.
                </div>

                <label style={fieldWrap}>
                  <span style={fieldLabel}>Motivo do cancelamento</span>
                  <input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    style={fieldInput}
                    placeholder="Ex.: cliente ausente"
                  />
                </label>

                <label style={fieldWrap}>
                  <span style={fieldLabel}>Observação</span>
                  <textarea
                    value={cancelObs}
                    onChange={(e) => setCancelObs(e.target.value)}
                    style={fieldTextArea}
                    placeholder="Ex.: cliente disse que já comprou em outro lugar"
                  />
                </label>

                <button onClick={onCancelOrder} type="button" style={cancelConfirmBtn}>
                  Confirmar cancelamento
                </button>
              </div>
            )}
          </div>
        ) : null}

        <div style={sectionCard}>
          <div style={sectionTitle}>Itens e valores</div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {itens.map((item) => (
              <div key={item.produtoId} style={itemRow}>
                <div style={{ minWidth: 0 }}>
                  <div style={itemTitle}>
                    {item.quantidade}x {item.nome}
                  </div>
                </div>
                <div style={itemPrice}>
                  {money(Number(item.precoUnitario ?? 0) * Number(item.quantidade ?? 0))}
                </div>
              </div>
            ))}
          </div>

          <div style={totalsBox}>
            <Row label="Subtotal" value={money(subtotal)} />
            <Row label="Taxa de entrega" value={money(taxaEntrega)} />
            <Row label="Total" value={money(total)} strong />
          </div>
        </div>

        {nextAfterThis ? (
          <div style={sectionCard}>
            <div style={sectionTitle}>Próximo da fila</div>
            <div style={{ marginTop: 10, color: "#475569", lineHeight: 1.5 }}>
              Pedido #{String(nextAfterThis.id).slice(0, 6)} •{" "}
              {safeText((nextAfterThis as any).clienteNome) || "Cliente"} •{" "}
              {statusLabel(nextAfterThis.status)}
            </div>

            <button
              onClick={() => {
                setCurrentPedidoId(String(nextAfterThis.id));
                navigate(`/entregador/pedido/${nextAfterThis.id}`);
              }}
              style={{ ...ghostBtn, marginTop: 12 }}
              type="button"
            >
              Abrir próximo pedido
            </button>
          </div>
        ) : null}

        {safeText((pedidoData as any).observacao) ? (
          <div style={sectionCard}>
            <div style={sectionTitle}>Observação</div>
            <div
              style={{
                marginTop: 12,
                color: "#475569",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {safeText((pedidoData as any).observacao)}
            </div>
          </div>
        ) : null}

        <div style={footerActions}>
          <button
            onClick={() => {
              if (assignedToMe) {
                setCurrentPedidoId(String(pedidoData.id));
              }
              navigate("/entregador");
            }}
            style={ghostBtn}
            type="button"
          >
            Fechar pedido
          </button>
        </div>
      </div>
    </EntregadorLayout>
  );
}

function InfoBox(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div style={infoBox}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
    </div>
  );
}

function Row(props: { label: string; value: string; strong?: boolean }) {
  const { label, value, strong } = props;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 8,
        gap: 10,
      }}
    >
      <span style={{ color: "#64748B", fontWeight: 800 }}>{label}</span>
      <span
        style={{
          fontWeight: strong ? 950 : 850,
          color: strong ? "#111827" : "#475569",
        }}
      >
        {value}
      </span>
    </div>
  );
}

const pageWrap: CSSProperties = {
  paddingBottom: 10,
  display: "grid",
  gap: 14,
  width: "100%",
  maxWidth: "100%",
  overflowX: "hidden",
};

const syncLine: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const heroCard: CSSProperties = {
  background: "linear-gradient(135deg,#0F172A 0%, #111827 52%, #1F2937 100%)",
  borderRadius: 24,
  padding: 16,
  color: "#fff",
  boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  overflow: "hidden",
};

const heroTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const heroTitle: CSSProperties = {
  fontWeight: 950,
  fontSize: 22,
  letterSpacing: -0.4,
  wordBreak: "break-word",
};

const heroMeta: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  opacity: 0.86,
  wordBreak: "break-word",
};

const heroMetaSecondary: CSSProperties = {
  marginTop: 6,
  fontSize: 12.5,
  opacity: 0.8,
  wordBreak: "break-word",
};

const statusBadge: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  fontWeight: 950,
  fontSize: 13,
  whiteSpace: "nowrap",
  maxWidth: "100%",
};

const heroPriceWrap: CSSProperties = {
  marginTop: 14,
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const heroPriceLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.84,
  textTransform: "uppercase",
};

const heroPrice: CSSProperties = {
  marginTop: 8,
  fontSize: 28,
  fontWeight: 950,
  letterSpacing: -0.4,
  wordBreak: "break-word",
};

const infoCard: CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,.05)",
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  overflow: "hidden",
};

const infoGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 10,
};

const infoBox: CSSProperties = {
  borderRadius: 18,
  padding: 12,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
};

const infoLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
};

const infoValue: CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  fontWeight: 900,
  color: "#111827",
  lineHeight: 1.5,
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

const compactCard: CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,.05)",
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  overflow: "hidden",
};

const actionCard: CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "2px solid rgba(228,79,42,0.12)",
  boxShadow: "0 10px 26px rgba(228,79,42,0.08)",
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  overflow: "hidden",
};

const sectionCard: CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,.05)",
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  overflow: "hidden",
};

const sectionTitle: CSSProperties = {
  fontWeight: 950,
  fontSize: 16,
  color: "#111827",
  wordBreak: "break-word",
};

const smallActionsRow: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const miniActionBtn: CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  textDecoration: "none",
  fontWeight: 950,
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "0 8px",
  boxSizing: "border-box",
};

const supportRow: CSSProperties = {
  marginTop: 10,
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
};

const slideBtnDark: CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 52,
  borderRadius: 18,
  border: "none",
  background: "linear-gradient(90deg,#111827,#374151)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
};

const slideBtnGreen: CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 52,
  borderRadius: 18,
  border: "none",
  background: "linear-gradient(90deg,#15803D,#22C55E)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 26px rgba(34,197,94,0.20)",
};

const helperText: CSSProperties = {
  marginTop: 10,
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const deliveryBox: CSSProperties = {
  marginTop: 12,
  borderRadius: 18,
  padding: 14,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const deliveryTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const deliveryText: CSSProperties = {
  marginTop: 8,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const fieldWrap: CSSProperties = {
  display: "grid",
  gap: 6,
  marginTop: 12,
};

const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#111827",
};

const fieldInput: CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  padding: "0 14px",
  fontWeight: 800,
  color: "#111827",
  outline: "none",
  boxSizing: "border-box",
};

const fieldTextArea: CSSProperties = {
  width: "100%",
  minHeight: 88,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  padding: 12,
  fontWeight: 700,
  color: "#111827",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
};

const confirmPinBtn: CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 48,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#15803D,#22C55E)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const manualBtn: CSSProperties = {
  marginTop: 10,
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const cancelTriggerBtn: CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(185,28,28,0.16)",
  background: "rgba(185,28,28,0.06)",
  color: "#7F1D1D",
  fontWeight: 950,
  cursor: "pointer",
};

const cancelBox: CSSProperties = {
  marginTop: 12,
  borderRadius: 18,
  padding: 14,
  background: "rgba(185,28,28,0.04)",
  border: "1px solid rgba(185,28,28,0.12)",
};

const cancelConfirmBtn: CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 48,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#B91C1C,#EF4444)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const itemRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
  alignItems: "center",
};

const itemTitle: CSSProperties = {
  fontWeight: 900,
  color: "#111827",
  wordBreak: "break-word",
};

const itemPrice: CSSProperties = {
  fontWeight: 950,
  color: "#111827",
  whiteSpace: "nowrap",
};

const totalsBox: CSSProperties = {
  marginTop: 12,
  borderTop: "1px solid rgba(0,0,0,0.08)",
  paddingTop: 12,
};

const footerActions: CSSProperties = {
  display: "grid",
  gap: 10,
};

const primaryBtnDark: CSSProperties = {
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

const ghostBtn: CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const ghostLinkBtn: CSSProperties = {
  display: "block",
  textAlign: "center",
  textDecoration: "none",
  height: 44,
  lineHeight: "44px",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  color: "#111827",
  fontWeight: 950,
};

const routeBanner: CSSProperties = {
  background: "rgba(228,79,42,0.10)",
  border: "1px solid rgba(228,79,42,0.18)",
  borderRadius: 16,
  padding: 12,
  color: "#111",
  fontWeight: 950,
  fontSize: 13,
};

const focusBanner: CSSProperties = {
  background: "rgba(17,24,39,0.06)",
  border: "1px solid rgba(17,24,39,0.12)",
  borderRadius: 16,
  padding: 12,
  color: "#111827",
  fontWeight: 950,
  fontSize: 13,
};

const offlineBanner: CSSProperties = {
  background: "rgba(153,27,27,0.08)",
  border: "1px solid rgba(153,27,27,0.16)",
  borderRadius: 16,
  padding: 12,
  color: "#7F1D1D",
  fontWeight: 950,
  fontSize: 13,
};

const blockedBanner: CSSProperties = {
  background: "rgba(153,27,27,0.08)",
  border: "1px solid rgba(153,27,27,0.16)",
  borderRadius: 16,
  padding: 12,
  color: "#7F1D1D",
  fontWeight: 900,
  fontSize: 13,
  lineHeight: 1.5,
};

const cancelledBanner: CSSProperties = {
  background: "rgba(185,28,28,0.08)",
  border: "1px solid rgba(185,28,28,0.14)",
  borderRadius: 16,
  padding: 12,
  color: "#7F1D1D",
  fontWeight: 900,
  fontSize: 13,
  lineHeight: 1.5,
};