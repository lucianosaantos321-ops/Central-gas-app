import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { usePedidoStore } from "../../store/usePedidoStore";
import { appLogger } from "../../services/appLogger";
import { pedidoService } from "../../services/pedidoService";
import { emitToast } from "../../services/realtimeBus";
import { exportRowsToCsv } from "../../services/csvExportService";
import {
  adminAuditTrailService,
  type AdminAuditLogRow,
} from "../../services/adminAuditTrailService";
import { adminSupportService } from "../../services/adminSupportService";
import { money, safeText, statusLabel, getTime } from "../../utils/delivererHelpers";
import type { StatusPedido } from "../../types";

type PedidoFiltro =
  | "todos"
  | "criado"
  | "confirmado"
  | "buscando_entregador"
  | "preparando"
  | "saiu_para_entrega"
  | "entregue"
  | "cancelado";

function badgeByStatus(status: string): CSSProperties {
  switch (status) {
    case "criado":
      return {
        background: "rgba(100,116,139,0.10)",
        color: "#475569",
        border: "1px solid rgba(100,116,139,0.18)",
      };
    case "confirmado":
      return {
        background: "rgba(37,99,235,0.10)",
        color: "#1D4ED8",
        border: "1px solid rgba(37,99,235,0.18)",
      };
    case "buscando_entregador":
      return {
        background: "rgba(146,64,14,0.10)",
        color: "#92400E",
        border: "1px solid rgba(146,64,14,0.18)",
      };
    case "preparando":
      return {
        background: "rgba(234,88,12,0.10)",
        color: "#C2410C",
        border: "1px solid rgba(234,88,12,0.18)",
      };
    case "saiu_para_entrega":
      return {
        background: "rgba(124,58,237,0.10)",
        color: "#7C3AED",
        border: "1px solid rgba(124,58,237,0.18)",
      };
    case "entregue":
      return {
        background: "rgba(22,163,74,0.10)",
        color: "#15803D",
        border: "1px solid rgba(22,163,74,0.18)",
      };
    case "cancelado":
      return {
        background: "rgba(185,28,28,0.10)",
        color: "#B91C1C",
        border: "1px solid rgba(185,28,28,0.18)",
      };
    default:
      return {
        background: "#F1F5F9",
        color: "#111827",
        border: "1px solid rgba(15,23,42,0.08)",
      };
  }
}

function nextStatusOptions(current: string): StatusPedido[] {
  switch (current) {
    case "criado":
      return ["confirmado", "buscando_entregador", "preparando", "cancelado"];
    case "confirmado":
      return ["buscando_entregador", "preparando", "cancelado"];
    case "buscando_entregador":
      return ["preparando", "cancelado"];
    case "preparando":
      return ["saiu_para_entrega", "cancelado"];
    case "saiu_para_entrega":
      return ["entregue", "cancelado"];
    default:
      return [];
  }
}

function dedupePedidos(list: any[]) {
  const map = new Map<string, any>();

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

function formatDateTimeBR(raw: string | null | undefined) {
  if (!raw) return "Nao informado";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "Nao informado";
  return date.toLocaleString("pt-BR");
}

function askCriticalReason(actionLabel: string) {
  const confirmed = window.confirm(`Confirmar a acao: ${actionLabel}?`);
  if (!confirmed) return null;

  const reason = window.prompt("Informe o motivo da acao:", "Ajuste administrativo");
  if (!reason || !reason.trim()) {
    emitToast("Motivo obrigatorio", "Informe o motivo para registrar a acao.", "warning");
    return null;
  }

  return reason.trim();
}

function orderRegion(pedido: any) {
  return (
    [
      safeText(pedido?.enderecoSnapshot?.bairro ?? pedido?.enderecoSnapshot?.neighborhood),
      safeText(pedido?.enderecoSnapshot?.cidade ?? pedido?.enderecoSnapshot?.city),
    ]
      .filter(Boolean)
      .join(" / ") || "Nao informado"
  );
}

function extractLatLng(pedido: any) {
  const lat = Number(
    pedido?.enderecoSnapshot?.lat ??
      pedido?.enderecoSnapshot?.latitude ??
      pedido?.cancelamentoLat ??
      ""
  );
  const lng = Number(
    pedido?.enderecoSnapshot?.lng ??
      pedido?.enderecoSnapshot?.longitude ??
      pedido?.cancelamentoLng ??
      ""
  );
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function buildAddressLabel(pedido: any) {
  return (
    [
      safeText(pedido?.enderecoSnapshot?.street ?? pedido?.enderecoSnapshot?.rua),
      safeText(pedido?.enderecoSnapshot?.number ?? pedido?.enderecoSnapshot?.numero),
      safeText(pedido?.enderecoSnapshot?.bairro ?? pedido?.enderecoSnapshot?.neighborhood),
      safeText(pedido?.enderecoSnapshot?.cidade ?? pedido?.enderecoSnapshot?.city),
    ]
      .filter(Boolean)
      .join(", ") || "Nao informado"
  );
}

function buildMapsUrl(pedido: any) {
  const { lat, lng } = extractLatLng(pedido);
  if (lat != null && lng != null) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(buildAddressLabel(pedido))}`;
}

function buildWazeUrl(pedido: any) {
  const { lat, lng } = extractLatLng(pedido);
  if (lat != null && lng != null) {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }
  return `https://waze.com/ul?q=${encodeURIComponent(buildAddressLabel(pedido))}&navigate=yes`;
}

function copyText(label: string, text: string) {
  if (!text.trim()) {
    emitToast(label, "Nao ha informacao suficiente para copiar.", "warning");
    return;
  }

  void navigator.clipboard
    .writeText(text)
    .then(() => emitToast(label, "Resumo copiado com sucesso.", "success"))
    .catch(() => emitToast(label, "Nao foi possivel copiar agora.", "warning"));
}

export default function AdminPedidos() {
  const pedidos = usePedidoStore((s) => s.pedidos);
  const loadingRemote = usePedidoStore((s) => s.loadingRemote);
  const remoteReady = usePedidoStore((s) => s.remoteReady);
  const refetchPedidos = usePedidoStore((s) => s.refetchPedidos);
  const atualizarStatus = usePedidoStore((s) => s.atualizarStatus);
  const atribuirEntregador = usePedidoStore((s) => s.atribuirEntregador);
  const cancelarPedido = usePedidoStore((s) => s.cancelarPedido);
  const marcarEntregaManual = usePedidoStore((s) => s.marcarEntregaManual);

  const [filtro, setFiltro] = useState<PedidoFiltro>("todos");
  const [busca, setBusca] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [delivererDraft, setDelivererDraft] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelObs, setCancelObs] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [customerObs, setCustomerObs] = useState("");
  const [reopenStatus, setReopenStatus] = useState<StatusPedido>("confirmado");
  const [supportBusy, setSupportBusy] = useState("");
  const [auditRows, setAuditRows] = useState<AdminAuditLogRow[]>([]);
  const [notificationRows, setNotificationRows] = useState<any[]>([]);
  const [addressForm, setAddressForm] = useState({
    enderecoId: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    complement: "",
    reference: "",
    lat: "",
    lng: "",
  });

  const refreshPedidos = useCallback(async () => {
    try {
      await refetchPedidos();
    } catch (error) {
      appLogger.error("admin_pedidos", "refresh_pedidos_failed", error);
    }
  }, [refetchPedidos]);

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

  const ordered = useMemo(() => {
    const list = Array.isArray(pedidos) ? dedupePedidos([...pedidos]) : [];
    return list.sort((a: any, b: any) => getTime(b) - getTime(a));
  }, [pedidos]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return ordered.filter((p: any) => {
      if (filtro !== "todos" && p?.status !== filtro) return false;

      if (!q) return true;

      const haystack = [
        p?.id,
        p?.clienteNome,
        p?.clienteTelefone,
        p?.entregadorId,
        p?.status,
        p?.tipo,
        p?.formaPagamento,
        p?.cupomCodigo,
        p?.motivoCancelamento,
        p?.observacaoCancelamento,
        p?.observacao,
        p?.enderecoSnapshot?.bairro,
        p?.enderecoSnapshot?.neighborhood,
        p?.enderecoSnapshot?.cidade,
        p?.enderecoSnapshot?.city,
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [ordered, filtro, busca]);

  const selected = useMemo(() => {
    return (
      filtered.find((p: any) => String(p?.id ?? "") === selectedId) ??
      filtered[0] ??
      null
    );
  }, [filtered, selectedId]);

  const summary = useMemo(() => {
    return {
      total: ordered.length,
      andamento: ordered.filter(
        (p: any) => p?.status !== "entregue" && p?.status !== "cancelado"
      ).length,
      entregues: ordered.filter((p: any) => p?.status === "entregue").length,
      cancelados: ordered.filter((p: any) => p?.status === "cancelado").length,
      agendados: ordered.filter((p: any) => p?.tipo === "agendado").length,
      semEntregador: ordered.filter(
        (p: any) =>
          p?.status !== "entregue" &&
          p?.status !== "cancelado" &&
          !safeText(p?.entregadorId)
      ).length,
    };
  }, [ordered]);

  useEffect(() => {
    if (!selected) {
      setDelivererDraft("");
      setCancelReason("");
      setCancelObs("");
      setInternalNote("");
      setCustomerObs("");
      setAuditRows([]);
      setNotificationRows([]);
      return;
    }

    setDelivererDraft(safeText(selected.entregadorId));
    setCancelReason(safeText(selected.motivoCancelamento));
    setCancelObs(safeText(selected.observacaoCancelamento));
    setInternalNote("");
    setCustomerObs(safeText(selected.observacao));
    setAddressForm({
      enderecoId: safeText(selected.enderecoId),
      street: safeText(selected?.enderecoSnapshot?.street ?? selected?.enderecoSnapshot?.rua),
      number: safeText(selected?.enderecoSnapshot?.number ?? selected?.enderecoSnapshot?.numero),
      neighborhood: safeText(selected?.enderecoSnapshot?.bairro ?? selected?.enderecoSnapshot?.neighborhood),
      city: safeText(selected?.enderecoSnapshot?.cidade ?? selected?.enderecoSnapshot?.city),
      complement: safeText(selected?.enderecoSnapshot?.complemento ?? selected?.enderecoSnapshot?.complement),
      reference: safeText(selected?.enderecoSnapshot?.referencia ?? selected?.enderecoSnapshot?.reference),
      lat:
        selected?.enderecoSnapshot?.lat != null
          ? String(selected.enderecoSnapshot.lat)
          : selected?.enderecoSnapshot?.latitude != null
          ? String(selected.enderecoSnapshot.latitude)
          : "",
      lng:
        selected?.enderecoSnapshot?.lng != null
          ? String(selected.enderecoSnapshot.lng)
          : selected?.enderecoSnapshot?.longitude != null
          ? String(selected.enderecoSnapshot.longitude)
          : "",
    });
    setReopenStatus(
      safeText(selected.entregadorId) ? "preparando" : "confirmado"
    );

    let active = true;
    void Promise.all([
      adminAuditTrailService.listRecent({
        entityType: "pedido",
        entityId: String(selected.id),
        limit: 40,
      }),
      adminSupportService.listOrderNotifications(String(selected.id), 30),
    ])
      .then(([audit, notifications]) => {
        if (!active) return;
        setAuditRows(audit);
        setNotificationRows(notifications);
      })
      .catch(() => {
        if (!active) return;
        setAuditRows([]);
        setNotificationRows([]);
      });

    return () => {
      active = false;
    };
  }, [selected]);

  function selectPedido(id: string) {
    setSelectedId(id);
  }

  async function onAssignDeliverer() {
    if (!selected?.id) return;

    const id = delivererDraft.trim();
    if (!id) {
      emitToast("Entregador obrigatorio", "Informe o ID do entregador.", "warning");
      return;
    }

    const reason = askCriticalReason(`Atribuir entregador ${id} ao pedido ${String(selected.id).slice(0, 6)}`);
    if (!reason) return;
    setSupportBusy("assign");

    try {
      const updated = await atribuirEntregador(selected.id, id);
      if (!updated) {
        emitToast("Falha na atribuicao", "Nao foi possivel atribuir este entregador.", "error");
        return;
      }

      await adminAuditTrailService.logAction({
        category: "admin_pedidos",
        event: "order_deliverer_assigned",
        message: "Entregador vinculado manualmente ao pedido.",
        entityType: "pedido",
        entityId: String(selected.id),
        reason,
        before: { entregadorId: selected.entregadorId, status: selected.status },
        after: { entregadorId: id, status: updated.status },
        extra: { delivererId: id },
      });

      emitToast("Atribuicao concluida", "O entregador foi vinculado ao pedido.", "success");
      await refreshPedidos();
    } finally {
      setSupportBusy("");
    }
  }

  async function onRemoveDeliverer() {
    if (!selected?.id) return;
    const reason = askCriticalReason(`Remover entregador do pedido ${String(selected.id).slice(0, 6)}`);
    if (!reason) return;
    setSupportBusy("remove_deliverer");

    try {
      await adminSupportService.removeOrderDeliverer(String(selected.id));
      await adminAuditTrailService.logAction({
        category: "admin_pedidos",
        event: "order_deliverer_removed",
        message: "Entregador removido do pedido pelo painel.",
        entityType: "pedido",
        entityId: String(selected.id),
        reason,
        before: { entregadorId: selected.entregadorId, status: selected.status },
        after: { entregadorId: null, status: "buscando_entregador" },
      });
      emitToast("Entregador removido", "O pedido voltou para a fila operacional.", "success");
      await refreshPedidos();
    } catch (error) {
      emitToast(
        "Falha ao remover entregador",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel remover o entregador deste pedido.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function onStatusChange(next: StatusPedido) {
    if (!selected?.id) return;
    const reason = askCriticalReason(`Alterar pedido ${String(selected.id).slice(0, 6)} para ${statusLabel(next)}`);
    if (!reason) return;
    setSupportBusy(`status_${next}`);

    try {
      const updated =
        next === "entregue"
          ? await marcarEntregaManual(selected.id)
          : await atualizarStatus(selected.id, next);
      if (!updated) {
        emitToast("Falha ao atualizar status", `Nao foi possivel alterar o status para ${statusLabel(next)}.`, "error");
        return;
      }

      await adminAuditTrailService.logAction({
        category: "admin_pedidos",
        event: "order_status_updated",
        message: "Status do pedido atualizado manualmente pelo ADM.",
        entityType: "pedido",
        entityId: String(selected.id),
        reason,
        before: { status: selected.status },
        after: { status: next },
      });

      await refreshPedidos();
      emitToast("Status atualizado", `Status alterado para ${statusLabel(next)}.`, "success");
    } finally {
      setSupportBusy("");
    }
  }

  async function onCancelByAdmin() {
    if (!selected?.id) return;

    if (!cancelReason.trim()) {
      emitToast("Motivo obrigatorio", "Informe o motivo do cancelamento.", "warning");
      return;
    }

    const reason = askCriticalReason(`Cancelar pedido ${String(selected.id).slice(0, 6)}`);
    if (!reason) return;
    setSupportBusy("cancel");

    try {
      const ok = await cancelarPedido({
        pedidoId: selected.id,
        canceladoPor: "adm",
        motivoCancelamento: cancelReason.trim(),
        observacaoCancelamento: cancelObs.trim() || null,
        lat: null,
        lng: null,
      });

      if (!ok) {
        emitToast("Falha no cancelamento", "Nao foi possivel cancelar este pedido.", "error");
        return;
      }

      await adminAuditTrailService.logAction({
        category: "admin_pedidos",
        event: "order_canceled_by_admin",
        message: "Pedido cancelado pelo painel.",
        entityType: "pedido",
        entityId: String(selected.id),
        reason,
        before: { status: selected.status },
        after: { status: "cancelado", motivoCancelamento: cancelReason.trim() },
      });

      setCancelReason("");
      setCancelObs("");
      await refreshPedidos();
      emitToast("Pedido cancelado", "O pedido foi cancelado pelo ADM.", "success");
    } finally {
      setSupportBusy("");
    }
  }

  async function onReopenOrder() {
    if (!selected?.id) return;
    const reason = askCriticalReason(`Reabrir pedido ${String(selected.id).slice(0, 6)}`);
    if (!reason) return;
    setSupportBusy("reopen");

    try {
      await adminSupportService.reopenOrder(String(selected.id), reopenStatus);
      await adminAuditTrailService.logAction({
        category: "admin_pedidos",
        event: "order_reopened",
        message: "Pedido reaberto manualmente pelo painel.",
        entityType: "pedido",
        entityId: String(selected.id),
        reason,
        before: { status: selected.status },
        after: { status: reopenStatus },
      });
      emitToast("Pedido reaberto", "O pedido voltou para o fluxo operacional.", "success");
      await refreshPedidos();
    } catch (error) {
      emitToast(
        "Falha ao reabrir pedido",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel reabrir este pedido.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function saveAddressAndObservation() {
    if (!selected?.id) return;
    const reason = askCriticalReason(`Corrigir endereco/observacao do pedido ${String(selected.id).slice(0, 6)}`);
    if (!reason) return;
    setSupportBusy("save_order");

    try {
      const payload = {
        observacao: customerObs.trim() || null,
        enderecoId: addressForm.enderecoId.trim() || null,
        enderecoSnapshot: {
          ...(selected.enderecoSnapshot ?? {}),
          street: addressForm.street.trim(),
          rua: addressForm.street.trim(),
          number: addressForm.number.trim(),
          numero: addressForm.number.trim(),
          neighborhood: addressForm.neighborhood.trim(),
          bairro: addressForm.neighborhood.trim(),
          city: addressForm.city.trim(),
          cidade: addressForm.city.trim(),
          complement: addressForm.complement.trim() || null,
          complemento: addressForm.complement.trim() || null,
          reference: addressForm.reference.trim() || null,
          referencia: addressForm.reference.trim() || null,
          lat: addressForm.lat.trim() ? Number(addressForm.lat) : null,
          lng: addressForm.lng.trim() ? Number(addressForm.lng) : null,
          latitude: addressForm.lat.trim() ? Number(addressForm.lat) : null,
          longitude: addressForm.lng.trim() ? Number(addressForm.lng) : null,
        },
      };

      await adminSupportService.updateOrderRecord(String(selected.id), payload);
      await adminAuditTrailService.logAction({
        category: "admin_pedidos",
        event: "order_address_observation_updated",
        message: "Endereco ou observacao do pedido corrigidos pelo painel.",
        entityType: "pedido",
        entityId: String(selected.id),
        reason,
        before: {
          observacao: selected.observacao,
          enderecoSnapshot: selected.enderecoSnapshot,
        },
        after: payload,
      });
      emitToast("Pedido atualizado", "Endereco e observacao foram salvos.", "success");
      await refreshPedidos();
    } catch (error) {
      emitToast(
        "Falha ao salvar pedido",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel salvar as correcoes do pedido.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function registerInternalNote() {
    if (!selected?.id || !internalNote.trim()) {
      emitToast("Observacao obrigatoria", "Informe a observacao interna para registrar o suporte.", "warning");
      return;
    }
    setSupportBusy("internal_note");

    try {
      await adminAuditTrailService.logAction({
        category: "admin_suporte",
        event: "order_internal_note",
        message: internalNote.trim(),
        entityType: "pedido",
        entityId: String(selected.id),
      });
      emitToast("Observacao registrada", "A anotacao interna foi adicionada na auditoria.", "success");
      setInternalNote("");
      const audit = await adminAuditTrailService.listRecent({
        entityType: "pedido",
        entityId: String(selected.id),
        limit: 40,
      });
      setAuditRows(audit);
    } catch (error) {
      emitToast(
        "Falha ao registrar observacao",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel registrar a observacao interna.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function resendOrderNotification(scope: "cliente" | "entregador") {
    if (!selected?.id) return;
    const reason = askCriticalReason(
      scope === "cliente"
        ? `Reenviar notificacao do pedido ${String(selected.id).slice(0, 6)} ao cliente`
        : `Reenviar notificacao do pedido ${String(selected.id).slice(0, 6)} ao entregador`
    );
    if (!reason) return;
    setSupportBusy(`push_${scope}`);

    try {
      await adminSupportService.sendPushTest({
        recipientAuthUserId: scope === "cliente" ? selected.clienteId : undefined,
        recipientRole: scope === "cliente" ? "cliente" : "entregador",
        recipientDelivererId: scope === "entregador" ? selected.entregadorId : undefined,
        title:
          scope === "cliente"
            ? `Atualizacao do pedido #${String(selected.id).slice(0, 6)}`
            : `Pedido #${String(selected.id).slice(0, 6)} em acompanhamento`,
        body:
          scope === "cliente"
            ? `Status atual: ${statusLabel(selected.status)}.`
            : `Confira o pedido #${String(selected.id).slice(0, 6)} no app do entregador.`,
        route:
          scope === "cliente"
            ? `/orders/${selected.id}`
            : `/entregador/pedido/${selected.id}`,
        eventType: scope === "cliente" ? "admin_reenvio_cliente" : "admin_reenvio_entregador",
        channelId: scope === "cliente" ? "cg_cliente_operacao_v5" : "cg_entregador_ofertas_v6",
        dedupeKey: null,
        payload: {
          pedido_id: selected.id,
          status: selected.status,
          origem: "admin_support",
        },
      });

      await adminAuditTrailService.logAction({
        category: "admin_notificacoes",
        event: scope === "cliente" ? "order_push_resent_client" : "order_push_resent_deliverer",
        message: "Push de pedido reenviado manualmente pelo suporte.",
        entityType: "pedido",
        entityId: String(selected.id),
        reason,
        extra: { target: scope },
      });
      emitToast("Push reenviado", "A notificacao foi reenfileirada com sucesso.", "success");
      const queue = await adminSupportService.listOrderNotifications(String(selected.id), 30);
      setNotificationRows(queue);
    } catch (error) {
      emitToast(
        "Falha ao reenviar notificacao",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel reenfileirar este push.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  function copyOrderSummary() {
    if (!selected) return;
    const summaryText = [
      `Pedido #${String(selected.id).slice(0, 6)}`,
      `Cliente: ${safeText(selected.clienteNome) || "Cliente"}`,
      `Telefone: ${safeText(selected.clienteTelefone) || "Nao informado"}`,
      `Status: ${statusLabel(selected.status)}`,
      `Pagamento: ${safeText(selected.formaPagamento) || "-"}`,
      `Total: ${money(Number(selected.total || 0))}`,
      `Endereco: ${buildAddressLabel(selected)}`,
      `Observacao: ${safeText(selected.observacao) || "Sem observacao"}`,
    ].join("\n");

    copyText("Resumo do pedido", summaryText);
  }

  function exportCsv() {
    exportRowsToCsv(
      "admin_pedidos.csv",
      filtered.map((pedido: any) => ({
        pedido_id: pedido.id,
        cliente_nome: safeText(pedido.clienteNome) || "Cliente",
        cliente_telefone: safeText(pedido.clienteTelefone),
        entregador_id: safeText(pedido.entregadorId),
        status: safeText(pedido.status),
        tipo: safeText(pedido.tipo),
        valor_total: Number(pedido.total ?? 0),
        forma_pagamento: safeText(pedido.formaPagamento),
        regiao: orderRegion(pedido),
        created_at: safeText(pedido.createdAt),
        updated_at: safeText(pedido.updatedAt),
      }))
    );
  }

  return (
    <AdminLayout
      title="ADM Pedidos"
      subtitle="Controle central da operacao, status, suporte, notificacoes e correcoes seguras do pedido."
    >
      <div style={syncLine}>
        Sincronizacao: {remoteReady ? "tempo real" : "aguardando conexao"}
        {loadingRemote ? " | sincronizando..." : ""}
      </div>

      <div style={heroGrid}>
        <MetricCard label="Pedidos totais" value={String(summary.total)} />
        <MetricCard label="Em andamento" value={String(summary.andamento)} />
        <MetricCard label="Agendados" value={String(summary.agendados)} />
        <MetricCard label="Sem entregador" value={String(summary.semEntregador)} />
        <MetricCard label="Entregues" value={String(summary.entregues)} />
        <MetricCardDanger label="Cancelados" value={String(summary.cancelados)} />
      </div>

      <div style={toolbarCard}>
        <div style={toolbarTop}>
          <div style={chipRow}>
            {[
              "todos",
              "criado",
              "confirmado",
              "buscando_entregador",
              "preparando",
              "saiu_para_entrega",
              "entregue",
              "cancelado",
            ].map((item) => (
              <button
                key={item}
                onClick={() => setFiltro(item as PedidoFiltro)}
                type="button"
                style={{
                  ...chipBtn,
                  ...(filtro === item ? chipBtnActive : null),
                }}
              >
                {item === "todos" ? "Todos" : statusLabel(item)}
              </button>
            ))}
          </div>

          <button onClick={exportCsv} type="button" style={exportBtn}>
            Exportar CSV
          </button>
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={searchInput}
          placeholder="Buscar por pedido, cliente, telefone, status, cupom, pagamento ou bairro..."
        />
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Fila operacional</div>
            <span style={countPill}>{filtered.length}</span>
          </div>

          {filtered.length === 0 ? (
            <div style={emptyText}>Nenhum pedido encontrado para esse filtro.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {filtered.map((p: any) => {
                const active = String(selected?.id ?? "") === String(p?.id ?? "");

                return (
                  <button
                    key={p.id}
                    onClick={() => selectPedido(String(p.id))}
                    type="button"
                    style={{
                      ...pedidoRowBtn,
                      border: active
                        ? "2px solid rgba(228,79,42,0.24)"
                        : "1px solid rgba(15,23,42,0.06)",
                      boxShadow: active
                        ? "0 12px 26px rgba(228,79,42,0.08)"
                        : "none",
                    }}
                  >
                    <div style={{ minWidth: 0, textAlign: "left" }}>
                      <div style={pedidoTop}>
                        <div style={pedidoTitle}>Pedido #{String(p.id).slice(0, 6)}</div>
                        <span
                          style={{
                            ...statusBadge,
                            ...badgeByStatus(String(p?.status ?? "")),
                          }}
                        >
                          {statusLabel(p.status)}
                        </span>
                      </div>

                      <div style={pedidoMeta}>
                        {safeText(p?.clienteNome) || "Cliente"} | {orderRegion(p)}
                      </div>

                      <div style={pedidoMetaSecondary}>
                        {safeText(p?.tipo) || "imediato"} | {safeText(p?.formaPagamento) || "-"} | Entregador: {safeText(p?.entregadorId) || "Nao atribuido"}
                      </div>
                    </div>

                    <div style={pedidoPrice}>{money(Number(p?.total ?? 0))}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Controle do pedido</div>
            {selected ? <span style={countPill}>#{String(selected.id).slice(0, 6)}</span> : null}
          </div>

          {!selected ? (
            <div style={emptyText}>Selecione um pedido na fila para abrir o detalhe operacional.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
              <div style={detailsGrid}>
                <DetailBox label="Cliente" value={safeText(selected.clienteNome) || "Cliente"} />
                <DetailBox label="Telefone" value={safeText(selected.clienteTelefone) || "Nao informado"} />
                <DetailBox label="Status" value={statusLabel(selected.status)} />
                <DetailBox label="Tipo" value={safeText(selected.tipo) || "imediato"} />
                <DetailBox label="Entregador" value={safeText(selected.entregadorId) || "Nao atribuido"} />
                <DetailBox label="Pagamento" value={safeText(selected.formaPagamento) || "Nao informado"} />
                <DetailBox label="Total" value={money(Number(selected.total ?? 0))} />
                <DetailBox label="Taxa" value={money(Number(selected.taxaEntrega ?? 0))} />
                <DetailBox label="Cupom" value={safeText(selected.cupomCodigo) || "Sem cupom"} />
                <DetailBox label="PIN" value={safeText(selected.deliveryPin) || "Nao gerado"} />
                <DetailBox label="Criado em" value={formatDateTimeBR(selected.createdAt)} />
                <DetailBox label="Atualizado em" value={formatDateTimeBR(selected.updatedAt)} />
              </div>

              <div style={dualGrid}>
                <div style={subCard}>
                  <div style={subTitle}>Acoes de fluxo</div>
                  <div style={actionGrid}>
                    {nextStatusOptions(String(selected.status)).map((next) => (
                      <button
                        key={next}
                        onClick={() => void onStatusChange(next)}
                        type="button"
                        style={secondaryBtn}
                        disabled={supportBusy !== ""}
                      >
                        Alterar para {statusLabel(next)}
                      </button>
                    ))}
                    <button
                      onClick={() => void onStatusChange("entregue")}
                      type="button"
                      style={primaryBtn}
                      disabled={supportBusy !== "" || selected.status === "entregue" || selected.status === "cancelado"}
                    >
                      Finalizar manualmente
                    </button>
                  </div>
                </div>

                <div style={subCard}>
                  <div style={subTitle}>Atribuicao do entregador</div>
                  <div style={formGrid}>
                    <Field label="ID do entregador">
                      <input
                        value={delivererDraft}
                        onChange={(e) => setDelivererDraft(e.target.value)}
                        style={fieldInput}
                        placeholder="Ex.: d_123456"
                      />
                    </Field>
                  </div>
                  <div style={actionGrid}>
                    <button onClick={() => void onAssignDeliverer()} type="button" style={primaryBtn} disabled={supportBusy !== ""}>
                      Salvar entregador
                    </button>
                    <button onClick={() => void onRemoveDeliverer()} type="button" style={secondaryBtn} disabled={supportBusy !== "" || !safeText(selected.entregadorId)}>
                      Remover entregador
                    </button>
                  </div>
                </div>
              </div>

              <div style={dualGrid}>
                <div style={subCard}>
                  <div style={subTitle}>Endereco e mapa</div>
                  <div style={formGridTwo}>
                    <Field label="Endereco ID">
                      <input
                        value={addressForm.enderecoId}
                        onChange={(e) => setAddressForm((current) => ({ ...current, enderecoId: e.target.value }))}
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Rua">
                      <input
                        value={addressForm.street}
                        onChange={(e) => setAddressForm((current) => ({ ...current, street: e.target.value }))}
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Numero">
                      <input
                        value={addressForm.number}
                        onChange={(e) => setAddressForm((current) => ({ ...current, number: e.target.value }))}
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Bairro">
                      <input
                        value={addressForm.neighborhood}
                        onChange={(e) => setAddressForm((current) => ({ ...current, neighborhood: e.target.value }))}
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Cidade">
                      <input
                        value={addressForm.city}
                        onChange={(e) => setAddressForm((current) => ({ ...current, city: e.target.value }))}
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Complemento">
                      <input
                        value={addressForm.complement}
                        onChange={(e) => setAddressForm((current) => ({ ...current, complement: e.target.value }))}
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Referencia">
                      <input
                        value={addressForm.reference}
                        onChange={(e) => setAddressForm((current) => ({ ...current, reference: e.target.value }))}
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Latitude">
                      <input
                        value={addressForm.lat}
                        onChange={(e) => setAddressForm((current) => ({ ...current, lat: e.target.value }))}
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Longitude">
                      <input
                        value={addressForm.lng}
                        onChange={(e) => setAddressForm((current) => ({ ...current, lng: e.target.value }))}
                        style={fieldInput}
                      />
                    </Field>
                  </div>
                  <div style={actionGrid}>
                    <button onClick={() => void saveAddressAndObservation()} type="button" style={primaryBtn} disabled={supportBusy !== ""}>
                      Salvar endereco e observacao
                    </button>
                    <button onClick={() => window.open(buildMapsUrl(selected), "_blank", "noopener,noreferrer")} type="button" style={secondaryBtn}>
                      Abrir Maps
                    </button>
                    <button onClick={() => window.open(buildWazeUrl(selected), "_blank", "noopener,noreferrer")} type="button" style={secondaryBtn}>
                      Abrir Waze
                    </button>
                  </div>
                </div>

                <div style={subCard}>
                  <div style={subTitle}>Observacoes e suporte</div>
                  <div style={formGrid}>
                    <Field label="Observacao visivel no pedido">
                      <textarea
                        value={customerObs}
                        onChange={(e) => setCustomerObs(e.target.value)}
                        style={fieldTextArea}
                      />
                    </Field>
                    <Field label="Observacao interna do suporte">
                      <textarea
                        value={internalNote}
                        onChange={(e) => setInternalNote(e.target.value)}
                        style={fieldTextArea}
                        placeholder="Ex.: contato com cliente, ajuste de rota, validacao com entregador, reenvio de push..."
                      />
                    </Field>
                  </div>
                  <div style={actionGrid}>
                    <button onClick={() => void registerInternalNote()} type="button" style={secondaryBtn} disabled={supportBusy !== ""}>
                      Registrar observacao interna
                    </button>
                    <button onClick={copyOrderSummary} type="button" style={primaryBtn}>
                      Copiar resumo para WhatsApp
                    </button>
                  </div>
                </div>
              </div>

              <div style={dualGrid}>
                <div style={subCardDanger}>
                  <div style={subTitle}>Cancelamento e reabertura</div>
                  <div style={formGrid}>
                    <Field label="Motivo do cancelamento">
                      <input
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Observacao do cancelamento">
                      <textarea
                        value={cancelObs}
                        onChange={(e) => setCancelObs(e.target.value)}
                        style={fieldTextArea}
                      />
                    </Field>
                    <Field label="Status ao reabrir">
                      <select
                        value={reopenStatus}
                        onChange={(e) => setReopenStatus(e.target.value as StatusPedido)}
                        style={fieldInput}
                      >
                        <option value="confirmado">Confirmado</option>
                        <option value="buscando_entregador">Buscando entregador</option>
                        <option value="preparando">Preparando</option>
                      </select>
                    </Field>
                  </div>
                  <div style={actionGrid}>
                    <button onClick={() => void onCancelByAdmin()} type="button" style={dangerBtn} disabled={supportBusy !== "" || selected.status === "cancelado" || selected.status === "entregue"}>
                      Cancelar pedido
                    </button>
                    <button onClick={() => void onReopenOrder()} type="button" style={secondaryBtn} disabled={supportBusy !== "" || selected.status !== "cancelado"}>
                      Reabrir pedido
                    </button>
                  </div>
                </div>

                <div style={subCard}>
                  <div style={subTitle}>Notificacoes do pedido</div>
                  <div style={actionGrid}>
                    <button onClick={() => void resendOrderNotification("cliente")} type="button" style={primaryBtn} disabled={supportBusy !== "" || !selected.clienteId}>
                      Reenviar push ao cliente
                    </button>
                    <button onClick={() => void resendOrderNotification("entregador")} type="button" style={secondaryBtn} disabled={supportBusy !== "" || !safeText(selected.entregadorId)}>
                      Reenviar push ao entregador
                    </button>
                  </div>
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {notificationRows.length === 0 ? (
                      <div style={emptyTextSmall}>Nenhuma notificacao registrada na fila para este pedido.</div>
                    ) : (
                      notificationRows.slice(0, 8).map((row) => (
                        <div key={row.id} style={notificationRow}>
                          <div style={{ minWidth: 0 }}>
                            <div style={notificationTitle}>{safeText(row.event_type) || "evento"}</div>
                            <div style={notificationMeta}>
                              {safeText(row.recipient_role) || safeText(row.recipient_scope)} | {safeText(row.status) || "pending"}
                            </div>
                            <div style={notificationMeta}>{formatDateTimeBR(row.created_at)}</div>
                          </div>
                          <div style={notificationTag}>{safeText(row.channel_id) || "cg_operacao"}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div style={dualGrid}>
                <div style={subCard}>
                  <div style={subTitle}>Itens e historico</div>
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {(Array.isArray(selected.itens) ? selected.itens : []).map((item: any, index: number) => (
                      <div key={`${item.produtoId}_${index}`} style={itemRow}>
                        <div>
                          <div style={itemTitle}>{item.quantidade}x {item.nome}</div>
                          <div style={itemMeta}>{safeText(item.categoria) || "Produto"} | {safeText(item.unidade) || "un"}</div>
                        </div>
                        <div style={itemValue}>
                          {money(Number(item.precoUnitario || 0) * Number(item.quantidade || 0))}
                        </div>
                      </div>
                    ))}
                    <div style={timelineWrap}>
                      {(Array.isArray(selected.historico) ? selected.historico : []).map((item: any, index: number) => (
                        <div key={`${item.status}_${item.data}_${index}`} style={timelineRow}>
                          <div style={timelineBadge}>{statusLabel(item.status)}</div>
                          <div style={timelineMeta}>{formatDateTimeBR(item.data)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={subCardDark}>
                  <div style={subTitleDark}>Auditoria recente</div>
                  {auditRows.length === 0 ? (
                    <div style={emptyTextOnDark}>Ainda nao ha acoes auditadas para este pedido.</div>
                  ) : (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      {auditRows.slice(0, 8).map((row) => (
                        <div key={row.id} style={auditRow}>
                          <div style={auditTitle}>{row.event}</div>
                          <div style={auditMeta}>{formatDateTimeBR(row.created_at)} | {row.category}</div>
                          <div style={auditMessage}>{safeText(row.message) || "Acao administrativa registrada."}</div>
                          {safeText((row.details ?? {}).reason) ? (
                            <div style={auditReason}>Motivo: {safeText((row.details ?? {}).reason)}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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

function MetricCardDanger(props: { label: string; value: string }) {
  return (
    <div style={metricDangerCard}>
      <div style={metricLabelLight}>{props.label}</div>
      <div style={metricValueLight}>{props.value}</div>
    </div>
  );
}

function DetailBox(props: { label: string; value: string }) {
  return (
    <div style={detailBox}>
      <div style={detailLabel}>{props.label}</div>
      <div style={detailValue}>{props.value}</div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{props.label}</span>
      {props.children}
    </label>
  );
}

const syncLine: CSSProperties = {
  marginBottom: 14,
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 10,
};

const metricCard: CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  borderRadius: 22,
  padding: 14,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const metricDangerCard: CSSProperties = {
  background: "linear-gradient(135deg,#7F1D1D 0%, #991B1B 55%, #B91C1C 100%)",
  borderRadius: 22,
  padding: 14,
  color: "#fff",
  boxShadow: "0 16px 30px rgba(127,29,29,0.18)",
};

const metricLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const metricValue: CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 950,
  color: "#111827",
};

const metricLabelLight: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(255,255,255,0.82)",
};

const metricValueLight: CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 950,
  color: "#fff",
};

const toolbarCard: CSSProperties = {
  marginTop: 14,
  background: "#fff",
  borderRadius: 22,
  padding: 14,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.05)",
};

const chipRow: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const toolbarTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const chipBtn: CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: 999,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#F8FAFC",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const chipBtnActive: CSSProperties = {
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  border: "1px solid rgba(228,79,42,0.18)",
  boxShadow: "0 12px 24px rgba(228,79,42,0.12)",
};

const exportBtn: CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const searchInput: CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  padding: "0 14px",
  boxSizing: "border-box",
  fontSize: 14,
  background: "#F8FAFC",
  color: "#111827",
};

const contentGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "minmax(320px, 0.95fr) minmax(0, 1.45fr)",
  gap: 14,
};

const sectionCard: CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 16px 34px rgba(15,23,42,0.05)",
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

const countPill: CSSProperties = {
  minWidth: 42,
  height: 34,
  padding: "0 12px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(228,79,42,0.10)",
  color: "#C2410C",
  fontWeight: 900,
};

const emptyText: CSSProperties = {
  marginTop: 14,
  fontSize: 13.5,
  color: "#64748B",
  lineHeight: 1.6,
};

const emptyTextSmall: CSSProperties = {
  fontSize: 13,
  color: "#64748B",
};

const pedidoRowBtn: CSSProperties = {
  width: "100%",
  textAlign: "left",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  padding: 14,
  borderRadius: 18,
  background: "#fff",
  cursor: "pointer",
};

const pedidoTop: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const pedidoTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const statusBadge: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
};

const pedidoMeta: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#64748B",
};

const pedidoMetaSecondary: CSSProperties = {
  marginTop: 6,
  fontSize: 12.5,
  color: "#94A3B8",
};

const pedidoPrice: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
  whiteSpace: "nowrap",
};

const detailsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const detailBox: CSSProperties = {
  borderRadius: 16,
  padding: 12,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const detailLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
};

const detailValue: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  fontWeight: 900,
  color: "#111827",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const dualGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const subCard: CSSProperties = {
  borderRadius: 20,
  padding: 14,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const subCardDanger: CSSProperties = {
  borderRadius: 20,
  padding: 14,
  background: "rgba(185,28,28,0.04)",
  border: "1px solid rgba(185,28,28,0.12)",
};

const subCardDark: CSSProperties = {
  background: "linear-gradient(135deg,#111827 0%, #1F2937 100%)",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.06)",
  boxShadow: "0 18px 36px rgba(15,23,42,0.18)",
};

const subTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const subTitleDark: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#fff",
};

const formGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 10,
};

const formGridTwo: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const fieldWrap: CSSProperties = {
  display: "grid",
  gap: 8,
};

const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const fieldInput: CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "#fff",
  padding: "0 14px",
  fontWeight: 800,
  color: "#111827",
  outline: "none",
  boxSizing: "border-box",
};

const fieldTextArea: CSSProperties = {
  width: "100%",
  minHeight: 92,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "#fff",
  padding: 12,
  fontWeight: 700,
  color: "#111827",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
};

const actionGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const primaryBtn: CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  padding: "0 16px",
};

const secondaryBtn: CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "#fff",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
  padding: "0 16px",
};

const dangerBtn: CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#B91C1C,#EF4444)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  padding: "0 16px",
};

const itemRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  borderRadius: 16,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.06)",
  alignItems: "center",
};

const itemTitle: CSSProperties = {
  fontWeight: 900,
  color: "#111827",
};

const itemMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
};

const itemValue: CSSProperties = {
  fontWeight: 950,
  color: "#111827",
};

const timelineWrap: CSSProperties = {
  marginTop: 4,
  display: "grid",
  gap: 8,
};

const timelineRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 10,
  borderRadius: 14,
  background: "rgba(15,23,42,0.04)",
};

const timelineBadge: CSSProperties = {
  fontWeight: 900,
  color: "#111827",
};

const timelineMeta: CSSProperties = {
  fontSize: 12.5,
  color: "#64748B",
};

const notificationRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.06)",
};

const notificationTitle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 900,
  color: "#111827",
};

const notificationMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748B",
};

const notificationTag: CSSProperties = {
  minWidth: 80,
  height: 28,
  padding: "0 10px",
  borderRadius: 999,
  background: "rgba(228,79,42,0.10)",
  color: "#C2410C",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  fontSize: 11.5,
};

const emptyTextOnDark: CSSProperties = {
  fontSize: 13.5,
  color: "rgba(255,255,255,0.72)",
};

const auditRow: CSSProperties = {
  borderRadius: 16,
  padding: 12,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const auditTitle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 950,
  color: "#fff",
};

const auditMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "rgba(255,255,255,0.68)",
};

const auditMessage: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  lineHeight: 1.55,
  color: "rgba(255,255,255,0.82)",
};

const auditReason: CSSProperties = {
  marginTop: 8,
  fontSize: 12.5,
  fontWeight: 800,
  color: "#FCD34D",
};
