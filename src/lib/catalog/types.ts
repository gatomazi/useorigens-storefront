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
  /**
   * Set when the product belongs to a Federal District administrative region (`geo/administrative-regions.ts`): the RA's locality id. Such a
   * product is that RA's own product (its primary for the family, like a municipality's), NOT a Brasília product, even though `cityId` still names
   * the municipality that legally contains it. Absent on snapshots written before RAs existed: `withLocality` (repository.ts) derives it from
   * `localityLabel` with the same exact-match rule, so no resync is needed.
   */
  localityId?: string;

  isPrimary: boolean;
  /** Lower wins. Deterministic: variant rank, then store priority, then INK id. */
  priority: number;

  /**
   * INK's own `product_cluster_id` for this exact product, when INK returned one (ADR 0001: roughly a
   * sixth to a seventh of visible products across the three stores don't have one). This is the ONLY
   * authorized way to link a city+family's classic product to its other garment-type siblings
   * (src/lib/catalog/garments.ts) — never by approximate name/city text. Missing here means the family
   * has zero garment-type tabs beyond the classic one: fail closed, never guessed.
   */
  productClusterId?: string;

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
  /** INK's `product_cluster_id`, when it returned one: the pieces of ONE design share it (the global search groups merchandise by it). */
  productClusterId?: string;
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

/**
 * One real INK product that is the SAME design as a city+family's classic `CityDesignBinding`, but a
 * different physical piece (INK's `product_type`) — e.g. Oversized, Algodão Peruano, Body Infantil. Hidden
 * from INK's own search (`visible_in_store: false`, `status: "not_published"`) but genuinely purchasable by
 * direct link (verified against the live storefront, docs/storefront/city-garment-tabs-round.md). Linked to
 * its classic sibling by `product_cluster_id` only — see `CityDesignBinding.productClusterId` and
 * `src/lib/catalog/garments.ts`. Never a synonym for "public"/"active": sellability here is decided purely by
 * having a valid https image, a numeric price and a validated purchase-URL host, exactly like `commerce.ts`
 * already does for classic bindings.
 */
export type GarmentBinding = {
  cityId: string;
  designFamily: DesignFamilyId;
  /** INK's stable, global `product_type.id` (src/lib/catalog/garments.ts owns the id → label map). */
  garmentTypeId: number;
  commerceStoreKey: CommerceStoreKey;
  inkProductId: string;
  slug: string;
  storeProductUrl: string;
  imageUrl: string;
  price: number | null;
  productClusterId: string;
  syncedAt: string;
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
