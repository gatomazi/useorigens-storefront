import type { InkProductNormalized } from "../catalog/types";
import type { CommerceStoreKey } from "../geo/regions";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asHttpsUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  try {
    return new URL(text).protocol === "https:" ? text : null;
  } catch {
    return null;
  }
}

/**
 * Validates one raw INK product. Returns null (never throws) for anything the storefront
 * cannot safely sell: not published, no https image, or no purchase URL.
 */
export function normalizeInkProduct(raw: unknown, storeKey: CommerceStoreKey): InkProductNormalized | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;

  const id = typeof p.id === "number" ? String(p.id) : asString(p.id);
  const name = asString(p.name);
  const slug = asString(p.slug);
  const storeProductUrl = asHttpsUrl(p.store_product_url);
  const imageUrl = asHttpsUrl(p.main_image_url);
  if (!id || !name || !slug || !storeProductUrl || !imageUrl) return null;
  if (p.status !== "published" || p.visible_in_store !== true) return null;

  return {
    id,
    storeKey,
    name,
    slug,
    storeProductUrl,
    imageUrl,
    price: asPrice(p.price),
    tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === "string") : [],
    clusterId: typeof p.product_cluster_id === "number" ? String(p.product_cluster_id) : null,
    totalSalesCount: typeof p.total_sales_count === "number" ? p.total_sales_count : 0,
    createdAt: asString(p.created_at),
  };
}
