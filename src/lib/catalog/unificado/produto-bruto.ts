/**
 * Um produto INK reduzido ao que a reconciliação precisa — inclusive OCULTO e não publicado, ao contrário de `normalizeInkProduct` (que
 * descarta tudo que não é vendável hoje). Nada é inferido aqui: só copia campos e resume as variantes.
 */
export type ProdutoBruto = {
  id: string;
  name: string;
  slug: string;
  url: string | null;
  image: string | null;
  price: string | null;
  promotionalPrice: string | null;
  clusterId: string | null;
  typeId: number | null;
  typeName: string | null;
  status: string | null;
  visible: boolean;
  approval: string | null;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
  sales: number;
  /** Resumo das variantes (cor × modelo × tamanho): quantas existem, quantas `is_available`, quais cores/modelos. */
  variants: { total: number; available: number; colors: string[]; models: string[] };
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const numeroTexto = (v: unknown): string | null => (typeof v === "number" ? String(v) : texto(v));

export function reduzirProdutoBruto(raw: unknown): ProdutoBruto | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const id = numeroTexto(p.id);
  const name = texto(p.name);
  if (!id || !name) return null;
  const tipo = typeof p.product_type === "object" && p.product_type !== null ? (p.product_type as Record<string, unknown>) : null;
  const variantes = Array.isArray(p.product_variants) ? (p.product_variants as Record<string, unknown>[]) : [];
  return {
    id,
    name,
    slug: texto(p.slug) ?? "",
    url: texto(p.store_product_url),
    image: texto(p.main_image_url),
    price: numeroTexto(p.price),
    promotionalPrice: numeroTexto(p.promotional_price),
    clusterId: numeroTexto(p.product_cluster_id),
    typeId: tipo && typeof tipo.id === "number" ? tipo.id : null,
    typeName: tipo ? texto(tipo.name) : null,
    status: texto(p.status),
    visible: p.visible_in_store === true,
    approval: texto(p.approval_status),
    tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === "string") : [],
    createdAt: texto(p.created_at),
    updatedAt: texto(p.updated_at),
    sales: typeof p.total_sales_count === "number" ? p.total_sales_count : 0,
    variants: {
      total: variantes.length,
      available: variantes.filter((v) => v.is_available === true).length,
      colors: [...new Set(variantes.map((v) => texto(v.color)).filter((c): c is string => c !== null))].sort(),
      models: [...new Set(variantes.map((v) => texto(v.model)).filter((m): m is string => m !== null))].sort(),
    },
  };
}
