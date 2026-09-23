import type { CommerceStoreKey, RegionSlug } from "../geo/regions";
import type { DesignFamilyId } from "./families";

/** Product as returned by INK, reduced to the fields the storefront depends on. */
export type InkProductNormalized = {
  id: string;
  storeKey: CommerceStoreKey;
  name: string;
  slug: string;
  storeProductUrl: string;
  imageUrl: string;
  price: number | null;
  tags: string[];
  clusterId: string | null;
  totalSalesCount: number;
  createdAt: string | null;
};

/** One real INK product that represents a city design. Never merged or overwritten. */
export type CityDesignBinding = {
  cityId: string;
  designFamily: DesignFamilyId;

  /** Normalized internal key: "base", "regional", "localidade"... */
  designVariant: string;
  variantLabel?: string;

  /** Set when the product is about a locality inside a municipality (never a canonical city). */
  parentCityId?: string;
  localityLabel?: string;

  isPrimary: boolean;
  /** Lower wins. Deterministic: variant rank, then store priority, then INK id. */
  priority: number;

  commerceStoreKey: CommerceStoreKey;

  inkProductId: string;
  slug: string;
  storeProductUrl: string;
  imageUrl: string;
  /** Exactly what INK returned, never normalized or rewritten. */
  price: number | null;

  syncedAt: string;

  /**
   * INK's own cumulative sales count for this exact product (`total_sales_count`), same field already used
   * to rank merch. Optional because a snapshot written before this field existed on bindings won't have it —
   * every reader must treat a missing value as 0, never as "unknown ranked higher/lower". No period or "as of"
   * date is known for this count (it is a running total), so it is never presented publicly as "Mais
   * vendidas" — only used internally to prefer a real product over another when curating (see
   * src/lib/editorial/state-showcase.ts).
   */
  totalSalesCount?: number;
};

/** What the indexer stores per store. Ranking across stores happens at read time (ranking.ts). */
export type UnrankedBinding = Omit<CityDesignBinding, "isPrimary" | "priority">;

/** Non-city merchandise (art prints, pockets, clubs, state lines) used by carousels/editorial. */
export type MerchProduct = {
  inkProductId: string;
  commerceStoreKey: CommerceStoreKey;
  regionSlug: RegionSlug;
  name: string;
  slug: string;
  storeProductUrl: string;
  imageUrl: string;
  price: number | null;
  totalSalesCount: number;
  syncedAt: string;
};

export type ExclusionReason =
  | "ambiguous-city"
  | "city-not-found"
  | "unclassified-family"
  | "uf-mismatch";

export type ExcludedProduct = {
  inkProductId: string;
  commerceStoreKey: CommerceStoreKey;
  name: string;
  reason: ExclusionReason;
  detail?: string;
};

export type StoreIndex = {
  commerceStoreKey: CommerceStoreKey;
  syncedAt: string;
  productCount: number;
  bindings: UnrankedBinding[];
  merch: MerchProduct[];
  excluded: ExcludedProduct[];
};

export type CatalogSnapshot = {
  version: 1;
  stores: Partial<Record<CommerceStoreKey, StoreIndex>>;
};
