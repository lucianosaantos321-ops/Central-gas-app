import EntregadorLayout from "../../layouts/EntregadorLayout";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type CSSProperties,
  type TouchEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { usePedidoStore } from "../../store/usePedidoStore";
import { useEntregadorStore } from "../../store/useEntregadorStore";
import { useRemoteSyncStore } from "../../store/useRemoteSyncStore";
import { useEffectiveEntregadorId } from "../../hooks/useEffectiveEntregadorId";
import { financeService } from "../../services/financeService";
import { pedidoService } from "../../services/pedidoService";
import { appLogger } from "../../services/appLogger";
import { emitToast } from "../../services/realtimeBus";
import type { Pedido } from "../../types";
import {
  money,
  safeText,
  statusLabel,
  getTime,
} from "../../utils/delivererHelpers";
import {
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionCardStyle,
  ui,
} from "../../styles/ui";

const SCHEDULED_SOON_MS = 20 * 60 * 1000;
const SCHEDULED_NOW_WINDOW_MS = 5 * 60 * 1000;
const SCHEDULED_NOTIFICATION_KEY = "cg_scheduled_notice_v1";
const ACCEPT_LOCK_KEY = "cg_deliverer_accept_lock";
const ACCEPT_LOCK_TTL_MS = 20_000;
const DEBUG_DELIVERER_ONLINE =
  import.meta.env.DEV ||
  String(import.meta.env.VITE_ENABLE_DELIVERER_DEBUG || "").trim() === "1";
const OFERTA_STATUS_ACEITAVEIS = new Set([
  "criado",
  "confirmado",
  "buscando_entregador",
]);

function debugOnline(message: string, extra?: Record<string, unknown>) {
  if (!DEBUG_DELIVERER_ONLINE) return;
  appLogger.debug("deliverer_home", message, extra);
}

function isToday(value: unknown) {
  const t = typeof value === "number" ? value : Date.parse(String(value ?? ""));
  if (!Number.isFinite(t)) return false;

  const d = new Date(t);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
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

function getScheduledTime(pedido: Pedido | null) {
  if (!pedido || pedido.tipo !== "agendado" || !pedido.horarioAgendado) return null;
  const time = new Date(pedido.horarioAgendado).getTime();
  return Number.isFinite(time) ? time : null;
}

function getScheduledPriorityState(pedido: Pedido | null) {
  const scheduledTime = getScheduledTime(pedido);
  if (!scheduledTime) return "none" as const;

  const diff = scheduledTime - Date.now();
  if (diff <= SCHEDULED_NOW_WINDOW_MS) return "due" as const;
  if (diff <= SCHEDULED_SOON_MS) return "soon" as const;
  return "future" as const;
}

function readScheduledNoticeMap() {
  if (typeof window === "undefined") return {} as Record<string, "soon" | "due">;
  try {
    const raw = localStorage.getItem(SCHEDULED_NOTIFICATION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, "soon" | "due">) : {};
  } catch {
    return {};
  }
}

function writeScheduledNoticeMap(map: Record<string, "soon" | "due">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SCHEDULED_NOTIFICATION_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function safeGet(key: string, fallback = "") {
  try {
    const value = localStorage.getItem(key);
    return value && value.trim() ? value : fallback;
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

function normalizeAcceptErrorMessage(error: unknown) {
  const raw =
    error instanceof Error ? error.message : safeText((error as any)?.message);
  const normalized = raw
    ? raw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
    : "";

  if (
    normalized.includes("ja foi aceito") ||
    normalized.includes("nao esta mais disponivel")
  ) {
    return "Pedido já foi aceito por outro entregador.";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("fetch") ||
    normalized.includes("offline")
  ) {
    return "Falha de conexão ao aceitar o pedido. Tente novamente.";
  }

  return "Não foi possível aceitar este pedido agora.";
}

function ageLabel(p: any) {
  const created = new Date(p?.createdAt ?? 0).getTime();
  if (!Number.isFinite(created)) return "Agora";

  const mins = Math.max(1, Math.floor((Date.now() - created) / 60000));
  if (mins < 60) return `${mins} min`;

  const hrs = Math.floor(mins / 60);
  return `${hrs}h`;
}

function executionLabel(pedido: Pedido | null) {
  if (!pedido) return "";
  const baseTime =
    pedido.status === "preparando"
      ? getTime(pedido)
      : new Date(pedido.updatedAt ?? pedido.createdAt ?? 0).getTime();

  if (!Number.isFinite(baseTime) || baseTime <= 0) return "";

  const mins = Math.max(1, Math.floor((Date.now() - baseTime) / 60000));
  if (pedido.status === "preparando") return `Em preparo há ${mins} min`;
  if (pedido.status === "saiu_para_entrega") return `Em rota há ${mins} min`;
  return `Em execução há ${mins} min`;
}

function useWindowWidth() {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );

  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth);
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}

function isOfertaElegivel(p: Pedido) {
  const status = String(p?.status ?? "");
  return !p?.entregadorId && OFERTA_STATUS_ACEITAVEIS.has(status);
}

function isPedidoAtivoDoEntregador(p: Pedido, entregadorId: string) {
  const status = String(p?.status ?? "");
  return (
    String(p?.entregadorId || "") === String(entregadorId || "") &&
    status !== "entregue" &&
    status !== "cancelado"
  );
}

function isPedidoEmExecucao(pedido: Pedido | null) {
  const status = String(pedido?.status ?? "");
  return status === "preparando" || status === "saiu_para_entrega";
}

function isAgendadoPendenteDoEntregador(pedido: Pedido | null, entregadorId: string) {
  if (!pedido) return false;
  if (String(pedido.entregadorId || "") !== String(entregadorId || "")) return false;
  if (pedido.tipo !== "agendado") return false;
  return (
    pedido.status === "criado" ||
    pedido.status === "confirmado" ||
    pedido.status === "buscando_entregador"
  );
}

function normalizePedidosForHome(list: Pedido[]) {
  const map = new Map<string, Pedido>();

  for (const pedido of list) {
    const id = String(pedido?.id ?? "").trim();
    if (!id) continue;

    const existing = map.get(id);
    if (!existing) {
      map.set(id, pedido);
      continue;
    }

    const existingTime = getTime(existing);
    const incomingTime = getTime(pedido);
    map.set(id, incomingTime >= existingTime ? pedido : existing);
  }

  return Array.from(map.values());
}

function getNeighborhood(pedido: Pedido | null) {
  if (!pedido) return "Sem região";

  return (
    safeText((pedido as any)?.enderecoSnapshot?.neighborhood) ||
    safeText((pedido as any)?.enderecoSnapshot?.bairro) ||
    safeText((pedido as any)?.enderecoSnapshot?.city) ||
    safeText((pedido as any)?.enderecoSnapshot?.cidade) ||
    "Sem região"
  );
}

function getAddressLine(pedido: Pedido | null) {
  if (!pedido) return "Endereço não informado";

  const street =
    safeText((pedido as any)?.enderecoSnapshot?.street) ||
    safeText((pedido as any)?.enderecoSnapshot?.rua);
  const number =
    safeText((pedido as any)?.enderecoSnapshot?.number) ||
    safeText((pedido as any)?.enderecoSnapshot?.numero);
  const city =
    safeText((pedido as any)?.enderecoSnapshot?.city) ||
    safeText((pedido as any)?.enderecoSnapshot?.cidade);

  return [street, number, city].filter(Boolean).join(", ") || "Endereço não informado";
}

function getItemSummary(pedido: Pedido | null) {
  if (!pedido?.itens?.length) return "Sem itens";
  return pedido.itens.map((item) => `${item.quantidade}x ${item.nome}`).join(" • ");
}

export default function EntregadorHome() {
  const navigate = useNavigate();
  useWindowWidth();

  const pedidos = usePedidoStore((s) => s.pedidos);
  const loadingRemote = usePedidoStore((s) => s.loadingRemote);
  const remoteReady = usePedidoStore((s) => s.remoteReady);
  const refetchPedidos = usePedidoStore((s) => s.refetchPedidos);
  const upsertPedidoLocal = usePedidoStore((s) => s.upsertPedidoLocal);
  const publicVersion = useRemoteSyncStore((s) => s.publicVersion);
  const financeVersion = useRemoteSyncStore((s) => s.financeVersion);

  const entregadorId = useEffectiveEntregadorId();
  const online = useEntregadorStore((s) => s.isOnline);
  const onlineSyncing = useEntregadorStore((s) => s.onlineSyncing);
  const onlineHydrating = useEntregadorStore((s) => s.onlineHydrating);
  const onlineSyncError = useEntregadorStore((s) => s.onlineSyncError);
  const onlineToggleTarget = useEntregadorStore((s) => s.onlineToggleTarget);
  const setOnlineRemote = useEntregadorStore((s) => s.setOnlineRemote);
  const hydrateOnlineStatus = useEntregadorStore((s) => s.hydrateOnlineStatus);
  const ensureEntregadorId = useEntregadorStore((s) => s.ensureEntregadorId);
  const currentPedidoId = useEntregadorStore((s) => s.currentPedidoId);
  const setCurrentPedidoId = useEntregadorStore((s) => s.setCurrentPedidoId);
  const setLastPedidosTab = useEntregadorStore((s) => s.setLastPedidosTab);
  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(() => {
    const lock = readAcceptLock();
    return isLockValid(lock) ? lock!.pedidoId : null;
  });
  const [openingOfferId, setOpeningOfferId] = useState<string | null>(null);
  const [offerFeedback, setOfferFeedback] = useState<{
    type: "success" | "warning";
    message: string;
  } | null>(null);

  useEffect(() => {
    ensureEntregadorId();
    void hydrateOnlineStatus();
  }, [ensureEntregadorId, hydrateOnlineStatus]);

  const refreshPedidos = useCallback(async () => {
    try {
      await refetchPedidos();
    } catch (error) {
      appLogger.error("deliverer_home", "refresh_pedidos_failed", error, {
        entregadorId,
      });
    }
  }, [entregadorId, refetchPedidos]);

  useEffect(() => {
    void refreshPedidos();
    const stopRealtime = pedidoService.subscribePedidosRealtime(() => {
      void refreshPedidos();
    });
    const timer = window.setInterval(() => {
      void refreshPedidos();
    }, 8000);
    return () => {
      stopRealtime();
      window.clearInterval(timer);
    };
  }, [refreshPedidos]);

  const derived = useMemo(() => {
    const base = Array.isArray(pedidos) ? normalizePedidosForHome(pedidos) : [];

    const sorted = [...base].sort((a, b) => {
      const aMine = isPedidoAtivoDoEntregador(a, entregadorId) ? 1 : 0;
      const bMine = isPedidoAtivoDoEntregador(b, entregadorId) ? 1 : 0;
      if (aMine !== bMine) return bMine - aMine;

      const aRoute = a?.status === "saiu_para_entrega" ? 1 : 0;
      const bRoute = b?.status === "saiu_para_entrega" ? 1 : 0;
      if (aRoute !== bRoute) return bRoute - aRoute;

      return getTime(b) - getTime(a);
    });

    const ofertas = online
      ? sorted
          .filter((p) => isOfertaElegivel(p))
          .sort((a, b) => {
            const aCreated = new Date(a?.createdAt ?? 0).getTime();
            const bCreated = new Date(b?.createdAt ?? 0).getTime();
            return aCreated - bCreated;
          })
      : [];
    const ofertasImediatas = ofertas.filter((pedido) => pedido.tipo !== "agendado");
    const ofertasAgendadas = ofertas.filter((pedido) => pedido.tipo === "agendado");

    const meusAtivos = sorted
      .filter((p) => isPedidoAtivoDoEntregador(p, entregadorId))
      .sort((a, b) => {
        const aRoute = a?.status === "saiu_para_entrega" ? 1 : 0;
        const bRoute = b?.status === "saiu_para_entrega" ? 1 : 0;
        if (aRoute !== bRoute) return bRoute - aRoute;

        const aScheduled = getScheduledTime(a);
        const bScheduled = getScheduledTime(b);
        const aPriority = getScheduledPriorityState(a);
        const bPriority = getScheduledPriorityState(b);

        const weight = (value: "none" | "future" | "soon" | "due") => {
          switch (value) {
            case "due":
              return 3;
            case "soon":
              return 2;
            case "future":
              return 1;
            default:
              return 0;
          }
        };

        if (weight(aPriority) !== weight(bPriority)) {
          return weight(bPriority) - weight(aPriority);
        }

        if (aScheduled && bScheduled && aScheduled !== bScheduled) {
          return aScheduled - bScheduled;
        }

        return rankPedido(b, currentPedidoId) - rankPedido(a, currentPedidoId);
      });

    const agendadosPendentes = meusAtivos.filter((pedido) =>
      isAgendadoPendenteDoEntregador(pedido, entregadorId)
    );
    const meusEmExecucao = meusAtivos.filter((pedido) => isPedidoEmExecucao(pedido));

    const historicoHoje = sorted.filter(
      (p) =>
        String(p?.entregadorId || "") === String(entregadorId || "") &&
        p?.status === "entregue" &&
        isToday(p?.updatedAt ?? p?.createdAt)
    );

    const pedidoEmRota =
      meusEmExecucao.find((p) => p?.status === "saiu_para_entrega") ?? null;

    const pedidoEmAndamento =
      pedidoEmRota ??
      meusEmExecucao.find(
        (p) => String(p?.id ?? "") === String(currentPedidoId || "")
      ) ??
      meusEmExecucao[0] ??
      null;

    const fila = meusEmExecucao.filter(
      (p) => String(p?.id ?? "") !== String(pedidoEmAndamento?.id ?? "")
    );

    const agendadoPrioritario =
      agendadosPendentes.find((p) => getScheduledPriorityState(p) === "due") ??
      agendadosPendentes.find((p) => getScheduledPriorityState(p) === "soon") ??
      (pedidoEmAndamento && getScheduledPriorityState(pedidoEmAndamento) !== "none"
        ? pedidoEmAndamento
        : null);

    return {
      ofertas,
      ofertasImediatas,
      ofertasAgendadas,
      ofertaPrincipal: ofertasImediatas[0] ?? ofertasAgendadas[0] ?? null,
      pedidoEmAndamento,
      fila,
      agendadosPendentes,
      agendadoPrioritario,
      historicoHoje,
      finance: financeService.getDelivererState(entregadorId),
    };
  }, [pedidos, entregadorId, currentPedidoId, online, publicVersion, financeVersion]);

  useEffect(() => {
    if (derived.pedidoEmAndamento?.id) {
      setCurrentPedidoId(String(derived.pedidoEmAndamento.id));
    }
  }, [derived.pedidoEmAndamento?.id, setCurrentPedidoId]);

  useEffect(() => {
    const ofertaId = String(derived.ofertaPrincipal?.id ?? "").trim();
    const lock = readAcceptLock();

    if (lock && (!isLockValid(lock) || (ofertaId && lock.pedidoId !== ofertaId))) {
      safeRemove(ACCEPT_LOCK_KEY);
      setAcceptingOfferId((current) => (current === lock.pedidoId ? null : current));
    }

    if (!ofertaId) {
      setOfferFeedback(null);
      setAcceptingOfferId(null);
      setOpeningOfferId(null);
      return;
    }

    if (lock && isLockValid(lock) && lock.pedidoId === ofertaId) {
      setAcceptingOfferId(ofertaId);
    }

    setOfferFeedback((current) => {
      if (!current) return current;
      if (acceptingOfferId && acceptingOfferId !== ofertaId) return null;
      return current;
    });
  }, [derived.ofertaPrincipal?.id, acceptingOfferId]);

  useEffect(() => {
    const ativosDoEntregador = (Array.isArray(pedidos) ? pedidos : []).filter((pedido) =>
      isPedidoAtivoDoEntregador(pedido, entregadorId)
    );

    if (!ativosDoEntregador.length) return;

    const noticeMap = readScheduledNoticeMap();
    let changed = false;

    ativosDoEntregador.forEach((pedido) => {
      const priority = getScheduledPriorityState(pedido);
      if (priority === "none" || priority === "future") return;

      const key = String(pedido.id);
      const previous = noticeMap[key];

      if (priority === "soon" && !previous) {
        emitToast(
          "Pedido agendado se aproximando",
          `Você tem um pedido agendado se aproximando do horário: #${String(pedido.id).slice(0, 6)}.`,
          "warning"
        );
        noticeMap[key] = "soon";
        changed = true;
      }

      if (priority === "due" && previous !== "due") {
        emitToast(
          "Pedido agendado no horário",
          `Prioridade ativa para o pedido #${String(pedido.id).slice(0, 6)}.`,
          "warning"
        );
        noticeMap[key] = "due";
        changed = true;
      }
    });

    if (changed) writeScheduledNoticeMap(noticeMap);
  }, [pedidos, entregadorId]);

  function forceOpenPedido(pedidoIdRaw: string, tab: "ofertas" | "andamento") {
    const pedidoId = String(pedidoIdRaw || "").trim();
    if (!pedidoId) {
      emitToast("Oferta indisponível", "Não foi possível abrir este pedido agora.", "warning");
      return;
    }

    setCurrentPedidoId(pedidoId);
    setLastPedidosTab(tab);
    navigate(`/entregador/pedido/${pedidoId}`);
  }

  function openOfertaPrincipal(
    event?: MouseEvent<HTMLButtonElement> | TouchEvent<HTMLButtonElement>
  ) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const pedidoId = String(derived.ofertaPrincipal?.id ?? "").trim();
    if (!pedidoId) {
      emitToast("Oferta indisponível", "Não foi possível abrir esta oferta agora.", "warning");
      return;
    }

    if (openingOfferId === pedidoId) return;

    setOpeningOfferId(pedidoId);
    setOfferFeedback(null);
    setCurrentPedidoId(pedidoId);
    setLastPedidosTab("ofertas");

    window.setTimeout(() => {
      navigate(`/entregador/pedido/${pedidoId}`);
      window.setTimeout(() => {
        setOpeningOfferId((current) => (current === pedidoId ? null : current));
      }, 500);
    }, 0);
  }

  async function acceptOfertaPrincipal() {
    const oferta = derived.ofertaPrincipal;
    const pedidoId = String(oferta?.id ?? "").trim();
    const financeState = derived.finance;

    if (!pedidoId || !oferta) {
      const message = "Não foi possível localizar esta oferta agora.";
      setOfferFeedback({ type: "warning", message });
      emitToast("Oferta indisponível", message, "warning");
      await refreshPedidos();
      return;
    }

    if (!online) {
      const message = "Ative o modo online para aceitar pedidos.";
      setOfferFeedback({ type: "warning", message });
      emitToast("Offline", message, "warning");
      return;
    }

    if (financeState.bloqueado) {
      const message = `Sua comissão do app está em ${money(
        financeState.saldoDevedor
      )}. Regularize para continuar recebendo pedidos.`;
      setOfferFeedback({ type: "warning", message });
      emitToast("Bloqueado", message, "warning");
      return;
    }

    if (acceptingOfferId === pedidoId) return;

    safeSet(ACCEPT_LOCK_KEY, `${pedidoId}|${Date.now()}`);
    setAcceptingOfferId(pedidoId);
    setOfferFeedback(null);

    try {
      const pedidoRemoto = await pedidoService.buscarPedidoRemotoPorId(pedidoId);

      if (!pedidoRemoto) {
        const message = "Este pedido não está mais disponível.";
        setOfferFeedback({ type: "warning", message });
        emitToast("Oferta indisponível", message, "warning");
        await refreshPedidos();
        return;
      }

      if (pedidoRemoto.entregadorId) {
        const alreadyMine =
          String(pedidoRemoto.entregadorId) === String(entregadorId);
        upsertPedidoLocal(pedidoRemoto);

        if (alreadyMine) {
          setCurrentPedidoId(String(pedidoRemoto.id));
          setLastPedidosTab("andamento");
          const message = "Esse pedido já estava atribuído para você.";
          setOfferFeedback({ type: "success", message });
          emitToast("Pedido retomado", message, "success", {
            route: `/entregador/pedido/${pedidoRemoto.id}`,
          });
          await refreshPedidos();
          return;
        }

        const message = alreadyMine
          ? "Este pedido já está com você."
          : "Pedido já foi aceito por outro entregador.";
        setOfferFeedback({ type: "warning", message });
        emitToast(
          alreadyMine ? "Pedido já atribuído" : "Oferta indisponível",
          message,
          "warning"
        );
        await refreshPedidos();
        return;
      }

      if (!OFERTA_STATUS_ACEITAVEIS.has(String(pedidoRemoto.status ?? ""))) {
        const message = "Este pedido não está mais disponível para aceite.";
        setOfferFeedback({ type: "warning", message });
        emitToast("Oferta indisponível", message, "warning");
        await refreshPedidos();
        return;
      }

      const pedidoAceito = await pedidoService.atribuirEntregadorRemoto(
        pedidoId,
        entregadorId
      );

      if (!pedidoAceito) {
        const message = "Pedido já foi aceito por outro entregador.";
        setOfferFeedback({ type: "warning", message });
        emitToast("Oferta indisponível", message, "warning");
        await refreshPedidos();
        return;
      }

      upsertPedidoLocal(pedidoAceito);
      setCurrentPedidoId(String(pedidoAceito.id));
      setLastPedidosTab("andamento");

      const message = "Pedido aceito com sucesso.";
      setOfferFeedback({ type: "success", message });
        emitToast("Pedido aceito", message, "success", {
          route: `/entregador/pedido/${pedidoAceito.id}`,
        });
      await refreshPedidos();
    } catch (error) {
      const message = normalizeAcceptErrorMessage(error);

      setOfferFeedback({ type: "warning", message });
      emitToast(
        message === "Não foi possível aceitar este pedido agora."
          ? "Falha ao aceitar"
          : "Oferta indisponível",
        message,
        "warning"
      );
      await refreshPedidos();
    } finally {
      safeRemove(ACCEPT_LOCK_KEY);
      setAcceptingOfferId((current) => (current === pedidoId ? null : current));
    }
  }

  async function toggleOnlineStatus() {
    if (onlineSyncing) return;

    const nextOnline = !online;
    debugOnline("clique no toggle de online/offline", {
      currentOnline: online,
      nextOnline,
    });

    try {
      await setOnlineRemote(nextOnline);
      await refreshPedidos();
      emitToast(
        nextOnline ? "Você está online" : "Você ficou offline",
        nextOnline
          ? "Seu status foi sincronizado e você pode receber ofertas."
          : `Seu status foi sincronizado e novas ofertas foram ocultadas. Comissão atual do app: ${money(
              derived.finance.saldoDevedor
            )}.`,
        "success",
        nextOnline
          ? {}
          : {
              native: true,
              route: "/entregador/conta",
              group: "cg_entregador_financeiro",
            }
      );
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível atualizar seu status agora.";
      emitToast("Falha ao sincronizar", message, "warning");
    }
  }

  const searchHint = online
    ? "Estamos procurando novas rotas para você"
    : "Você está offline e não recebe pedidos";
  const pedidoAtualTempo = executionLabel(derived.pedidoEmAndamento);

  return (
    <EntregadorLayout>
      <style>
        {`@keyframes cg-scheduled-pulse { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249,115,22,0.28); } 70% { transform: scale(1.01); box-shadow: 0 0 0 8px rgba(249,115,22,0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249,115,22,0); } }`}
      </style>
      <div style={pageWrap}>
        <div style={topShell}>
          <div style={avatarCircle}>CG</div>

          <button
            onClick={() => {
              void toggleOnlineStatus();
            }}
            type="button"
            style={{
              ...availabilityBtn,
              opacity: onlineSyncing || onlineHydrating ? 0.8 : 1,
              cursor:
                onlineSyncing || onlineHydrating ? "progress" : "pointer",
              background: online
                ? "linear-gradient(135deg,#3BAA4A 0%, #2F8F3D 100%)"
                : "linear-gradient(135deg,#475569 0%, #334155 100%)",
            }}
            disabled={onlineSyncing || onlineHydrating}
          >
            <span style={availabilityDot} />
            {onlineSyncing
              ? onlineToggleTarget === false
                ? "Ficando offline..."
                : "Ficando online..."
              : onlineHydrating
              ? "Carregando status..."
              : online
              ? "Online"
              : "Offline"}
            <span style={availabilityChevron}>▾</span>
          </button>

          <div style={headerIcon}>{derived.ofertas.length}</div>
        </div>

        <div style={searchPill}>{searchHint}</div>

        <div style={syncLine}>
          Atualização: {remoteReady ? "ao vivo" : "reconectando"}
          {loadingRemote ? " • atualizando..." : ""}
          {onlineHydrating ? " • carregando status..." : ""}
          {onlineSyncing ? " • atualizando status..." : ""}
        </div>

        {onlineSyncError ? (
          <div style={dangerBanner}>{onlineSyncError}</div>
        ) : null}

        {derived.finance.bloqueado ? (
          <div style={dangerBanner}>
            Sua comissão do app está em{" "}
            <strong>{money(derived.finance.saldoDevedor)}</strong>. Regularize o
            repasse para continuar recebendo pedidos.
          </div>
        ) : null}
        {!online ? (
          <div style={emptyMainCard}>
            <div style={emptyMainTitle}>Você está offline</div>
            <div style={emptyMainText}>
              Ative o status online para receber novas ofertas e voltar para a
              operação.
            </div>
          </div>
        ) : null}

        {online && derived.ofertaPrincipal ? (
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <div style={sectionTitle}>Nova oferta</div>
              <span style={offerBubble}>{derived.ofertas.length}</span>
            </div>

            <div style={offerCard}>
              <div style={offerGlow} />
              <div style={offerAccentRow}>
                <div style={offerStatusBadge}>
                  <span style={offerPulseDot} />
                  Nova oferta
                </div>
                <div style={offerRegion}>{getNeighborhood(derived.ofertaPrincipal)}</div>
              </div>

              <div style={offerTitle}>
                Pedido #{String(derived.ofertaPrincipal.id).slice(0, 6)}
              </div>

              <div style={offerClient}>
                {safeText((derived.ofertaPrincipal as any)?.clienteNome) || "Cliente"}
              </div>

              <div style={offerItemSummary}>{getItemSummary(derived.ofertaPrincipal)}</div>
              <div style={offerMeta}>{getAddressLine(derived.ofertaPrincipal)}</div>

              <div style={offerSummaryRow}>
                <div style={offerInfoBlock}>
                  <div style={offerInfoLabel}>Tempo na fila</div>
                  <div style={offerInfoValue}>
                    Esperando há {ageLabel(derived.ofertaPrincipal)}
                  </div>
                </div>
                <div style={offerInfoBlock}>
                  <div style={offerInfoLabel}>Valor total</div>
                  <div style={offerPrice}>
                    {money(Number((derived.ofertaPrincipal as any)?.total ?? 0))}
                  </div>
                </div>
              </div>

              {offerFeedback ? (
                <div
                  style={
                    offerFeedback.type === "success"
                      ? offerFeedbackSuccess
                      : offerFeedbackWarning
                  }
                >
                  {offerFeedback.message}
                </div>
              ) : null}

              <div style={offerActions}>
                <button
                  onClick={() => {
                    void acceptOfertaPrincipal();
                  }}
                  type="button"
                  style={{
                    ...offerPrimaryAction,
                    ...(acceptingOfferId === String(derived.ofertaPrincipal.id)
                      ? offerPrimaryActionBusy
                      : null),
                  }}
                  disabled={acceptingOfferId === String(derived.ofertaPrincipal.id)}
                >
                  {acceptingOfferId === String(derived.ofertaPrincipal.id)
                    ? "Aceitando..."
                    : "Aceitar agora"}
                </button>

                <button
                  onClick={openOfertaPrincipal}
                  type="button"
                  style={offerSecondaryAction}
                  disabled={
                    acceptingOfferId === String(derived.ofertaPrincipal.id) ||
                    openingOfferId === String(derived.ofertaPrincipal.id)
                  }
                >
                  {openingOfferId === String(derived.ofertaPrincipal.id)
                    ? "Abrindo..."
                    : "Ver detalhes"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {online && derived.pedidoEmAndamento ? (
          <div style={priorityCard}>
            <div style={priorityIndex}>{derived.ofertaPrincipal ? "2" : "1"}</div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={priorityTop}>
                <div style={priorityTitle}>
                  Pedido #{String(derived.pedidoEmAndamento.id).slice(0, 6)}
                </div>
                <div style={priorityStatus}>
                  {statusLabel(derived.pedidoEmAndamento.status)}
                </div>
              </div>

              <div style={priorityClient}>
                {safeText(derived.pedidoEmAndamento.clienteNome) || "Cliente"} •{" "}
                {getNeighborhood(derived.pedidoEmAndamento)}
              </div>

              {pedidoAtualTempo ? <div style={priorityRuntime}>{pedidoAtualTempo}</div> : null}
              <div style={priorityAddress}>{getAddressLine(derived.pedidoEmAndamento)}</div>
              <div style={priorityItems}>{getItemSummary(derived.pedidoEmAndamento)}</div>

              <div style={priorityActions}>
                <button
                  onClick={() =>
                    forceOpenPedido(String(derived.pedidoEmAndamento?.id ?? ""), "andamento")
                  }
                  type="button"
                  style={primaryAction}
                >
                  Continuar entrega
                </button>
                <div style={priorityPrice}>
                  {money(Number((derived.pedidoEmAndamento as any)?.total ?? 0))}
                </div>
              </div>
            </div>
          </div>
        ) : online && !derived.ofertaPrincipal ? (
          <div style={emptyMainCard}>
            <div style={emptyMainTitle}>Aguardando nova oferta</div>
            <div style={emptyMainText}>
              Quando surgir uma nova oferta, ela aparece aqui no topo para você agir rápido.
            </div>
          </div>
        ) : null}

        {online && derived.fila.length > 0 ? (
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <div style={sectionTitle}>Em espera / fila</div>
              <span style={countBubble}>{derived.fila.length}</span>
            </div>

            <div style={routeList}>
              {derived.fila.slice(0, 6).map((pedido, index) => (
                <button
                  key={pedido.id}
                  onClick={() => forceOpenPedido(String(pedido.id), "andamento")}
                  type="button"
                  style={routeCard}
                >
                  <div style={routeNumber}>{index + 1}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={routeTitle}>Pedido #{String(pedido.id).slice(0, 6)}</div>
                    <div style={routeMeta}>{getAddressLine(pedido)}</div>
                    <div style={routeMetaStrong}>{getItemSummary(pedido)}</div>
                  </div>
                  <div style={routeAction}>Abrir</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </EntregadorLayout>
  );
}

const pageWrap: CSSProperties = {
  display: "grid",
  gap: 14,
};

const topShell: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "60px minmax(0, 1fr) 52px",
  gap: 10,
  alignItems: "center",
};

const avatarCircle: CSSProperties = {
  width: 60,
  height: 60,
  borderRadius: "50%",
  background: "linear-gradient(135deg,#FFE0B2 0%, #FFB74D 100%)",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  color: "#9A3412",
  boxShadow: "0 12px 24px rgba(228,79,42,0.18)",
};

const availabilityBtn: CSSProperties = {
  minHeight: 54,
  borderRadius: 20,
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  color: "#fff",
  fontWeight: 950,
  fontSize: 16,
  cursor: "pointer",
  boxShadow: "0 12px 24px rgba(15,23,42,0.18)",
};

const availabilityDot: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "0 0 0 4px rgba(255,255,255,0.18)",
};

const availabilityChevron: CSSProperties = {
  fontSize: 16,
  opacity: 0.9,
};

const headerIcon: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 18,
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  color: "#E44F2A",
  boxShadow: "0 10px 22px rgba(0,0,0,0.06)",
};

const searchPill: CSSProperties = {
  minHeight: 48,
  borderRadius: 18,
  background: "rgba(255,248,240,0.96)",
  border: "1px solid rgba(228,79,42,0.14)",
  display: "flex",
  alignItems: "center",
  padding: "0 16px",
  color: "#7C2D12",
  fontWeight: 700,
  boxShadow: "0 10px 18px rgba(228,79,42,0.08)",
};

const syncLine: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const dangerBanner: CSSProperties = {
  background: "rgba(185,28,28,0.08)",
  border: "1px solid rgba(185,28,28,0.16)",
  borderRadius: 16,
  padding: 12,
  color: "#7F1D1D",
  fontWeight: 900,
  lineHeight: 1.5,
};

const priorityCard: CSSProperties = {
  display: "flex",
  gap: 14,
  background: "#fff",
  borderRadius: ui.radius.hero,
  padding: 18,
  border: "2px solid rgba(234,179,8,0.34)",
  boxShadow: "0 22px 38px rgba(228,79,42,0.16)",
};

const priorityIndex: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: "50%",
  background: "linear-gradient(135deg,#FF7A18 0%, #F97316 100%)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  fontSize: 22,
  flexShrink: 0,
};

const priorityTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const priorityTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  color: "#111827",
};

const priorityStatus: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(34,197,94,0.12)",
  color: "#2F8F3D",
  fontWeight: 900,
  fontSize: 13,
};

const priorityClient: CSSProperties = {
  marginTop: 10,
  color: "#374151",
  fontWeight: 800,
};

const priorityRuntime: CSSProperties = {
  marginTop: 8,
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.06)",
  color: "#334155",
  fontWeight: 900,
  fontSize: 12.5,
};

const priorityAddress: CSSProperties = {
  marginTop: 8,
  color: "#374151",
  lineHeight: 1.45,
};

const priorityItems: CSSProperties = {
  marginTop: 8,
  color: "#6B7280",
  fontWeight: 700,
  lineHeight: 1.45,
};

const priorityActions: CSSProperties = {
  marginTop: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const primaryAction: CSSProperties = {
  ...primaryButtonStyle({
    minHeight: 50,
    padding: "0 18px",
  }),
};

const priorityPrice: CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  color: "#111827",
};

const emptyMainCard: CSSProperties = {
  background: "#fff",
  borderRadius: 28,
  padding: 20,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 26px rgba(0,0,0,0.05)",
};

const emptyMainTitle: CSSProperties = {
  fontSize: 24,
  fontWeight: 950,
  color: "#111827",
};

const emptyMainText: CSSProperties = {
  marginTop: 8,
  color: "#6B7280",
  lineHeight: 1.5,
};

const sectionCard: CSSProperties = {
  ...sectionCardStyle({
    borderRadius: ui.radius.hero,
    padding: 18,
  }),
};

const sectionHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const sectionTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  color: "#111827",
};

const countBubble: CSSProperties = {
  minWidth: 34,
  height: 34,
  borderRadius: 999,
  background: "#F3F4F6",
  color: "#111827",
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
};

const offerBubble: CSSProperties = {
  minWidth: 34,
  height: 34,
  borderRadius: 999,
  background: "rgba(228,79,42,0.10)",
  color: "#E44F2A",
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
};

const routeList: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 12,
};

const routeCard: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  width: "100%",
  textAlign: "left",
  padding: "14px 14px",
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  cursor: "pointer",
  transition: "opacity 180ms ease, transform 180ms ease",
};

const routeNumber: CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "linear-gradient(135deg,#FF7A18 0%, #F97316 100%)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  flexShrink: 0,
};

const routeTitle: CSSProperties = {
  fontWeight: 950,
  color: "#111827",
};

const routeMeta: CSSProperties = {
  marginTop: 6,
  color: "#4B5563",
  lineHeight: 1.45,
};

const routeMetaStrong: CSSProperties = {
  marginTop: 6,
  color: "#6B7280",
  fontWeight: 700,
};

const routeAction: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 14,
  background: "rgba(255,243,205,0.9)",
  color: "#9A6700",
  fontWeight: 950,
  flexShrink: 0,
};

const offerCard: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 10,
  position: "relative",
  zIndex: 1,
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(228,79,42,0.14)",
  background: "linear-gradient(180deg,#FFFFFF 0%, #FFF8F4 100%)",
  boxShadow: "0 18px 38px rgba(228,79,42,0.12)",
  overflow: "hidden",
};

const offerGlow: CSSProperties = {
  position: "absolute",
  inset: "-30% auto auto 55%",
  width: 180,
  height: 180,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0) 72%)",
  pointerEvents: "none",
};

const offerTitle: CSSProperties = {
  fontSize: 22,
  fontWeight: 950,
  color: "#111827",
};

const offerMeta: CSSProperties = {
  color: "#4B5563",
  lineHeight: 1.45,
};

const offerPrice: CSSProperties = {
  fontSize: 24,
  fontWeight: 950,
  color: "#111827",
};

const offerAccentRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const offerStatusBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(228,79,42,0.10)",
  color: "#C2410C",
  border: "1px solid rgba(228,79,42,0.18)",
  fontWeight: 950,
  fontSize: 12,
};

const offerPulseDot: CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: "50%",
  background: "#F97316",
  animation: "cg-scheduled-pulse 2.1s ease-in-out infinite",
  flexShrink: 0,
};

const offerClient: CSSProperties = {
  fontSize: 17,
  fontWeight: 900,
  color: "#111827",
  lineHeight: 1.2,
};

const offerRegion: CSSProperties = {
  color: "#6B7280",
  fontWeight: 800,
  fontSize: 13,
};

const offerSummaryRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const offerInfoBlock: CSSProperties = {
  borderRadius: 16,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.74)",
  border: "1px solid rgba(15,23,42,0.06)",
  display: "grid",
  gap: 4,
};

const offerInfoLabel: CSSProperties = {
  fontSize: 11,
  color: "#94A3B8",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const offerInfoValue: CSSProperties = {
  color: "#111827",
  fontWeight: 900,
  lineHeight: 1.35,
};

const offerItemSummary: CSSProperties = {
  color: "#374151",
  fontWeight: 800,
  lineHeight: 1.45,
};

const offerActions: CSSProperties = {
  display: "grid",
  gap: 10,
};

const offerPrimaryAction: CSSProperties = {
  ...primaryButtonStyle({
    width: "100%",
    minHeight: 54,
    fontSize: 16,
  }),
  position: "relative",
  zIndex: 2,
};

const offerPrimaryActionBusy: CSSProperties = {
  boxShadow: "0 14px 28px rgba(228,79,42,0.18)",
  filter: "saturate(0.92)",
};

const offerSecondaryAction: CSSProperties = {
  ...secondaryButtonStyle({
    width: "100%",
    minHeight: 46,
  }),
  position: "relative",
  zIndex: 3,
  pointerEvents: "auto",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
  cursor: "pointer",
};

const offerFeedbackBase: CSSProperties = {
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 13,
  fontWeight: 850,
  lineHeight: 1.45,
};

const offerFeedbackSuccess: CSSProperties = {
  ...offerFeedbackBase,
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.18)",
  color: "#166534",
};

const offerFeedbackWarning: CSSProperties = {
  ...offerFeedbackBase,
  background: "rgba(239,68,68,0.10)",
  border: "1px solid rgba(239,68,68,0.18)",
  color: "#991B1B",
};


