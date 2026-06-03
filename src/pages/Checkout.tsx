import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../layout";
import { usePedidoStore } from "../store/usePedidoStore";
import { useAuthStore } from "../store/useAuthStore";
import { useRemoteSyncStore } from "../store/useRemoteSyncStore";
import { getAddresses, getPrimaryAddressId } from "../services/addressStore";
import type { Address } from "../services/addressStore";
import PageHeader from "../components/PageHeader";
import { couponAdminService } from "../services/couponAdminService";
import { appLogger } from "../services/appLogger";
import { saveClientProfilePatch } from "../services/remoteUserStateService";
import { emitToast } from "../services/realtimeBus";
import {
  readLocalUserDocumentPayload,
  type ClientProfileDocument,
} from "../services/userStateSchemas";

type ScheduleType = "imediato" | "agendado";
type Payment = "dinheiro" | "pix" | "cartao";

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

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

function maskPhoneBR(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function isPastDateTime(dtLocal: string) {
  if (!dtLocal) return false;
  const d = new Date(dtLocal);
  return d.getTime() < Date.now();
}

function toUtcIsoFromLocalDateTime(dtLocal: string) {
  if (!dtLocal) return "";
  const parsed = new Date(dtLocal);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString();
}

function getPedidoErrorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message) return "";

  const raw = error.message.trim();

  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw) as {
        message?: string;
        code?: string;
      };
      return String(parsed.message || parsed.code || raw).trim();
    } catch {
      return raw;
    }
  }

  return raw;
}

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type ConfirmModal =
  | null
  | {
      title: string;
      subtitle: string;
      cta: string;
      onCta: () => void;
    };

export default function Checkout() {
  const navigate = useNavigate();

  const carrinho = usePedidoStore((s) => s.carrinho);
  const pedidos = usePedidoStore((s) => s.pedidos);
  const criarPedido = usePedidoStore((s) => s.criarPedido);
  const aumentarQuantidadeCarrinho = usePedidoStore((s) => s.aumentarQuantidadeCarrinho);
  const diminuirQuantidadeCarrinho = usePedidoStore((s) => s.diminuirQuantidadeCarrinho);
  const authUserId = useAuthStore((s) => s.user?.id ?? "");
  const publicVersion = useRemoteSyncStore((s) => s.publicVersion);
  const clientProfile = useMemo(
    () =>
      readLocalUserDocumentPayload("client_profile") as ClientProfileDocument,
    [publicVersion]
  );

  const [addresses, setAddresses] = useState<Address[]>(() => getAddresses());
  const [addressId, setAddressId] = useState<string>(() => {
    const currentAddresses = getAddresses();
    return getPrimaryAddressId() || currentAddresses[0]?.id || "";
  });

  const [tipo, setTipo] = useState<ScheduleType>("imediato");
  const [horarioAgendado, setHorarioAgendado] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<Payment>("dinheiro");

  const [observacao, setObservacao] = useState("");
  const [phone, setPhone] = useState(() => maskPhoneBR(clientProfile.telefone || ""));
  const [clienteNome, setClienteNome] = useState(() => clientProfile.nome || "Cliente");

  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [geoLink, setGeoLink] = useState(() => safeGet("cg_last_geo_link", ""));
  const [geoLat, setGeoLat] = useState<number | null>(() => {
    const raw = safeGet("cg_last_geo_lat", "");
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });
  const [geoLng, setGeoLng] = useState<number | null>(() => {
    const raw = safeGet("cg_last_geo_lng", "");
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });

  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<null | {
    id: string;
    codigo: string;
    titulo: string;
    tipo: "fixo" | "percentual" | "frete";
    desconto: number;
    taxaEntregaFinal: number;
    totalFinal: number;
  }>(null);

  const [didSubmit, setDidSubmit] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);
  const [submitting, setSubmitting] = useState(false);

  const taxaEntrega = 10;

  const subtotal = useMemo(() => {
    return carrinho.reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0);
  }, [carrinho]);

  const taxaEntregaFinal = appliedCoupon ? appliedCoupon.taxaEntregaFinal : taxaEntrega;
  const descontoAplicado = appliedCoupon ? appliedCoupon.desconto : 0;
  const total = appliedCoupon ? appliedCoupon.totalFinal : subtotal + taxaEntrega;

  useEffect(() => {
    if (carrinho.length === 0 && !didSubmit && !confirmModal) {
      navigate("/loja");
    }
  }, [carrinho.length, didSubmit, confirmModal, navigate]);

  useEffect(() => {
    function refreshAddresses() {
      const currentAddresses = getAddresses();
      const preferredId = getPrimaryAddressId() || currentAddresses[0]?.id || "";
      setAddresses(currentAddresses);
      setAddressId((currentId) => {
        if (currentAddresses.some((address) => address.id === currentId)) {
          return currentId;
        }
        return preferredId;
      });
    }

    refreshAddresses();
    window.addEventListener("storage", refreshAddresses);
    window.addEventListener("focus", refreshAddresses);
    return () => {
      window.removeEventListener("storage", refreshAddresses);
      window.removeEventListener("focus", refreshAddresses);
    };
  }, []);

  useEffect(() => {
    setPhone((current) =>
      current.trim() ? current : maskPhoneBR(clientProfile.telefone || "")
    );
    setClienteNome((current) =>
      current.trim() && current.trim().toLowerCase() !== "cliente"
        ? current
        : clientProfile.nome || "Cliente"
    );
  }, [clientProfile.nome, clientProfile.telefone]);

  useEffect(() => {
    if (!appliedCoupon?.codigo) return;

    const result = couponAdminService.validateForCheckout({
      code: appliedCoupon.codigo,
      subtotal,
      taxaEntrega,
      clienteId: authUserId,
      clienteTelefone: phone,
      pedidos,
    });

    if (!result.ok) {
      setAppliedCoupon(null);
      setCouponMessage("Cupom removido porque as condições mudaram.");
      return;
    }

    const nextCoupon = {
      id: result.coupon.id,
      codigo: result.coupon.codigo,
      titulo: result.coupon.titulo,
      tipo: result.coupon.tipo,
      desconto: result.desconto,
      taxaEntregaFinal: result.taxaEntregaFinal,
      totalFinal: result.totalFinal,
    };

    const unchanged =
      appliedCoupon.id === nextCoupon.id &&
      appliedCoupon.codigo === nextCoupon.codigo &&
      appliedCoupon.titulo === nextCoupon.titulo &&
      appliedCoupon.tipo === nextCoupon.tipo &&
      appliedCoupon.desconto === nextCoupon.desconto &&
      appliedCoupon.taxaEntregaFinal === nextCoupon.taxaEntregaFinal &&
      appliedCoupon.totalFinal === nextCoupon.totalFinal;

    if (!unchanged) {
      setAppliedCoupon(nextCoupon);
    }
  }, [subtotal, taxaEntrega, appliedCoupon?.codigo, publicVersion, authUserId, phone, pedidos]);

  const orderedAddresses = useMemo(() => {
    const primaryAddressId = getPrimaryAddressId();
    return [...addresses].sort((a, b) => {
      const aScore = a.id === primaryAddressId ? 1 : 0;
      const bScore = b.id === primaryAddressId ? 1 : 0;
      if (aScore !== bScore) return bScore - aScore;
      const aUpdated = new Date(a.updatedAt ?? a.createdAt).getTime();
      const bUpdated = new Date(b.updatedAt ?? b.createdAt).getTime();
      return bUpdated - aUpdated;
    });
  }, [addresses]);

  function selectedAddress(): Address | null {
    const a = orderedAddresses.find((x) => x.id === addressId);
    return a ?? null;
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard?.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function buildMapsLink(lat: number, lng: number) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  function usarMinhaLocalizacao() {
    if (!("geolocation" in navigator)) {
      emitToast("Localizacao indisponivel", "Seu navegador nao suporta localizacao.", "warning");
      return;
    }

    setGeoStatus("loading");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const link = buildMapsLink(lat, lng);

        setGeoLat(lat);
        setGeoLng(lng);
        setGeoLink(link);

        safeSet("cg_last_geo_lat", String(lat));
        safeSet("cg_last_geo_lng", String(lng));
        safeSet("cg_last_geo_link", link);

        const ok = await copyText(link);
        setGeoStatus("ok");

        if (ok) {
          emitToast("Localizacao salva", "O link do mapa foi copiado para facilitar a entrega.", "success");
        } else {
          emitToast(
            "Localizacao gerada",
            "Nao consegui copiar automaticamente. Use o link exibido abaixo.",
            "info"
          );
        }
      },
      () => {
        setGeoStatus("error");
        emitToast(
          "Falha na localizacao",
          "Nao consegui pegar sua localizacao. Verifique a permissao do navegador.",
          "error"
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function validarTelefoneObrigatorio() {
    const digits = onlyDigits(phone);
    return digits.length === 10 || digits.length === 11;
  }

  function aplicarCupom() {
    const result = couponAdminService.validateForCheckout({
      code: couponCode,
      subtotal,
      taxaEntrega,
      clienteId: authUserId,
      clienteTelefone: phone,
      pedidos,
    });

    if (!result.ok) {
      setAppliedCoupon(null);
      setCouponMessage(result.message);
      return;
    }

    setAppliedCoupon({
      id: result.coupon.id,
      codigo: result.coupon.codigo,
      titulo: result.coupon.titulo,
      tipo: result.coupon.tipo,
      desconto: result.desconto,
      taxaEntregaFinal: result.taxaEntregaFinal,
      totalFinal: result.totalFinal,
    });
    setCouponMessage(result.message);
  }

  function removerCupom() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponMessage("Cupom removido.");
  }

  function openConfirmedModal(orderId?: string | null) {
    const id = orderId || null;

    setConfirmModal({
      title: "Pedido confirmado",
      subtitle: "Seu pedido foi enviado. Agora acompanhe o status, o PIN de segurança e a entrega pelo app.",
      cta: "Acompanhar agora",
      onCta: () => {
        setConfirmModal(null);
        if (id) navigate(`/orders/${id}`);
        else navigate("/orders");
      },
    });
  }

  async function confirmarPedido() {
    if (submitting || carrinho.length === 0) return;

    if (!clienteNome.trim()) {
      emitToast("Nome obrigatorio", "Informe seu nome para confirmar o pedido.", "warning");
      return;
    }

    if (!validarTelefoneObrigatorio()) {
      emitToast("Telefone invalido", "Informe um telefone valido com DDD.", "warning");
      return;
    }

    const phoneDigits = onlyDigits(phone);

    saveClientProfilePatch({
      nome: clienteNome.trim(),
    });

    if (!addressId) {
      emitToast("Endereço obrigatório", "Selecione um endereço para entrega.", "warning");
      return;
    }

    if (tipo === "agendado") {
      if (!horarioAgendado) {
        emitToast("Agendamento incompleto", "Selecione a data e hora do agendamento.", "warning");
        return;
      }
      if (isPastDateTime(horarioAgendado)) {
        emitToast("Horario invalido", "Nao e possivel agendar no passado.", "warning");
        return;
      }
    }

    const endereco = selectedAddress();
    const observacaoFinal = observacao.trim() || null;

    if (!authUserId) {
      emitToast(
        "Acesso pendente",
        "Seu acesso ainda está sendo preparado. Tente novamente em instantes.",
        "warning"
      );
      return;
    }

    const enderecoSnapshot = endereco
      ? {
          ...endereco,
          lat: geoLat ?? (endereco as any)?.lat ?? (endereco as any)?.latitude ?? null,
          lng: geoLng ?? (endereco as any)?.lng ?? (endereco as any)?.longitude ?? null,
          latitude: geoLat ?? (endereco as any)?.latitude ?? (endereco as any)?.lat ?? null,
          longitude: geoLng ?? (endereco as any)?.longitude ?? (endereco as any)?.lng ?? null,
        }
      : null;

    try {
      setSubmitting(true);
      setDidSubmit(true);

      const novo = await criarPedido({
        clienteId: authUserId,
        tipo,
        horarioAgendado:
          tipo === "agendado"
            ? toUtcIsoFromLocalDateTime(horarioAgendado)
            : null,
        taxaEntrega,
        taxaEntregaFinal,
        formaPagamento,
        enderecoId: endereco?.id ?? null,
        enderecoSnapshot,
        observacao: observacaoFinal,
        clienteNome: clienteNome.trim(),
        clienteTelefone: phoneDigits,
        descontoAplicado,
        totalFinal: total,
        cupomId: appliedCoupon?.id ?? null,
        cupomCodigo: appliedCoupon?.codigo ?? null,
        cupomTitulo: appliedCoupon?.titulo ?? null,
        cupomTipo: appliedCoupon?.tipo ?? null,
      });

      if (!novo?.id) {
        throw new Error("criarPedido retornou nulo");
      }

      openConfirmedModal(novo.id);
    } catch (error) {
      appLogger.error("checkout", "confirmar_pedido_failed", error, {
        tipo,
        addressId,
        authUserId,
      });
      setDidSubmit(false);
      const detail = getPedidoErrorMessage(error);
      emitToast(
        "Falha ao confirmar",
        detail || "Ocorreu um erro ao confirmar o pedido.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
    padding: 14,
    marginTop: 12,
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 13,
    color: "#111",
    marginBottom: 8,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 46,
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.12)",
    padding: "0 14px",
    outline: "none",
    fontWeight: 700,
    color: "#111827",
    background: "#fff",
  };

  return (
    <Layout>
      <div style={{ paddingBottom: 96 }}>
        <PageHeader title="Finalizar pedido" subtitle="Revise os itens e confirme os dados da entrega" />

        <div style={heroCard}>
          <div style={heroTitle}>Revise e confirme</div>
          <div style={heroSub}>
            Seu pedido terá PIN de segurança e acompanhamento pelo app.
          </div>
          <div style={heroSummaryRow}>
            <div style={heroSummaryPill}>{carrinho.length} item(ns)</div>
            <div style={heroSummaryPill}>Entrega {money(taxaEntregaFinal)}</div>
            <div style={heroSummaryPill}>Total {money(total)}</div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Itens do carrinho</div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {carrinho.map((item) => (
              <div key={item.produtoId} style={cartRow}>
                <div style={{ minWidth: 0 }}>
                  <div style={cartItemName}>{item.nome}</div>
                  <div style={cartItemMeta}>{money(item.precoUnitario)} por unidade</div>
                </div>

                <div style={cartControls}>
                  <button
                    onClick={() => diminuirQuantidadeCarrinho(item.produtoId)}
                    style={qtyBtn}
                    type="button"
                    aria-label={`Diminuir ${item.nome}`}
                  >
                    -
                  </button>

                  <div style={qtyValue}>{item.quantidade}</div>

                  <button
                    onClick={() => aumentarQuantidadeCarrinho(item.produtoId)}
                    style={qtyBtnPrimary}
                    type="button"
                    aria-label={`Aumentar ${item.nome}`}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Seus dados</div>

          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div>
              <div style={labelStyle}>Nome</div>
              <input
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                placeholder="Seu nome"
                style={inputStyle}
              />
            </div>

            <div>
              <div style={labelStyle}>Telefone (obrigatório)</div>
              <input
                value={phone}
                onChange={(e) => setPhone(maskPhoneBR(e.target.value))}
                placeholder="(61) 99999-9999"
                inputMode="tel"
                style={{
                  ...inputStyle,
                  border: validarTelefoneObrigatorio()
                    ? "1px solid rgba(0,0,0,0.12)"
                    : "2px solid rgba(209,43,43,0.45)",
                }}
              />
              {!validarTelefoneObrigatorio() && (
                <div style={{ marginTop: 8, color: "#D12B2B", fontSize: 12 }}>
                  Informe um telefone válido com DDD.
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Entrega</div>

          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>Endereço</div>
            <select
              value={addressId}
              onChange={(e) => setAddressId(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {orderedAddresses.length === 0 ? (
                <option value="">Nenhum endereço cadastrado</option>
              ) : (
                orderedAddresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))
              )}
            </select>

            <button
              onClick={() => navigate("/my-addresses", { state: { returnTo: "/checkout" } })}
              style={secondaryBtn}
              type="button"
            >
              Gerenciar endereços
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={labelStyle}>Ponto da entrega no mapa</div>

            <button
              onClick={usarMinhaLocalizacao}
              style={mapBtn}
              type="button"
            >
              {geoStatus === "loading"
                ? "Localizando..."
                : geoLat != null && geoLng != null
                ? "Atualizar ponto no mapa"
                : "Marcar meu ponto atual"}
            </button>

            <div style={{ marginTop: 8, color: "#666", fontSize: 12, lineHeight: 1.5 }}>
              Salve o ponto da entrega para facilitar a rota do entregador.
            </div>

            {geoLat != null && geoLng != null ? (
              <div style={geoBox}>
                <div style={{ fontWeight: 900, color: "#111827" }}>Ponto salvo</div>
                <div style={{ marginTop: 6, color: "#475569", fontSize: 13 }}>
                  Lat: {geoLat.toFixed(6)} • Lng: {geoLng.toFixed(6)}
                </div>
                {geoLink ? (
                  <a
                    href={geoLink}
                    target="_blank"
                    rel="noreferrer"
                    style={geoLinkBtn}
                  >
                    Ver no Maps
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Quando deseja?</div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              onClick={() => setTipo("imediato")}
              style={{
                ...choiceBtn,
                border: tipo === "imediato" ? "2px solid rgba(228,79,42,0.55)" : "1px solid rgba(0,0,0,0.12)",
                background: tipo === "imediato" ? "rgba(228,79,42,0.10)" : "#fff",
                color: tipo === "imediato" ? "#E44F2A" : "#111",
              }}
              type="button"
            >
              Agora
            </button>

            <button
              onClick={() => setTipo("agendado")}
              style={{
                ...choiceBtn,
                border: tipo === "agendado" ? "2px solid rgba(228,79,42,0.55)" : "1px solid rgba(0,0,0,0.12)",
                background: tipo === "agendado" ? "rgba(228,79,42,0.10)" : "#fff",
                color: tipo === "agendado" ? "#E44F2A" : "#111",
              }}
              type="button"
            >
              Agendar
            </button>
          </div>

          {tipo === "agendado" && (
            <div style={{ marginTop: 12 }}>
              <div style={labelStyle}>Data e hora</div>
              <input
                type="datetime-local"
                value={horarioAgendado}
                onChange={(e) => setHorarioAgendado(e.target.value)}
                style={inputStyle}
              />
              {horarioAgendado && isPastDateTime(horarioAgendado) && (
                <div style={{ marginTop: 8, color: "#D12B2B", fontSize: 12 }}>
                  Agendamento no passado não é permitido.
                </div>
              )}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Pagamento</div>

          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>Forma</div>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value as Payment)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
              <option value="cartao">Cartão</option>
            </select>

            <div style={{ marginTop: 10, color: "#64748B", fontSize: 12.5, lineHeight: 1.5 }}>
              Escolha como prefere pagar no recebimento do pedido.
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Cupom</div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              style={inputStyle}
              placeholder="Digite seu cupom"
            />

            {appliedCoupon ? (
              <button onClick={removerCupom} type="button" style={secondaryBtnInline}>
                Remover cupom
              </button>
            ) : (
              <button onClick={aplicarCupom} type="button" style={primarySmallBtn}>
                Aplicar cupom
              </button>
            )}

            {couponMessage ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: 12,
                  background: appliedCoupon ? "rgba(22,163,74,0.08)" : "rgba(185,28,28,0.06)",
                  color: appliedCoupon ? "#166534" : "#7F1D1D",
                  border: appliedCoupon
                    ? "1px solid rgba(22,163,74,0.14)"
                    : "1px solid rgba(185,28,28,0.12)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {couponMessage}
              </div>
            ) : null}

            {appliedCoupon ? (
              <div style={couponBox}>
                <div style={{ fontWeight: 950, color: "#111827" }}>
                  {appliedCoupon.codigo} • {appliedCoupon.titulo}
                </div>
                <div style={{ marginTop: 6, color: "#475569", fontSize: 13 }}>
                  Tipo: {appliedCoupon.tipo} • Desconto: {money(appliedCoupon.desconto)}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Observação</div>

          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: portaria, casa do fundo, referência, bloco ou apartamento"
            style={textAreaStyle}
          />
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Resumo</div>

          <div style={{ marginTop: 12, color: "#333" }}>
            <div style={summaryRow}>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>

            <div style={{ ...summaryRow, marginTop: 8 }}>
              <span>Entrega</span>
              <strong>{money(taxaEntregaFinal)}</strong>
            </div>

            {descontoAplicado > 0 ? (
              <div style={{ ...summaryRow, marginTop: 8 }}>
                <span>Desconto</span>
                <strong style={{ color: "#16A34A" }}>- {money(descontoAplicado)}</strong>
              </div>
            ) : null}

            <div style={totalRow}>
              <span style={{ fontWeight: 900 }}>Total</span>
              <span style={{ fontWeight: 900, color: "#E44F2A", fontSize: 18 }}>
                {money(total)}
              </span>
            </div>

            <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
              * Entregas podem exigir PIN de segurança para finalização.
            </div>
          </div>

          <button
            onClick={confirmarPedido}
            style={{ ...primaryBtn, opacity: submitting ? 0.7 : 1 }}
            type="button"
            disabled={submitting}
          >
            {submitting ? "Confirmando..." : "Confirmar pedido"}
          </button>

          <button
            onClick={() => navigate("/loja")}
            style={secondaryBtn}
            type="button"
          >
            Voltar para a loja
          </button>
        </div>
      </div>

      {confirmModal && (
        <div
          onClick={() => setConfirmModal(null)}
          style={modalBackdrop}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={modalCard}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{confirmModal.title}</div>

              <button
                onClick={() => setConfirmModal(null)}
                style={modalCloseBtn}
                aria-label="Fechar"
                type="button"
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 10, color: "#444", lineHeight: 1.5 }}>
              {confirmModal.subtitle}
            </div>

            <button
              onClick={confirmModal.onCta}
              style={modalCtaBtn}
              type="button"
            >
              {confirmModal.cta}
            </button>

          </div>
        </div>
      )}
    </Layout>
  );
}

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg,#FF4500,#FF7A18)",
  borderRadius: 22,
  padding: 18,
  color: "#fff",
  boxShadow: "0 16px 34px rgba(228,79,42,0.18)",
};

const heroTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
};

const heroSub: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  opacity: 0.94,
  lineHeight: 1.5,
};

const heroSummaryRow: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const heroSummaryPill: React.CSSProperties = {
  minHeight: 30,
  padding: "0 12px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.16)",
  border: "1px solid rgba(255,255,255,0.22)",
  fontSize: 12,
  fontWeight: 900,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const secondaryBtn: React.CSSProperties = {
  marginTop: 10,
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtnInline: React.CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const primarySmallBtn: React.CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F7A212)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(228,79,42,0.18)",
};

const mapBtn: React.CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 16,
  border: "2px solid rgba(228,79,42,0.35)",
  background: "rgba(228,79,42,0.08)",
  color: "#E44F2A",
  fontWeight: 950,
  cursor: "pointer",
};

const geoBox: React.CSSProperties = {
  marginTop: 12,
  borderRadius: 16,
  padding: 12,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.08)",
};

const geoLinkBtn: React.CSSProperties = {
  display: "inline-block",
  marginTop: 10,
  textDecoration: "none",
  color: "#E44F2A",
  fontWeight: 900,
};

const cartRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: 14,
  borderRadius: 18,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.08)",
};

const cartItemName: React.CSSProperties = {
  fontWeight: 900,
  color: "#111827",
  fontSize: 15,
};

const cartItemMeta: React.CSSProperties = {
  marginTop: 6,
  color: "#64748B",
  fontSize: 12.5,
  fontWeight: 700,
};

const cartControls: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexShrink: 0,
};

const qtyBtn: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#fff",
  color: "#64748B",
  fontWeight: 900,
  fontSize: 18,
  cursor: "pointer",
};

const qtyBtnPrimary: React.CSSProperties = {
  ...qtyBtn,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F7A212)",
  color: "#fff",
  boxShadow: "0 10px 22px rgba(228,79,42,0.18)",
};

const qtyValue: React.CSSProperties = {
  minWidth: 20,
  textAlign: "center",
  fontWeight: 900,
  color: "#111827",
};

const choiceBtn: React.CSSProperties = {
  flex: 1,
  height: 46,
  borderRadius: 16,
  fontWeight: 900,
  cursor: "pointer",
};

const textAreaStyle: React.CSSProperties = {
  marginTop: 10,
  width: "100%",
  minHeight: 96,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  padding: 12,
  outline: "none",
  fontWeight: 700,
  resize: "vertical",
};

const summaryRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
};

const totalRow: React.CSSProperties = {
  borderTop: "1px dashed rgba(0,0,0,0.12)",
  marginTop: 12,
  paddingTop: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const primaryBtn: React.CSSProperties = {
  marginTop: 14,
  width: "100%",
  height: 54,
  borderRadius: 18,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F7A212)",
  color: "#fff",
  fontWeight: 900,
  fontSize: 16,
  cursor: "pointer",
  boxShadow: "0 10px 26px rgba(228,79,42,0.25)",
};

const couponBox: React.CSSProperties = {
  borderRadius: 16,
  padding: 12,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 9999,
};

const modalCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const modalCloseBtn: React.CSSProperties = {
  marginLeft: "auto",
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const modalCtaBtn: React.CSSProperties = {
  marginTop: 14,
  width: "100%",
  height: 48,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F7A212)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 26px rgba(228,79,42,0.22)",
};


