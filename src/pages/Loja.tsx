import { useMemo, useState, type CSSProperties } from "react";
import Layout from "../layout";
import PageHeader from "../components/PageHeader";
import { usePedidoStore } from "../store/usePedidoStore";
import { productCatalogService } from "../services/productCatalogService";
import type { ProdutoLoja } from "../types";

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Loja() {
  const adicionarAoCarrinho = usePedidoStore((s) => s.adicionarAoCarrinho);
  const carrinho = usePedidoStore((s) => s.carrinho);

  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todos");

  const produtos = useMemo(() => productCatalogService.getActive(), []);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    produtos.forEach((item) => {
      if (item.categoria?.trim()) set.add(item.categoria.trim());
    });
    return ["todos", ...Array.from(set)];
  }, [produtos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return produtos.filter((item) => {
      if (categoria !== "todos" && item.categoria !== categoria) return false;

      if (!q) return true;

      const haystack = [
        item.nome,
        item.categoria,
        item.descricao,
        item.badge,
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [produtos, busca, categoria]);

  const totalCarrinho = useMemo(() => {
    return carrinho.reduce(
      (acc, item) => acc + Number(item.precoUnitario || 0) * Number(item.quantidade || 0),
      0
    );
  }, [carrinho]);

  function addProduto(produto: ProdutoLoja) {
    adicionarAoCarrinho({
      produtoId: produto.id,
      nome: produto.nome,
      quantidade: 1,
      precoUnitario: Number(produto.preco || 0),
      imagem: produto.imagem || "",
      categoria: produto.categoria || "",
      descricao: produto.descricao || "",
      unidade: produto.unidade || "un",
    });
  }

  return (
    <Layout>
      <div style={{ display: "grid", gap: 12, paddingBottom: 96 }}>
        <PageHeader
          title="Loja"
          subtitle="Escolha seus produtos e monte seu pedido"
        />

        <div style={toolbarCard}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            style={searchInput}
          />

          <div style={chipRow}>
            {categorias.map((item) => (
              <button
                key={item}
                onClick={() => setCategoria(item)}
                type="button"
                style={{
                  ...chipBtn,
                  ...(categoria === item ? chipBtnActive : null),
                }}
              >
                {item === "todos" ? "Todos" : item}
              </button>
            ))}
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div style={emptyCard}>
            <div style={emptyTitle}>Nenhum produto encontrado</div>
            <div style={emptyText}>
              Ajuste sua busca ou publique novos produtos pelo ADM.
            </div>
          </div>
        ) : (
          <div style={grid}>
            {filtrados.map((produto) => (
              <div key={produto.id} style={card}>
                <div style={imageWrap}>
                  {produto.imagem ? (
                    <img
                      src={produto.imagem}
                      alt={produto.nome}
                      style={imageStyle}
                    />
                  ) : (
                    <div style={imagePlaceholder}>Sem imagem</div>
                  )}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={titleRow}>
                    <div style={cardTitle}>{produto.nome}</div>
                    {produto.badge ? <span style={badge}>{produto.badge}</span> : null}
                  </div>

                  {produto.categoria ? (
                    <div style={cardCategory}>{produto.categoria}</div>
                  ) : null}

                  {produto.descricao ? (
                    <div style={cardDesc}>{produto.descricao}</div>
                  ) : null}

                  <div style={priceRow}>
                    <div style={priceValue}>{money(Number(produto.preco || 0))}</div>
                    <div style={unitText}>{produto.unidade || "un"}</div>
                  </div>

                  <button
                    onClick={() => addProduto(produto)}
                    type="button"
                    style={addBtn}
                  >
                    Adicionar ao carrinho
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {carrinho.length > 0 ? (
          <div style={floatingSummary}>
            <div>
              <div style={floatingLabel}>{carrinho.length} item(ns)</div>
              <div style={floatingValue}>{money(totalCarrinho)}</div>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}

const toolbarCard: CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const searchInput: CSSProperties = {
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

const chipRow: CSSProperties = {
  marginTop: 12,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const chipBtn: CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const chipBtnActive: CSSProperties = {
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  boxShadow: "0 10px 22px rgba(228,79,42,0.18)",
};

const emptyCard: CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const emptyTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
};

const emptyText: CSSProperties = {
  marginTop: 8,
  color: "#64748B",
  lineHeight: 1.5,
  fontSize: 13,
};

const grid: CSSProperties = {
  display: "grid",
  gap: 12,
};

const card: CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
};

const imageWrap: CSSProperties = {
  width: "100%",
  height: 180,
  borderRadius: 20,
  overflow: "hidden",
  background: "#F8FAFC",
  border: "1px solid rgba(15,23,42,0.06)",
};

const imageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const imagePlaceholder: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  color: "#94A3B8",
  fontWeight: 900,
  fontSize: 13,
};

const titleRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const cardTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  color: "#111827",
};

const badge: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(228,79,42,0.10)",
  color: "#E44F2A",
  fontWeight: 900,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const cardCategory: CSSProperties = {
  marginTop: 8,
  fontSize: 12.5,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
};

const cardDesc: CSSProperties = {
  marginTop: 8,
  color: "#475569",
  lineHeight: 1.55,
  fontSize: 13.5,
};

const priceRow: CSSProperties = {
  marginTop: 14,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const priceValue: CSSProperties = {
  fontSize: 22,
  fontWeight: 950,
  color: "#111827",
};

const unitText: CSSProperties = {
  fontSize: 13,
  color: "#64748B",
  fontWeight: 800,
};

const addBtn: CSSProperties = {
  marginTop: 14,
  width: "100%",
  height: 48,
  borderRadius: 18,
  border: "none",
  background: "linear-gradient(90deg,#E44F2A,#F59E0B)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(228,79,42,0.18)",
};

const floatingSummary: CSSProperties = {
  position: "sticky",
  bottom: 86,
  background: "#111827",
  color: "#fff",
  borderRadius: 22,
  padding: 14,
  boxShadow: "0 18px 36px rgba(15,23,42,0.18)",
};

const floatingLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.8,
  textTransform: "uppercase",
};

const floatingValue: CSSProperties = {
  marginTop: 6,
  fontSize: 20,
  fontWeight: 950,
};