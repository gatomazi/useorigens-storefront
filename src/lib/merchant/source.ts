/**
 * What the Google Merchant feed needs from INK that the catalog snapshot does not keep: the cover (`main_image_url`, the image INK shows
 * on its own product page and our site uses), the piece type and the variants (color with its hex, model, size, availability). Captured
 * from the same `GET /v1/stores/products?visible_in_store=true` pages the single-store sync already reads (no extra INK request).
 * Nothing is inferred here: fields are copied and the variants grouped by color.
 */
export type MerchantColor = {
  name: string;
  /** INK's `hex_color` without "#", when it sent one. */
  hex: string | null;
  models: string[];
  /** Sizes of this color with `is_available: true`, in INK's order. */
  sizes: string[];
};

export type MerchantSourceProduct = {
  id: string;
  name: string;
  cover: string | null;
  typeId: number | null;
  typeName: string | null;
  description: string | null;
  sales: number;
  createdAt: string | null;
  colors: MerchantColor[];
};

export type MerchantSourceFile = { version: 1; syncedAt: string; products: MerchantSourceProduct[] };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);

function httpsUrl(v: unknown): string | null {
  const t = text(v);
  if (!t) return null;
  try {
    return new URL(t).protocol === "https:" ? t : null;
  } catch {
    return null;
  }
}

export function reduceMerchantSource(raw: unknown): MerchantSourceProduct | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const id = typeof p.id === "number" ? String(p.id) : text(p.id);
  const name = text(p.name);
  if (!id || !name) return null;
  const type = typeof p.product_type === "object" && p.product_type !== null ? (p.product_type as Record<string, unknown>) : null;
  const colors = new Map<string, MerchantColor>();
  for (const v of Array.isArray(p.product_variants) ? (p.product_variants as Record<string, unknown>[]) : []) {
    const color = text(v?.color);
    if (!color) continue;
    const entry = colors.get(color) ?? { name: color, hex: null, models: [], sizes: [] };
    const hex = text(v.hex_color)?.replace(/^#/, "") ?? null;
    if (!entry.hex && hex && /^[0-9a-f]{6}$/i.test(hex)) entry.hex = hex.toLowerCase();
    const model = text(v.model);
    if (model && !entry.models.includes(model)) entry.models.push(model);
    const size = text(v.size);
    if (size && v.is_available === true && !entry.sizes.includes(size)) entry.sizes.push(size);
    colors.set(color, entry);
  }
  return {
    id,
    name,
    cover: httpsUrl(p.main_image_url),
    typeId: type && typeof type.id === "number" ? type.id : null,
    typeName: type ? text(type.name) : null,
    description: text(p.description),
    sales: typeof p.total_sales_count === "number" ? p.total_sales_count : 0,
    createdAt: text(p.created_at),
    colors: [...colors.values()],
  };
}
