import type { CommerceStoreKey } from "../geo/regions";

/**
 * One saved "estampa". Identity is `inkProductId` + `commerceStoreKey` (never a slug or title — see
 * docs/decisions/0001-ink-catalog-indexing-and-store-consolidation.md: slugs/ids can change under a store swap).
 * Display fields are a cache taken from whatever card was on screen at save time; the Meus Lugares page refreshes
 * them from the live catalog and never trusts this cache for anything security-relevant (a purchase link).
 */
export type FavoriteItem = {
  inkProductId: string;
  commerceStoreKey: CommerceStoreKey;
  title: string;
  context: string | null;
  imageUrl: string;
  price: number | null;
  /** Order of addition (`Date.now()` at save time) — V1 keeps this order; no manual reordering yet. */
  addedAt: number;
};

export type FavoritesSnapshotV1 = {
  v: 1;
  items: FavoriteItem[];
};

export const FAVORITES_MAX_ITEMS = 60;
