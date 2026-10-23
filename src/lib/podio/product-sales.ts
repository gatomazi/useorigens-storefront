import type { CommerceStoreKey, RegionSlug } from "../geo/regions";
import type { StoreProducts } from "../catalog/repository";
import type { EligibleLine } from "./orders";

/**
 * Units sold per product over the pódio's window, for the collection pages' "Mais vendidas" sort. INTERNAL like the pódio snapshot: it lives on the
 * Volume next to it and no page ever shows a count, only the order it gives. Computed in the same daily run, from the same eligible lines (paid, not
 * an exchange, positive total, inside the 30 days, refunds and free units out), so it costs no extra call to INK.
 */
export type ProductSales = {
  version: 1;
  region: RegionSlug;
  /** The store whose ids `units` is keyed by (the one the region sells from now). */
  storeKey: CommerceStoreKey;
  referenceDate: string;
  window: { start: string; end: string };
  computedAt: string;
  /** Net units per product id of `storeKey`. A product with no sale is absent. */
  units: Record<string, number>;
};

/** A sale older than this stops ordering the pages (the pódio's own limit): the sort is offered only on fresh data. */
export const PRODUCT_SALES_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/**
 * Pure: eligible lines → units per product id of the served store. `storeOf` names the store a line was sold in (an order id carries its store when
 * the pódio read two); `served` maps a product of that store to the id it has in the served store (itself, or its confirmed id in the single store),
 * or null when it has no confirmed counterpart: such a sale is left out rather than credited to a guess.
 */
export function tallyProductSales(lines: readonly EligibleLine[], storeOf: (line: EligibleLine) => CommerceStoreKey, served: (store: CommerceStoreKey, productId: string) => string | null): Record<string, number> {
  const units: Record<string, number> = {};
  for (const line of lines) {
    const id = served(storeOf(line), line.productId);
    if (id) units[id] = (units[id] ?? 0) + line.units;
  }
  return units;
}

/**
 * The store of an eligible line. Its key is `<pódio store key>:<order id>:<item id>`; with two stores the order id itself starts with its store
 * (`use-norte:123`, sync.ts), with one store every line is that store's.
 */
export function lineStore(line: Pick<EligibleLine, "key">, stores: readonly CommerceStoreKey[]): CommerceStoreKey {
  if (stores.length === 1) return stores[0];
  const prefix = line.key.split(":")[1];
  return (stores as readonly string[]).includes(prefix) ? (prefix as CommerceStoreKey) : stores[0];
}

export const isProductSales = (v: unknown): v is ProductSales => {
  const s = v as ProductSales;
  return typeof s === "object" && s !== null && s.version === 1 && typeof s.region === "string" && typeof s.computedAt === "string" && typeof s.units === "object" && s.units !== null;
};

/** The units of a fresh file, or null: missing, of another region, or older than `PRODUCT_SALES_MAX_AGE_MS`. Pure on `now`. */
export function freshUnits(sales: ProductSales | null, region: RegionSlug, now: Date): Record<string, number> | null {
  if (!sales || sales.region !== region) return null;
  const age = now.getTime() - Date.parse(sales.computedAt);
  return Number.isFinite(age) && age <= PRODUCT_SALES_MAX_AGE_MS ? sales.units : null;
}

/**
 * Fallback for "Mais vendidas" when there is no fresh 30-day count (the pódio of the region is switched off, or its run is stale): INK's own
 * cumulative `total_sales_count` of every product the region sells from, as the catalog sync stored it. No extra call to INK. A product without a
 * count is absent (the sort reads it as zero); null when no product carries one, so the sort is not offered on nothing.
 */
export function cumulativeUnits(stores: readonly StoreProducts[]): Record<string, number> | null {
  const units: Record<string, number> = {};
  let counted = false;
  for (const store of stores) {
    for (const products of [store.merch, store.unscoped, store.cityDesigns]) {
      for (const [id, product] of products ?? []) {
        const count = product.totalSalesCount;
        if (typeof count !== "number" || !Number.isFinite(count) || count < 0) continue;
        units[id] = count;
        counted = true;
      }
    }
  }
  return counted ? units : null;
}
