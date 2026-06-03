import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../layouts/AdminLayout";
import { usePedidoStore } from "../../store/usePedidoStore";
import { useRemoteSyncStore } from "../../store/useRemoteSyncStore";
import { exportRowsToCsv } from "../../services/csvExportService";
import { financeService } from "../../services/financeService";
import { delivererAdminService } from "../../services/delivererAdminService";
import {
  adminSupportService,
  type AdminDelivererDirectoryRow,
} from "../../services/adminSupportService";
import {
  adminAuditTrailService,
  type AdminAuditLogRow,
} from "../../services/adminAuditTrailService";
import { delivererAccessService } from "../../services/delivererAccessService";
import { emitToast } from "../../services/realtimeBus";
import { money, safeText, statusLabel } from "../../utils/delivererHelpers";

type DelivererFilter =
  | "todos"
  | "pendentes"
  | "aprovados"
  | "reprovados"
  | "online"
  | "bloqueados"
  | "com_pedido";

type DelivererRow = AdminDelivererDirectoryRow & {
  activeOrders: any[];
  deliveredOrders: number;
  canceledOrders: number;
  totalOrders: number;
  currentOrder: any | null;
  financial: ReturnType<typeof financeService.getDelivererState>;
  blockedFinal: boolean;
};

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatPhoneBR(raw: string) {
  const digits = onlyDigits(raw);
  if (!digits) return "Nao informado";
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function formatDateBR(raw: string | null | undefined) {
  if (!raw) return "Nao informado";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "Nao informado";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTimeBR(raw: string | null | undefined) {
  if (!raw) return "Nao informado";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "Nao informado";
  return date.toLocaleString("pt-BR");
}

function buildDelivererKey(row: AdminDelivererDirectoryRow) {
  return safeText(row.delivererId) || safeText(row.authUserId);
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

function buildVehicleSummary(row: AdminDelivererDirectoryRow) {
  const parts = [
    safeText(row.vehicleType),
    safeText(row.vehicleBrand),
    safeText(row.vehicleModel),
    safeText(row.plate),
  ].filter(Boolean);
  return parts.join(" | ") || "Nao informado";
}

function humanizeApplicationStatus(status: AdminDelivererDirectoryRow["status"]) {
  if (status === "approved") return "Aprovado";
  if (status === "rejected") return "Ajuste solicitado";
  return "Pendente";
}

export default function AdminEntregadores() {
  const pedidos = usePedidoStore((s) => s.pedidos);
  const adminVersion = useRemoteSyncStore((s) => s.adminVersion);
  const financeVersion = useRemoteSyncStore((s) => s.financeVersion);

  const [refreshKey, setRefreshKey] = useState(0);
  const [filtro, setFiltro] = useState<DelivererFilter>("todos");
  const [busca, setBusca] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [deliverers, setDeliverers] = useState<AdminDelivererDirectoryRow[]>([]);
  const [auditRows, setAuditRows] = useState<AdminAuditLogRow[]>([]);
  const [supportBusy, setSupportBusy] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [personalForm, setPersonalForm] = useState({
    nome: "",
    whatsapp: "",
    cpf: "",
    rg: "",
    nascimento: "",
    email: "",
    address: "",
  });
  const [vehicleForm, setVehicleForm] = useState({
    vehicleType: "",
    vehicleBrand: "",
    vehicleModel: "",
    plate: "",
    renavam: "",
    pixInfo: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    valor: "",
    observacao: "",
  });

  useEffect(() => {
    let active = true;

    async function loadDeliverers() {
      setDirectoryLoading(true);
      setDirectoryError("");

      try {
        const rows = await adminSupportService.listDeliverers();
        if (!active) return;
        setDeliverers(rows);
      } catch (error) {
        if (!active) return;
        setDirectoryError(
          error instanceof Error && error.message
            ? error.message
            : "Nao foi possivel carregar a base de entregadores."
        );
      } finally {
        if (active) {
          setDirectoryLoading(false);
        }
      }
    }

    void loadDeliverers();

    return () => {
      active = false;
    };
  }, [adminVersion, refreshKey]);

  const financeSummary = useMemo(
    () => financeService.getGlobalSummary(pedidos),
    [financeVersion, pedidos]
  );

  const financialById = useMemo(
    () =>
      new Map(
        financeSummary.states.map((state) => [safeText(state.entregadorId), state] as const)
      ),
    [financeSummary.states]
  );

  const delivererRows = useMemo<DelivererRow[]>(() => {
    const base = Array.isArray(pedidos) ? pedidos : [];

    return [...deliverers]
      .map((row) => {
        const key = safeText(row.delivererId);
        const linkedOrders = key
          ? base.filter((pedido: any) => safeText(pedido.entregadorId) === key)
          : [];
        const activeOrders = linkedOrders.filter(
          (pedido: any) =>
            pedido?.status !== "entregue" && pedido?.status !== "cancelado"
        );
        const financial =
          financialById.get(key) ?? financeService.getDelivererState(key);

        return {
          ...row,
          activeOrders,
          deliveredOrders: linkedOrders.filter((pedido: any) => pedido?.status === "entregue").length,
          canceledOrders: linkedOrders.filter((pedido: any) => pedido?.status === "cancelado").length,
          totalOrders: linkedOrders.length,
          currentOrder:
            [...activeOrders].sort(
              (a: any, b: any) =>
                new Date(b?.updatedAt ?? b?.createdAt ?? 0).getTime() -
                new Date(a?.updatedAt ?? a?.createdAt ?? 0).getTime()
            )[0] ?? null,
          financial,
          blockedFinal: Boolean(financial.bloqueado || row.manualBlocked),
        };
      })
      .sort((a, b) => {
        const aPending = a.status === "pending" ? 0 : a.status === "rejected" ? 1 : 2;
        const bPending = b.status === "pending" ? 0 : b.status === "rejected" ? 1 : 2;
        if (aPending !== bPending) return aPending - bPending;
        return (
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
        );
      });
  }, [deliverers, financialById, pedidos]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return delivererRows.filter((row) => {
      if (filtro === "pendentes" && row.status !== "pending") return false;
      if (filtro === "aprovados" && row.status !== "approved") return false;
      if (filtro === "reprovados" && row.status !== "rejected") return false;
      if (filtro === "online" && !row.online) return false;
      if (filtro === "bloqueados" && !row.blockedFinal) return false;
      if (filtro === "com_pedido" && row.activeOrders.length <= 0) return false;

      if (!q) return true;

      const haystack = [
        row.name,
        row.phone,
        row.email,
        row.cpf,
        row.rg,
        row.delivererId,
        row.address,
        row.vehicleBrand,
        row.vehicleModel,
        row.plate,
        row.renavam,
      ]
        .map((value) => String(value ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [busca, delivererRows, filtro]);

  const selected = useMemo(() => {
    return (
      filtered.find((row) => buildDelivererKey(row) === selectedKey) ??
      filtered[0] ??
      null
    );
  }, [filtered, selectedKey]);

  const summary = useMemo(() => {
    return {
      total: delivererRows.length,
      pendentes: delivererRows.filter((row) => row.status === "pending").length,
      online: delivererRows.filter((row) => row.online).length,
      bloqueados: delivererRows.filter((row) => row.blockedFinal).length,
      ativos: delivererRows.filter((row) => row.activeOrders.length > 0).length,
      saldoAberto: financeSummary.saldoEmAberto,
    };
  }, [delivererRows, financeSummary.saldoEmAberto]);

  useEffect(() => {
    if (!selected) {
      setReviewNote("");
      setNotesInput("");
      setAuditRows([]);
      return;
    }

    setReviewNote(selected.adminNotes ?? "");
    setNotesInput(selected.adminNotes ?? "");
    setPersonalForm({
      nome: selected.name,
      whatsapp: selected.phone,
      cpf: selected.cpf,
      rg: selected.rg,
      nascimento: selected.birthDate,
      email: selected.email,
      address: selected.address,
    });
    setVehicleForm({
      vehicleType: selected.vehicleType,
      vehicleBrand: selected.vehicleBrand,
      vehicleModel: selected.vehicleModel,
      plate: selected.plate,
      renavam: selected.renavam,
      pixInfo: selected.profile.pixInfo ?? "",
    });
    setPaymentForm({
      valor: "",
      observacao: "",
    });

    let active = true;
    void adminAuditTrailService
      .listRecent({
        entityType: "entregador",
        entityId: selected.authUserId,
        limit: 40,
      })
      .then((rows) => {
        if (active) setAuditRows(rows);
      })
      .catch(() => {
        if (active) setAuditRows([]);
      });

    return () => {
      active = false;
    };
  }, [selected]);

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  function selectDeliverer(key: string) {
    setSelectedKey(key);
  }

  async function approveSelected() {
    if (!selected?.authUserId) return;
    setSupportBusy("approve");

    try {
      const approved = await delivererAccessService.approve(
        selected.authUserId,
        reviewNote || notesInput || "Cadastro aprovado pelo ADM."
      );
      await adminAuditTrailService.logAction({
        category: "admin_entregadores",
        event: "deliverer_approved",
        message: "Cadastro de entregador aprovado pelo painel.",
        entityType: "entregador",
        entityId: selected.authUserId,
        reason: reviewNote || null,
        before: { status: selected.status },
        after: { status: approved?.status ?? "approved", delivererId: approved?.delivererId ?? selected.delivererId },
      });
      emitToast("Entregador aprovado", "O cadastro foi liberado com sucesso.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha na aprovacao",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel aprovar este cadastro agora.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function rejectSelected() {
    if (!selected?.authUserId) return;
    const reason = reviewNote.trim() || "Ajuste os dados e envie novamente.";
    setSupportBusy("reject");

    try {
      const rejected = await delivererAccessService.reject(selected.authUserId, reason);
      await adminAuditTrailService.logAction({
        category: "admin_entregadores",
        event: "deliverer_rejected",
        message: "Cadastro de entregador devolvido para ajuste.",
        entityType: "entregador",
        entityId: selected.authUserId,
        reason,
        before: { status: selected.status },
        after: { status: rejected?.status ?? "rejected" },
      });
      emitToast("Ajuste solicitado", "O entregador recebeu a devolucao do cadastro.", "warning");
      refresh();
    } catch (error) {
      emitToast(
        "Falha no parecer",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel devolver este cadastro.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function saveCadastro() {
    if (!selected?.authUserId) return;
    const reason = askCriticalReason(`Salvar cadastro de ${selected.name}`);
    if (!reason) return;
    setSupportBusy("save_profile");

    try {
      const before = {
        name: selected.name,
        phone: selected.phone,
        cpf: selected.cpf,
        rg: selected.rg,
        birthDate: selected.birthDate,
        email: selected.email,
        address: selected.address,
      };

      await adminSupportService.updateDelivererApplication(selected.authUserId, {
        full_name: personalForm.nome.trim(),
        whatsapp: personalForm.whatsapp.trim(),
        cpf: personalForm.cpf.trim(),
        rg: personalForm.rg.trim(),
        birth_date: personalForm.nascimento.trim(),
        address: personalForm.address.trim(),
        email: personalForm.email.trim(),
      });

      await adminSupportService.updateDelivererProfileDoc(selected.authUserId, {
        nome: personalForm.nome.trim(),
        telefone: personalForm.whatsapp.trim(),
      });

      if (
        personalForm.email.trim() &&
        personalForm.email.trim().toLowerCase() !== selected.email.toLowerCase()
      ) {
        await adminSupportService.updateDelivererEmail(
          selected.authUserId,
          personalForm.email.trim()
        );
      }

      await adminAuditTrailService.logAction({
        category: "admin_entregadores",
        event: "deliverer_profile_updated",
        message: "Cadastro do entregador ajustado pelo suporte.",
        entityType: "entregador",
        entityId: selected.authUserId,
        reason,
        before,
        after: { ...before, ...personalForm },
      });

      emitToast("Cadastro atualizado", "Os dados do entregador foram salvos.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao salvar",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel salvar os dados do entregador.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function saveVeiculoPix() {
    if (!selected?.authUserId) return;
    const reason = askCriticalReason(`Salvar veiculo e PIX de ${selected.name}`);
    if (!reason) return;
    setSupportBusy("save_vehicle");

    try {
      const before = {
        vehicleType: selected.vehicleType,
        vehicleBrand: selected.vehicleBrand,
        vehicleModel: selected.vehicleModel,
        plate: selected.plate,
        renavam: selected.renavam,
        pixInfo: selected.profile.pixInfo,
      };

      await adminSupportService.updateDelivererApplication(selected.authUserId, {
        vehicle_type: vehicleForm.vehicleType.trim(),
        vehicle_brand: vehicleForm.vehicleBrand.trim(),
        vehicle_model: vehicleForm.vehicleModel.trim(),
        plate: vehicleForm.plate.trim().toUpperCase(),
        renavam: vehicleForm.renavam.trim(),
      });

      await adminSupportService.updateDelivererProfileDoc(selected.authUserId, {
        veiculo: [vehicleForm.vehicleBrand, vehicleForm.vehicleModel].filter(Boolean).join(" ").trim(),
        placa: vehicleForm.plate.trim().toUpperCase(),
        pixInfo: vehicleForm.pixInfo.trim(),
      });

      await adminAuditTrailService.logAction({
        category: "admin_entregadores",
        event: "deliverer_vehicle_updated",
        message: "Veiculo e dados PIX do entregador atualizados.",
        entityType: "entregador",
        entityId: selected.authUserId,
        reason,
        before,
        after: {
          vehicleType: vehicleForm.vehicleType,
          vehicleBrand: vehicleForm.vehicleBrand,
          vehicleModel: vehicleForm.vehicleModel,
          plate: vehicleForm.plate,
          renavam: vehicleForm.renavam,
          pixInfo: vehicleForm.pixInfo,
        },
      });

      emitToast("Veiculo atualizado", "Veiculo e PIX salvos com sucesso.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao salvar",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel salvar veiculo e PIX.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function saveNotes() {
    if (!selected?.authUserId) return;
    setSupportBusy("save_notes");

    try {
      await adminSupportService.updateDelivererApplication(selected.authUserId, {
        admin_notes: notesInput.trim() || null,
      });
      await adminAuditTrailService.logAction({
        category: "admin_entregadores",
        event: "deliverer_note_updated",
        message: "Observacao interna do entregador atualizada.",
        entityType: "entregador",
        entityId: selected.authUserId,
        before: { adminNotes: selected.adminNotes ?? null },
        after: { adminNotes: notesInput.trim() || null },
      });
      emitToast("Observacao salva", "A observacao interna foi atualizada.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao salvar observacao",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel salvar a observacao.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function toggleManualBlock(nextBlocked: boolean) {
    if (!selected?.delivererId) return;
    const reason = askCriticalReason(
      nextBlocked ? `Bloquear ${selected.name}` : `Desbloquear ${selected.name}`
    );
    if (!reason) return;
    setSupportBusy(nextBlocked ? "block" : "unblock");

    try {
      if (nextBlocked) {
        delivererAdminService.setManualBlock(selected.delivererId, reason);
      } else {
        delivererAdminService.clearManualBlock(selected.delivererId);
      }
      await adminAuditTrailService.logAction({
        category: "admin_entregadores",
        event: nextBlocked ? "deliverer_blocked" : "deliverer_unblocked",
        message: nextBlocked
          ? "Bloqueio manual aplicado ao entregador."
          : "Bloqueio manual removido do entregador.",
        entityType: "entregador",
        entityId: selected.authUserId,
        reason,
        before: { manualBlocked: selected.manualBlocked, manualBlockReason: selected.manualBlockReason },
        after: { manualBlocked: nextBlocked, manualBlockReason: nextBlocked ? reason : null },
      });
      emitToast(
        nextBlocked ? "Entregador bloqueado" : "Bloqueio removido",
        nextBlocked
          ? "O bloqueio manual foi aplicado."
          : "O bloqueio manual foi removido.",
        nextBlocked ? "warning" : "success"
      );
      refresh();
    } finally {
      setSupportBusy("");
    }
  }

  async function forceOffline() {
    if (!selected?.delivererId) return;
    const reason = askCriticalReason(`Forcar ${selected.name} offline`);
    if (!reason) return;
    setSupportBusy("offline");

    try {
      await adminSupportService.forceDelivererOffline(selected.delivererId);
      await adminAuditTrailService.logAction({
        category: "admin_entregadores",
        event: "deliverer_forced_offline",
        message: "Entregador colocado offline pelo suporte.",
        entityType: "entregador",
        entityId: selected.authUserId,
        reason,
        before: { online: selected.online },
        after: { online: false },
      });
      emitToast("Offline aplicado", "O entregador foi marcado como offline.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao forcar offline",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel atualizar o status online.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function resetPassword() {
    if (!selected?.authUserId) return;
    const nextPassword = window.prompt(
      "Informe a senha temporaria do entregador:",
      "1234"
    );
    if (!nextPassword || nextPassword.trim().length < 4) {
      emitToast("Senha invalida", "A senha temporaria precisa ter ao menos 4 digitos.", "warning");
      return;
    }
    const reason = askCriticalReason(`Redefinir senha de ${selected.name}`);
    if (!reason) return;
    setSupportBusy("reset_password");

    try {
      await adminSupportService.resetDelivererPassword(
        selected.authUserId,
        nextPassword.trim()
      );
      await adminAuditTrailService.logAction({
        category: "admin_entregadores",
        event: "deliverer_password_reset",
        message: "Senha temporaria do entregador redefinida pelo suporte.",
        entityType: "entregador",
        entityId: selected.authUserId,
        reason,
      });
      emitToast("Senha redefinida", "A senha temporaria foi atualizada.", "success");
    } catch (error) {
      emitToast(
        "Falha ao redefinir senha",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel redefinir a senha.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function registerPayment(full = false) {
    if (!selected?.delivererId) return;
    const rawValue = full ? String(selected.financial.saldoDevedor || 0) : paymentForm.valor;
    const value = Math.abs(Number(rawValue || 0));
    if (!Number.isFinite(value) || value <= 0) {
      emitToast("Valor invalido", "Informe um valor valido para o pagamento.", "warning");
      return;
    }
    const saldoAtual = Number(selected.financial.saldoDevedor || 0);
    if (!full && saldoAtual > 0 && value > saldoAtual) {
      emitToast(
        "Pagamento acima do saldo",
        `O saldo pendente atual e ${money(saldoAtual)}. Informe um valor menor ou use a quitacao total.`,
        "warning"
      );
      return;
    }
    const reason = askCriticalReason(
      full ? `Quitar saldo de ${selected.name}` : `Registrar pagamento de ${selected.name}`
    );
    if (!reason) return;
    setSupportBusy(full ? "settle_all" : "register_payment");

    try {
      financeService.registerPagamento(
        selected.delivererId,
        value,
        paymentForm.observacao.trim() || reason
      );
      await adminAuditTrailService.logAction({
        category: "admin_entregadores",
        event: "deliverer_payment_registered",
        message: "Pagamento/comissao registrada pelo painel.",
        entityType: "entregador",
        entityId: selected.authUserId,
        reason,
        before: { saldoDevedor: selected.financial.saldoDevedor },
        after: { pagamento: value },
      });
      emitToast("Pagamento registrado", "O repasse foi lancado no financeiro.", "success");
      setPaymentForm({ valor: "", observacao: "" });
      refresh();
    } finally {
      setSupportBusy("");
    }
  }

  function exportCsv() {
    exportRowsToCsv(
      "admin_entregadores.csv",
      filtered.map((row) => ({
        auth_user_id: row.authUserId,
        entregador_id: row.delivererId,
        nome: row.name,
        telefone: row.phone,
        cpf: row.cpf,
        email: row.email,
        status_cadastro: row.status,
        online: row.online ? "sim" : "nao",
        bloqueado: row.blockedFinal ? "sim" : "nao",
        pedidos_ativos: row.activeOrders.length,
        entregues: row.deliveredOrders,
        cancelados: row.canceledOrders,
        comissao_pendente: row.financial.saldoDevedor,
        pix: row.profile.pixInfo,
      }))
    );
  }

  return (
    <AdminLayout
      title="ADM Entregadores"
      subtitle="Cadastro, aprovacao, status online, operacao, documentos e financeiro em um unico fluxo."
    >
      <div style={heroGrid}>
        <MetricCard label="Entregadores" value={String(summary.total)} />
        <MetricCard label="Pendentes" value={String(summary.pendentes)} />
        <MetricCard label="Online" value={String(summary.online)} />
        <MetricCardDanger label="Bloqueados" value={String(summary.bloqueados)} />
        <MetricCard label="Com pedido ativo" value={String(summary.ativos)} />
        <MetricCard label="Saldo em aberto" value={money(summary.saldoAberto)} />
      </div>

      <div style={toolbarCard}>
        <div style={chipRow}>
          {[
            ["todos", "Todos"],
            ["pendentes", "Pendentes"],
            ["aprovados", "Aprovados"],
            ["reprovados", "Ajuste"],
            ["online", "Online"],
            ["bloqueados", "Bloqueados"],
            ["com_pedido", "Com pedido"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFiltro(value as DelivererFilter)}
              type="button"
              style={{ ...chipBtn, ...(filtro === value ? chipBtnActive : null) }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={toolbarBottom}>
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            style={searchInput}
            placeholder="Buscar por nome, telefone, CPF, placa, veiculo ou ID..."
          />
          <button onClick={exportCsv} type="button" style={exportBtn}>
            Exportar CSV
          </button>
        </div>
      </div>

      {directoryError ? <div style={errorBox}>{directoryError}</div> : null}

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Base operacional</div>
            <span style={countPill}>{directoryLoading ? "..." : String(filtered.length)}</span>
          </div>

          {directoryLoading ? (
            <div style={emptyText}>Carregando entregadores reais do sistema...</div>
          ) : filtered.length === 0 ? (
            <div style={emptyText}>Nenhum entregador encontrado para esse filtro.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {filtered.map((row) => (
                <button
                  key={buildDelivererKey(row)}
                  onClick={() => selectDeliverer(buildDelivererKey(row))}
                  type="button"
                  style={{
                    ...rowBtn,
                    border:
                      buildDelivererKey(selected as DelivererRow) === buildDelivererKey(row)
                        ? "2px solid rgba(228,79,42,0.24)"
                        : "1px solid rgba(15,23,42,0.06)",
                    boxShadow:
                      buildDelivererKey(selected as DelivererRow) === buildDelivererKey(row)
                        ? "0 12px 26px rgba(228,79,42,0.08)"
                        : "none",
                  }}
                >
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={rowTitle}>{row.name}</div>
                    <div style={rowMeta}>
                      {formatPhoneBR(row.phone)} | {humanizeApplicationStatus(row.status)}
                    </div>
                    <div style={rowMetaSecondary}>
                      {row.delivererId || "Sem ID operacional"} | {buildVehicleSummary(row)}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        ...statusPill,
                        background: row.blockedFinal
                          ? "rgba(185,28,28,0.10)"
                          : row.online
                          ? "rgba(16,185,129,0.10)"
                          : "rgba(100,116,139,0.10)",
                        color: row.blockedFinal ? "#B91C1C" : row.online ? "#166534" : "#475569",
                        border: row.blockedFinal
                          ? "1px solid rgba(185,28,28,0.18)"
                          : row.online
                          ? "1px solid rgba(22,163,74,0.18)"
                          : "1px solid rgba(100,116,139,0.18)",
                      }}
                    >
                      {row.blockedFinal ? "Bloqueado" : row.online ? "Online" : "Offline"}
                    </div>
                    <div style={rowMetaSecondary}>
                      {row.activeOrders.length} ativo(s) | {money(row.financial.saldoDevedor)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Controle do entregador</div>
            {selected ? <span style={countPill}>{selected.delivererId || "sem ID"}</span> : null}
          </div>

          {!selected ? (
            <div style={emptyText}>Selecione um entregador da lista para abrir a ficha completa.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
              <div style={detailsGrid}>
                <DetailBox label="Nome" value={selected.name} />
                <DetailBox label="Telefone" value={formatPhoneBR(selected.phone)} />
                <DetailBox label="Status cadastro" value={humanizeApplicationStatus(selected.status)} />
                <DetailBox label="Status online" value={selected.online ? "Online" : "Offline"} />
                <DetailBox label="ID operacional" value={selected.delivererId || "Nao gerado"} />
                <DetailBox label="Ultima presenca" value={formatDateTimeBR(selected.lastSeenAt)} />
                <DetailBox label="CPF / RG" value={`${selected.cpf || "Nao informado"} | ${selected.rg || "Nao informado"}`} />
                <DetailBox label="Nascimento" value={formatDateBR(selected.birthDate)} />
                <DetailBox label="Endereco" value={selected.address || "Nao informado"} />
                <DetailBox label="Veiculo" value={buildVehicleSummary(selected)} />
                <DetailBox label="PIX / banco" value={selected.profile.pixInfo || "Nao informado"} />
                <DetailBox label="Saldo pendente" value={money(selected.financial.saldoDevedor)} />
              </div>

              <div style={miniInsightGrid}>
                <InsightMini title="Pedidos ativos" value={String(selected.activeOrders.length)} />
                <InsightMini title="Entregues" value={String(selected.deliveredOrders)} />
                <InsightMini title="Cancelados" value={String(selected.canceledOrders)} />
                <InsightMini title="Comissao do app" value={money(selected.financial.saldoDevedor)} danger={selected.blockedFinal} />
              </div>

              {(selected.status === "pending" || selected.status === "rejected") && (
                <div style={subCard}>
                  <div style={subTitle}>Aprovacao documental</div>
                  <div style={subHint}>
                    Revise os dados enviados, documentos e registre um parecer antes de aprovar ou devolver para ajuste.
                  </div>
                  <textarea
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    style={fieldTextArea}
                    placeholder="Observacao para aprovacao ou pedido de ajuste"
                  />
                  <div style={actionGrid}>
                    <button onClick={() => void approveSelected()} type="button" style={primaryBtn} disabled={supportBusy !== ""}>
                      {supportBusy === "approve" ? "Aprovando..." : "Aprovar cadastro"}
                    </button>
                    <button onClick={() => void rejectSelected()} type="button" style={dangerBtn} disabled={supportBusy !== ""}>
                      {supportBusy === "reject" ? "Enviando..." : "Pedir ajuste"}
                    </button>
                  </div>
                </div>
              )}

              <div style={dualGrid}>
                <div style={subCard}>
                  <div style={subTitle}>Cadastro principal</div>
                  <div style={formGridTwo}>
                    <Field label="Nome completo">
                      <input
                        value={personalForm.nome}
                        onChange={(event) =>
                          setPersonalForm((current) => ({ ...current, nome: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="WhatsApp">
                      <input
                        value={personalForm.whatsapp}
                        onChange={(event) =>
                          setPersonalForm((current) => ({ ...current, whatsapp: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="CPF">
                      <input
                        value={personalForm.cpf}
                        onChange={(event) =>
                          setPersonalForm((current) => ({ ...current, cpf: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="RG">
                      <input
                        value={personalForm.rg}
                        onChange={(event) =>
                          setPersonalForm((current) => ({ ...current, rg: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Nascimento">
                      <input
                        value={personalForm.nascimento}
                        onChange={(event) =>
                          setPersonalForm((current) => ({ ...current, nascimento: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Email de acesso">
                      <input
                        value={personalForm.email}
                        onChange={(event) =>
                          setPersonalForm((current) => ({ ...current, email: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                  </div>
                  <div style={formGridOne}>
                    <Field label="Endereco">
                      <textarea
                        value={personalForm.address}
                        onChange={(event) =>
                          setPersonalForm((current) => ({ ...current, address: event.target.value }))
                        }
                        style={fieldTextArea}
                      />
                    </Field>
                  </div>
                  <div style={actionGrid}>
                    <button onClick={() => void saveCadastro()} type="button" style={primaryBtn} disabled={supportBusy !== ""}>
                      Salvar cadastro
                    </button>
                    <button onClick={() => void resetPassword()} type="button" style={secondaryBtn} disabled={supportBusy !== ""}>
                      Redefinir senha
                    </button>
                  </div>
                </div>

                <div style={subCard}>
                  <div style={subTitle}>Veiculo, documentos e PIX</div>
                  <div style={formGridTwo}>
                    <Field label="Tipo">
                      <input
                        value={vehicleForm.vehicleType}
                        onChange={(event) =>
                          setVehicleForm((current) => ({ ...current, vehicleType: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Marca">
                      <input
                        value={vehicleForm.vehicleBrand}
                        onChange={(event) =>
                          setVehicleForm((current) => ({ ...current, vehicleBrand: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Modelo">
                      <input
                        value={vehicleForm.vehicleModel}
                        onChange={(event) =>
                          setVehicleForm((current) => ({ ...current, vehicleModel: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="Placa">
                      <input
                        value={vehicleForm.plate}
                        onChange={(event) =>
                          setVehicleForm((current) => ({ ...current, plate: event.target.value.toUpperCase() }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="RENAVAM">
                      <input
                        value={vehicleForm.renavam}
                        onChange={(event) =>
                          setVehicleForm((current) => ({ ...current, renavam: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                    <Field label="PIX / dados bancarios">
                      <input
                        value={vehicleForm.pixInfo}
                        onChange={(event) =>
                          setVehicleForm((current) => ({ ...current, pixInfo: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                  </div>
                  <div style={docList}>
                    <StatusLine
                      label="CNH enviada"
                      value={safeText(selected.cnhUpload?.name) || "Nao enviado"}
                      danger={!selected.cnhUpload?.name}
                    />
                    <StatusLine
                      label="CRLV enviado"
                      value={safeText(selected.crlvUpload?.name) || "Nao enviado"}
                      danger={!selected.crlvUpload?.name}
                    />
                  </div>
                  <div style={actionGrid}>
                    <button onClick={() => void saveVeiculoPix()} type="button" style={primaryBtn} disabled={supportBusy !== ""}>
                      Salvar veiculo e PIX
                    </button>
                    {selected.currentOrder ? (
                      <Link to="/admin/pedidos" style={linkBtn}>
                        Abrir pedido ativo
                      </Link>
                    ) : (
                      <Link to="/admin/financeiro" style={linkBtn}>
                        Abrir financeiro
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              <div style={dualGrid}>
                <div style={subCardDark}>
                  <div style={subTitleDark}>Operacao e seguranca</div>
                  <div style={actionGrid}>
                    <button
                      onClick={() => void toggleManualBlock(!selected.manualBlocked)}
                      type="button"
                      style={selected.manualBlocked ? secondaryBtn : dangerBtn}
                      disabled={supportBusy !== "" || !selected.delivererId}
                    >
                      {selected.manualBlocked ? "Remover bloqueio manual" : "Bloquear manualmente"}
                    </button>
                    <button
                      onClick={() => void forceOffline()}
                      type="button"
                      style={secondaryBtn}
                      disabled={supportBusy !== "" || !selected.delivererId}
                    >
                      Forcar offline
                    </button>
                  </div>
                  {selected.manualBlockReason ? (
                    <div style={noticeBoxDark}>
                      <strong>Motivo atual:</strong> {selected.manualBlockReason}
                    </div>
                  ) : null}
                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    <StatusLine label="Online agora" value={selected.online ? "Sim" : "Nao"} />
                    <StatusLine label="Bloqueio por saldo" value={selected.financial.bloqueado ? "Sim" : "Nao"} danger={selected.financial.bloqueado} />
                    <StatusLine label="Bloqueio manual" value={selected.manualBlocked ? "Sim" : "Nao"} danger={selected.manualBlocked} />
                  </div>
                </div>

                <div style={subCard}>
                  <div style={subTitle}>Financeiro rapido</div>
                  <div style={subHint}>
                    Registre pagamento parcial ou quite o saldo pendente direto desta ficha.
                  </div>
                  <div style={formGridTwo}>
                    <Field label="Valor do pagamento">
                      <input
                        value={paymentForm.valor}
                        onChange={(event) =>
                          setPaymentForm((current) => ({ ...current, valor: event.target.value }))
                        }
                        style={fieldInput}
                        inputMode="decimal"
                      />
                    </Field>
                    <Field label="Observacao">
                      <input
                        value={paymentForm.observacao}
                        onChange={(event) =>
                          setPaymentForm((current) => ({ ...current, observacao: event.target.value }))
                        }
                        style={fieldInput}
                      />
                    </Field>
                  </div>
                  <div style={actionGrid}>
                    <button onClick={() => void registerPayment(false)} type="button" style={primaryBtn} disabled={supportBusy !== "" || !selected.delivererId}>
                      Registrar pagamento
                    </button>
                    <button onClick={() => void registerPayment(true)} type="button" style={secondaryBtn} disabled={supportBusy !== "" || !selected.delivererId || Number(selected.financial.saldoDevedor || 0) <= 0}>
                      Quitar saldo total
                    </button>
                  </div>
                </div>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Push e dispositivos</div>
                {selected.pushDevices.length === 0 ? (
                  <div style={emptyTextSmall}>Nenhum dispositivo push ativo para este entregador.</div>
                ) : (
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {selected.pushDevices.map((device) => (
                      <div key={device.installation_id} style={deviceRow}>
                        <div style={{ minWidth: 0 }}>
                          <div style={deviceTitle}>{device.app_variant} | {device.platform}</div>
                          <div style={deviceMeta}>Instalacao {device.installation_id.slice(0, 10)}... | {device.enabled ? "token ativo" : "token inativo"}</div>
                          <div style={deviceMeta}>Ultimo registro {formatDateTimeBR(device.last_registered_at)}</div>
                        </div>
                        <div style={statusPillMini}>{device.enabled ? "Ativo" : "Inativo"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={subCard}>
                <div style={subTitle}>Observacao interna</div>
                <textarea
                  value={notesInput}
                  onChange={(event) => setNotesInput(event.target.value)}
                  style={fieldTextArea}
                  placeholder="Ex.: perfil confiavel, pendencia documental, repasse combinado, suporte acionado, alinhamento operacional..."
                />
                <div style={actionGrid}>
                  <button onClick={() => void saveNotes()} type="button" style={primaryBtn} disabled={supportBusy !== ""}>
                    Salvar observacao
                  </button>
                </div>
              </div>

              <div style={dualGrid}>
                <div style={subCardDark}>
                  <div style={subTitleDark}>Auditoria recente</div>
                  {auditRows.length === 0 ? (
                    <div style={emptyTextOnDark}>Ainda nao ha acoes auditadas para este entregador.</div>
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

                <div style={subCard}>
                  <div style={subTitle}>Pedidos recentes</div>
                  {selected.totalOrders === 0 ? (
                    <div style={emptyTextSmall}>Sem pedidos vinculados a este entregador.</div>
                  ) : (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      {[...selected.activeOrders, ...pedidos.filter((pedido: any) => safeText(pedido.entregadorId) === selected.delivererId && pedido.status !== "entregue" && pedido.status !== "cancelado" ? false : safeText(pedido.entregadorId) === selected.delivererId).slice(0, 6)]
                        .slice(0, 8)
                        .map((pedido: any) => (
                          <div key={pedido.id} style={orderRow}>
                            <div style={{ minWidth: 0 }}>
                              <div style={orderTitle}>Pedido #{String(pedido.id).slice(0, 6)}</div>
                              <div style={orderMeta}>
                                {safeText(pedido.clienteNome) || "Cliente"} | {statusLabel(pedido.status)}
                              </div>
                              <div style={orderMeta}>
                                {formatDateTimeBR(pedido.updatedAt ?? pedido.createdAt)}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={orderValue}>{money(Number(pedido.total || 0))}</div>
                            </div>
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

function InsightMini(props: { title: string; value: string; danger?: boolean }) {
  return (
    <div
      style={{
        ...insightMiniCard,
        background: props.danger ? "rgba(185,28,28,0.05)" : "#F8FAFC",
        border: props.danger
          ? "1px solid rgba(185,28,28,0.12)"
          : "1px solid rgba(15,23,42,0.06)",
      }}
    >
      <div style={insightMiniLabel}>{props.title}</div>
      <div style={{ ...insightMiniValue, color: props.danger ? "#B91C1C" : "#111827" }}>
        {props.value}
      </div>
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

function StatusLine(props: { label: string; value: string; danger?: boolean }) {
  return (
    <div style={statusLine}>
      <span style={statusLineLabel}>{props.label}</span>
      <strong style={{ color: props.danger ? "#B91C1C" : "#111827" }}>{props.value}</strong>
    </div>
  );
}

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

const toolbarBottom: CSSProperties = {
  marginTop: 12,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const searchInput: CSSProperties = {
  flex: 1,
  minWidth: 240,
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  padding: "0 14px",
  boxSizing: "border-box",
  fontSize: 14,
  background: "#F8FAFC",
  color: "#111827",
};

const exportBtn: CSSProperties = {
  height: 46,
  padding: "0 16px",
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const errorBox: CSSProperties = {
  marginTop: 14,
  background: "rgba(185,28,28,0.08)",
  color: "#7F1D1D",
  border: "1px solid rgba(185,28,28,0.14)",
  borderRadius: 18,
  padding: 14,
  fontWeight: 700,
};

const contentGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "minmax(320px, 0.96fr) minmax(0, 1.44fr)",
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
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
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

const rowBtn: CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 14,
  borderRadius: 18,
  background: "#fff",
  cursor: "pointer",
};

const rowTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const rowMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
};

const rowMetaSecondary: CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "#94A3B8",
};

const statusPill: CSSProperties = {
  minWidth: 92,
  height: 34,
  padding: "0 12px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const statusPillMini: CSSProperties = {
  minWidth: 76,
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

const detailsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const detailBox: CSSProperties = {
  background: "#F8FAFC",
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(15,23,42,0.06)",
};

const detailLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const detailValue: CSSProperties = {
  marginTop: 8,
  fontSize: 14,
  fontWeight: 900,
  color: "#111827",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const miniInsightGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const insightMiniCard: CSSProperties = {
  borderRadius: 18,
  padding: 14,
};

const insightMiniLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const insightMiniValue: CSSProperties = {
  marginTop: 8,
  fontSize: 16,
  fontWeight: 950,
};

const dualGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const subCard: CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 12px 28px rgba(15,23,42,0.04)",
};

const subCardDark: CSSProperties = {
  background: "linear-gradient(135deg,#111827 0%, #1F2937 100%)",
  borderRadius: 22,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.06)",
  boxShadow: "0 18px 36px rgba(15,23,42,0.18)",
};

const subTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const subTitleDark: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#fff",
};

const subHint: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.55,
};

const formGridTwo: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const formGridOne: CSSProperties = {
  marginTop: 12,
  display: "grid",
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
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.08)",
  padding: "0 14px",
  boxSizing: "border-box",
  background: "#F8FAFC",
  color: "#111827",
  fontSize: 14,
};

const fieldTextArea: CSSProperties = {
  width: "100%",
  minHeight: 92,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  padding: 14,
  boxSizing: "border-box",
  background: "#F8FAFC",
  color: "#111827",
  fontSize: 14,
  resize: "vertical",
};

const actionGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const primaryBtn: CSSProperties = {
  height: 46,
  padding: "0 16px",
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  height: 46,
  padding: "0 16px",
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerBtn: CSSProperties = {
  ...secondaryBtn,
  background: "rgba(185,28,28,0.10)",
  color: "#B91C1C",
  border: "1px solid rgba(185,28,28,0.18)",
};

const linkBtn: CSSProperties = {
  height: 46,
  padding: "0 16px",
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
};

const docList: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 8,
};

const statusLine: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const statusLineLabel: CSSProperties = {
  color: "#475569",
  fontWeight: 800,
};

const noticeBoxDark: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.88)",
  lineHeight: 1.55,
};

const deviceRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const deviceTitle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 900,
  color: "#111827",
};

const deviceMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748B",
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

const emptyTextOnDark: CSSProperties = {
  fontSize: 13.5,
  color: "rgba(255,255,255,0.72)",
};

const orderRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const orderTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const orderMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
};

const orderValue: CSSProperties = {
  fontSize: 14.5,
  fontWeight: 950,
  color: "#111827",
};
