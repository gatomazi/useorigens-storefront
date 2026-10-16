import "server-only";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import { arrangementOf, enabledInternalIds } from "../site-config/collections-enabled";
import { PAGE_SLUG, RESERVED_SLUGS, type ScopeDoc } from "../site-config/schema";
import { arrangeMembers, type CategoryArrangement, type CategoryLookup, type CollectionLinks, type CollectionPageLookup, type InkCategorySource, type UnavailableReason } from "../site-config/sources";
import { discountPercent, formatListPrice, formatPrice } from "../format";
import { isRegionSlug, REGIONS, STATE_NAMES, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { normalizeText } from "../geo/text";
import { commercePlan, storeForRegion } from "./commerce-mode";
import { getCatalog } from "./repository";
import { purchaseUrl } from "./commerce";
import { collectionState, completeMembers, MIN_USABLE_PRODUCTS, type CollectionReason, type CollectionRecord } from "./collections";
import { findCollection, getStoreCollections } from "./collections-file";
import { DESIGN_FAMILIES } from "./families";
import { localityOfBinding } from "./locality-binding";
import type { StoreProducts } from "./repository";
import type { MerchProduct, UnrankedBinding } from "./types";
import { umaPencaLookup } from "../umapenca/carousel";
import { CITY_DESIGN_GARMENT_TYPE_ID } from "../search/collection-filter";

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
  return {
    id: product.inkProductId, name: product.name.replace(/\s+/g, " ").trim(), price: formatPrice(product.price), listPrice: formatListPrice(product), discount: discountPercent(product), rawPrice: product.price, imageUrl: product.imageUrl, href,
    ...(product.garmentTypeId !== undefined ? { garmentTypeId: product.garmentTypeId } : {}),
  };
}

/** A city design has no display name of its own: its family and city are the label ("Ponto de Origem" · "Tijucas · SC"). */
function cityDesignItem(design: UnrankedBinding): CarouselItem | null {
  const href = purchaseUrl(design);
  // A Federal District administrative region's product reads as ITS region ("Taguatinga · DF"), never as Brasília.
  const city = localityOfBinding(design);
  const family = DESIGN_FAMILIES.find((f) => f.id === design.designFamily);
  if (!href || !city || !family) return null;
  return {
    id: design.inkProductId, name: family.name, context: `${city.name} · ${city.uf}`, price: formatPrice(design.price), listPrice: formatListPrice(design), discount: discountPercent(design), rawPrice: design.price, state: city.uf, imageUrl: design.imageUrl, href,
    city: city.name, family: family.id, garmentTypeId: CITY_DESIGN_GARMENT_TYPE_ID,
  };
}

/** The card of one product of the store's catalog snapshot (merch or city design), or null when it is not there (or has no verified purchase URL). */
function storeItem(products: StoreProducts, id: string): CarouselItem | null {
  const merch = products.merch.get(id);
  if (merch) return merchItem(merch);
  const design = products.cityDesigns.get(id);
  return design ? cityDesignItem(design) : null;
}

/** The region a catalog product is about (a city design's locality, a merch item's own region), or null when unknown. */
export function regionOfStoreProduct(products: StoreProducts, id: string): RegionSlug | null {
  const merch = products.merch.get(id);
  if (merch) return merch.regionSlug;
  const design = products.cityDesigns.get(id);
  return design ? (localityOfBinding(design)?.regionSlug ?? null) : null;
}

/** A store product's card, or null when it is not in the catalog or (with `region`) is about another region: a no-op for a regional store; in
 * single-store mode one store holds the three regions. */
const regionItem = (products: StoreProducts, id: string, region: RegionSlug | undefined): CarouselItem | null =>
  region && regionOfStoreProduct(products, id) !== region ? null : storeItem(products, id);

/**
 * The collections a region may show (search results, collection pages): those of the region's store under the effective commerce mode. In
 * single-store mode one store's collections serve three regions and thematic ones mix them ("Da Nossa Terra" has Sul, Norte and Centro-Oeste
 * products), so a collection is the region's when it has at least MIN_USABLE_PRODUCTS products of that region (evidence from the products
 * themselves, never from the name), and the region shows only those. In the regional mode every collection of the region's own store qualifies.
 */
export function collectionsForRegion(region: RegionSlug, productsOf: (store: CommerceStoreKey) => StoreProducts, filePath?: string): CollectionRecord[] {
  const store = storeForRegion(region);
  const all = getStoreCollections(store, filePath)?.collections ?? [];
  if (commercePlan().effective !== "single-store") return all;
  const products = productsOf(store);
  // The count the region shows (search results, "N produtos") is its own products', not the whole mixed collection's.
  return all.flatMap((c) => {
    const n = regionMemberCount(c, products, region);
    return n >= MIN_USABLE_PRODUCTS ? [{ ...c, matchedCount: n }] : [];
  });
}

/** How many of a collection's products are about `region` (a thematic collection of the single store mixes the three regions). */
function regionMemberCount(c: CollectionRecord, products: StoreProducts, region: RegionSlug): number {
  return (completeMembers(c) ?? c.memberIds).filter((id) => regionOfStoreProduct(products, id) === region).length;
}

/** A collection is the region's when it has at least MIN_USABLE_PRODUCTS products of the region; it then shows only those (`regionItem`). */
function belongsToRegion(c: CollectionRecord, products: StoreProducts, region: RegionSlug): boolean {
  return regionMemberCount(c, products, region) >= MIN_USABLE_PRODUCTS;
}

/** Whether a collection of the region's selling store is the region's (`collectionsForRegion`'s rule, one record): always in the regional mode. */
export function regionShowsCollection(region: RegionSlug, c: CollectionRecord): boolean {
  if (commercePlan().effective !== "single-store") return true;
  return belongsToRegion(c, getCatalog().productsOfStore(storeForRegion(region)), region);
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
  region?: RegionSlug,
): CategoryLookup {
  return (source) => {
    // A region's document may keep refs to its own store and to the single store; only the one that sells there now resolves.
    if (region && source.store !== storeForRegion(region)) return { status: "unavailable", reason: "collection-not-found" };
    const found = resolveCollection(source.store, source.collectionId, enabled(source.store), arrange(source), filePath);
    if (found.status !== "ok") return found;
    const products = productsOf(source.store);
    const items: CarouselItem[] = [];
    for (const id of found.ids) {
      const item = regionItem(products, id, region);
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
  region?: RegionSlug,
): CollectionPageLookup {
  return (source, page) => {
    // A region's document may keep refs to its own store and to the single store; only the one that sells there now resolves.
    if (region && source.store !== storeForRegion(region)) return { status: "unavailable", reason: "collection-not-found" };
    const found = resolveCollection(source.store, source.collectionId, enabled(source.store), arrange(source), filePath);
    if (found.status !== "ok") return found;
    const products = productsOf(source.store);
    const all = found.ids.map((id) => regionItem(products, id, region)).filter((item): item is CarouselItem => item !== null);
    if (all.length === 0) return { status: "unavailable", reason: "collection-has-no-products" };
    const perPage = Math.max(1, source.limit);
    const pageCount = Math.ceil(all.length / perPage);
    return { status: "ok", items: all.slice((page - 1) * perPage, page * perPage), total: all.length, page, pageCount };
  };
}

/** One row of a state page: a collection ("Fala Daqui") cut down to the products of the state's own collection ("Pará"). */
export type StateCollectionRow = { collection: CollectionRecord; items: CarouselItem[] };

/** A row with fewer products than this is not shown (a carousel of one or two cards looks broken). */
export const STATE_ROW_MIN_ITEMS = 3;

const stateNameKeys = new Set(Object.values(STATE_NAMES).map(normalizeText));
const byMenuOrder = (a: CollectionRecord, b: CollectionRecord) => a.position - b.position || a.id - b.id;

/**
 * The collections that may become rows on the region's state pages, in the order they show. The region's choice when it made one (`collections.stateRows`,
 * any collection of its selling store, in the owner's order; one no longer synced is skipped); otherwise automatic: every PUBLIC collection of the store,
 * in INK's menu order. Never a collection named after a state: those are the parents.
 */
export function stateRowCollections(region: RegionSlug, doc: ScopeDoc | undefined, filePath?: string): { own: boolean; records: CollectionRecord[] } {
  const store = storeForRegion(region);
  const records = getStoreCollections(store, filePath)?.collections ?? [];
  const usable = (c: CollectionRecord) => !c.needsResync && !stateNameKeys.has(normalizeText(c.name));
  const chosen = doc?.collections?.stateRows;
  if (chosen) {
    const byId = new Map(records.map((c) => [c.id, c]));
    return { own: true, records: chosen.filter((r) => r.store === store).map((r) => byId.get(r.collectionId)).filter((c): c is CollectionRecord => c !== undefined && usable(c)) };
  }
  return { own: false, records: records.filter((c) => c.isAvailable && usable(c)).sort(byMenuOrder) };
}

/**
 * The state's collections as the state page shows them. INK has no parent/child between collections, so the hierarchy is ours: the PARENT is the
 * collection named after the state ("Pará", usually internal); the rows are the collections of `stateRowCollections` ("Da Nossa Terra", "Fala Daqui")
 * cut down to the products they share with it, in each collection's own arrangement for the region (hidden ones out), only products of the catalog and of
 * this region. A row needs at least `STATE_ROW_MIN_ITEMS` products; no parent, no rows.
 */
export function stateCollectionRows(region: RegionSlug, uf: string, doc: ScopeDoc | undefined, productsOf: (store: CommerceStoreKey) => StoreProducts, filePath?: string): StateCollectionRow[] {
  const parent = stateParentCollection(region, uf, filePath);
  if (!parent) return [];
  const store = storeForRegion(region);
  const inState = new Set(completeMembers(parent) ?? parent.memberIds);
  const products = productsOf(store);
  const rows: StateCollectionRow[] = [];
  for (const c of stateRowCollections(region, doc, filePath).records) {
    const items = stateRowItems(region, inState, c, doc, products);
    if (items.length >= STATE_ROW_MIN_ITEMS) rows.push({ collection: c, items });
  }
  return rows;
}

/** The collection named after the state ("Paraná"), the parent of that state's rows; null when the region's store has none. */
export function stateParentCollection(region: RegionSlug, uf: string, filePath?: string): CollectionRecord | null {
  const wanted = normalizeText(STATE_NAMES[uf] ?? "");
  if (!wanted) return null;
  const records = getStoreCollections(storeForRegion(region), filePath)?.collections ?? [];
  return records.filter((c) => normalizeText(c.name) === wanted && !c.needsResync).sort(byMenuOrder)[0] ?? null;
}

/** A collection's products on one state page BEFORE the minimum: shared with the state's parent, in the catalog and of this region, in the collection's arrangement. */
function stateRowItems(region: RegionSlug, inState: ReadonlySet<string>, c: CollectionRecord, doc: ScopeDoc | undefined, products: StoreProducts): CarouselItem[] {
  const members = (completeMembers(c) ?? c.memberIds).filter((id) => inState.has(id));
  return arrangeMembers(members, arrangementOf(doc, storeForRegion(region), c.id))
    .map((id) => regionItem(products, id, region))
    .filter((item): item is CarouselItem => item !== null);
}

/** One state of the region as the panel explains it: its parent collection (with how many of its products the store can show) or none. */
export type StateParentView = { uf: string; name: string; parent: { id: number; name: string; products: number } | null };

/**
 * For the panel ("Páginas de estado"): every state's parent collection and, for each candidate row, how many products it would show on each state page
 * (below `STATE_ROW_MIN_ITEMS` the row is not drawn). This is what turns "não aparece em nenhum estado" into a reason: no parent, or too few shared products.
 */
export function stateRowMatrix(region: RegionSlug, doc: ScopeDoc | undefined, productsOf: (store: CommerceStoreKey) => StoreProducts, filePath?: string): { states: StateParentView[]; counts: Map<number, Record<string, number>> } {
  const products = productsOf(storeForRegion(region));
  const candidates = stateRowCollections(region, doc, filePath).records;
  const counts = new Map<number, Record<string, number>>(candidates.map((c) => [c.id, {}]));
  const states: StateParentView[] = REGIONS[region].ufs.map((uf) => {
    const parent = stateParentCollection(region, uf, filePath);
    const members = parent ? (completeMembers(parent) ?? parent.memberIds) : [];
    const inState = new Set(members);
    for (const c of candidates) counts.get(c.id)![uf] = parent ? stateRowItems(region, inState, c, doc, products).length : 0;
    return { uf, name: STATE_NAMES[uf] ?? uf, parent: parent ? { id: parent.id, name: parent.name, products: members.filter((id) => regionItem(products, id, region) !== null).length } : null };
  });
  return { states, counts };
}

/** For the panel: in how many of the region's states each collection shows as a row (0 = it shows nowhere), by collection id. */
export function stateRowsReach(region: RegionSlug, doc: ScopeDoc | undefined, productsOf: (store: CommerceStoreKey) => StoreProducts, filePath?: string): Map<number, number> {
  const reach = new Map<number, number>();
  for (const uf of REGIONS[region].ufs) for (const row of stateCollectionRows(region, uf, doc, productsOf, filePath)) reach.set(row.collection.id, (reach.get(row.collection.id) ?? 0) + 1);
  return reach;
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
  const store = storeForRegion(region);
  const collection = getStoreCollections(store, filePath)?.collections.find((c) => c.slug === slug);
  // Single store: a collection of another region (or a mixed one) is not a page of this region.
  return collection && collectionState(collection, enabledInternalIds(doc, store)).selectable && regionShowsCollection(region, collection) ? collection : null;
}

/** The address of a collection's page in the region of `doc`, or null when the region cannot show it (same rule as `collectionForPage`). */
export function collectionPageSlug(doc: ScopeDoc | undefined, store: CommerceStoreKey, collectionId: number, filePath?: string): string | null {
  const region = doc && isRegionSlug(doc.scope) ? doc.scope : null;
  if (!region || storeForRegion(region) !== store) return null;
  const collection = findCollection(store, collectionId, filePath);
  if (!collection || !pageAddress(collection.slug)) return null;
  return collectionState(collection, enabledInternalIds(doc, store)).selectable && regionShowsCollection(region, collection) ? collection.slug : null;
}

const regionOfDoc = (doc: ScopeDoc | undefined): RegionSlug | undefined => (doc && isRegionSlug(doc.scope) ? doc.scope : undefined);

/** What `HomeSections` needs to render collection-backed (and Uma Penca) sections for a document (the published one, or a draft in the preview). */
export function categoryProps(productsOf: (store: CommerceStoreKey) => StoreProducts, doc: ScopeDoc | undefined) {
  const enabled = (store: CommerceStoreKey) => enabledInternalIds(doc, store);
  const links: CollectionLinks = {
    // A button to the INK page of a collection of a store that does not sell in the region now (an old or a re-pointed ref): no link.
    inkSlug: (store, collectionId) => (regionOfDoc(doc) && storeForRegion(regionOfDoc(doc)!) !== store ? null : publicCollectionSlug(store, collectionId)),
    pageSlug: (store, collectionId) => collectionPageSlug(doc, store, collectionId),
  };
  return {
    categories: categoryLookup(productsOf, enabled, undefined, arrangementIn(doc), regionOfDoc(doc)),
    collectionPage: collectionPageLookup(productsOf, enabled, undefined, arrangementIn(doc), regionOfDoc(doc)),
    links,
    umapenca: umaPencaLookup(doc?.scope ?? ""),
  };
}
