import "server-only";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import { arrangementOf, enabledInternalIds } from "../site-config/collections-enabled";
import { PAGE_SLUG, RESERVED_SLUGS, type ScopeDoc } from "../site-config/schema";
import { arrangeMembers, type CategoryArrangement, type CategoryLookup, type CollectionLinks, type CollectionPageLookup, type InkCategorySource, type UnavailableReason } from "../site-config/sources";
import { discountPercent, formatListPrice, formatPrice } from "../format";
import { isRegionSlug, REGIONS, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { purchaseUrl } from "./commerce";
import { collectionState, completeMembers, MIN_USABLE_PRODUCTS, type CollectionReason, type CollectionRecord } from "./collections";
import { findCollection, getStoreCollections } from "./collections-file";
import { DESIGN_FAMILIES } from "./families";
import { localityOfBinding } from "./locality-binding";
import type { StoreProducts } from "./repository";
import type { MerchProduct, UnrankedBinding } from "./types";
import { umaPencaLookup } from "../umapenca/carousel";

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
  return { id: product.inkProductId, name: product.name.replace(/\s+/g, " ").trim(), price: formatPrice(product.price), listPrice: formatListPrice(product), discount: discountPercent(product), rawPrice: product.price, imageUrl: product.imageUrl, href };
}

/** A city design has no display name of its own: its family and city are the label ("Ponto de Origem" · "Tijucas · SC"). */
function cityDesignItem(design: UnrankedBinding): CarouselItem | null {
  const href = purchaseUrl(design);
  // A Federal District administrative region's product reads as ITS region ("Taguatinga · DF"), never as Brasília.
  const city = localityOfBinding(design);
  const family = DESIGN_FAMILIES.find((f) => f.id === design.designFamily);
  if (!href || !city || !family) return null;
  return { id: design.inkProductId, name: family.name, context: `${city.name} · ${city.uf}`, price: formatPrice(design.price), listPrice: formatListPrice(design), discount: discountPercent(design), rawPrice: design.price, state: city.uf, imageUrl: design.imageUrl, href };
}

/** The card of one product of the store's catalog snapshot (merch or city design), or null when it is not there (or has no verified purchase URL). */
function storeItem(products: StoreProducts, id: string): CarouselItem | null {
  const merch = products.merch.get(id);
  if (merch) return merchItem(merch);
  const design = products.cityDesigns.get(id);
  return design ? cityDesignItem(design) : null;
}

type Resolved = { status: "ok"; collection: CollectionRecord; ids: string[] } | { status: "unavailable"; reason: UnavailableReason };

/**
 * A collection's products as this region shows them: EVERY member when the snapshot has the complete list (else the showcase slice), arranged
 * (`arrangeMembers`), hidden ones out. Only a real, synced, enabled collection resolves; a public one is usable as-is, an INTERNAL one only when the
 * document has explicitly enabled it (`enabled`).
 */
function resolveCollection(store: CommerceStoreKey, collectionId: number, enabled: ReadonlySet<number>, arrangement: CategoryArrangement | undefined, filePath?: string): Resolved {
  if (!getStoreCollections(store, filePath)) return { status: "unavailable", reason: "ink-collections-not-synced" };
  const collection = findCollection(store, collectionId, filePath);
  if (!collection) return { status: "unavailable", reason: "collection-not-found" };
  const state = collectionState(collection, enabled);
  if (state.reason === "needs-resync") return { status: "unavailable", reason: "collection-needs-resync" };
  if (!state.enabled) return { status: "unavailable", reason: "collection-not-enabled" };
  const members = completeMembers(collection) ?? collection.memberIds;
  const ids = arrangeMembers(members, arrangement);
  if (ids.length === 0 && members.length > 0) return { status: "unavailable", reason: "collection-all-hidden" };
  return { status: "ok", collection, ids };
}

/** How the sections of a document arrange their collection: the collection's own arrangement in that document, or a section's older one (`arrangementOf`). */
const arrangementIn = (doc: ScopeDoc | undefined) => (source: InkCategorySource) => arrangementOf(doc, source.store, source.collectionId, source);

/**
 * Resolves a collection to carousel items using ONLY products of the same store that exist in the catalog snapshot (merch or city
 * design); hidden, missing, other-store and duplicated ids never appear, nothing is invented. Order = INK's own, unless the region set its
 * own for the collection (`arrange`, by default the section's own older order).
 */
export function categoryLookup(
  productsOf: (store: CommerceStoreKey) => StoreProducts,
  enabled: (store: CommerceStoreKey) => ReadonlySet<number>,
  filePath?: string,
  arrange: (source: InkCategorySource) => CategoryArrangement | undefined = arrangementIn(undefined),
): CategoryLookup {
  return (source) => {
    const found = resolveCollection(source.store, source.collectionId, enabled(source.store), arrange(source), filePath);
    if (found.status !== "ok") return found;
    const products = productsOf(source.store);
    const items: CarouselItem[] = [];
    for (const id of found.ids) {
      const item = storeItem(products, id);
      if (item) items.push(item);
      if (items.length >= source.limit) break;
    }
    return items.length > 0 ? { status: "ok", items } : { status: "unavailable", reason: "collection-has-no-products" };
  };
}

/** The products of a collection in INK's order, at most `limit` (the panel's order list): nothing arranged, nothing hidden. */
export function collectionMembersInInkOrder(productsOf: (store: CommerceStoreKey) => StoreProducts, enabled: ReadonlySet<number>, store: CommerceStoreKey, collectionId: number, limit: number, filePath?: string): CarouselItem[] | null {
  const found = resolveCollection(store, collectionId, enabled, undefined, filePath);
  if (found.status !== "ok") return null;
  const products = productsOf(store);
  const items: CarouselItem[] = [];
  for (const id of found.ids) {
    const item = storeItem(products, id);
    if (item) items.push(item);
    if (items.length >= limit) break;
  }
  return items;
}

/**
 * One page of EVERY product of a collection (the collection page's paged grid): the same rule as the carousels (same arrangement, same store-only
 * products), `source.limit` per page. A page past the last one is an empty `items` with the real `pageCount`: the route answers 404 for it.
 */
export function collectionPageLookup(
  productsOf: (store: CommerceStoreKey) => StoreProducts,
  enabled: (store: CommerceStoreKey) => ReadonlySet<number>,
  filePath?: string,
  arrange: (source: InkCategorySource) => CategoryArrangement | undefined = arrangementIn(undefined),
): CollectionPageLookup {
  return (source, page) => {
    const found = resolveCollection(source.store, source.collectionId, enabled(source.store), arrange(source), filePath);
    if (found.status !== "ok") return found;
    const products = productsOf(source.store);
    const all = found.ids.map((id) => storeItem(products, id)).filter((item): item is CarouselItem => item !== null);
    if (all.length === 0) return { status: "unavailable", reason: "collection-has-no-products" };
    const perPage = Math.max(1, source.limit);
    const pageCount = Math.ceil(all.length / perPage);
    return { status: "ok", items: all.slice((page - 1) * perPage, page * perPage), total: all.length, page, pageCount };
  };
}

/** The slug of a PUBLIC collection only. An internal collection has no verified public page on INK, so it never gets a link there. */
export function publicCollectionSlug(store: CommerceStoreKey, collectionId: number, filePath?: string): string | null {
  const c = findCollection(store, collectionId, filePath);
  return c?.isAvailable ? c.slug : null;
}

/** A collection slug that can be an address of ours (`/<region>/colecoes/<slug>`): the same rule as a page's own address. */
const pageAddress = (slug: string): boolean => PAGE_SLUG.test(slug) && slug.length <= 60 && !RESERVED_SLUGS.includes(slug);

/**
 * The collection behind `/<region>/colecoes/<slug>` when no page of the document has that address: a collection of the region's own store that the
 * region can use right now (public, or internal and enabled in `doc`; with enough products). Null = no collection page (404).
 */
export function collectionForPage(region: RegionSlug, doc: ScopeDoc | undefined, slug: string, filePath?: string): CollectionRecord | null {
  if (!pageAddress(slug)) return null;
  const store = REGIONS[region].storeKey;
  const collection = getStoreCollections(store, filePath)?.collections.find((c) => c.slug === slug);
  return collection && collectionState(collection, enabledInternalIds(doc, store)).selectable ? collection : null;
}

/** The address of a collection's page in the region of `doc`, or null when the region cannot show it (same rule as `collectionForPage`). */
export function collectionPageSlug(doc: ScopeDoc | undefined, store: CommerceStoreKey, collectionId: number, filePath?: string): string | null {
  const region = doc && isRegionSlug(doc.scope) ? doc.scope : null;
  if (!region || REGIONS[region].storeKey !== store) return null;
  const collection = findCollection(store, collectionId, filePath);
  if (!collection || !pageAddress(collection.slug)) return null;
  return collectionState(collection, enabledInternalIds(doc, store)).selectable ? collection.slug : null;
}

/** What `HomeSections` needs to render collection-backed (and Uma Penca) sections for a document (the published one, or a draft in the preview). */
export function categoryProps(productsOf: (store: CommerceStoreKey) => StoreProducts, doc: ScopeDoc | undefined) {
  const enabled = (store: CommerceStoreKey) => enabledInternalIds(doc, store);
  const links: CollectionLinks = {
    inkSlug: (store, collectionId) => publicCollectionSlug(store, collectionId),
    pageSlug: (store, collectionId) => collectionPageSlug(doc, store, collectionId),
  };
  return {
    categories: categoryLookup(productsOf, enabled, undefined, arrangementIn(doc)),
    collectionPage: collectionPageLookup(productsOf, enabled, undefined, arrangementIn(doc)),
    links,
    umapenca: umaPencaLookup(doc?.scope ?? ""),
  };
}
