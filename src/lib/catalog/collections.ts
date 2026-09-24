import type { CommerceStoreKey } from "../geo/regions";

/**
 * INK collections ("categorias") per store — a representation ISOLATED from the product catalog: it lives in its own file
 * (`collections-snapshot.json`, see collections-file.ts), never inside `catalog-snapshot.json`, so the catalog format, its
 * readers and its sync are untouched (no schema migration). Deleting the file returns the site to exactly today's behaviour.
 *
 * Identity is (store, collection id): ids are per store and are never comparable across stores.
 *
 * Size (measured on 2026-09-23 against the live stores, docs/admin/ink-collections-inventory.md): the API reports up to ~100k
 * product ids for a single collection, but only ids that exist in the store's catalog snapshot are kept, and only their MERCH
 * subset (a few hundred at most). Expected file size: tens of KB for the three stores together.
 */
export type CollectionRecord = {
  id: number;
  name: string;
  slug: string;
  /** INK's own navbar position (ascending). */
  position: number;
  /** `false` = hidden on the live store (internal segmentation such as "SUL - RS"). Never offered to the CMS. */
  isAvailable: boolean;
  /** How many product ids the API reported. Informational only: it counts hidden/unpublished products too. */
  reportedProductCount: number;
  /** Ids that ALSO exist as merch products in this store's catalog snapshot, in the order INK returned them. Empty unless available. */
  merchProductIds: string[];
  /** How many reported ids are city-design bindings of this store (not stored one by one: "Seu Lugar" alone has ~9.5k). */
  bindingProductCount: number;
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

export type CollectionsSnapshot = { version: 1; stores: Partial<Record<CommerceStoreKey, StoreCollections>> };

export const EMPTY_COLLECTIONS: CollectionsSnapshot = { version: 1, stores: {} };

const STORE_KEYS: readonly string[] = ["use-sul", "use-norte", "use-centro", "use-origens"];
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Which of a collection's ids exist in the store's catalog. Injected so parsing never needs the catalog itself. */
export type IdMatcher = (ids: readonly string[]) => { merchIds: string[]; bindingCount: number };

/**
 * Validates ONE page of `GET /v1/stores/collections` and reduces every collection immediately (the raw `product_ids` array is
 * dropped as soon as it has been matched, so a 100k-id collection never stays in memory). Anything off in the shape is an error
 * for the whole page: a half-understood response must not become a snapshot.
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
    const isAvailable = c.is_available === true; // null/false = not shown on the store
    const matched = match(ids);
    out.push({
      id: c.id,
      name: c.name,
      slug: c.slug,
      position: c.position,
      isAvailable,
      reportedProductCount: ids.length,
      merchProductIds: isAvailable ? matched.merchIds : [],
      bindingProductCount: matched.bindingCount,
    });
  }
  return { ok: true, value: { collections: out, page: page as number, totalPages: totalPages as number, totalCount: totalCount as number } };
}

/** Builds the matcher for one store from its catalog index: only that store's own products can ever match. */
export function matcherForStore(index: { bindings: readonly { inkProductId: string }[]; merch: readonly { inkProductId: string }[] }): IdMatcher {
  const bindings = new Set(index.bindings.map((b) => b.inkProductId));
  const merch = new Set(index.merch.map((m) => m.inkProductId));
  return (ids) => {
    const merchIds: string[] = [];
    let bindingCount = 0;
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue; // a repeated id is one product
      seen.add(id);
      if (merch.has(id)) merchIds.push(id);
      else if (bindings.has(id)) bindingCount++;
    }
    return { merchIds, bindingCount };
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

export function isCollectionsSnapshot(value: unknown): value is CollectionsSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as CollectionsSnapshot;
  if (v.version !== 1 || typeof v.stores !== "object" || v.stores === null) return false;
  return Object.entries(v.stores).every(([k, s]) => STORE_KEYS.includes(k) && typeof s === "object" && s !== null && Array.isArray((s as StoreCollections).collections));
}
