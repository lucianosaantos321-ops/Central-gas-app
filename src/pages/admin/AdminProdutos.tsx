import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { useRemoteSyncStore } from "../../store/useRemoteSyncStore";
import { productCatalogService } from "../../services/productCatalogService";
import { couponAdminService } from "../../services/couponAdminService";
import { adminAuditTrailService } from "../../services/adminAuditTrailService";
import { adminSupportService } from "../../services/adminSupportService";
import { emitToast } from "../../services/realtimeBus";
import { usePedidoStore } from "../../store/usePedidoStore";
import type { CupomCampanha, ProdutoLoja } from "../../types";
import { money } from "../../utils/delivererHelpers";

type ProductFormState = {
  nome: string;
  preco: string;
  imagem: string;
  categoria: string;
  descricao: string;
  unidade: string;
  badge: string;
  ordem: string;
  destaque: boolean;
  ativo: boolean;
};

type CouponFormState = {
  codigo: string;
  titulo: string;
  descricao: string;
  tipo: "fixo" | "percentual" | "frete";
  valor: string;
  ativo: boolean;
  usoMaximo: string;
  minimoPedido: string;
  usoUnicoPorCliente: boolean;
  primeiraCompraApenas: boolean;
  expiraEm: string;
};

function askCriticalReason(actionLabel: string) {
  const confirmed = window.confirm(`Confirmar a acao: ${actionLabel}?`);
  if (!confirmed) return null;

  const reason = window.prompt(
    "Informe o motivo da alteracao:",
    "Ajuste administrativo de catalogo"
  );
  if (!reason || !reason.trim()) {
    emitToast(
      "Motivo obrigatorio",
      "Informe o motivo para registrar esta acao.",
      "warning"
    );
    return null;
  }

  return reason.trim();
}

function defaultProductForm(): ProductFormState {
  return {
    nome: "",
    preco: "",
    imagem: "",
    categoria: "Gas",
    descricao: "",
    unidade: "un",
    badge: "",
    ordem: "100",
    destaque: false,
    ativo: true,
  };
}

function defaultCouponForm(): CouponFormState {
  return {
    codigo: "",
    titulo: "",
    descricao: "",
    tipo: "fixo",
    valor: "",
    ativo: false,
    usoMaximo: "",
    minimoPedido: "",
    usoUnicoPorCliente: false,
    primeiraCompraApenas: false,
    expiraEm: "",
  };
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function formatExpiry(value?: string | null) {
  if (!value) return "Sem validade";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Sem validade";
  }
}

function productTone(item: ProdutoLoja) {
  if (!item.ativo) {
    return {
      background: "rgba(100,116,139,0.10)",
      color: "#475569",
      border: "1px solid rgba(100,116,139,0.18)",
    };
  }

  if (item.destaque) {
    return {
      background: "rgba(245,158,11,0.12)",
      color: "#B45309",
      border: "1px solid rgba(245,158,11,0.20)",
    };
  }

  return {
    background: "rgba(22,163,74,0.10)",
    color: "#15803D",
    border: "1px solid rgba(22,163,74,0.18)",
  };
}

export default function AdminProdutos() {
  const pedidos = usePedidoStore((s) => s.pedidos);
  const publicVersion = useRemoteSyncStore((s) => s.publicVersion);
  const [refreshKey, setRefreshKey] = useState(0);

  const produtos = useMemo(
    () => productCatalogService.getAll(),
    [refreshKey, publicVersion]
  );
  const cupons = useMemo(
    () => couponAdminService.getAll(),
    [refreshKey, publicVersion]
  );
  const couponMetrics = useMemo(
    () => couponAdminService.getMetrics(pedidos),
    [pedidos, refreshKey, publicVersion]
  );

  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedCouponId, setSelectedCouponId] = useState("");
  const [produtoForm, setProdutoForm] = useState<ProductFormState>(
    defaultProductForm
  );
  const [cupomForm, setCupomForm] = useState<CouponFormState>(
    defaultCouponForm
  );
  const [broadcastForm, setBroadcastForm] = useState({
    targetRole: "cliente" as "cliente" | "entregador",
    title: "Central Gas",
    body: "Nova promocao disponivel no app. Abra agora e aproveite.",
    route: "/loja",
  });

  const selectedProduct = useMemo(
    () => produtos.find((item) => item.id === selectedProductId) ?? null,
    [produtos, selectedProductId]
  );
  const selectedCoupon = useMemo(
    () => cupons.find((item) => item.id === selectedCouponId) ?? null,
    [cupons, selectedCouponId]
  );

  const summary = useMemo(
    () => ({
      totalProdutos: produtos.length,
      ativos: produtos.filter((item) => item.ativo).length,
      inativos: produtos.filter((item) => !item.ativo).length,
      destaques: produtos.filter((item) => item.destaque).length,
      campanhas: cupons.length,
    }),
    [produtos, cupons]
  );

  const productPerformance = useMemo(() => {
    const map = new Map<
      string,
      {
        produtoId: string;
        nome: string;
        quantidade: number;
        faturamento: number;
      }
    >();

    (Array.isArray(pedidos) ? pedidos : []).forEach((pedido: any) => {
      const itens = Array.isArray(pedido?.itens) ? pedido.itens : [];
      itens.forEach((item: any) => {
        const produtoId = String(item?.produtoId || item?.id || "").trim();
        if (!produtoId) return;

        const current = map.get(produtoId) ?? {
          produtoId,
          nome: String(item?.nome || "Produto").trim() || "Produto",
          quantidade: 0,
          faturamento: 0,
        };

        current.quantidade += Number(item?.quantidade || 0);
        current.faturamento +=
          Number(item?.precoUnitario || 0) * Number(item?.quantidade || 0);
        map.set(produtoId, current);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade);
  }, [pedidos]);

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  function resetProdutoForm() {
    setSelectedProductId("");
    setProdutoForm(defaultProductForm());
  }

  function resetCupomForm() {
    setSelectedCouponId("");
    setCupomForm(defaultCouponForm());
  }

  function loadProduto(item: ProdutoLoja) {
    setSelectedProductId(item.id);
    setProdutoForm({
      nome: item.nome,
      preco: String(item.preco ?? ""),
      imagem: item.imagem || "",
      categoria: item.categoria || "",
      descricao: item.descricao || "",
      unidade: item.unidade || "un",
      badge: item.badge || "",
      ordem: String(item.ordem ?? 100),
      destaque: Boolean(item.destaque),
      ativo: item.ativo,
    });
  }

  function loadCupom(item: CupomCampanha) {
    setSelectedCouponId(item.id);
    setCupomForm({
      codigo: item.codigo,
      titulo: item.titulo,
      descricao: item.descricao || "",
      tipo: item.tipo,
      valor: String(item.valor),
      ativo: item.ativo,
      usoMaximo: item.usoMaximo == null ? "" : String(item.usoMaximo),
      minimoPedido: item.minimoPedido == null ? "" : String(item.minimoPedido),
      usoUnicoPorCliente: Boolean(item.usoUnicoPorCliente),
      primeiraCompraApenas: Boolean(item.primeiraCompraApenas),
      expiraEm: toDateTimeLocal(item.expiraEm),
    });
  }

  async function saveProduto() {
    if (!produtoForm.nome.trim()) {
      emitToast("Nome obrigatorio", "Informe o nome do produto.", "warning");
      return;
    }

    const preco = Number(produtoForm.preco);
    const ordem = Number(produtoForm.ordem);
    if (!Number.isFinite(preco) || preco <= 0) {
      emitToast("Preco invalido", "Informe um preco valido.", "warning");
      return;
    }
    if (!Number.isFinite(ordem)) {
      emitToast(
        "Ordem invalida",
        "Informe um numero valido para ordenar o catalogo.",
        "warning"
      );
      return;
    }

    const reason = askCriticalReason(
      selectedProduct
        ? `Salvar alteracoes do produto ${selectedProduct.nome}`
        : `Criar o produto ${produtoForm.nome.trim()}`
    );
    if (!reason) return;

    const payload = {
      nome: produtoForm.nome.trim(),
      preco,
      imagem: produtoForm.imagem.trim(),
      categoria: produtoForm.categoria.trim(),
      descricao: produtoForm.descricao.trim(),
      unidade: produtoForm.unidade.trim() || "un",
      badge: produtoForm.badge.trim(),
      ordem,
      destaque: produtoForm.destaque,
      ativo: produtoForm.ativo,
    };

    if (selectedProduct) {
      const updated = productCatalogService.update(selectedProduct.id, payload);
      await adminAuditTrailService.logAction({
        category: "admin_produtos",
        event: "product_updated",
        message: "Produto atualizado pelo ADM.",
        entityType: "produto",
        entityId: selectedProduct.id,
        reason,
        before: selectedProduct,
        after: updated,
      });
      emitToast("Produto atualizado", "As alteracoes foram salvas.", "success");
    } else {
      const created = productCatalogService.create(payload);
      await adminAuditTrailService.logAction({
        category: "admin_produtos",
        event: "product_created",
        message: "Produto criado pelo ADM.",
        entityType: "produto",
        entityId: created.id,
        reason,
        before: null,
        after: created,
      });
      emitToast("Produto criado", "O produto foi adicionado ao catalogo.", "success");
    }

    resetProdutoForm();
    refresh();
  }

  async function removeProduto() {
    if (!selectedProduct) return;

    const reason = askCriticalReason(`Remover o produto ${selectedProduct.nome}`);
    if (!reason) return;

    productCatalogService.remove(selectedProduct.id);
    await adminAuditTrailService.logAction({
      category: "admin_produtos",
      event: "product_removed",
      message: "Produto removido do catalogo pelo ADM.",
      entityType: "produto",
      entityId: selectedProduct.id,
      reason,
      before: selectedProduct,
      after: null,
    });

    emitToast("Produto removido", "O produto saiu do catalogo.", "success");
    resetProdutoForm();
    refresh();
  }

  async function toggleProduto(id: string) {
    const current = produtos.find((item) => item.id === id);
    if (!current) return;

    const reason = askCriticalReason(
      current.ativo ? `Desativar ${current.nome}` : `Ativar ${current.nome}`
    );
    if (!reason) return;

    const updated = productCatalogService.toggleActive(id);
    await adminAuditTrailService.logAction({
      category: "admin_produtos",
      event: "product_availability_toggled",
      message: "Disponibilidade do produto alterada pelo ADM.",
      entityType: "produto",
      entityId: id,
      reason,
      before: current,
      after: updated,
    });

    emitToast(
      "Disponibilidade atualizada",
      current.ativo
        ? "O produto foi ocultado do cliente."
        : "O produto voltou a ficar disponivel.",
      "success"
    );
    refresh();
  }

  function saveCupom() {
    if (!cupomForm.codigo.trim()) {
      emitToast("Codigo obrigatorio", "Informe o codigo do cupom.", "warning");
      return;
    }
    if (!cupomForm.titulo.trim()) {
      emitToast("Titulo obrigatorio", "Informe o titulo da campanha.", "warning");
      return;
    }

    const valor = Number(cupomForm.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      emitToast("Valor invalido", "Informe um valor valido.", "warning");
      return;
    }

    const usoMaximo =
      cupomForm.usoMaximo.trim() === "" ? null : Number(cupomForm.usoMaximo);
    const minimoPedido =
      cupomForm.minimoPedido.trim() === ""
        ? null
        : Number(cupomForm.minimoPedido);
    const expiraEm = fromDateTimeLocal(cupomForm.expiraEm);

    if (selectedCoupon) {
      couponAdminService.update(selectedCoupon.id, {
        codigo: cupomForm.codigo.trim().toUpperCase(),
        titulo: cupomForm.titulo.trim(),
        descricao: cupomForm.descricao.trim(),
        tipo: cupomForm.tipo,
        valor,
        ativo: cupomForm.ativo,
        usoMaximo,
        minimoPedido,
        usoUnicoPorCliente: cupomForm.usoUnicoPorCliente,
        primeiraCompraApenas: cupomForm.primeiraCompraApenas,
        expiraEm,
      });
      emitToast("Cupom atualizado", "A campanha foi atualizada.", "success");
    } else {
      couponAdminService.create({
        codigo: cupomForm.codigo.trim().toUpperCase(),
        titulo: cupomForm.titulo.trim(),
        descricao: cupomForm.descricao.trim(),
        tipo: cupomForm.tipo,
        valor,
        ativo: cupomForm.ativo,
        usoMaximo,
        minimoPedido,
        usoUnicoPorCliente: cupomForm.usoUnicoPorCliente,
        primeiraCompraApenas: cupomForm.primeiraCompraApenas,
        expiraEm,
      });
      emitToast("Cupom criado", "A campanha foi criada.", "success");
    }

    resetCupomForm();
    refresh();
  }

  function removeCupom() {
    if (!selectedCoupon) return;
    const confirmed = window.confirm(`Remover a campanha ${selectedCoupon.titulo}?`);
    if (!confirmed) return;

    couponAdminService.remove(selectedCoupon.id);
    emitToast("Campanha removida", "A campanha foi removida.", "success");
    resetCupomForm();
    refresh();
  }

  function toggleCupom(id: string) {
    couponAdminService.toggleActive(id);
    refresh();
  }

  async function sendBroadcast() {
    if (!broadcastForm.title.trim() || !broadcastForm.body.trim()) {
      emitToast(
        "Mensagem incompleta",
        "Informe titulo e texto do aviso em massa.",
        "warning"
      );
      return;
    }

    const reason = askCriticalReason(
      `Disparar aviso em massa para ${
        broadcastForm.targetRole === "cliente" ? "todos os clientes" : "todos os entregadores"
      }`
    );
    if (!reason) return;

    await adminSupportService.sendPushTest({
      recipientRole: broadcastForm.targetRole,
      title: broadcastForm.title.trim(),
      body: broadcastForm.body.trim(),
      route: broadcastForm.route.trim() || null,
      eventType:
        broadcastForm.targetRole === "cliente"
          ? "promo_broadcast_admin"
          : "operacao_broadcast_admin",
      channelId:
        broadcastForm.targetRole === "entregador"
          ? "cg_entregador_ofertas_v6"
          : "cg_cliente_operacao_v5",
      payload: {
        origem: "admin_broadcast",
        target_role: broadcastForm.targetRole,
      },
    });

    await adminAuditTrailService.logAction({
      category: "admin_notificacoes",
      event: "broadcast_push_sent",
      message: "Push em massa disparado pelo ADM.",
      entityType: "notificacao",
      entityId: broadcastForm.targetRole,
      reason,
      before: null,
      after: {
        recipientRole: broadcastForm.targetRole,
        title: broadcastForm.title.trim(),
        route: broadcastForm.route.trim() || null,
      },
    });

    emitToast(
      "Aviso em massa enfileirado",
      broadcastForm.targetRole === "cliente"
        ? "Todos os clientes entraram na fila de push."
        : "Todos os entregadores entraram na fila de push.",
      "success"
    );
  }

  return (
    <AdminLayout
      title="Produtos"
      subtitle="Catalogo do cliente, disponibilidade, destaque, ordem e cupons."
    >
      <div style={heroGrid}>
        <MetricCard label="Produtos" value={String(summary.totalProdutos)} />
        <MetricCard label="Ativos" value={String(summary.ativos)} />
        <MetricCard label="Inativos" value={String(summary.inativos)} />
        <MetricCard label="Destaques" value={String(summary.destaques)} />
      </div>

      <div style={{ ...heroGrid, marginTop: 10, gridTemplateColumns: "repeat(1, minmax(0, 1fr))" }}>
        <MetricCard label="Campanhas" value={String(summary.campanhas)} />
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Catalogo de produtos</div>
            <span style={countPill}>{produtos.length}</span>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {produtos.map((item) => (
              <div key={item.id} style={listCard}>
                <button onClick={() => loadProduto(item)} type="button" style={listBtn}>
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={itemTitle}>{item.nome}</div>
                    <div style={itemMeta}>
                      {item.categoria || "Sem categoria"} - {money(Number(item.preco || 0))}
                    </div>
                    <div style={itemMeta}>
                      Ordem {Number(item.ordem ?? 999)} - {item.destaque ? "Destaque ativo" : "Sem destaque"}
                    </div>
                  </div>

                  <span style={{ ...statusPill, ...productTone(item) }}>
                    {!item.ativo ? "Inativo" : item.destaque ? "Destaque" : "Ativo"}
                  </span>
                </button>

                <button
                  onClick={() => void toggleProduto(item.id)}
                  type="button"
                  style={inlineActionBtn}
                >
                  {item.ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>
              {selectedProduct ? "Editar produto" : "Novo produto"}
            </div>
            <button onClick={resetProdutoForm} type="button" style={ghostBtn}>
              Limpar
            </button>
          </div>

          <div style={formGrid}>
            <Field label="Nome">
              <input
                value={produtoForm.nome}
                onChange={(e) =>
                  setProdutoForm((current) => ({ ...current, nome: e.target.value }))
                }
                style={fieldInput}
                placeholder="Nome do produto"
              />
            </Field>

            <Field label="Preco">
              <input
                value={produtoForm.preco}
                onChange={(e) =>
                  setProdutoForm((current) => ({ ...current, preco: e.target.value }))
                }
                style={fieldInput}
                inputMode="decimal"
                placeholder="120"
              />
            </Field>

            <Field label="Categoria">
              <input
                value={produtoForm.categoria}
                onChange={(e) =>
                  setProdutoForm((current) => ({ ...current, categoria: e.target.value }))
                }
                style={fieldInput}
                placeholder="Gas"
              />
            </Field>

            <Field label="Unidade">
              <input
                value={produtoForm.unidade}
                onChange={(e) =>
                  setProdutoForm((current) => ({ ...current, unidade: e.target.value }))
                }
                style={fieldInput}
                placeholder="un"
              />
            </Field>

            <Field label="Badge">
              <input
                value={produtoForm.badge}
                onChange={(e) =>
                  setProdutoForm((current) => ({ ...current, badge: e.target.value }))
                }
                style={fieldInput}
                placeholder="Mais pedido"
              />
            </Field>

            <Field label="Ordem de exibicao">
              <input
                value={produtoForm.ordem}
                onChange={(e) =>
                  setProdutoForm((current) => ({ ...current, ordem: e.target.value }))
                }
                style={fieldInput}
                inputMode="numeric"
                placeholder="10"
              />
            </Field>

            <Field label="URL da imagem">
              <input
                value={produtoForm.imagem}
                onChange={(e) =>
                  setProdutoForm((current) => ({ ...current, imagem: e.target.value }))
                }
                style={fieldInput}
                placeholder="https://..."
              />
            </Field>

            <Field label="Descricao">
              <textarea
                value={produtoForm.descricao}
                onChange={(e) =>
                  setProdutoForm((current) => ({ ...current, descricao: e.target.value }))
                }
                style={fieldTextArea}
                placeholder="Descricao do produto"
              />
            </Field>

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={produtoForm.ativo}
                onChange={(e) =>
                  setProdutoForm((current) => ({ ...current, ativo: e.target.checked }))
                }
              />
              <span>Produto ativo para o cliente</span>
            </label>

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={produtoForm.destaque}
                onChange={(e) =>
                  setProdutoForm((current) => ({ ...current, destaque: e.target.checked }))
                }
              />
              <span>Produto em destaque</span>
            </label>

            <div style={actionDualGrid}>
              <button onClick={() => void saveProduto()} type="button" style={primaryBtn}>
                {selectedProduct ? "Salvar alteracoes" : "Criar produto"}
              </button>
              <button
                onClick={() => void removeProduto()}
                type="button"
                style={dangerBtn}
                disabled={!selectedProduct}
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Campanhas e cupons</div>
            <span style={countPill}>{cupons.length}</span>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {cupons.map((item) => (
              <div key={item.id} style={listCard}>
                <button onClick={() => loadCupom(item)} type="button" style={listBtn}>
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={itemTitle}>
                      {item.codigo} - {item.titulo}
                    </div>
                    <div style={itemMeta}>
                      {item.tipo} - {item.tipo === "frete" ? "Frete" : money(Number(item.valor || 0))}
                    </div>
                    <div style={itemMeta}>
                      Validade: {formatExpiry(item.expiraEm)}
                      {item.usoUnicoPorCliente ? " - uso unico" : ""}
                      {item.primeiraCompraApenas ? " - primeira compra" : ""}
                    </div>
                  </div>

                  <span
                    style={{
                      ...statusPill,
                      background: item.ativo
                        ? "rgba(22,163,74,0.10)"
                        : "rgba(100,116,139,0.10)",
                      color: item.ativo ? "#15803D" : "#475569",
                      border: item.ativo
                        ? "1px solid rgba(22,163,74,0.18)"
                        : "1px solid rgba(100,116,139,0.18)",
                    }}
                  >
                    {item.ativo ? "Ativo" : "Inativo"}
                  </span>
                </button>

                <button onClick={() => toggleCupom(item.id)} type="button" style={inlineActionBtn}>
                  {item.ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>
              {selectedCoupon ? "Editar campanha" : "Nova campanha"}
            </div>
            <button onClick={resetCupomForm} type="button" style={ghostBtn}>
              Limpar
            </button>
          </div>

          <div style={formGrid}>
            <Field label="Codigo">
              <input
                value={cupomForm.codigo}
                onChange={(e) =>
                  setCupomForm((current) => ({
                    ...current,
                    codigo: e.target.value.toUpperCase(),
                  }))
                }
                style={fieldInput}
                placeholder="BEMVINDO10"
              />
            </Field>

            <Field label="Titulo">
              <input
                value={cupomForm.titulo}
                onChange={(e) =>
                  setCupomForm((current) => ({ ...current, titulo: e.target.value }))
                }
                style={fieldInput}
                placeholder="Cupom de boas-vindas"
              />
            </Field>

            <Field label="Descricao">
              <textarea
                value={cupomForm.descricao}
                onChange={(e) =>
                  setCupomForm((current) => ({ ...current, descricao: e.target.value }))
                }
                style={fieldTextArea}
                placeholder="Mensagem interna ou descricao comercial"
              />
            </Field>

            <Field label="Tipo">
              <select
                value={cupomForm.tipo}
                onChange={(e) =>
                  setCupomForm((current) => ({
                    ...current,
                    tipo: e.target.value as CouponFormState["tipo"],
                  }))
                }
                style={fieldInput}
              >
                <option value="fixo">Valor fixo</option>
                <option value="percentual">Percentual</option>
                <option value="frete">Frete</option>
              </select>
            </Field>

            <Field label="Valor">
              <input
                value={cupomForm.valor}
                onChange={(e) =>
                  setCupomForm((current) => ({ ...current, valor: e.target.value }))
                }
                style={fieldInput}
                inputMode="decimal"
                placeholder="10"
              />
            </Field>

            <Field label="Uso maximo">
              <input
                value={cupomForm.usoMaximo}
                onChange={(e) =>
                  setCupomForm((current) => ({
                    ...current,
                    usoMaximo: e.target.value,
                  }))
                }
                style={fieldInput}
                inputMode="numeric"
                placeholder="Opcional"
              />
            </Field>

            <Field label="Pedido minimo">
              <input
                value={cupomForm.minimoPedido}
                onChange={(e) =>
                  setCupomForm((current) => ({
                    ...current,
                    minimoPedido: e.target.value,
                  }))
                }
                style={fieldInput}
                inputMode="decimal"
                placeholder="Opcional"
              />
            </Field>

            <Field label="Expira em">
              <input
                value={cupomForm.expiraEm}
                onChange={(e) =>
                  setCupomForm((current) => ({
                    ...current,
                    expiraEm: e.target.value,
                  }))
                }
                style={fieldInput}
                type="datetime-local"
              />
            </Field>

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={cupomForm.ativo}
                onChange={(e) =>
                  setCupomForm((current) => ({ ...current, ativo: e.target.checked }))
                }
              />
              <span>Campanha ativa</span>
            </label>

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={cupomForm.usoUnicoPorCliente}
                onChange={(e) =>
                  setCupomForm((current) => ({
                    ...current,
                    usoUnicoPorCliente: e.target.checked,
                  }))
                }
              />
              <span>Uso unico por cliente</span>
            </label>

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={cupomForm.primeiraCompraApenas}
                onChange={(e) =>
                  setCupomForm((current) => ({
                    ...current,
                    primeiraCompraApenas: e.target.checked,
                  }))
                }
              />
              <span>Somente primeira compra</span>
            </label>

            <div style={actionDualGrid}>
              <button onClick={saveCupom} type="button" style={primaryBtn}>
                {selectedCoupon ? "Salvar campanha" : "Criar campanha"}
              </button>
              <button
                onClick={removeCupom}
                type="button"
                style={dangerBtn}
                disabled={!selectedCoupon}
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Leitura de giro</div>
            <span style={countPill}>{productPerformance.length}</span>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {productPerformance.length === 0 ? (
              <div style={emptyText}>Ainda nao ha vendas suficientes para formar ranking.</div>
            ) : (
              productPerformance.slice(0, 8).map((item, index) => (
                <div key={item.produtoId} style={insightCard}>
                  <div>
                    <div style={itemTitle}>
                      #{index + 1} - {item.nome}
                    </div>
                    <div style={itemMeta}>{item.quantidade} unidade(s) vendidas</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={insightValue}>{money(item.faturamento)}</div>
                    <div style={itemMeta}>Faturamento</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Compatibilidade com o app Cliente</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div style={insightCard}>
              <div>
                <div style={itemTitle}>Fallback protegido</div>
                <div style={itemMeta}>
                  P13, P20 e P45 continuam aparecendo de forma consistente quando ativos.
                </div>
              </div>
            </div>
            <div style={insightCard}>
              <div>
                <div style={itemTitle}>Mesmo catalogo no cliente e no ADM</div>
                <div style={itemMeta}>
                  O catalogo usa o mesmo documento remoto e nao depende so de localStorage.
                </div>
              </div>
            </div>
            <div style={insightCard}>
              <div>
                <div style={itemTitle}>Ordem e destaque</div>
                <div style={itemMeta}>
                  A ordem de exibicao e o destaque agora podem ser controlados pelo painel.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Disparo em massa</div>
            <span style={countPill}>Push</span>
          </div>

          <div style={formGrid}>
            <Field label="Destino">
              <select
                value={broadcastForm.targetRole}
                onChange={(e) =>
                  setBroadcastForm((current) => ({
                    ...current,
                    targetRole: e.target.value as "cliente" | "entregador",
                    route:
                      e.target.value === "entregador"
                        ? "/entregador"
                        : "/loja",
                  }))
                }
                style={fieldInput}
              >
                <option value="cliente">Todos os clientes</option>
                <option value="entregador">Todos os entregadores</option>
              </select>
            </Field>

            <Field label="Titulo">
              <input
                value={broadcastForm.title}
                onChange={(e) =>
                  setBroadcastForm((current) => ({
                    ...current,
                    title: e.target.value,
                  }))
                }
                style={fieldInput}
                placeholder="Central Gas"
              />
            </Field>

            <Field label="Mensagem">
              <textarea
                value={broadcastForm.body}
                onChange={(e) =>
                  setBroadcastForm((current) => ({
                    ...current,
                    body: e.target.value,
                  }))
                }
                style={fieldTextArea}
                placeholder="Escreva o aviso que todos vao receber."
              />
            </Field>

            <Field label="Rota ao tocar">
              <input
                value={broadcastForm.route}
                onChange={(e) =>
                  setBroadcastForm((current) => ({
                    ...current,
                    route: e.target.value,
                  }))
                }
                style={fieldInput}
                placeholder="/loja"
              />
            </Field>

            <button onClick={() => void sendBroadcast()} type="button" style={primaryBtn}>
              Disparar aviso em massa
            </button>
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Reflexo no app Cliente</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div style={insightCard}>
              <div>
                <div style={itemTitle}>Sincronizacao publica reforcada</div>
                <div style={itemMeta}>
                  O Cliente passa a atualizar catalogo, preco e campanhas ao voltar ao foco e em ciclo curto.
                </div>
              </div>
            </div>
            <div style={insightCard}>
              <div>
                <div style={itemTitle}>Sem quebrar o estado geral</div>
                <div style={itemMeta}>
                  O catalogo continua vindo do mesmo documento remoto; apenas aceleramos a rehidratacao segura.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <div style={sectionTitle}>Uso de campanhas</div>
          <span style={countPill}>{couponMetrics.length}</span>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {couponMetrics.length === 0 ? (
            <div style={emptyText}>Nenhuma campanha registrada ate o momento.</div>
          ) : (
            couponMetrics.map((item) => (
              <div key={item.id} style={insightCard}>
                <div>
                  <div style={itemTitle}>
                    {item.codigo} - {item.titulo}
                  </div>
                  <div style={itemMeta}>
                    {item.ativo ? "Ativa" : "Inativa"} - {item.pedidosVinculados} pedido(s)
                  </div>
                  <div style={itemMeta}>
                    Validade: {formatExpiry(item.expiraEm)}
                    {item.usoUnicoPorCliente ? " - uso unico por cliente" : ""}
                    {item.primeiraCompraApenas ? " - primeira compra" : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={insightValue}>{money(item.descontoTotal)}</div>
                  <div style={itemMeta}>Desconto total</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div style={heroStat}>
      <div style={heroLabel}>{props.label}</div>
      <div style={heroValue}>{props.value}</div>
    </div>
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

const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const heroStat: CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  borderRadius: 22,
  padding: 14,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
};

const heroLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
};

const heroValue: CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 950,
  color: "#111827",
};

const contentGrid: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "minmax(320px, 0.95fr) minmax(0, 1.1fr)",
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
  alignItems: "center",
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

const listCard: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  padding: 12,
  borderRadius: 18,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
  alignItems: "center",
};

const listBtn: CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
};

const statusPill: CSSProperties = {
  minWidth: 88,
  height: 30,
  padding: "0 12px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  fontSize: 12,
};

const inlineActionBtn: CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const formGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 10,
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

const checkRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 800,
  color: "#111827",
};

const actionDualGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
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

const ghostBtn: CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const itemTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const itemMeta: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#64748B",
};

const insightCard: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: 12,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const insightValue: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const emptyText: CSSProperties = {
  fontSize: 13.5,
  color: "#64748B",
  lineHeight: 1.6,
};
