/**
 * Contract of the Use Origens GA4 custom events v1 (docs/expansao-cinco-produtos-analytics.md). Pure and client-safe: the enums,
 * the one-time arrival marker parser and the two bucketing helpers. Nothing here reads or sends anything.
 *
 * The marker is a FIXED-ENUM query pair the INK-side loader appends to its own links to /sul (`origens_src`, `origens_p`). It is not the
 * cart token, carries no personal data, is validated against closed lists, and is consumed once (removed from the address bar).
 */

/** Where the click that brought the visitor here happened, on the INK side. */
export const ORIGENS_ENTRY_POINTS = ["ink_cart_drawer", "ink_post_add", "ink_product_detail", "ink_product_return"] as const;
export type OrigensEntryPoint = (typeof ORIGENS_ENTRY_POINTS)[number];

/** The only INK product pages that carry our loader (the Worker's exact allowlist). A slug outside this list is dropped, never sent. */
export const ORIGENS_PRODUCT_SLUGS = [
  "serra-catarinense",
  "made-in-rio-grande-do-sul-8834d3a7-4ed3-49a3-8258-d2ba71fa8241",
  "made-in-santa-catarina-60ba13f6-62cf-4309-9d03-490ab9193829",
  "paranaense-essencia",
  "made-in-parana-cda5fe30-bb4e-4e2e-b416-01e3ec45649a",
] as const;

export const ARRIVAL_SRC_PARAM = "origens_src";
export const ARRIVAL_PRODUCT_PARAM = "origens_p";

export type ArrivalExtraction = {
  entryPoint: OrigensEntryPoint | null;
  productSlug: string | null;
  /** Either parameter was present, so both must be removed from the address bar whether or not they were valid. */
  present: boolean;
  /** The same query without the two markers, every other parameter (UTMs included) preserved in order ("?..." or ""). */
  search: string;
};

export function extractArrival(search: string): ArrivalExtraction {
  const params = new URLSearchParams(search);
  const src = params.getAll(ARRIVAL_SRC_PARAM);
  const product = params.getAll(ARRIVAL_PRODUCT_PARAM);
  const entryPoint = ORIGENS_ENTRY_POINTS.find((value) => src.length === 1 && src[0] === value) ?? null;
  const productSlug = ORIGENS_PRODUCT_SLUGS.find((value) => product.length === 1 && product[0] === value) ?? null;
  params.delete(ARRIVAL_SRC_PARAM);
  params.delete(ARRIVAL_PRODUCT_PARAM);
  const rest = params.toString();
  return { entryPoint, productSlug, present: src.length + product.length > 0, search: rest ? `?${rest}` : "" };
}

export type CartItemsBucket = "0" | "1" | "2" | "3_5" | "6_plus";
/** Bucket of the TOTAL units in the snapshot (the promotion tiers of the INK are per piece), never an exact count. */
export function cartItemsBucket(units: number): CartItemsBucket {
  if (!Number.isFinite(units) || units <= 0) return "0";
  if (units === 1) return "1";
  if (units === 2) return "2";
  return units <= 5 ? "3_5" : "6_plus";
}

export type MirrorAgeBucket = "under_1m" | "1_5m" | "5_30m";
export function mirrorAgeBucket(ageSeconds: number): MirrorAgeBucket {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 60) return "under_1m";
  return ageSeconds < 300 ? "1_5m" : "5_30m";
}

/** A navigation from the INK counts as ours only when the browser did not report a different origin (an empty referrer is accepted). */
export function referrerAllowsArrival(referrer: string, inkOrigin: string): boolean {
  if (!referrer) return true;
  try {
    return new URL(referrer).origin === inkOrigin;
  } catch {
    return false;
  }
}
