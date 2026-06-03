import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../layouts/AdminLayout";
import { usePedidoStore } from "../../store/usePedidoStore";
import { useRemoteSyncStore } from "../../store/useRemoteSyncStore";
import { exportRowsToCsv } from "../../services/csvExportService";
import { clientAdminService } from "../../services/clientAdminService";
import {
  adminAuditTrailService,
  type AdminAuditLogRow,
} from "../../services/adminAuditTrailService";
import {
  adminSupportService,
  type AdminClientDirectoryRow,
} from "../../services/adminSupportService";
import { emitToast } from "../../services/realtimeBus";
import { money, safeText, statusLabel } from "../../utils/delivererHelpers";

type ClientFilter =
  | "todos"
  | "ativos"
  | "suspeitos"
  | "bloqueados"
  | "atencao"
  | "recorrentes"
  | "vip"
  | "churn"
  | "ausentes";

type ClientRow = {
  clientKey: string;
  authUserId: string;
  nome: string;
  telefone: string;
  cpf: string;
  email: string;
  nascimento: string;
  createdAt: string;
  updatedAt: string;
  pedidos: any[];
  totalPedidos: number;
  ativos: number;
  entregues: number;
  cancelados: number;
  cancelamentosSuspeitos: number;
  totalGasto: number;
  ultimoPedidoAt: string | null;
  primeiroPedidoAt: string | null;
  ultimoStatus: string;
  ultimoEndereco: string;
  ausenciaCount: number;
  comprouDeOutroCount: number;
  semContatoCount: number;
  ticketMedio: number;
  diasDesdeUltimoPedido: number;
  tier: string;
  risco: string;
  churn: string;
  adminStatus: "normal" | "atencao" | "bloqueado";
  adminNotes: string | null;
  adminUpdatedAt: string | null;
  contaStatus: string;
  addresses: AdminClientDirectoryRow["addresses"];
  primaryAddressId: string;
  gasTank: AdminClientDirectoryRow["gasTank"];
  pushDevices: AdminClientDirectoryRow["pushDevices"];
  notifsPedido: boolean;
  notifsGas: boolean;
  notifsPromos: boolean;
};

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhoneBR(raw: string) {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function daysSince(dateStr: string | null | undefined) {
  if (!dateStr) return 9999;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return 9999;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function formatDateBR(raw: string | null | undefined) {
  if (!raw) return "Não informado";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "Não informado";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTimeBR(raw: string | null | undefined) {
  if (!raw) return "Não informado";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "Não informado";
  return date.toLocaleString("pt-BR");
}

function clientTier(row: {
  totalPedidos: number;
  totalGasto: number;
  cancelados: number;
}) {
  if (row.totalPedidos >= 5 || row.totalGasto >= 500) return "VIP";
  if (row.totalPedidos >= 3 || row.totalGasto >= 250) return "Recorrente";
  if (row.cancelados >= 2) return "Atenção";
  return "Base";
}

function riskLevel(row: {
  cancelamentosSuspeitos: number;
  cancelados: number;
  ausenciaCount: number;
  adminStatus: "normal" | "atencao" | "bloqueado";
}) {
  let score = 0;
  score += row.cancelamentosSuspeitos * 3;
  score += row.cancelados * 1.5;
  score += row.ausenciaCount * 2;

  if (row.adminStatus === "atencao") score += 3;
  if (row.adminStatus === "bloqueado") score += 8;

  if (score >= 8) return "Alto";
  if (score >= 4) return "Médio";
  return "Baixo";
}

function churnRisk(row: {
  totalPedidos: number;
  diasDesdeUltimoPedido: number;
  ativos: number;
}) {
  if (row.ativos > 0) return "Baixo";
  if (row.totalPedidos >= 3 && row.diasDesdeUltimoPedido >= 30) return "Alto";
  if (row.totalPedidos >= 2 && row.diasDesdeUltimoPedido >= 21) return "Médio";
  if (row.totalPedidos === 1 && row.diasDesdeUltimoPedido >= 14) return "Médio";
  return "Baixo";
}

function normalizeReason(text: string) {
  return safeText(text).toLowerCase();
}

function buildLocationSummary(addresses: AdminClientDirectoryRow["addresses"]) {
  const primary =
    addresses.find((item) => item.id && item.id === addresses[0]?.id) ??
    addresses.find((item) => item.isDefault) ??
    addresses[0] ??
    null;

  if (!primary) return "Não informado";

  return [
    safeText(primary.neighborhood),
    safeText(primary.city),
  ]
    .filter(Boolean)
    .join(" / ") || "Não informado";
}

function buildAddressPreview(address?: Partial<AdminClientDirectoryRow["addresses"][number]> | null) {
  if (!address) return "Não informado";
  return [
    safeText(address.street),
    safeText(address.number),
    safeText(address.neighborhood),
    safeText(address.city),
  ]
    .filter(Boolean)
    .join(", ") || "Não informado";
}

function buildClientKey(input: {
  authUserId?: string | null;
  nome?: string | null;
  telefone?: string | null;
}) {
  const authUserId = safeText(input.authUserId);
  if (authUserId) return `auth:${authUserId}`;

  const phone = onlyDigits(String(input.telefone || ""));
  if (phone) return `phone:${phone}`;

  const nome = safeText(input.nome || "").toLowerCase();
  if (nome) return `name:${nome}`;

  return "unknown:sem-identificacao";
}

function createFallbackGasTank() {
  return {
    state: {
      current_level: 72,
      estimated_days: 0,
      start_date: "",
      finish_date: "",
      last_updated: "",
      last_alert_level: "none" as const,
      last_delivery_order_id: null as string | null,
    },
    setup: {
      configured: false,
      initial_level: 100,
      average_duration_days: 30,
      days_since_last_exchange: 0,
      last_exchange_date: "",
      updated_at: "",
    },
    updatedAt: "",
  };
}

function askCriticalReason(actionLabel: string) {
  const confirmed = window.confirm(`Confirmar a ação: ${actionLabel}?`);
  if (!confirmed) return null;

  const reason = window.prompt("Informe o motivo da ação:", "Ajuste administrativo");
  if (!reason || !reason.trim()) {
    emitToast("Motivo obrigatório", "Informe o motivo para registrar a ação.", "warning");
    return null;
  }

  return reason.trim();
}

function createAddressId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `addr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function buildGasDocument(input: {
  averageDurationDays: number;
  daysSinceLastExchange: number;
  currentLevel: number;
  fallback: ClientRow["gasTank"];
}) {
  const averageDurationDays = Math.max(1, Math.round(input.averageDurationDays));
  const daysSinceLastExchange = Math.max(
    0,
    Math.min(Math.round(input.daysSinceLastExchange), averageDurationDays)
  );
  const currentLevel = Math.max(0, Math.min(Number(input.currentLevel || 0), 100));
  const lastExchangeDate = new Date();
  lastExchangeDate.setHours(0, 0, 0, 0);
  lastExchangeDate.setDate(lastExchangeDate.getDate() - daysSinceLastExchange);
  const finishDate = new Date(lastExchangeDate);
  finishDate.setDate(finishDate.getDate() + averageDurationDays);
  const alertLevel: "none" | "low" | "critical" =
    currentLevel <= 8 ? "critical" : currentLevel <= 20 ? "low" : "none";

  return {
    ...input.fallback,
    state: {
      ...input.fallback.state,
      current_level: currentLevel,
      estimated_days: Math.max(0, Math.ceil(averageDurationDays - daysSinceLastExchange)),
      start_date: lastExchangeDate.toISOString(),
      finish_date: finishDate.toISOString(),
      last_updated: new Date().toISOString(),
      last_alert_level: alertLevel,
    },
    setup: {
      ...input.fallback.setup,
      configured: true,
      average_duration_days: averageDurationDays,
      days_since_last_exchange: daysSinceLastExchange,
      last_exchange_date: lastExchangeDate.toISOString(),
      updated_at: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
}

export default function AdminClientes() {
  const pedidos = usePedidoStore((s) => s.pedidos);
  const adminVersion = useRemoteSyncStore((s) => s.adminVersion);

  const [refreshKey, setRefreshKey] = useState(0);
  const [filtro, setFiltro] = useState<ClientFilter>("todos");
  const [busca, setBusca] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [clientDirectory, setClientDirectory] = useState<AdminClientDirectoryRow[]>([]);
  const [auditRows, setAuditRows] = useState<AdminAuditLogRow[]>([]);
  const [supportBusy, setSupportBusy] = useState("");
  const [personalForm, setPersonalForm] = useState({
    nome: "",
    cpf: "",
    email: "",
    nascimento: "",
  });
  const [addressForm, setAddressForm] = useState({
    label: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    complement: "",
    reference: "",
    phone: "",
    lat: "",
    lng: "",
  });
  const [gasForm, setGasForm] = useState({
    averageDurationDays: "30",
    daysSinceLastExchange: "0",
    currentLevel: "72",
  });
  const [pushTestForm, setPushTestForm] = useState({
    title: "Teste da Central Gás",
    body: "Este é um push de teste enviado pelo suporte da Central.",
    route: "/conta",
  });

  useEffect(() => {
    let active = true;

    async function loadClients() {
      setDirectoryLoading(true);
      setDirectoryError("");

      try {
        const rows = await adminSupportService.listClients();
        if (!active) return;
        setClientDirectory(rows);
      } catch (error) {
        if (!active) return;
        setDirectoryError(
          error instanceof Error && error.message
            ? error.message
            : "Nao foi possivel carregar a base real de clientes."
        );
      } finally {
        if (active) {
          setDirectoryLoading(false);
        }
      }
    }

    void loadClients();

    return () => {
      active = false;
    };
  }, [adminVersion, refreshKey]);

  const orderClientRows = useMemo(() => {
    const all = Array.isArray(pedidos) ? pedidos : [];
    const map = new Map<
      string,
      {
        clientKey: string;
        nome: string;
        telefone: string;
        pedidos: any[];
        totalPedidos: number;
        ativos: number;
        entregues: number;
        cancelados: number;
        cancelamentosSuspeitos: number;
        totalGasto: number;
        ultimoPedidoAt: string | null;
        primeiroPedidoAt: string | null;
        ultimoStatus: string;
        ultimoEndereco: string;
        ausenciaCount: number;
        comprouDeOutroCount: number;
        semContatoCount: number;
      }
    >();

    all.forEach((pedido: any) => {
      const clientKey = buildClientKey({
        nome: pedido?.clienteNome,
        telefone: pedido?.clienteTelefone,
      });

      const current = map.get(clientKey) || {
        clientKey,
        nome: safeText(pedido?.clienteNome) || "Cliente",
        telefone: safeText(pedido?.clienteTelefone) || "",
        pedidos: [],
        totalPedidos: 0,
        ativos: 0,
        entregues: 0,
        cancelados: 0,
        cancelamentosSuspeitos: 0,
        totalGasto: 0,
        ultimoPedidoAt: null,
        primeiroPedidoAt: null,
        ultimoStatus: "",
        ultimoEndereco: "",
        ausenciaCount: 0,
        comprouDeOutroCount: 0,
        semContatoCount: 0,
      };

      current.pedidos.push(pedido);
      current.totalPedidos += 1;
      current.totalGasto += Number(pedido?.total || 0);

      if (pedido?.status === "entregue") current.entregues += 1;
      else if (pedido?.status === "cancelado") current.cancelados += 1;
      else current.ativos += 1;

      if (pedido?.cancelamentoSuspeito) current.cancelamentosSuspeitos += 1;

      const reason = normalizeReason(
        `${pedido?.motivoCancelamento || ""} ${pedido?.observacaoCancelamento || ""}`
      );

      if (
        reason.includes("cliente ausente") ||
        reason.includes("ausente") ||
        reason.includes("não estava") ||
        reason.includes("nao estava")
      ) {
        current.ausenciaCount += 1;
      }

      if (reason.includes("comprou de outro") || reason.includes("concorrente")) {
        current.comprouDeOutroCount += 1;
      }

      if (
        reason.includes("sem contato") ||
        reason.includes("não atendeu") ||
        reason.includes("nao atendeu")
      ) {
        current.semContatoCount += 1;
      }

      const updatedAt = String(pedido?.updatedAt || pedido?.createdAt || "");
      const createdAt = String(pedido?.createdAt || pedido?.updatedAt || "");

      if (!current.ultimoPedidoAt || new Date(updatedAt).getTime() > new Date(current.ultimoPedidoAt).getTime()) {
        current.ultimoPedidoAt = updatedAt;
        current.ultimoStatus = safeText(pedido?.status) || "";
        current.ultimoEndereco =
          [
            safeText(pedido?.enderecoSnapshot?.bairro ?? pedido?.enderecoSnapshot?.neighborhood),
            safeText(pedido?.enderecoSnapshot?.cidade ?? pedido?.enderecoSnapshot?.city),
          ]
            .filter(Boolean)
            .join(" / ") || "Não informado";
      }

      if (!current.primeiroPedidoAt || new Date(createdAt).getTime() < new Date(current.primeiroPedidoAt).getTime()) {
        current.primeiroPedidoAt = createdAt;
      }

      map.set(clientKey, current);
    });

    return Array.from(map.values());
  }, [pedidos]);

  const clientRows = useMemo<ClientRow[]>(() => {
    const fallbackGas = createFallbackGasTank();
    const matchedAuthIds = new Set<string>();
    const byPhone = new Map(
      clientDirectory
        .filter((item) => onlyDigits(item.phone))
        .map((item) => [onlyDigits(item.phone), item] as const)
    );

    const mergedFromOrders = orderClientRows.map((row) => {
      const phoneKey = onlyDigits(row.telefone);
      const remote =
        (phoneKey ? byPhone.get(phoneKey) : null) ??
        clientDirectory.find(
          (item) =>
            safeText(item.name).toLowerCase() === safeText(row.nome).toLowerCase()
        ) ??
        null;

      if (remote?.authUserId) {
        matchedAuthIds.add(remote.authUserId);
      }

      const adminControl = remote?.authUserId
        ? clientAdminService.get(`auth:${remote.authUserId}`)
        : clientAdminService.get(row.clientKey);
      const diasDesdeUltimoPedido = daysSince(row.ultimoPedidoAt);
      const tier = clientTier(row);
      const risco = riskLevel({
        cancelamentosSuspeitos: row.cancelamentosSuspeitos,
        cancelados: row.cancelados,
        ausenciaCount: row.ausenciaCount,
        adminStatus: adminControl.status,
      });
      const churn = churnRisk({
        totalPedidos: row.totalPedidos,
        diasDesdeUltimoPedido,
        ativos: row.ativos,
      });

      return {
        clientKey: remote?.authUserId ? `auth:${remote.authUserId}` : row.clientKey,
        authUserId: remote?.authUserId ?? "",
        nome: remote?.name || row.nome,
        telefone: remote?.phone || row.telefone,
        cpf: remote?.cpf || "",
        email: remote?.email || "",
        nascimento: remote?.birthDate || "",
        createdAt: remote?.createdAt || row.primeiroPedidoAt || "",
        updatedAt: remote?.updatedAt || row.ultimoPedidoAt || "",
        pedidos: row.pedidos,
        totalPedidos: row.totalPedidos,
        ativos: row.ativos,
        entregues: row.entregues,
        cancelados: row.cancelados,
        cancelamentosSuspeitos: row.cancelamentosSuspeitos,
        totalGasto: row.totalGasto,
        ultimoPedidoAt: row.ultimoPedidoAt,
        primeiroPedidoAt: row.primeiroPedidoAt,
        ultimoStatus: row.ultimoStatus,
        ultimoEndereco:
          row.ultimoEndereco !== "Não informado"
            ? row.ultimoEndereco
            : buildLocationSummary(remote?.addresses ?? []),
        ausenciaCount: row.ausenciaCount,
        comprouDeOutroCount: row.comprouDeOutroCount,
        semContatoCount: row.semContatoCount,
        ticketMedio: row.totalPedidos > 0 ? row.totalGasto / row.totalPedidos : 0,
        diasDesdeUltimoPedido,
        tier,
        risco,
        churn,
        adminStatus: adminControl.status,
        adminNotes: adminControl.notes ?? remote?.adminNotes ?? null,
        adminUpdatedAt: adminControl.updatedAt ?? remote?.adminUpdatedAt ?? null,
        contaStatus: adminControl.status === "bloqueado" ? "Bloqueada" : "Ativa",
        addresses: remote?.addresses ?? [],
        primaryAddressId: remote?.primaryAddressId ?? "",
        gasTank: remote?.gasTank ?? fallbackGas,
        pushDevices: remote?.pushDevices ?? [],
        notifsPedido: remote?.profile?.notifsPedido ?? true,
        notifsGas: remote?.profile?.notifsGas ?? true,
        notifsPromos: remote?.profile?.notifsPromos ?? false,
      };
    });

    const remoteOnly = clientDirectory
      .filter((item) => !matchedAuthIds.has(item.authUserId))
      .map((item) => {
        const adminControl = clientAdminService.get(`auth:${item.authUserId}`);
        return {
          clientKey: `auth:${item.authUserId}`,
          authUserId: item.authUserId,
          nome: item.name,
          telefone: item.phone,
          cpf: item.cpf,
          email: item.email,
          nascimento: item.birthDate,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          pedidos: [],
          totalPedidos: 0,
          ativos: 0,
          entregues: 0,
          cancelados: 0,
          cancelamentosSuspeitos: 0,
          totalGasto: 0,
          ultimoPedidoAt: null,
          primeiroPedidoAt: item.createdAt,
          ultimoStatus: "",
          ultimoEndereco: buildLocationSummary(item.addresses),
          ausenciaCount: 0,
          comprouDeOutroCount: 0,
          semContatoCount: 0,
          ticketMedio: 0,
          diasDesdeUltimoPedido: 9999,
          tier: "Base",
          risco:
            adminControl.status === "bloqueado"
              ? "Alto"
              : adminControl.status === "atencao"
              ? "Médio"
              : "Baixo",
          churn: "Baixo",
          adminStatus: adminControl.status,
          adminNotes: adminControl.notes ?? item.adminNotes ?? null,
          adminUpdatedAt: adminControl.updatedAt ?? item.adminUpdatedAt ?? null,
          contaStatus: adminControl.status === "bloqueado" ? "Bloqueada" : "Ativa",
          addresses: item.addresses,
          primaryAddressId: item.primaryAddressId,
          gasTank: item.gasTank ?? fallbackGas,
          pushDevices: item.pushDevices,
          notifsPedido: item.profile?.notifsPedido ?? true,
          notifsGas: item.profile?.notifsGas ?? true,
          notifsPromos: item.profile?.notifsPromos ?? false,
        } satisfies ClientRow;
      });

    return [...mergedFromOrders, ...remoteOnly].sort((a, b) => {
      const tA = new Date(a.ultimoPedidoAt || a.updatedAt || a.createdAt || 0).getTime();
      const tB = new Date(b.ultimoPedidoAt || b.updatedAt || b.createdAt || 0).getTime();
      return tB - tA;
    });
  }, [clientDirectory, orderClientRows]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return clientRows.filter((row) => {
      if (filtro === "ativos" && row.ativos <= 0) return false;
      if (filtro === "suspeitos" && row.cancelamentosSuspeitos <= 0) return false;
      if (filtro === "bloqueados" && row.adminStatus !== "bloqueado") return false;
      if (filtro === "atencao" && row.adminStatus !== "atencao") return false;
      if (filtro === "recorrentes" && row.totalPedidos < 3) return false;
      if (filtro === "vip" && row.tier !== "VIP") return false;
      if (filtro === "churn" && row.churn !== "Alto") return false;
      if (filtro === "ausentes" && row.ausenciaCount <= 0) return false;

      if (!q) return true;

      const haystack = [
        row.nome,
        row.telefone,
        row.cpf,
        row.email,
        row.clientKey,
        row.ultimoEndereco,
        row.adminNotes,
        row.tier,
        row.risco,
        row.churn,
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [busca, clientRows, filtro]);

  const selected = useMemo(() => {
    return filtered.find((row) => row.clientKey === selectedKey) ?? filtered[0] ?? null;
  }, [filtered, selectedKey]);

  useEffect(() => {
    if (!selected) {
      setAuditRows([]);
      return;
    }

    const primaryAddress =
      selected.addresses.find((item) => item.id === selected.primaryAddressId) ??
      selected.addresses.find((item) => item.isDefault) ??
      selected.addresses[0] ??
      null;

    setNotesInput(selected.adminNotes || "");
    setPersonalForm({
      nome: selected.nome,
      cpf: selected.cpf,
      email: selected.email,
      nascimento: selected.nascimento,
    });
    setAddressForm({
      label: primaryAddress?.label || "",
      street: primaryAddress?.street || "",
      number: primaryAddress?.number || "",
      neighborhood: primaryAddress?.neighborhood || "",
      city: primaryAddress?.city || "",
      complement: primaryAddress?.complement || "",
      reference: primaryAddress?.reference || "",
      phone: primaryAddress?.phone || selected.telefone || "",
      lat:
        primaryAddress?.lat == null || primaryAddress?.lat === undefined
          ? ""
          : String(primaryAddress.lat),
      lng:
        primaryAddress?.lng == null || primaryAddress?.lng === undefined
          ? ""
          : String(primaryAddress.lng),
    });
    setGasForm({
      averageDurationDays: String(
        Math.max(1, Number(selected.gasTank.setup.average_duration_days || 30))
      ),
      daysSinceLastExchange: String(
        Math.max(0, Number(selected.gasTank.setup.days_since_last_exchange || 0))
      ),
      currentLevel: String(
        Math.max(0, Number(selected.gasTank.state.current_level || 0))
      ),
    });

    if (!selected.authUserId) {
      setAuditRows([]);
      return;
    }

    let active = true;
    void adminAuditTrailService
      .listRecent({
        entityType: "cliente",
        entityId: selected.authUserId,
        limit: 40,
      })
      .then((rows) => {
        if (active) {
          setAuditRows(rows);
        }
      })
      .catch(() => {
        if (active) {
          setAuditRows([]);
        }
      });

    return () => {
      active = false;
    };
  }, [selected?.clientKey]);

  const summary = useMemo(() => {
    return {
      total: clientRows.length,
      bloqueados: clientRows.filter((x) => x.adminStatus === "bloqueado").length,
      atencao: clientRows.filter((x) => x.adminStatus === "atencao").length,
      suspeitos: clientRows.filter((x) => x.cancelamentosSuspeitos > 0).length,
      ativos: clientRows.filter((x) => x.ativos > 0).length,
      gastoTotal: clientRows.reduce((acc, row) => acc + Number(row.totalGasto || 0), 0),
      vip: clientRows.filter((x) => x.tier === "VIP").length,
      recorrentes: clientRows.filter((x) => x.totalPedidos >= 3).length,
      churn: clientRows.filter((x) => x.churn === "Alto").length,
      ausentes: clientRows.filter((x) => x.ausenciaCount > 0).length,
    };
  }, [clientRows]);

  const rankingTopClientes = useMemo(() => {
    return [...clientRows]
      .sort((a, b) => Number(b.totalGasto || 0) - Number(a.totalGasto || 0))
      .slice(0, 5);
  }, [clientRows]);

  const rankingRecorrencia = useMemo(() => {
    return [...clientRows]
      .sort((a, b) => Number(b.totalPedidos || 0) - Number(a.totalPedidos || 0))
      .slice(0, 5);
  }, [clientRows]);

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  function selectClient(clientKey: string) {
    setSelectedKey(clientKey);
  }

  async function setClientStatus(status: "normal" | "atencao" | "bloqueado") {
    if (!selected?.authUserId) {
      emitToast("Cliente sem vínculo", "Esse cliente ainda não tem autenticação associada.", "warning");
      return;
    }

    const reason = askCriticalReason(
      status === "bloqueado"
        ? "Bloquear cliente"
        : status === "atencao"
        ? "Marcar cliente em atenção"
        : "Normalizar status do cliente"
    );
    if (!reason) return;

    setSupportBusy("status");
    try {
      const before = {
        status: selected.adminStatus,
        notes: selected.adminNotes,
      };
      adminSupportService.setClientStatus(selected.authUserId, status);
      await adminAuditTrailService.logAction({
        category: "admin_cliente",
        event: "status_update",
        message: `Status do cliente atualizado para ${status}.`,
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before,
        after: {
          status,
        },
      });
      emitToast("Status atualizado", "O status do cliente foi atualizado.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao atualizar status",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel atualizar o status do cliente.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function saveNotes() {
    if (!selected?.authUserId) return;
    const reason = askCriticalReason("Salvar observação interna");
    if (!reason) return;

    setSupportBusy("notes");
    try {
      const before = {
        notes: selected.adminNotes,
      };
      adminSupportService.setClientNotes(selected.authUserId, notesInput);
      await adminAuditTrailService.logAction({
        category: "admin_cliente",
        event: "notes_update",
        message: "Observação interna do cliente atualizada.",
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before,
        after: {
          notes: notesInput,
        },
      });
      emitToast("Observação salva", "A observação interna foi salva.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao salvar observação",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel salvar a observação.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function savePersonalData() {
    if (!selected?.authUserId) return;
    const reason = askCriticalReason("Salvar dados pessoais do cliente");
    if (!reason) return;

    setSupportBusy("personal");
    try {
      const before = {
        nome: selected.nome,
        cpf: selected.cpf,
        email: selected.email,
        nascimento: selected.nascimento,
      };
      await adminSupportService.updateClientIdentity(selected.authUserId, {
        name: personalForm.nome,
        cpf: personalForm.cpf,
        email: personalForm.email,
        birthDate: personalForm.nascimento,
      });
      await adminAuditTrailService.logAction({
        category: "admin_cliente",
        event: "identity_update",
        message: "Dados pessoais do cliente atualizados pelo ADM.",
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before,
        after: {
          ...personalForm,
        },
      });
      emitToast("Cadastro atualizado", "Os dados pessoais foram atualizados.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao salvar dados",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel salvar os dados do cliente.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function correctPhoneLogin() {
    if (!selected?.authUserId) return;

    const nextPhone = window.prompt(
      "Informe o novo celular com DDD que será usado no login do cliente:",
      onlyDigits(selected.telefone)
    );
    if (!nextPhone) return;

    const reason = askCriticalReason("Corrigir o telefone de login do cliente");
    if (!reason) return;

    setSupportBusy("phone");
    try {
      const before = {
        telefone: selected.telefone,
      };
      await adminSupportService.updateClientLoginPhone(selected.authUserId, nextPhone);
      await adminAuditTrailService.logAction({
        category: "admin_cliente",
        event: "login_phone_update",
        message: "Telefone de login do cliente corrigido pelo ADM.",
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before,
        after: {
          telefone: onlyDigits(nextPhone),
        },
      });
      emitToast("Telefone corrigido", "O celular de acesso foi atualizado.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao corrigir telefone",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel corrigir o telefone de acesso.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function resetPassword() {
    if (!selected?.authUserId) return;

    const nextPassword = window.prompt(
      "Informe a senha temporária do cliente:",
      ""
    );
    if (!nextPassword) return;

    const reason = askCriticalReason("Redefinir senha temporária do cliente");
    if (!reason) return;

    setSupportBusy("password");
    try {
      await adminSupportService.resetClientPassword(selected.authUserId, nextPassword);
      await adminAuditTrailService.logAction({
        category: "admin_cliente",
        event: "password_reset",
        message: "Senha temporária do cliente redefinida pelo ADM.",
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before: null,
        after: {
          temporaryPassword: true,
        },
      });
      emitToast("Senha redefinida", "A senha temporária foi aplicada com sucesso.", "success");
    } catch (error) {
      emitToast(
        "Falha ao redefinir senha",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel redefinir a senha agora.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function savePrimaryAddress() {
    if (!selected?.authUserId) return;
    const reason = askCriticalReason("Salvar endereço principal do cliente");
    if (!reason) return;

    const primaryExisting =
      selected.addresses.find((item) => item.id === selected.primaryAddressId) ??
      selected.addresses.find((item) => item.isDefault) ??
      selected.addresses[0] ??
      null;
    const primaryId = primaryExisting?.id || createAddressId();

    const nextAddress = {
      id: primaryId,
      label: addressForm.label || "Principal",
      street: addressForm.street,
      number: addressForm.number,
      neighborhood: addressForm.neighborhood,
      city: addressForm.city,
      complement: addressForm.complement || undefined,
      reference: addressForm.reference || undefined,
      phone: addressForm.phone || undefined,
      lat: addressForm.lat.trim() === "" ? null : Number(addressForm.lat),
      lng: addressForm.lng.trim() === "" ? null : Number(addressForm.lng),
      isDefault: true,
      createdAt: primaryExisting?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const otherItems = selected.addresses
      .filter((item) => item.id !== primaryId)
      .map((item) => ({
        ...item,
        isDefault: false,
      }));
    const nextItems = [nextAddress, ...otherItems];

    setSupportBusy("address");
    try {
      await adminSupportService.updateClientAddresses(selected.authUserId, {
        items: nextItems,
        primaryId,
      });
      await adminAuditTrailService.logAction({
        category: "admin_cliente",
        event: "address_update",
        message: "Endereço principal do cliente ajustado pelo ADM.",
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before: {
          primaryAddress: buildAddressPreview(primaryExisting),
        },
        after: {
          primaryAddress: buildAddressPreview(nextAddress),
          lat: nextAddress.lat,
          lng: nextAddress.lng,
        },
      });
      emitToast("Endereço salvo", "O endereço principal foi atualizado.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao salvar endereço",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel salvar o endereço principal.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function saveGasProfile() {
    if (!selected?.authUserId) return;
    const reason = askCriticalReason("Ajustar monitoramento do gás");
    if (!reason) return;

    const nextGas = buildGasDocument({
      averageDurationDays: Number(gasForm.averageDurationDays || 30),
      daysSinceLastExchange: Number(gasForm.daysSinceLastExchange || 0),
      currentLevel: Number(gasForm.currentLevel || 0),
      fallback: selected.gasTank,
    });

    setSupportBusy("gas");
    try {
      await adminSupportService.updateClientGasTank(selected.authUserId, nextGas);
      await adminAuditTrailService.logAction({
        category: "admin_gas",
        event: "gas_profile_update",
        message: "Monitoramento do gás ajustado pelo ADM.",
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before: selected.gasTank,
        after: nextGas,
      });
      emitToast("Gás atualizado", "Os dados de monitoramento do gás foram salvos.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao ajustar gás",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel ajustar o monitoramento do gás.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function resetGasTo100() {
    if (!selected?.authUserId) return;
    const reason = askCriticalReason("Resetar o gás para 100%");
    if (!reason) return;

    setGasForm((current) => ({
      ...current,
      daysSinceLastExchange: "0",
      currentLevel: "100",
    }));

    const nextGas = buildGasDocument({
      averageDurationDays: Number(gasForm.averageDurationDays || 30),
      daysSinceLastExchange: 0,
      currentLevel: 100,
      fallback: selected.gasTank,
    });

    setSupportBusy("gasReset");
    try {
      await adminSupportService.updateClientGasTank(selected.authUserId, nextGas);
      await adminAuditTrailService.logAction({
        category: "admin_gas",
        event: "gas_reset",
        message: "Nível do gás resetado para 100% pelo ADM.",
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before: selected.gasTank,
        after: nextGas,
      });
      emitToast("Tanque resetado", "O monitoramento voltou para 100%.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao resetar gás",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel resetar o tanque agora.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function updateNotificationFlag(
    flag: "notifsPedido" | "notifsGas" | "notifsPromos",
    value: boolean
  ) {
    if (!selected?.authUserId) return;
    const reason = askCriticalReason("Atualizar preferências de notificação");
    if (!reason) return;

    setSupportBusy("prefs");
    try {
      const before = {
        notifsPedido: selected.notifsPedido,
        notifsGas: selected.notifsGas,
        notifsPromos: selected.notifsPromos,
      };
      await adminSupportService.updateClientProfileDoc(selected.authUserId, {
        [flag]: value,
      });
      await adminAuditTrailService.logAction({
        category: "admin_cliente",
        event: "notification_preferences_update",
        message: "Preferências de notificação do cliente atualizadas pelo ADM.",
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before,
        after: {
          ...before,
          [flag]: value,
        },
      });
      emitToast("Preferências salvas", "As notificações do cliente foram atualizadas.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao salvar preferências",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel salvar as preferências.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function sendPushTest() {
    if (!selected?.authUserId) return;
    const reason = askCriticalReason("Enviar push de teste para o cliente");
    if (!reason) return;

    setSupportBusy("push");
    try {
      await adminSupportService.sendPushTest({
        recipientAuthUserId: selected.authUserId,
        title: pushTestForm.title,
        body: pushTestForm.body,
        route: pushTestForm.route,
        eventType: "admin_cliente_push_teste",
        channelId: "cg_cliente_operacao_v5",
        dedupeKey: `admin:${selected.authUserId}:${Date.now()}`,
        payload: {
          origin: "admin_cliente",
        },
      });
      await adminAuditTrailService.logAction({
        category: "admin_push",
        event: "push_test_sent",
        message: "Push de teste enviado para o cliente.",
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before: null,
        after: pushTestForm,
      });
      emitToast("Push enfileirado", "A notificação de teste foi enviada para a fila.", "success");
    } catch (error) {
      emitToast(
        "Falha ao enviar push",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel enviar o push de teste.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  async function disablePushDevices() {
    if (!selected?.authUserId) return;
    const reason = askCriticalReason("Desativar os dispositivos push do cliente");
    if (!reason) return;

    setSupportBusy("pushDisable");
    try {
      await adminSupportService.disableAllPushDevicesForUser(selected.authUserId);
      await adminAuditTrailService.logAction({
        category: "admin_push",
        event: "push_devices_disabled",
        message: "Dispositivos push do cliente foram desativados.",
        entityType: "cliente",
        entityId: selected.authUserId,
        reason,
        before: {
          devices: selected.pushDevices.length,
        },
        after: {
          devicesDisabled: true,
        },
      });
      emitToast("Dispositivos limpos", "Os tokens push foram desativados.", "success");
      refresh();
    } catch (error) {
      emitToast(
        "Falha ao limpar dispositivos",
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel desativar os dispositivos do cliente.",
        "error"
      );
    } finally {
      setSupportBusy("");
    }
  }

  function exportCsv() {
    exportRowsToCsv(
      "admin_clientes_consolidado.csv",
      filtered.map((row) => ({
        auth_user_id: row.authUserId,
        nome: row.nome,
        telefone: row.telefone,
        cpf: row.cpf,
        email: row.email,
        total_pedidos: row.totalPedidos,
        ativos: row.ativos,
        entregues: row.entregues,
        cancelados: row.cancelados,
        cancelamentos_suspeitos: row.cancelamentosSuspeitos,
        total_gasto: row.totalGasto,
        ticket_medio: row.ticketMedio,
        ultimo_status: row.ultimoStatus,
        ultimo_endereco: row.ultimoEndereco,
        status_manual: row.adminStatus,
        observacao_interna: row.adminNotes ?? "",
      }))
    );
  }

  const primaryAddress =
    selected?.addresses.find((item) => item.id === selected.primaryAddressId) ??
    selected?.addresses.find((item) => item.isDefault) ??
    selected?.addresses[0] ??
    null;

  return (
    <AdminLayout
      title="ADM Clientes"
      subtitle="Suporte real do cliente com dados pessoais, endereço, gás, push e histórico operacional"
    >
      <div style={heroGrid}>
        <MetricCard label="Clientes" value={String(summary.total)} />
        <MetricCard label="Com pedido ativo" value={String(summary.ativos)} />
        <MetricCard label="Recorrentes" value={String(summary.recorrentes)} />
        <MetricCardDanger label="Bloqueados" value={String(summary.bloqueados)} />
      </div>

      <div style={heroGrid}>
        <MetricCard label="VIP" value={String(summary.vip)} />
        <MetricCard label="Churn alto" value={String(summary.churn)} />
        <MetricCard label="Ausentes" value={String(summary.ausentes)} />
        <MetricCard label="Gasto total" value={money(summary.gastoTotal)} />
      </div>

      <div style={premiumGrid}>
        <div style={spotlightCard}>
          <div style={spotlightLabel}>Melhores clientes por gasto</div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {rankingTopClientes.length === 0 ? (
              <div style={emptyText}>Ainda não há clientes suficientes para ranking.</div>
            ) : (
              rankingTopClientes.map((row, index) => (
                <div key={row.clientKey} style={premiumRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={premiumTitle}>#{index + 1} | {row.nome}</div>
                    <div style={premiumMeta}>
                      {row.totalPedidos} pedido(s) | ticket {money(row.ticketMedio)}
                    </div>
                  </div>
                  <div style={premiumValue}>{money(row.totalGasto)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={spotlightCardDark}>
          <div style={spotlightLabelDark}>Maior recorrência</div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {rankingRecorrencia.length === 0 ? (
              <div style={emptyTextOnDark}>Ainda não há recorrência suficiente.</div>
            ) : (
              rankingRecorrencia.map((row, index) => (
                <div key={row.clientKey} style={premiumRowDark}>
                  <div style={{ minWidth: 0 }}>
                    <div style={premiumTitleDark}>#{index + 1} | {row.nome}</div>
                    <div style={premiumMetaDark}>
                      Último pedido há {row.diasDesdeUltimoPedido} dia(s)
                    </div>
                  </div>
                  <div style={premiumValueDark}>{row.totalPedidos}x</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={toolbarCard}>
        <div style={chipRow}>
          {[
            ["todos", "Todos"],
            ["ativos", "Ativos"],
            ["suspeitos", "Suspeitos"],
            ["vip", "VIP"],
            ["recorrentes", "Recorrentes"],
            ["churn", "Churn alto"],
            ["ausentes", "Ausentes"],
            ["atencao", "Atenção"],
            ["bloqueados", "Bloqueados"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFiltro(value as ClientFilter)}
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
            onChange={(e) => setBusca(e.target.value)}
            style={searchInput}
            placeholder="Buscar por nome, telefone, CPF, e-mail, risco ou endereço..."
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
            <div style={sectionTitle}>Base de clientes</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Link to="/admin/clientes/campanhas" style={campaignLinkBtn}>
                Campanhas
              </Link>
              <span style={countPill}>
                {directoryLoading ? "..." : filtered.length}
              </span>
            </div>
          </div>

          {directoryLoading ? (
            <div style={emptyText}>Carregando clientes reais do sistema...</div>
          ) : filtered.length === 0 ? (
            <div style={emptyText}>Nenhum cliente encontrado nesse filtro.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {filtered.map((row) => (
                <button
                  key={row.clientKey}
                  onClick={() => selectClient(row.clientKey)}
                  type="button"
                  style={{
                    ...rowBtn,
                    border:
                      selected?.clientKey === row.clientKey
                        ? "2px solid rgba(228,79,42,0.24)"
                        : "1px solid rgba(15,23,42,0.06)",
                    boxShadow:
                      selected?.clientKey === row.clientKey
                        ? "0 12px 26px rgba(228,79,42,0.08)"
                        : "none",
                  }}
                >
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={rowTitle}>{row.nome}</div>
                    <div style={rowMeta}>
                      {row.telefone ? formatPhoneBR(row.telefone) : "Sem telefone"} | {row.cpf || "CPF não informado"}
                    </div>
                    <div style={rowMetaSecondary}>
                      {row.totalPedidos} pedido(s) | {row.ultimoEndereco || "Sem endereço"}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={rowStrong}>{money(row.totalGasto)}</div>
                    <div
                      style={{
                        ...statusMini,
                        color:
                          row.adminStatus === "bloqueado"
                            ? "#B91C1C"
                            : row.adminStatus === "atencao"
                            ? "#C2410C"
                            : "#166534",
                      }}
                    >
                      {row.adminStatus === "bloqueado"
                        ? "Bloqueado"
                        : row.adminStatus === "atencao"
                        ? "Atenção"
                        : "Normal"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Ficha operacional do cliente</div>
            {selected ? <span style={countPill}>{selected.totalPedidos}</span> : null}
          </div>

          {!selected ? (
            <div style={emptyText}>Selecione um cliente.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
              <div style={detailsGrid}>
                <DetailBox label="Cliente" value={selected.nome} />
                <DetailBox label="Telefone de login" value={selected.telefone ? formatPhoneBR(selected.telefone) : "Não informado"} />
                <DetailBox label="CPF" value={selected.cpf || "Não informado"} />
                <DetailBox label="E-mail" value={selected.email || "Não informado"} />
                <DetailBox label="Nascimento" value={formatDateBR(selected.nascimento)} />
                <DetailBox label="Status da conta" value={selected.contaStatus} />
                <DetailBox label="Total de pedidos" value={String(selected.totalPedidos)} />
                <DetailBox label="Último pedido" value={selected.ultimoPedidoAt ? formatDateTimeBR(selected.ultimoPedidoAt) : "Sem pedidos"} />
                <DetailBox label="Último status" value={selected.ultimoStatus ? statusLabel(selected.ultimoStatus) : "Sem histórico"} />
                <DetailBox label="Região" value={selected.ultimoEndereco || buildLocationSummary(selected.addresses)} />
                <DetailBox label="Push ativo" value={selected.pushDevices.filter((item) => item.enabled).length ? "Sim" : "Não"} />
                <DetailBox label="Gás atual" value={`${Math.round(Number(selected.gasTank.state.current_level || 0))}%`} />
              </div>

              <div style={miniInsightGrid}>
                <InsightMini title="Ausências" value={String(selected.ausenciaCount)} danger={selected.ausenciaCount > 0} />
                <InsightMini title="Comprou de outro" value={String(selected.comprouDeOutroCount)} danger={selected.comprouDeOutroCount > 0} />
                <InsightMini title="Sem contato" value={String(selected.semContatoCount)} danger={selected.semContatoCount > 0} />
              </div>

              <div style={subCard}>
                <div style={subTitle}>Ações rápidas de suporte</div>
                <div style={subHint}>
                  Ações críticas pedem confirmação e motivo antes de salvar na auditoria.
                </div>

                <div style={actionGrid}>
                  <button onClick={() => void setClientStatus("normal")} type="button" style={normalBtn} disabled={supportBusy !== ""}>
                    Marcar normal
                  </button>
                  <button onClick={() => void setClientStatus("atencao")} type="button" style={warnBtn} disabled={supportBusy !== ""}>
                    Marcar atenção
                  </button>
                  <button onClick={() => void setClientStatus("bloqueado")} type="button" style={dangerBtn} disabled={supportBusy !== ""}>
                    Bloquear cliente
                  </button>
                  <button onClick={() => void correctPhoneLogin()} type="button" style={secondaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                    Corrigir telefone
                  </button>
                  <button onClick={() => void resetPassword()} type="button" style={secondaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                    Senha temporária
                  </button>
                  <button onClick={() => void disablePushDevices()} type="button" style={secondaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                    Limpar dispositivos
                  </button>
                </div>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Dados pessoais</div>
                <div style={formGridTwo}>
                  <Field label="Nome completo">
                    <input
                      value={personalForm.nome}
                      onChange={(e) => setPersonalForm((current) => ({ ...current, nome: e.target.value }))}
                      style={fieldInput}
                    />
                  </Field>
                  <Field label="CPF">
                    <input
                      value={personalForm.cpf}
                      onChange={(e) => setPersonalForm((current) => ({ ...current, cpf: e.target.value }))}
                      style={fieldInput}
                    />
                  </Field>
                  <Field label="E-mail">
                    <input
                      value={personalForm.email}
                      onChange={(e) => setPersonalForm((current) => ({ ...current, email: e.target.value }))}
                      style={fieldInput}
                    />
                  </Field>
                  <Field label="Nascimento">
                    <input
                      value={personalForm.nascimento}
                      onChange={(e) => setPersonalForm((current) => ({ ...current, nascimento: e.target.value }))}
                      style={fieldInput}
                      type="date"
                    />
                  </Field>
                </div>

                <button onClick={() => void savePersonalData()} type="button" style={primaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                  Salvar dados pessoais
                </button>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Endereço principal e ponto do mapa</div>
                <div style={subHint}>{primaryAddress ? buildAddressPreview(primaryAddress) : "Cliente ainda sem endereço salvo."}</div>

                <div style={formGridTwo}>
                  <Field label="Apelido">
                    <input
                      value={addressForm.label}
                      onChange={(e) => setAddressForm((current) => ({ ...current, label: e.target.value }))}
                      style={fieldInput}
                    />
                  </Field>
                  <Field label="Telefone do endereço">
                    <input
                      value={addressForm.phone}
                      onChange={(e) => setAddressForm((current) => ({ ...current, phone: e.target.value }))}
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
                  <Field label="Número">
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
                  <Field label="Referência">
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

                <button onClick={() => void savePrimaryAddress()} type="button" style={primaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                  Salvar endereço principal
                </button>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Monitoramento do gás</div>
                <div style={miniInsightGrid}>
                  <InsightMini title="Nível atual" value={`${Math.round(Number(selected.gasTank.state.current_level || 0))}%`} />
                  <InsightMini title="Média configurada" value={`${Math.round(Number(selected.gasTank.setup.average_duration_days || 30))} dias`} />
                  <InsightMini title="Última troca" value={formatDateBR(selected.gasTank.setup.last_exchange_date)} />
                </div>

                <div style={formGridTwo}>
                  <Field label="Média por botijão (dias)">
                    <input
                      value={gasForm.averageDurationDays}
                      onChange={(e) => setGasForm((current) => ({ ...current, averageDurationDays: e.target.value }))}
                      style={fieldInput}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Dias desde a última troca">
                    <input
                      value={gasForm.daysSinceLastExchange}
                      onChange={(e) => setGasForm((current) => ({ ...current, daysSinceLastExchange: e.target.value }))}
                      style={fieldInput}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Nível estimado (%)">
                    <input
                      value={gasForm.currentLevel}
                      onChange={(e) => setGasForm((current) => ({ ...current, currentLevel: e.target.value }))}
                      style={fieldInput}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Lembretes de gás">
                    <div style={inlinePreferenceRow}>
                      <button
                        onClick={() => void updateNotificationFlag("notifsGas", !selected.notifsGas)}
                        type="button"
                        style={selected.notifsGas ? smallToggleOn : smallToggleOff}
                        disabled={supportBusy !== "" || !selected.authUserId}
                      >
                        {selected.notifsGas ? "Ativo" : "Inativo"}
                      </button>
                    </div>
                  </Field>
                </div>

                <div style={actionGrid}>
                  <button onClick={() => void saveGasProfile()} type="button" style={primaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                    Salvar monitoramento
                  </button>
                  <button onClick={() => void resetGasTo100()} type="button" style={secondaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                    Resetar para 100%
                  </button>
                </div>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Notificações e dispositivos</div>

                <div style={miniInsightGrid}>
                  <InsightMini title="Pedido" value={selected.notifsPedido ? "Ativo" : "Inativo"} />
                  <InsightMini title="Gás" value={selected.notifsGas ? "Ativo" : "Inativo"} />
                  <InsightMini title="Promoções" value={selected.notifsPromos ? "Ativo" : "Inativo"} />
                </div>

                <div style={actionGrid}>
                  <button onClick={() => void updateNotificationFlag("notifsPedido", !selected.notifsPedido)} type="button" style={secondaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                    Pedido {selected.notifsPedido ? "on" : "off"}
                  </button>
                  <button onClick={() => void updateNotificationFlag("notifsGas", !selected.notifsGas)} type="button" style={secondaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                    Gás {selected.notifsGas ? "on" : "off"}
                  </button>
                  <button onClick={() => void updateNotificationFlag("notifsPromos", !selected.notifsPromos)} type="button" style={secondaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                    Promoções {selected.notifsPromos ? "on" : "off"}
                  </button>
                </div>

                <div style={formGridOne}>
                  <Field label="Título do push de teste">
                    <input
                      value={pushTestForm.title}
                      onChange={(e) => setPushTestForm((current) => ({ ...current, title: e.target.value }))}
                      style={fieldInput}
                    />
                  </Field>
                  <Field label="Mensagem do push">
                    <textarea
                      value={pushTestForm.body}
                      onChange={(e) => setPushTestForm((current) => ({ ...current, body: e.target.value }))}
                      style={fieldTextArea}
                    />
                  </Field>
                  <Field label="Rota ao abrir">
                    <input
                      value={pushTestForm.route}
                      onChange={(e) => setPushTestForm((current) => ({ ...current, route: e.target.value }))}
                      style={fieldInput}
                    />
                  </Field>
                </div>

                <div style={actionGrid}>
                  <button onClick={() => void sendPushTest()} type="button" style={primaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                    Enviar push de teste
                  </button>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {selected.pushDevices.length === 0 ? (
                    <div style={emptyTextSmall}>Sem dispositivos push ativos para este cliente.</div>
                  ) : (
                    selected.pushDevices.map((device) => (
                      <div key={device.installation_id} style={deviceRow}>
                        <div style={{ minWidth: 0 }}>
                          <div style={deviceTitle}>{device.app_variant} | {device.platform}</div>
                          <div style={deviceMeta}>Instalação {device.installation_id.slice(0, 10)}... | token {device.enabled ? "ativo" : "inativo"}</div>
                          <div style={deviceMeta}>Último registro {formatDateTimeBR(device.last_registered_at)}</div>
                        </div>
                        <div style={statusMini}>{device.enabled ? "Ativo" : "Inativo"}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={subCard}>
                <div style={subTitle}>Observação interna</div>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  style={fieldTextArea}
                  placeholder="Ex.: cliente VIP, retorno comercial, corrigido endereço, chamado aberto, acompanhamento manual..."
                />
                <button onClick={() => void saveNotes()} type="button" style={primaryBtn} disabled={supportBusy !== "" || !selected.authUserId}>
                  Salvar observação
                </button>
              </div>

              <div style={subCardDark}>
                <div style={subTitleDark}>Auditoria recente</div>
                {auditRows.length === 0 ? (
                  <div style={emptyTextOnDark}>Ainda não há ações auditadas para esse cliente.</div>
                ) : (
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {auditRows.slice(0, 8).map((row) => (
                      <div key={row.id} style={auditRow}>
                        <div style={auditTitle}>{row.event}</div>
                        <div style={auditMeta}>{formatDateTimeBR(row.created_at)} | {row.category}</div>
                        <div style={auditMessage}>{safeText(row.message) || "Ação administrativa registrada."}</div>
                        {safeText((row.details ?? {}).reason) ? (
                          <div style={auditReason}>Motivo: {safeText((row.details ?? {}).reason)}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={subCard}>
                <div style={subTitle}>Últimos pedidos do cliente</div>
                {selected.pedidos.length === 0 ? (
                  <div style={emptyTextSmall}>Sem pedidos registrados.</div>
                ) : (
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {selected.pedidos.slice(0, 8).map((pedido: any) => (
                      <div key={pedido.id} style={orderRow}>
                        <div style={{ minWidth: 0 }}>
                          <div style={orderTitle}>Pedido #{String(pedido.id).slice(0, 6)}</div>
                          <div style={orderMeta}>
                            {statusLabel(pedido.status)} | {formatDateTimeBR(pedido.updatedAt ?? pedido.createdAt)}
                          </div>
                          <div style={orderMeta}>
                            {safeText(
                              pedido?.enderecoSnapshot?.bairro ??
                                pedido?.enderecoSnapshot?.neighborhood
                            ) || "Sem bairro"} /{" "}
                            {safeText(
                              pedido?.enderecoSnapshot?.cidade ??
                                pedido?.enderecoSnapshot?.city
                            ) || "Sem cidade"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={orderValue}>{money(Number(pedido.total || 0))}</div>
                          {pedido.cancelamentoSuspeito ? <div style={riskTag}>Suspeito</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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

const premiumGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const spotlightCard: CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const spotlightCardDark: CSSProperties = {
  background: "linear-gradient(135deg,#111827 0%, #1F2937 60%, #374151 100%)",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.06)",
  boxShadow: "0 20px 40px rgba(15,23,42,0.16)",
  color: "#fff",
};

const spotlightLabel: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const spotlightLabelDark: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#fff",
};

const premiumRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const premiumRowDark: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const premiumTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const premiumMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
};

const premiumValue: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
  whiteSpace: "nowrap",
};

const premiumTitleDark: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#fff",
};

const premiumMetaDark: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "rgba(255,255,255,0.74)",
};

const premiumValueDark: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#fff",
  whiteSpace: "nowrap",
};

const emptyTextOnDark: CSSProperties = {
  fontSize: 13.5,
  color: "rgba(255,255,255,0.72)",
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

const campaignLinkBtn: CSSProperties = {
  height: 38,
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 14,
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 900,
  textDecoration: "none",
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

const rowStrong: CSSProperties = {
  fontSize: 14.5,
  fontWeight: 950,
  color: "#111827",
};

const statusMini: CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  fontWeight: 900,
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
};

const miniInsightGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
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

const normalBtn: CSSProperties = {
  ...secondaryBtn,
  background: "rgba(16,185,129,0.08)",
  color: "#166534",
  border: "1px solid rgba(22,163,74,0.16)",
};

const warnBtn: CSSProperties = {
  ...secondaryBtn,
  background: "rgba(245,158,11,0.10)",
  color: "#B45309",
  border: "1px solid rgba(245,158,11,0.18)",
};

const dangerBtn: CSSProperties = {
  ...secondaryBtn,
  background: "rgba(185,28,28,0.10)",
  color: "#B91C1C",
  border: "1px solid rgba(185,28,28,0.18)",
};

const inlinePreferenceRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 46,
};

const smallToggleOn: CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid rgba(22,163,74,0.18)",
  background: "rgba(22,163,74,0.10)",
  color: "#166534",
  fontWeight: 900,
  cursor: "pointer",
};

const smallToggleOff: CSSProperties = {
  ...smallToggleOn,
  border: "1px solid rgba(100,116,139,0.18)",
  background: "rgba(100,116,139,0.10)",
  color: "#475569",
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

const riskTag: CSSProperties = {
  marginTop: 6,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 28,
  padding: "0 10px",
  borderRadius: 999,
  background: "rgba(185,28,28,0.10)",
  color: "#B91C1C",
  fontWeight: 900,
  fontSize: 11.5,
};
