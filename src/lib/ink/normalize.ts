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
    garmentTypeId: productTypeId(p.product_type),
    totalSalesCount: typeof p.total_sales_count === "number" ? p.total_sales_count : 0,
    createdAt: asString(p.created_at),
  };
}

function productTypeId(value: unknown): number | null {
  const id = typeof value === "object" && value !== null ? (value as Record<string, unknown>).id : undefined;
  return typeof id === "number" && Number.isInteger(id) ? id : null;
}

/** One real INK product as returned by `GET /v1/stores/products(/:id)`, reduced to what garment linking needs. */
export type GarmentSourceProduct = {
  id: string;
  storeKey: CommerceStoreKey;
  name: string;
  slug: string;
  storeProductUrl: string;
  imageUrl: string;
  price: number | null;
  clusterId: string | null;
  garmentTypeId: number | null;
  /** ISO 8601, when INK provided one. Drives the incremental sync's `begin_date` watermark (garment-client.ts). */
  createdAt: string | null;
};

/**
 * Same field-level validation as `normalizeInkProduct` (id/name/slug/https image/https store URL all
 * required), but deliberately WITHOUT the `status`/`visible_in_store` gate: a garment-type sibling is
 * expected to be `not_published`/hidden in INK's own admin while still being genuinely sellable by direct
 * link (see `GarmentBinding` in catalog/types.ts and docs/storefront/city-garment-tabs-round.md for the live
 * verification). Actual sellability is decided later, by `commerce.ts`'s own https+host allowlist check —
 * never by any status/visibility flag here. Used only by the garment-fixture fetch path
 * (scripts/fetch-garment-fixtures.mts), never by the main `fetchStoreProducts` sync.
 */
export function normalizeGarmentSourceProduct(raw: unknown, storeKey: CommerceStoreKey): GarmentSourceProduct | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;

  const id = typeof p.id === "number" ? String(p.id) : asString(p.id);
  const name = asString(p.name);
  const slug = asString(p.slug);
  const storeProductUrl = asHttpsUrl(p.store_product_url);
  const imageUrl = asHttpsUrl(p.main_image_url);
  if (!id || !name || !slug || !storeProductUrl || !imageUrl) return null;

  const productType = typeof p.product_type === "object" && p.product_type !== null ? (p.product_type as Record<string, unknown>) : null;

  return {
    id,
    storeKey,
    name,
    slug,
    storeProductUrl,
    imageUrl,
    price: asPrice(p.price),
    clusterId: typeof p.product_cluster_id === "number" ? String(p.product_cluster_id) : null,
    garmentTypeId: productType && typeof productType.id === "number" ? productType.id : null,
    createdAt: asString(p.created_at),
  };
}
