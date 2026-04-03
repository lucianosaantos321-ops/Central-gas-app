import { useMemo, useState, type CSSProperties } from "react";
import AdminLayout from "../../layouts/AdminLayout";
import { productCatalogService } from "../../services/productCatalogService";
import { couponAdminService } from "../../services/couponAdminService";
import { usePedidoStore } from "../../store/usePedidoStore";
import type { ProdutoLoja, CupomCampanha } from "../../types";
import { money } from "../../utils/delivererHelpers";

export default function AdminProdutos() {
  const pedidos = usePedidoStore((s) => s.pedidos);
  const [refreshKey, setRefreshKey] = useState(0);

  const produtos = useMemo(() => productCatalogService.getAll(), [refreshKey]);
  const cupons = useMemo(() => couponAdminService.getAll(), [refreshKey]);
  const couponMetrics = useMemo(() => couponAdminService.getMetrics(pedidos), [pedidos, refreshKey]);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedCouponId, setSelectedCouponId] = useState("");

  const [produtoForm, setProdutoForm] = useState({
    nome: "",
    preco: "",
    imagem: "",
    categoria: "",
    descricao: "",
    unidade: "un",
    badge: "",
    ativo: true,
  });

  const [cupomForm, setCupomForm] = useState({
    codigo: "",
    titulo: "",
    descricao: "",
    tipo: "fixo" as "fixo" | "percentual" | "frete",
    valor: "",
    ativo: false,
    usoMaximo: "",
    minimoPedido: "",
  });

  const selectedProduct = useMemo(
    () => produtos.find((item) => item.id === selectedProductId) ?? null,
    [produtos, selectedProductId]
  );

  const selectedCoupon = useMemo(
    () => cupons.find((item) => item.id === selectedCouponId) ?? null,
    [cupons, selectedCouponId]
  );

  const productPerformance = useMemo(() => {
    const map = new Map<
      string,
      {
        produtoId: string;
        nome: string;
        quantidade: number;
        faturamento: number;
        pedidos: number;
      }
    >();

    (Array.isArray(pedidos) ? pedidos : []).forEach((pedido: any) => {
      const itens = Array.isArray(pedido?.itens) ? pedido.itens : [];
      itens.forEach((item: any) => {
        const current = map.get(item.produtoId) || {
          produtoId: String(item.produtoId),
          nome: String(item.nome || "Produto"),
          quantidade: 0,
          faturamento: 0,
          pedidos: 0,
        };

        current.quantidade += Number(item.quantidade || 0);
        current.faturamento += Number(item.precoUnitario || 0) * Number(item.quantidade || 0);
        current.pedidos += 1;
        map.set(item.produtoId, current);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade);
  }, [pedidos]);

  const summary = useMemo(() => {
    return {
      totalProdutos: produtos.length,
      ativos: produtos.filter((item) => item.ativo).length,
      inativos: produtos.filter((item) => !item.ativo).length,
      campanhas: cupons.length,
    };
  }, [produtos, cupons]);

  function refresh() {
    setRefreshKey((v) => v + 1);
  }

  function resetProdutoForm() {
    setProdutoForm({
      nome: "",
      preco: "",
      imagem: "",
      categoria: "",
      descricao: "",
      unidade: "un",
      badge: "",
      ativo: true,
    });
    setSelectedProductId("");
  }

  function resetCupomForm() {
    setCupomForm({
      codigo: "",
      titulo: "",
      descricao: "",
      tipo: "fixo",
      valor: "",
      ativo: false,
      usoMaximo: "",
      minimoPedido: "",
    });
    setSelectedCouponId("");
  }

  function loadProduto(item: ProdutoLoja) {
    setSelectedProductId(item.id);
    setProdutoForm({
      nome: item.nome,
      preco: String(item.preco),
      imagem: item.imagem || "",
      categoria: item.categoria || "",
      descricao: item.descricao || "",
      unidade: item.unidade || "un",
      badge: item.badge || "",
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
    });
  }

  function saveProduto() {
    if (!produtoForm.nome.trim()) {
      alert("Informe o nome do produto.");
      return;
    }

    const preco = Number(produtoForm.preco);
    if (!Number.isFinite(preco) || preco <= 0) {
      alert("Informe um preço válido.");
      return;
    }

    if (selectedProduct) {
      productCatalogService.update(selectedProduct.id, {
        nome: produtoForm.nome.trim(),
        preco,
        imagem: produtoForm.imagem.trim(),
        categoria: produtoForm.categoria.trim(),
        descricao: produtoForm.descricao.trim(),
        unidade: produtoForm.unidade.trim() || "un",
        badge: produtoForm.badge.trim(),
        ativo: produtoForm.ativo,
      });
      alert("Produto atualizado ✅");
    } else {
      productCatalogService.create({
        nome: produtoForm.nome.trim(),
        preco,
        imagem: produtoForm.imagem.trim(),
        categoria: produtoForm.categoria.trim(),
        descricao: produtoForm.descricao.trim(),
        unidade: produtoForm.unidade.trim() || "un",
        badge: produtoForm.badge.trim(),
        ativo: produtoForm.ativo,
      });
      alert("Produto criado ✅");
    }

    resetProdutoForm();
    refresh();
  }

  function removeProduto() {
    if (!selectedProduct) return;

    const ok = confirm(`Remover o produto "${selectedProduct.nome}"?`);
    if (!ok) return;

    productCatalogService.remove(selectedProduct.id);
    alert("Produto removido ✅");
    resetProdutoForm();
    refresh();
  }

  function toggleProduto(id: string) {
    productCatalogService.toggleActive(id);
    refresh();
  }

  function saveCupom() {
    if (!cupomForm.codigo.trim()) {
      alert("Informe o código do cupom.");
      return;
    }

    if (!cupomForm.titulo.trim()) {
      alert("Informe o título da campanha.");
      return;
    }

    const valor = Number(cupomForm.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      alert("Informe um valor válido.");
      return;
    }

    const usoMaximo =
      cupomForm.usoMaximo.trim() === "" ? null : Number(cupomForm.usoMaximo);
    const minimoPedido =
      cupomForm.minimoPedido.trim() === "" ? null : Number(cupomForm.minimoPedido);

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
      });
      alert("Campanha/cupom atualizado ✅");
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
      });
      alert("Campanha/cupom criado ✅");
    }

    resetCupomForm();
    refresh();
  }

  function removeCupom() {
    if (!selectedCoupon) return;

    const ok = confirm(`Remover a campanha "${selectedCoupon.titulo}"?`);
    if (!ok) return;

    couponAdminService.remove(selectedCoupon.id);
    alert("Campanha removida ✅");
    resetCupomForm();
    refresh();
  }

  function toggleCupom(id: string) {
    couponAdminService.toggleActive(id);
    refresh();
  }

  return (
    <AdminLayout
      title="ADM Produtos"
      subtitle="Controle total do catálogo, campanhas e leitura de performance"
    >
      <div style={heroGrid}>
        <div style={heroStat}>
          <div style={heroLabel}>Produtos</div>
          <div style={heroValue}>{summary.totalProdutos}</div>
        </div>

        <div style={heroStat}>
          <div style={heroLabel}>Ativos</div>
          <div style={heroValue}>{summary.ativos}</div>
        </div>

        <div style={heroStat}>
          <div style={heroLabel}>Inativos</div>
          <div style={heroValue}>{summary.inativos}</div>
        </div>

        <div style={heroStat}>
          <div style={heroLabel}>Campanhas</div>
          <div style={heroValue}>{summary.campanhas}</div>
        </div>
      </div>

      <div style={contentGrid}>
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Catálogo de produtos</div>
            <span style={countPill}>{produtos.length}</span>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {produtos.map((item) => (
              <div key={item.id} style={listCard}>
                <button
                  onClick={() => loadProduto(item)}
                  type="button"
                  style={listBtn}
                >
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={itemTitle}>{item.nome}</div>
                    <div style={itemMeta}>
                      {item.categoria || "Sem categoria"} • {money(Number(item.preco || 0))}
                    </div>
                  </div>

                  <span
                    style={{
                      ...statusPill,
                      background: item.ativo
                        ? "rgba(22,163,74,0.10)"
                        : "rgba(100,116,139,0.10)",
                      color: item.ativo ? "#15803D" : "#475569",
                    }}
                  >
                    {item.ativo ? "Ativo" : "Inativo"}
                  </span>
                </button>

                <button
                  onClick={() => toggleProduto(item.id)}
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
            <input
              value={produtoForm.nome}
              onChange={(e) => setProdutoForm((p) => ({ ...p, nome: e.target.value }))}
              style={fieldInput}
              placeholder="Nome do produto"
            />

            <input
              value={produtoForm.preco}
              onChange={(e) => setProdutoForm((p) => ({ ...p, preco: e.target.value }))}
              style={fieldInput}
              placeholder="Preço"
              inputMode="decimal"
            />

            <input
              value={produtoForm.imagem}
              onChange={(e) => setProdutoForm((p) => ({ ...p, imagem: e.target.value }))}
              style={fieldInput}
              placeholder="URL da imagem"
            />

            <input
              value={produtoForm.categoria}
              onChange={(e) => setProdutoForm((p) => ({ ...p, categoria: e.target.value }))}
              style={fieldInput}
              placeholder="Categoria"
            />

            <input
              value={produtoForm.unidade}
              onChange={(e) => setProdutoForm((p) => ({ ...p, unidade: e.target.value }))}
              style={fieldInput}
              placeholder="Unidade"
            />

            <input
              value={produtoForm.badge}
              onChange={(e) => setProdutoForm((p) => ({ ...p, badge: e.target.value }))}
              style={fieldInput}
              placeholder="Badge (ex.: Mais pedido)"
            />

            <textarea
              value={produtoForm.descricao}
              onChange={(e) => setProdutoForm((p) => ({ ...p, descricao: e.target.value }))}
              style={fieldTextArea}
              placeholder="Descrição"
            />

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={produtoForm.ativo}
                onChange={(e) => setProdutoForm((p) => ({ ...p, ativo: e.target.checked }))}
              />
              <span>Produto ativo</span>
            </label>

            <div style={actionDualGrid}>
              <button onClick={saveProduto} type="button" style={primaryBtn}>
                {selectedProduct ? "Salvar edição" : "Criar produto"}
              </button>

              <button
                onClick={removeProduto}
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
                <button
                  onClick={() => loadCupom(item)}
                  type="button"
                  style={listBtn}
                >
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={itemTitle}>
                      {item.codigo} • {item.titulo}
                    </div>
                    <div style={itemMeta}>
                      {item.tipo} • {item.tipo === "frete" ? "Frete" : money(Number(item.valor || 0))}
                    </div>
                  </div>

                  <span
                    style={{
                      ...statusPill,
                      background: item.ativo
                        ? "rgba(22,163,74,0.10)"
                        : "rgba(100,116,139,0.10)",
                      color: item.ativo ? "#15803D" : "#475569",
                    }}
                  >
                    {item.ativo ? "Ativo" : "Inativo"}
                  </span>
                </button>

                <button
                  onClick={() => toggleCupom(item.id)}
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
              {selectedCoupon ? "Editar campanha/cupom" : "Nova campanha/cupom"}
            </div>

            <button onClick={resetCupomForm} type="button" style={ghostBtn}>
              Limpar
            </button>
          </div>

          <div style={formGrid}>
            <input
              value={cupomForm.codigo}
              onChange={(e) => setCupomForm((p) => ({ ...p, codigo: e.target.value.toUpperCase() }))}
              style={fieldInput}
              placeholder="Código"
            />

            <input
              value={cupomForm.titulo}
              onChange={(e) => setCupomForm((p) => ({ ...p, titulo: e.target.value }))}
              style={fieldInput}
              placeholder="Título"
            />

            <textarea
              value={cupomForm.descricao}
              onChange={(e) => setCupomForm((p) => ({ ...p, descricao: e.target.value }))}
              style={fieldTextArea}
              placeholder="Descrição"
            />

            <select
              value={cupomForm.tipo}
              onChange={(e) =>
                setCupomForm((p) => ({
                  ...p,
                  tipo: e.target.value as "fixo" | "percentual" | "frete",
                }))
              }
              style={fieldInput}
            >
              <option value="fixo">Valor fixo</option>
              <option value="percentual">Percentual</option>
              <option value="frete">Frete grátis</option>
            </select>

            <input
              value={cupomForm.valor}
              onChange={(e) => setCupomForm((p) => ({ ...p, valor: e.target.value }))}
              style={fieldInput}
              placeholder="Valor"
              inputMode="decimal"
            />

            <input
              value={cupomForm.usoMaximo}
              onChange={(e) => setCupomForm((p) => ({ ...p, usoMaximo: e.target.value }))}
              style={fieldInput}
              placeholder="Uso máximo (opcional)"
              inputMode="numeric"
            />

            <input
              value={cupomForm.minimoPedido}
              onChange={(e) => setCupomForm((p) => ({ ...p, minimoPedido: e.target.value }))}
              style={fieldInput}
              placeholder="Pedido mínimo (opcional)"
              inputMode="decimal"
            />

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={cupomForm.ativo}
                onChange={(e) => setCupomForm((p) => ({ ...p, ativo: e.target.checked }))}
              />
              <span>Campanha ativa</span>
            </label>

            <div style={actionDualGrid}>
              <button onClick={saveCupom} type="button" style={primaryBtn}>
                {selectedCoupon ? "Salvar edição" : "Criar campanha"}
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
            <div style={sectionTitle}>Performance por produto</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {productPerformance.length === 0 ? (
              <div style={emptyText}>Sem vendas ainda para montar ranking.</div>
            ) : (
              productPerformance.slice(0, 8).map((item, index) => (
                <div key={item.produtoId} style={performanceRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={itemTitle}>
                      #{index + 1} • {item.nome}
                    </div>
                    <div style={itemMeta}>
                      {item.quantidade} unidade(s) • {item.pedidos} ocorrência(s)
                    </div>
                  </div>

                  <div style={performanceRight}>
                    <div style={performanceValue}>{money(item.faturamento)}</div>
                    <div style={itemMeta}>Faturamento</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div style={sectionTitle}>Performance por campanha</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {couponMetrics.length === 0 ? (
              <div style={emptyText}>Sem campanhas cadastradas.</div>
            ) : (
              couponMetrics.slice(0, 8).map((item) => (
                <div key={item.id} style={performanceRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={itemTitle}>
                      {item.codigo} • {item.titulo}
                    </div>
                    <div style={itemMeta}>
                      {item.pedidosVinculados} uso(s) • {item.pedidosEntregues} entrega(s)
                    </div>
                  </div>

                  <div style={performanceRight}>
                    <div style={performanceValue}>{money(item.descontoTotal)}</div>
                    <div style={itemMeta}>Desconto total</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const heroStat: CSSProperties = {
  background: "#fff",
  borderRadius: 20,
  padding: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
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
  gridTemplateColumns: "0.95fr 1.05fr",
  gap: 14,
};

const sectionCard: CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const sectionHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const sectionTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const countPill: CSSProperties = {
  minWidth: 30,
  height: 30,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "#F1F5F9",
  color: "#111827",
  fontWeight: 950,
  fontSize: 12,
};

const listCard: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
  alignItems: "center",
  padding: 12,
  borderRadius: 18,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const listBtn: CSSProperties = {
  width: "100%",
  textAlign: "left",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};

const itemTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#111827",
};

const itemMeta: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#64748B",
};

const statusPill: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const inlineActionBtn: CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
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
};

const fieldTextArea: CSSProperties = {
  width: "100%",
  minHeight: 92,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  padding: 12,
  fontWeight: 700,
  color: "#111827",
  outline: "none",
  resize: "vertical",
};

const checkRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 900,
  color: "#111827",
};

const actionDualGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const primaryBtn: CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(228,79,42,0.18)",
};

const dangerBtn: CSSProperties = {
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(90deg,#B91C1C,#EF4444)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const ghostBtn: CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const performanceRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 18,
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const performanceRight: CSSProperties = {
  textAlign: "right",
  whiteSpace: "nowrap",
};

const performanceValue: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111827",
};

const emptyText: CSSProperties = {
  marginTop: 12,
  color: "#64748B",
  lineHeight: 1.5,
};