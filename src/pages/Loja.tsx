import { useMemo, useState, type CSSProperties } from "react";
import Layout from "../layout";
import PageHeader from "../components/PageHeader";
import { usePedidoStore } from "../store/usePedidoStore";
import { useRemoteSyncStore } from "../store/useRemoteSyncStore";
import { productCatalogService } from "../services/productCatalogService";
import type { ProdutoLoja } from "../types";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  cardStyle,
  primaryButtonStyle,
  sectionCardStyle,
} from "../styles/ui";

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Loja() {
  const adicionarAoCarrinho = usePedidoStore((s) => s.adicionarAoCarrinho);
  const carrinho = usePedidoStore((s) => s.carrinho);
  const publicVersion = useRemoteSyncStore((s) => s.publicVersion);

  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todos");
  const buscaDebounced = useDebouncedValue(busca, 220);

  const produtos = useMemo(
    () => productCatalogService.getActive(),
    [publicVersion]
  );

  const categorias = useMemo(() => {
    const set = new Set<string>();
    produtos.forEach((item) => {
      if (item.categoria?.trim()) set.add(item.categoria.trim());
    });
    return ["todos", ...Array.from(set)];
  }, [produtos]);

  const filtrados = useMemo(() => {
    const q = buscaDebounced.trim().toLowerCase();

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
  }, [produtos, buscaDebounced, categoria]);

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
          subtitle="Escolha o botijão ideal e adicione ao carrinho"
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
              Tente outro termo ou ajuste o filtro para ver mais opções.
            </div>
          </div>
        ) : (
          <div style={grid}>
            {filtrados.map((produto) => {
              const featured = /mais vendido/i.test(String(produto.badge || ""));

              return (
              <div
                key={produto.id}
                style={{
                  ...card,
                  border: featured
                    ? "1px solid rgba(228,79,42,0.18)"
                    : "1px solid rgba(15,23,42,0.06)",
                  boxShadow: featured
                    ? "0 16px 32px rgba(228,79,42,0.12)"
                    : "0 10px 24px rgba(15,23,42,0.06)",
                }}
              >
                <div style={imageWrap}>
                  {produto.imagem ? (
                    <img
                      src={produto.imagem}
                      alt={produto.nome}
                      style={imageStyle}
                    />
                  ) : (
                    <div style={imagePlaceholder}>
                      <div style={placeholderCylinder} />
                      <div style={placeholderBrand}>Central Gás</div>
                      <div style={placeholderCaption}>Entrega rápida na sua região</div>
                    </div>
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
                    <div>
                      <div style={priceLabel}>Preço</div>
                      <div style={priceValue}>{money(Number(produto.preco || 0))}</div>
                    </div>
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
            )})}
          </div>
        )}

        {carrinho.length > 0 ? (
          <div style={floatingSummary}>
            <div>
              <div style={floatingLabel}>{carrinho.length} item(ns) no carrinho</div>
              <div style={floatingValue}>{money(totalCarrinho)}</div>
            </div>
            <div style={floatingText}>
              O carrinho fica sempre visivel acima do menu inferior.
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}

const toolbarCard: CSSProperties = {
  ...sectionCardStyle({
    borderRadius: 20,
    padding: 16,
  }),
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
  ...sectionCardStyle(),
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
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  alignItems: "start",
};

const card: CSSProperties = {
  ...cardStyle({
    borderRadius: 18,
    padding: 12,
  }),
};

const imageWrap: CSSProperties = {
  width: "100%",
  height: 122,
  borderRadius: 16,
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
  alignContent: "center",
  justifyItems: "center",
  gap: 8,
  color: "#475569",
  fontWeight: 900,
  fontSize: 13,
  background:
    "radial-gradient(circle at top, rgba(247,162,18,0.22), transparent 42%), linear-gradient(180deg,#FFF7ED 0%, #F8FAFC 100%)",
};

const placeholderCylinder: CSSProperties = {
  width: 46,
  height: 58,
  borderRadius: 14,
  background: "linear-gradient(180deg,#F97316 0%, #EA580C 100%)",
  boxShadow: "inset 0 10px 14px rgba(255,255,255,0.18), 0 10px 18px rgba(234,88,12,0.20)",
  position: "relative",
};

const placeholderBrand: CSSProperties = {
  fontSize: 13,
  fontWeight: 950,
  color: "#111827",
};

const placeholderCaption: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.4,
  color: "#64748B",
};

const titleRow: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 6,
};

const cardTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111827",
  lineHeight: 1.2,
};

const badge: CSSProperties = {
  padding: "5px 9px",
  borderRadius: 999,
  background: "linear-gradient(90deg,rgba(228,79,42,0.14),rgba(245,158,11,0.14))",
  color: "#9A3412",
  fontWeight: 900,
  fontSize: 11,
  whiteSpace: "nowrap",
  border: "1px solid rgba(228,79,42,0.10)",
};

const cardCategory: CSSProperties = {
  marginTop: 6,
  fontSize: 11.5,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
};

const cardDesc: CSSProperties = {
  marginTop: 6,
  color: "#475569",
  lineHeight: 1.4,
  fontSize: 12.5,
  minHeight: 34,
};

const priceRow: CSSProperties = {
  marginTop: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 12,
};

const priceLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#94A3B8",
};

const priceValue: CSSProperties = {
  fontSize: 22,
  fontWeight: 950,
  color: "#E44F2A",
};

const unitText: CSSProperties = {
  fontSize: 13,
  color: "#64748B",
  fontWeight: 800,
};

const addBtn: CSSProperties = {
  ...primaryButtonStyle({
    marginTop: 10,
    width: "100%",
    minHeight: 42,
    fontSize: 13.5,
  }),
};

const floatingSummary: CSSProperties = {
  position: "sticky",
  bottom: 12,
  background: "#fff",
  color: "#111827",
  borderRadius: 18,
  padding: 12,
  boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const floatingLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.8,
  textTransform: "uppercase",
};

const floatingValue: CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 950,
};

const floatingText: CSSProperties = {
  marginTop: 6,
  color: "#64748B",
  fontSize: 12.5,
};
