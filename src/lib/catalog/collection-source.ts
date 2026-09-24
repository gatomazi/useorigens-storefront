import "server-only";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import type { CategoryLookup } from "../site-config/sources";
import { formatPrice } from "../format";
import type { CommerceStoreKey } from "../geo/regions";
import { purchaseUrl } from "./commerce";
import { findCollection, getStoreCollections } from "./collections-file";
import type { MerchProduct } from "./types";

/** Smallest carousel the CMS schema allows (`Source.limit` is 3..24), so a collection with fewer real products is not offered as a source. */
export const MIN_USABLE_PRODUCTS = 3;

export type AvailableCategory = { collectionId: number; name: string; slug: string; position: number; productCount: number; usable: boolean };

/**
 * What the CMS may offer as an `ink-category` source for a store: only collections that (a) are in the synced snapshot, (b) are
 * shown on the live store, and (c) have real products in the catalog snapshot. `productCount` is the INTERSECTION with the catalog,
 * never INK's reported count (which includes hidden and unpublished products). Empty when no collections were synced.
 */
export function availableCategories(store: CommerceStoreKey, filePath?: string): AvailableCategory[] {
  const collections = getStoreCollections(store, filePath)?.collections ?? [];
  return collections
    .filter((c) => c.isAvailable && c.merchProductIds.length > 0)
    .map((c) => ({ collectionId: c.id, name: c.name, slug: c.slug, position: c.position, productCount: c.merchProductIds.length, usable: c.merchProductIds.length >= MIN_USABLE_PRODUCTS }));
}

function toItem(product: MerchProduct): CarouselItem | null {
  const href = purchaseUrl(product);
  if (!href) return null;
  return { id: product.inkProductId, name: product.name.replace(/\s+/g, " ").trim(), price: formatPrice(product.price), rawPrice: product.price, imageUrl: product.imageUrl, href };
}

/**
 * Resolves a collection to carousel items using ONLY products of the same store that exist in the catalog. `merch` is the region's
 * merch list (already merged across stores), so every product is also matched on `commerceStoreKey`: an id from another store can
 * never leak in, and nothing is invented for an id the catalog does not have. Order = the order INK returned the ids in.
 */
export function categoryLookup(merch: readonly MerchProduct[], filePath?: string): CategoryLookup {
  return (store, collectionId, limit) => {
    if (!getStoreCollections(store, filePath)) return { status: "unavailable", reason: "ink-collections-not-synced" };
    const collection = findCollection(store, collectionId, filePath);
    if (!collection) return { status: "unavailable", reason: "collection-not-found" };
    if (!collection.isAvailable) return { status: "unavailable", reason: "collection-unavailable" };
    const byId = new Map(merch.filter((m) => m.commerceStoreKey === store).map((m) => [m.inkProductId, m]));
    const items: CarouselItem[] = [];
    for (const id of collection.merchProductIds) {
      const product = byId.get(id);
      const item = product ? toItem(product) : null;
      if (item) items.push(item);
      if (items.length >= limit) break;
    }
    return items.length > 0 ? { status: "ok", items } : { status: "unavailable", reason: "collection-has-no-products" };
  };
}
