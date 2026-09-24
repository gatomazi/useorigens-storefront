import type { CommerceStoreKey } from "../geo/regions";

/**
 * INK collections ("categorias") per store, ISOLATED from the product catalog: their own file (`collections-snapshot.json`, see
 * collections-file.ts), so the catalog format, readers and sync are untouched. Identity is (store, collection id); ids are per store.
 *
 * Two independent facts about a collection (Round 5):
 *   - INK VISIBILITY (`isAvailable`): shown on the live INK store, or an internal/hidden segmentation. External, read-only. It says
 *     nothing about whether its PRODUCTS are for sale.
 *   - CMS ENABLEMENT: our own, explicit decision that an internal collection may feed editorial sections. Public collections are usable
 *     by default; internal ones start disabled and are enabled one by one (see `collectionState`). Enablement lives in the CMS document,
 *     never in INK.
 *
 * What is stored per collection is only the ASSOCIATION FILTERED to products of the same store's catalog snapshot: the total of matched
 * ids and the FIRST `MAX_STORED_MEMBERS` of them in INK's own order (a section shows at most 24). The raw `product_ids` (one Sul collection
 * has > 100k) are never persisted. Size measured in docs/admin/cms-v1-round5.md.
 */
export const MAX_STORED_MEMBERS = 48;
export const MIN_USABLE_PRODUCTS = 3;
export const COLLECTIONS_SNAPSHOT_VERSION = 2;

export type CollectionRecord = {
  id: number;
  name: string;
  slug: string;
  /** INK's own navbar position (ascending). */
  position: number;
  /** `false` = hidden on the live store (internal segmentation such as "SUL - RS"). Never implies the products are unavailable. */
  isAvailable: boolean;
  /** How many product ids the API reported. Informational only: it counts hidden and unpublished products too. */
  reportedProductCount: number;
  /** Reported ids that exist in THIS store's catalog snapshot (merch + city designs), de-duplicated. The useful count. */
  matchedCount: number;
  merchCount: number;
  cityDesignCount: number;
  /** The first matched ids, in the order INK returned them (at most MAX_STORED_MEMBERS). Not "best sellers", not "newest". */
  memberIds: string[];
  /** Set on records migrated from the v1 file, which dropped the members of hidden collections and all city designs: needs a resync. */
  needsResync?: true;
};

export type StoreCollections = {
  commerceStoreKey: CommerceStoreKey;
  syncedAt: string;
  /** `syncedAt` of the catalog index the ids were matched against: a collection is only meaningful with that catalog. */
  catalogSyncedAt: string;
  /** `total_count` reported by INK; the sync refuses to promote a result that did not fetch all of them. */
  totalCount: number;
  collections: CollectionRecord[];
};

export type CollectionsSnapshot = { version: 2; stores: Partial<Record<CommerceStoreKey, StoreCollections>> };

export const EMPTY_COLLECTIONS: CollectionsSnapshot = { version: 2, stores: {} };

const STORE_KEYS: readonly string[] = ["use-sul", "use-norte", "use-centro", "use-origens"];
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Which of a collection's ids exist in the store's catalog, and the first ones in INK's order. Injected so parsing never needs the catalog. */
export type IdMatcher = (ids: readonly string[]) => { members: string[]; matched: number; merch: number; cityDesigns: number };

/**
 * Validates ONE page of `GET /v1/stores/collections` and reduces every collection immediately (the raw `product_ids` array is dropped as
 * soon as it has been matched, so a 100k-id collection never stays in memory). Anything off in the shape is an error for the whole page:
 * a half-understood response must not become a snapshot.
 */
export function parseCollectionsPage(raw: unknown, match: IdMatcher): Parsed<{ collections: CollectionRecord[]; page: number; totalPages: number; totalCount: number }> {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "response is not an object" };
  const body = raw as Record<string, unknown>;
  const { page, total_pages: totalPages, total_count: totalCount } = body;
  if (!Array.isArray(body.collections)) return { ok: false, error: "missing collections array" };
  for (const [k, v] of Object.entries({ page, total_pages: totalPages, total_count: totalCount })) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return { ok: false, error: `bad pagination field ${k}` };
  }
  const out: CollectionRecord[] = [];
  for (const [i, item] of body.collections.entries()) {
    if (typeof item !== "object" || item === null) return { ok: false, error: `collections[${i}] is not an object` };
    const c = item as Record<string, unknown>;
    if (typeof c.id !== "number" || !Number.isInteger(c.id) || c.id <= 0) return { ok: false, error: `collections[${i}].id` };
    if (typeof c.name !== "string" || c.name.length === 0 || c.name.length > 200) return { ok: false, error: `collections[${i}].name` };
    if (typeof c.slug !== "string" || !SLUG.test(c.slug)) return { ok: false, error: `collections[${i}].slug` };
    if (typeof c.position !== "number" || !Number.isInteger(c.position)) return { ok: false, error: `collections[${i}].position` };
    if (c.is_available !== null && typeof c.is_available !== "boolean") return { ok: false, error: `collections[${i}].is_available` };
    if (!Array.isArray(c.product_ids) || c.product_ids.some((p) => typeof p !== "number")) return { ok: false, error: `collections[${i}].product_ids` };
    const ids = (c.product_ids as number[]).map(String);
    const matched = match(ids);
    out.push({
      id: c.id,
      name: c.name,
      slug: c.slug,
      position: c.position,
      isAvailable: c.is_available === true, // null/false = not shown on the store
      reportedProductCount: ids.length,
      matchedCount: matched.matched,
      merchCount: matched.merch,
      cityDesignCount: matched.cityDesigns,
      memberIds: matched.members,
    });
  }
  return { ok: true, value: { collections: out, page: page as number, totalPages: totalPages as number, totalCount: totalCount as number } };
}

/** Builds the matcher for one store from its catalog index: only that store's own products can ever match. */
export function matcherForStore(index: { bindings: readonly { inkProductId: string }[]; merch: readonly { inkProductId: string }[] }): IdMatcher {
  const cityDesigns = new Set(index.bindings.map((b) => b.inkProductId));
  const merch = new Set(index.merch.map((m) => m.inkProductId));
  return (ids) => {
    const members: string[] = [];
    let merchCount = 0;
    let cityCount = 0;
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue; // a repeated id is one product
      seen.add(id);
      if (merch.has(id)) merchCount++;
      else if (cityDesigns.has(id)) cityCount++;
      else continue;
      if (members.length < MAX_STORED_MEMBERS) members.push(id);
    }
    return { members, matched: merchCount + cityCount, merch: merchCount, cityDesigns: cityCount };
  };
}

/** Deterministic order (INK navbar position, then id) so the same INK state always produces the same file. */
export function sortCollections(list: readonly CollectionRecord[]): CollectionRecord[] {
  return [...list].sort((a, b) => a.position - b.position || a.id - b.id);
}

/** Content equality ignoring timestamps: a sync that changed nothing must not rewrite the file (idempotent, no cache churn). */
export function sameCollections(a: StoreCollections | undefined, b: StoreCollections): boolean {
  if (!a) return false;
  return a.catalogSyncedAt === b.catalogSyncedAt && a.totalCount === b.totalCount && JSON.stringify(a.collections) === JSON.stringify(b.collections);
}

const REGRESSION_THRESHOLD = 0.5;
const REGRESSION_FLOOR = 5;

/** Same spirit as `shouldPromoteStore` for products: never replace a good store entry with a partial or blank one. */
export function shouldPromoteCollections(previous: StoreCollections | undefined, next: StoreCollections): { promote: true } | { promote: false; reason: string } {
  if (next.collections.length !== next.totalCount) {
    return { promote: false, reason: `fetched ${next.collections.length} collections but INK reports ${next.totalCount} — partial result, refusing to promote` };
  }
  const before = previous?.collections.length ?? 0;
  if (next.collections.length === 0 && before > 0) return { promote: false, reason: `fetched 0 collections but the previous snapshot had ${before} — refusing to blank the store` };
  if (before > REGRESSION_FLOOR && next.collections.length < before * REGRESSION_THRESHOLD) {
    return { promote: false, reason: `fetched ${next.collections.length} collections, down from ${before} — looks partial, refusing to promote` };
  }
  return { promote: true };
}

// ── Reading (v2 and the older v1 file) ────────────────────────────────────────────────────────────────────────

type LegacyRecord = { id: number; name: string; slug: string; position: number; isAvailable: boolean; reportedProductCount: number; merchProductIds: string[]; bindingProductCount: number };

function migrateLegacy(r: LegacyRecord): CollectionRecord {
  return {
    id: r.id, name: r.name, slug: r.slug, position: r.position, isAvailable: r.isAvailable, reportedProductCount: r.reportedProductCount,
    matchedCount: r.merchProductIds.length + r.bindingProductCount, merchCount: r.merchProductIds.length, cityDesignCount: r.bindingProductCount,
    memberIds: r.merchProductIds.slice(0, MAX_STORED_MEMBERS),
    needsResync: true, // the v1 sync kept no members for hidden collections and none for city designs
  };
}

/**
 * Accepts the current (v2) file and the previous (v1) one. A v1 record is never presented as complete: it is flagged `needsResync`, and
 * `collectionState` only lets it feed a section under the OLD rule (a public collection with ≥ 3 merch members).
 * Anything else (unknown version, wrong shape) returns null → the caller treats it as "no collections".
 */
export function normalizeCollectionsSnapshot(value: unknown): CollectionsSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { version?: unknown; stores?: unknown };
  if ((v.version !== 1 && v.version !== 2) || typeof v.stores !== "object" || v.stores === null) return null;
  const stores: CollectionsSnapshot["stores"] = {};
  for (const [key, raw] of Object.entries(v.stores as Record<string, unknown>)) {
    if (!STORE_KEYS.includes(key) || typeof raw !== "object" || raw === null || !Array.isArray((raw as StoreCollections).collections)) return null;
    const s = raw as StoreCollections;
    stores[key as CommerceStoreKey] = v.version === 1 ? { ...s, collections: (s.collections as unknown as LegacyRecord[]).map(migrateLegacy) } : s;
  }
  return { version: 2, stores };
}

// ── Editorial state ────────────────────────────────────────────────────────────────────────────────────────────

export type CollectionReason = "needs-resync" | "too-few-products" | "not-enabled";

export type CollectionState = {
  visibility: "public" | "internal";
  /** May feed a section: public (by default) or explicitly enabled in the CMS. */
  enabled: boolean;
  /** Has enough real products to be a carousel (≥ 3 in this store's catalog, members present). */
  eligible: boolean;
  /** Enabled AND eligible: selectable in the editor. */
  selectable: boolean;
  /** Why it is not selectable (first blocking reason), or null. */
  reason: CollectionReason | null;
};

/** The single rule for "can this collection feed a section right now?". Pure. `enabledInternal` = the CMS's explicit enablements for this store. */
export function collectionState(record: CollectionRecord, enabledInternal: ReadonlySet<number>): CollectionState {
  const visibility = record.isAvailable ? "public" : "internal";
  const enabled = record.isAvailable || enabledInternal.has(record.id);
  let eligible = record.matchedCount >= MIN_USABLE_PRODUCTS && record.memberIds.length >= MIN_USABLE_PRODUCTS;
  let reason: CollectionReason | null = null;
  if (record.needsResync) {
    // Legacy records only keep the old behaviour: a public collection whose merch members are all there.
    eligible = record.isAvailable && record.merchCount >= MIN_USABLE_PRODUCTS && record.memberIds.length >= MIN_USABLE_PRODUCTS && record.cityDesignCount === 0;
    if (!eligible) reason = "needs-resync";
  }
  if (!reason && !eligible) reason = "too-few-products";
  if (!reason && !enabled) reason = "not-enabled";
  return { visibility, enabled, eligible, selectable: enabled && eligible, reason };
}

export function isCollectionsSnapshotShape(value: unknown): boolean {
  return normalizeCollectionsSnapshot(value) !== null;
}
