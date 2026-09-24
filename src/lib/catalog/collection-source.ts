import "server-only";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import { enabledInternalIds } from "../site-config/collections-enabled";
import type { ScopeDoc } from "../site-config/schema";
import type { CategoryLookup } from "../site-config/sources";
import { cityById } from "../geo/cities";
import { formatPrice } from "../format";
import type { CommerceStoreKey } from "../geo/regions";
import { purchaseUrl } from "./commerce";
import { collectionState, MIN_USABLE_PRODUCTS, type CollectionReason } from "./collections";
import { findCollection, getStoreCollections } from "./collections-file";
import { DESIGN_FAMILIES } from "./families";
import type { StoreProducts } from "./repository";
import type { MerchProduct, UnrankedBinding } from "./types";

export { MIN_USABLE_PRODUCTS };

/** One row of the Collections library / the editor's autocomplete. No product ids: only what a person needs to choose. */
export type LibraryEntry = {
  store: CommerceStoreKey;
  id: number;
  name: string;
  slug: string;
  position: number;
  visibility: "public" | "internal";
  enabled: boolean;
  eligible: boolean;
  selectable: boolean;
  reason: CollectionReason | null;
  /** Products of THIS store's catalog snapshot that belong to the collection (merch + city designs). The useful count, never INK's raw total. */
  matchedCount: number;
  merchCount: number;
  cityDesignCount: number;
  needsResync: boolean;
};

/**
 * Every collection of a store, with its editorial state. `enabledInternal` = the explicit CMS enablements of the document being edited.
 * Empty when no collections were synced (the caller says so; it is not "there are no collections").
 */
export function libraryEntries(store: CommerceStoreKey, enabledInternal: ReadonlySet<number>, filePath?: string): LibraryEntry[] {
  const collections = getStoreCollections(store, filePath)?.collections ?? [];
  return collections.map((c) => {
    const state = collectionState(c, enabledInternal);
    return {
      store, id: c.id, name: c.name, slug: c.slug, position: c.position, visibility: state.visibility, enabled: state.enabled, eligible: state.eligible,
      selectable: state.selectable, reason: state.reason, matchedCount: c.matchedCount, merchCount: c.merchCount, cityDesignCount: c.cityDesignCount, needsResync: c.needsResync === true,
    };
  });
}

/** What a section may be built on right now: enabled (public or explicitly enabled) and with enough real products. */
export const selectableEntries = (store: CommerceStoreKey, enabledInternal: ReadonlySet<number>, filePath?: string): LibraryEntry[] =>
  libraryEntries(store, enabledInternal, filePath).filter((e) => e.selectable);

function merchItem(product: MerchProduct): CarouselItem | null {
  const href = purchaseUrl(product);
  if (!href) return null;
  return { id: product.inkProductId, name: product.name.replace(/\s+/g, " ").trim(), price: formatPrice(product.price), rawPrice: product.price, imageUrl: product.imageUrl, href };
}

/** A city design has no display name of its own: its family and city are the label ("Ponto de Origem" · "Tijucas · SC"). */
function cityDesignItem(design: UnrankedBinding): CarouselItem | null {
  const href = purchaseUrl(design);
  const city = cityById(design.cityId);
  const family = DESIGN_FAMILIES.find((f) => f.id === design.designFamily);
  if (!href || !city || !family) return null;
  return { id: design.inkProductId, name: family.name, context: `${city.name} · ${city.uf}`, price: formatPrice(design.price), rawPrice: design.price, state: city.uf, imageUrl: design.imageUrl, href };
}

/**
 * Resolves a collection to carousel items using ONLY products of the same store that exist in the catalog snapshot (merch or city
 * design); hidden, missing, other-store and duplicated ids never appear, nothing is invented. Order = INK's own. A public collection is
 * usable as-is; an INTERNAL one only when the document has explicitly enabled it (`enabled`).
 */
export function categoryLookup(productsOf: (store: CommerceStoreKey) => StoreProducts, enabled: (store: CommerceStoreKey) => ReadonlySet<number>, filePath?: string): CategoryLookup {
  return (store, collectionId, limit) => {
    if (!getStoreCollections(store, filePath)) return { status: "unavailable", reason: "ink-collections-not-synced" };
    const collection = findCollection(store, collectionId, filePath);
    if (!collection) return { status: "unavailable", reason: "collection-not-found" };
    const state = collectionState(collection, enabled(store));
    if (state.reason === "needs-resync") return { status: "unavailable", reason: "collection-needs-resync" };
    if (!state.enabled) return { status: "unavailable", reason: "collection-not-enabled" };
    const products = productsOf(store);
    const items: CarouselItem[] = [];
    for (const id of collection.memberIds) {
      const merch = products.merch.get(id);
      const item = merch ? merchItem(merch) : products.cityDesigns.has(id) ? cityDesignItem(products.cityDesigns.get(id)!) : null;
      if (item) items.push(item);
      if (items.length >= limit) break;
    }
    return items.length > 0 ? { status: "ok", items } : { status: "unavailable", reason: "collection-has-no-products" };
  };
}

/** The slug of a PUBLIC collection only. An internal collection has no verified public page, so it never gets a "Ver todos" link. */
export function publicCollectionSlug(store: CommerceStoreKey, collectionId: number, filePath?: string): string | null {
  const c = findCollection(store, collectionId, filePath);
  return c?.isAvailable ? c.slug : null;
}

/** The two things `HomeSections` needs to render collection-backed sections for a document (the published one, or a draft in the preview). */
export function categoryProps(productsOf: (store: CommerceStoreKey) => StoreProducts, doc: ScopeDoc | undefined) {
  return {
    categories: categoryLookup(productsOf, (store) => enabledInternalIds(doc, store)),
    slugOf: (store: CommerceStoreKey, collectionId: number) => publicCollectionSlug(store, collectionId),
  };
}
