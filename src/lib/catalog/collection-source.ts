import "server-only";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import { arrangementOf, enabledInternalIds } from "../site-config/collections-enabled";
import { effectiveMenu } from "../site-config/collection-menu";
import { PAGE_SLUG, RESERVED_SLUGS, type CollectionRef, type ScopeDoc, type StateSubcategories } from "../site-config/schema";
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
import { stateHierarchyRows, type StateHierarchyRow } from "./state-hierarchy";
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
  const state = merchStates(product.commerceStoreKey).get(product.inkProductId);
  return {
    id: product.inkProductId, name: product.name.replace(/\s+/g, " ").trim(), price: formatPrice(product.price), listPrice: formatListPrice(product), discount: discountPercent(product), rawPrice: product.price, imageUrl: product.imageUrl, href,
    ...(product.garmentTypeId !== undefined ? { garmentTypeId: product.garmentTypeId } : {}),
    ...(state ? { state } : {}),
  };
}

const merchStateMaps = new WeakMap<readonly CollectionRecord[], Map<string, string>>();
/**
 * The UF of the store's merch products that are in exactly ONE collection named after a state ("Santa Catarina" > "SC"): the owner's own word that
 * the product is that state's (a merch product has no city to say it). One in two states' collections gets none, never a guess. Cached per synced file.
 */
function merchStates(store: CommerceStoreKey): Map<string, string> {
  const records = getStoreCollections(store)?.collections;
  if (!records) return new Map();
  const cached = merchStateMaps.get(records);
  if (cached) return cached;
  const map = new Map<string, string>();
  const twice = new Set<string>();
  for (const uf of Object.keys(STATE_NAMES)) {
    const parent = stateCollectionIn(records, uf);
    for (const id of parent ? (completeMembers(parent) ?? parent.memberIds) : []) {
      if (map.has(id) && map.get(id) !== uf) twice.add(id);
      map.set(id, uf);
    }
  }
  for (const id of twice) map.delete(id);
  merchStateMaps.set(records, map);
  return map;
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

/**
 * One row of a state page (state-hierarchy.ts): a category ("Fala Daqui"), a subcategory ("Fala de Onde") or the state's own collection ("Pará"), cut
 * down to the state's products that no deeper row took.
 */
export type StateCollectionRow = StateHierarchyRow<CollectionRecord, CarouselItem> & { display: StateRowDisplay };
export type StateRowDisplay = "carousel" | "grid";

/** A carousel row with fewer products than this is not shown (a carousel of one or two cards looks broken); its products go up one level. */
export const STATE_ROW_MIN_ITEMS = 3;
/** A GRID row (`collections.stateGrids`) shows from this many: the owner chose to show it, and a grid of one or two cards still reads as a list. */
export const STATE_GRID_MIN_ITEMS = 1;

/** How the region's state pages show this collection's row: a grid when it is in `collections.stateGrids`, otherwise a carousel. */
export function stateRowDisplay(region: RegionSlug, doc: ScopeDoc | undefined, collectionId: number): StateRowDisplay {
  const store = storeForRegion(region);
  return (doc?.collections?.stateGrids ?? []).some((r) => r.store === store && r.collectionId === collectionId) ? "grid" : "carousel";
}

const stateNameKeys = new Set(Object.values(STATE_NAMES).map(normalizeText));
const byMenuOrder = (a: CollectionRecord, b: CollectionRecord) => a.position - b.position || a.id - b.id;
/** A collection that may be a level of the hierarchy: synced as it is now, and never one named after a state (those are the parents). */
const usableLevel = (c: CollectionRecord) => !c.needsResync && !stateNameKeys.has(normalizeText(c.name));

/** The records of a list of refs of `store`, in the list's order (a ref no longer synced, or not usable as a level, is skipped). */
function recordsOf(store: CommerceStoreKey, records: readonly CollectionRecord[], refs: readonly CollectionRef[]): CollectionRecord[] {
  const byId = new Map(records.map((c) => [c.id, c]));
  return refs.filter((r) => r.store === store).map((r) => byId.get(r.collectionId)).filter((c): c is CollectionRecord => c !== undefined && usableLevel(c));
}

/**
 * The CATEGORIES of the region's state pages, in the order they show: the region's own list (`collections.stateCategories`) when it made one; otherwise
 * automatic, the collections on its menu bar (`menu.top`), in that order.
 */
export function stateCategoryCollections(region: RegionSlug, doc: ScopeDoc | undefined, filePath?: string): { own: boolean; records: CollectionRecord[] } {
  const store = storeForRegion(region);
  const records = getStoreCollections(store, filePath)?.collections ?? [];
  const chosen = doc?.collections?.stateCategories;
  return { own: chosen !== undefined, records: recordsOf(store, records, chosen ?? effectiveMenu(doc).menu.top) };
}

/**
 * The SUBCATEGORIES of the region's state pages. `manual` = the region chose them by hand (`collections.stateSubcategoryList`): exactly those, in that
 * order, public or internal, and nothing enters on its own. Otherwise AUTOMATIC, in INK's menu order: every PUBLIC collection of the store that is
 * neither a state's nor a category, minus the ones the region took out (`hidden`, returned apart for the panel), plus the internal ones it brought in
 * (`collections.stateSubcategories`). `legacy` = a document still carries the exact list of the first state page (`collections.stateRows`): then that
 * list, in its order, is the subcategories (its categories count as categories).
 */
export function stateSubcategoryCollections(region: RegionSlug, doc: ScopeDoc | undefined, filePath?: string): { manual: boolean; legacy: boolean; records: CollectionRecord[]; hidden: CollectionRecord[] } {
  const store = storeForRegion(region);
  const records = getStoreCollections(store, filePath)?.collections ?? [];
  const categories = new Set(stateCategoryCollections(region, doc, filePath).records.map((c) => c.id));
  const notCategory = (c: CollectionRecord) => !categories.has(c.id);
  const manual = doc?.collections?.stateSubcategoryList;
  if (manual) return { manual: true, legacy: false, records: recordsOf(store, records, manual).filter(notCategory), hidden: [] };
  const legacy = doc?.collections?.stateRows;
  if (legacy) return { manual: false, legacy: true, records: recordsOf(store, records, legacy).filter(notCategory), hidden: [] };
  const ids = (refs: readonly CollectionRef[] | undefined) => new Set((refs ?? []).filter((r) => r.store === store).map((r) => r.collectionId));
  const hidden = ids(doc?.collections?.stateSubcategories?.hidden);
  const added = ids(doc?.collections?.stateSubcategories?.added);
  const all = records.filter((c) => usableLevel(c) && notCategory(c) && (c.isAvailable || added.has(c.id))).sort(byMenuOrder);
  return { manual: false, legacy: false, records: all.filter((c) => !(c.isAvailable && hidden.has(c.id))), hidden: all.filter((c) => c.isAvailable && hidden.has(c.id)) };
}

/**
 * The region's subcategory choice in the shape it is stored (`stateSubcategories`): the stored one, or, for a document that still has the legacy exact
 * list (`stateRows`), the same choice re-expressed: every automatic collection left out of it is `hidden`, every internal one in it is `added`.
 */
export function stateSubcategoryChoice(region: RegionSlug, doc: ScopeDoc | undefined, filePath?: string): StateSubcategories {
  const legacy = doc?.collections?.stateRows;
  const stored = doc?.collections?.stateSubcategories;
  if (!legacy) return { hidden: [...(stored?.hidden ?? [])], added: [...(stored?.added ?? [])] };
  const store = storeForRegion(region);
  const categories = new Set(stateCategoryCollections(region, doc, filePath).records.map((c) => c.id));
  const kept = new Set(legacy.filter((r) => r.store === store).map((r) => r.collectionId));
  const records = (getStoreCollections(store, filePath)?.collections ?? []).filter((c) => usableLevel(c) && !categories.has(c.id)).sort(byMenuOrder);
  const ref = (c: CollectionRecord): CollectionRef => ({ store, collectionId: c.id });
  return { hidden: records.filter((c) => c.isAvailable && !kept.has(c.id)).map(ref), added: records.filter((c) => !c.isAvailable && kept.has(c.id)).map(ref) };
}

const statelessMerch = new WeakMap<readonly CollectionRecord[], WeakMap<StoreProducts, Set<string>>>();
/**
 * The store's merch products that are in NO collection named after a state ("Bah | Dizeres", "Made In Sul"): of no state in particular, so every
 * state page of their region shows them in its categories and subcategories (state-hierarchy.ts `everyState`; `regionItem` keeps them to their
 * region). City designs are never in it: their city says their state. Cached per synced file and catalog.
 */
function merchOfNoState(records: readonly CollectionRecord[], products: StoreProducts): Set<string> {
  let byCatalog = statelessMerch.get(records);
  if (!byCatalog) statelessMerch.set(records, (byCatalog = new WeakMap()));
  const cached = byCatalog.get(products);
  if (cached) return cached;
  const inSomeState = new Set<string>();
  for (const uf of Object.keys(STATE_NAMES)) {
    const parent = stateCollectionIn(records, uf);
    for (const id of parent ? (completeMembers(parent) ?? parent.memberIds) : []) inSomeState.add(id);
  }
  const out = new Set([...products.merch.keys()].filter((id) => !inSomeState.has(id)));
  byCatalog.set(products, out);
  return out;
}

/** The collection named after a state ("Paraná") among a store's collections, or null. */
function stateCollectionIn(records: readonly CollectionRecord[], uf: string): CollectionRecord | null {
  const wanted = normalizeText(STATE_NAMES[uf] ?? "");
  if (!wanted) return null;
  return records.filter((c) => normalizeText(c.name) === wanted && !c.needsResync).sort(byMenuOrder)[0] ?? null;
}

/** The collection named after the state ("Paraná"), the parent of that state's rows; null when the region's store has none. */
export function stateParentCollection(region: RegionSlug, uf: string, filePath?: string): CollectionRecord | null {
  return stateCollectionIn(getStoreCollections(storeForRegion(region), filePath)?.collections ?? [], uf);
}

/** The cards of `ids` as collection `c` shows them in the region: in its arrangement (hidden ones out), only products of the catalog and of this region. */
function stateRowItems(region: RegionSlug, c: CollectionRecord, ids: readonly string[], doc: ScopeDoc | undefined, products: StoreProducts): CarouselItem[] {
  return arrangeMembers(ids, arrangementOf(doc, storeForRegion(region), c.id))
    .map((id) => regionItem(products, id, region))
    .filter((item): item is CarouselItem => item !== null);
}

/**
 * The state page's rows. INK has no parent/child between collections, so the hierarchy is ours (state-hierarchy.ts): the state's own collection ("Pará",
 * usually internal) > the region's categories > its subcategories, each product in the deepest row that shows it, and a last row with what is left of
 * the state; merch of no state counts as every state's (`merchOfNoState`). Each row in its collection's arrangement for the region, only products of the catalog and of this region, at least `STATE_ROW_MIN_ITEMS`
 * (`STATE_GRID_MIN_ITEMS` for a row the region shows as a grid).
 * No parent, no rows.
 */
export function stateCollectionRows(region: RegionSlug, uf: string, doc: ScopeDoc | undefined, productsOf: (store: CommerceStoreKey) => StoreProducts, filePath?: string): StateCollectionRow[] {
  const parent = stateParentCollection(region, uf, filePath);
  if (!parent) return [];
  const products = productsOf(storeForRegion(region));
  const display = (c: CollectionRecord) => stateRowDisplay(region, doc, c.id);
  return stateHierarchyRows({
    state: parent,
    everyState: merchOfNoState(getStoreCollections(storeForRegion(region), filePath)?.collections ?? [], products),
    categories: stateCategoryCollections(region, doc, filePath).records,
    subcategories: stateSubcategoryCollections(region, doc, filePath).records,
    members: (c) => completeMembers(c) ?? c.memberIds,
    items: (c, ids) => stateRowItems(region, c, ids, doc, products),
    min: (c) => (display(c) === "grid" ? STATE_GRID_MIN_ITEMS : STATE_ROW_MIN_ITEMS),
  }).map((row) => ({ ...row, display: display(row.collection) }));
}

/** One state of the region as the panel explains it: its own collection ("Paraná", with how many of its products the store can show) or none. */
export type StateParentView = { uf: string; name: string; parent: { id: number; name: string; products: number } | null };

/**
 * For the panel ("Páginas de estado"): every state's own collection and, for each category and subcategory, how many products its carousel shows on each
 * state page AFTER the hierarchy (0 = no row there: too few products of the state left for it, or no collection named after the state).
 */
export function stateRowMatrix(region: RegionSlug, doc: ScopeDoc | undefined, productsOf: (store: CommerceStoreKey) => StoreProducts, filePath?: string): { states: StateParentView[]; counts: Map<number, Record<string, number>> } {
  const products = productsOf(storeForRegion(region));
  const candidates = [...stateCategoryCollections(region, doc, filePath).records, ...stateSubcategoryCollections(region, doc, filePath).records];
  const counts = new Map<number, Record<string, number>>(candidates.map((c) => [c.id, {}]));
  const states: StateParentView[] = REGIONS[region].ufs.map((uf) => {
    const parent = stateParentCollection(region, uf, filePath);
    const rows = parent ? stateCollectionRows(region, uf, doc, productsOf, filePath) : [];
    for (const c of candidates) counts.get(c.id)![uf] = rows.find((r) => r.level !== "state" && r.collection.id === c.id)?.items.length ?? 0;
    const members = parent ? (completeMembers(parent) ?? parent.memberIds) : [];
    return { uf, name: STATE_NAMES[uf] ?? uf, parent: parent ? { id: parent.id, name: parent.name, products: members.filter((id) => regionItem(products, id, region) !== null).length } : null };
  });
  return { states, counts };
}

/** For the panel: in how many of the region's states each category or subcategory shows as a row (0 = it shows nowhere), by collection id. */
export function stateRowsReach(region: RegionSlug, doc: ScopeDoc | undefined, productsOf: (store: CommerceStoreKey) => StoreProducts, filePath?: string): Map<number, number> {
  const reach = new Map<number, number>();
  for (const uf of REGIONS[region].ufs) {
    for (const row of stateCollectionRows(region, uf, doc, productsOf, filePath)) if (row.level !== "state") reach.set(row.collection.id, (reach.get(row.collection.id) ?? 0) + 1);
  }
  return reach;
}

/**
 * The subcategories as a hand-picked list would start (`start-manual-subcategories`) and as the panel lists them: the region's own list when it has
 * one; otherwise those that show in at least one state today, plus the ones brought in by hand (a choice that stopped showing stays visible), or all
 * of a legacy list. So switching to manual keeps exactly what the site shows.
 */
export function stateSubcategoriesInUse(region: RegionSlug, doc: ScopeDoc | undefined, productsOf: (store: CommerceStoreKey) => StoreProducts, filePath?: string): CollectionRecord[] {
  const subs = stateSubcategoryCollections(region, doc, filePath);
  if (subs.manual || subs.legacy) return subs.records;
  const store = storeForRegion(region);
  const byHand = new Set((doc?.collections?.stateSubcategories?.added ?? []).filter((r) => r.store === store).map((r) => r.collectionId));
  const reach = stateRowsReach(region, doc, productsOf, filePath);
  return subs.records.filter((c) => byHand.has(c.id) || (reach.get(c.id) ?? 0) > 0);
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
    customizerSlug: (customizerId) => {
      const model = doc?.customizers?.find((m) => m.id === customizerId);
      return model?.active ? model.slug : null;
    },
  };
  return {
    categories: categoryLookup(productsOf, enabled, undefined, arrangementIn(doc), regionOfDoc(doc)),
    collectionPage: collectionPageLookup(productsOf, enabled, undefined, arrangementIn(doc), regionOfDoc(doc)),
    links,
    umapenca: umaPencaLookup(doc?.scope ?? ""),
  };
}
