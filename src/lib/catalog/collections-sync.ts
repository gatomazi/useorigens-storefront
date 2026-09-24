import "server-only";
import { INK_STORES } from "../ink/config";
import { fetchStoreCollections, type CollectionsFetchDeps } from "../ink/collections-client";
import type { CommerceStoreKey } from "../geo/regions";
import { matcherForStore, sameCollections, shouldPromoteCollections, type CollectionsSnapshot, type StoreCollections } from "./collections";
import { readCollectionsFile, writeCollectionsFile } from "./collections-file";
import { readSnapshot } from "./snapshot-file";

export type CollectionsOutcome =
  | { storeKey: CommerceStoreKey; ok: true; changed: boolean; collections: number; available: number; requests: number }
  | { storeKey: CommerceStoreKey; ok: false; error: string };

/**
 * Manual, read-only sync of INK collections (GET only). Deliberately NOT part of the catalog sync and NOT reachable from a page
 * or route: the catalog sync (~4 min, paced against INK's rate limit) is untouched, and this adds about 4 requests in total.
 *
 * Preconditions and guarantees:
 *  - It matches against the CURRENT catalog snapshot of the same store; a store with no catalog index is skipped (nothing to match).
 *  - Last-known-good per store: a failed or suspicious fetch keeps what the file already had (`shouldPromoteCollections`).
 *  - Idempotent: identical content (ignoring timestamps) does not rewrite the file.
 *  - Never fabricates products: ids that are not in the store's snapshot are dropped, never created.
 */
export async function syncCollections(opts: { storeKeys?: CommerceStoreKey[]; deps?: CollectionsFetchDeps; filePath?: string; now?: () => Date } = {}): Promise<CollectionsOutcome[]> {
  const catalog = await readSnapshot();
  const current = readCollectionsFile(opts.filePath).snapshot;
  const next: CollectionsSnapshot = { version: 2, stores: { ...current.stores } };
  const keys = opts.storeKeys ?? (Object.keys(INK_STORES) as CommerceStoreKey[]);
  const outcomes: CollectionsOutcome[] = [];
  let dirty = false;

  for (const storeKey of keys) {
    const index = catalog.stores[storeKey];
    if (!index) {
      outcomes.push({ storeKey, ok: false, error: "no catalog index for this store yet — sync the catalog first" });
      continue;
    }
    try {
      const fetched = await fetchStoreCollections(storeKey, matcherForStore(index), opts.deps);
      const candidate: StoreCollections = {
        commerceStoreKey: storeKey,
        syncedAt: (opts.now?.() ?? new Date()).toISOString(),
        catalogSyncedAt: index.syncedAt,
        totalCount: fetched.totalCount,
        collections: fetched.collections,
      };
      const verdict = shouldPromoteCollections(current.stores[storeKey], candidate);
      if (!verdict.promote) {
        outcomes.push({ storeKey, ok: false, error: verdict.reason });
        continue;
      }
      const changed = !sameCollections(current.stores[storeKey], candidate);
      if (changed) {
        next.stores[storeKey] = candidate;
        dirty = true;
      }
      outcomes.push({ storeKey, ok: true, changed, collections: candidate.collections.length, available: candidate.collections.filter((c) => c.isAvailable).length, requests: fetched.requests });
    } catch (err) {
      outcomes.push({ storeKey, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (dirty) await writeCollectionsFile(next, opts.filePath);
  return outcomes;
}
