import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { syncCollections } from "./collections-sync";
import { finishSyncJobFailure, finishSyncJobSuccess, type CollectionsStep, type SyncJobState } from "./sync-job";
import { syncCatalog, type SyncResult } from "./sync-service";

/**
 * The body of a real (INK, read-only) catalog sync job, shared by the authenticated route and the admin button. The caller has already taken
 * the job lock (`beginSyncJob`) and runs this inside `after()`, so the request that started it has been answered. `onPromoted` runs after the
 * catalog was promoted (cache invalidation); when `withCollections` is set, the collections are then refreshed against the NEW catalog and a
 * failure there is reported in the job without touching the catalog result. Never throws: the outcome is written to the job state.
 */
export async function runCatalogSyncJob(
  running: Extract<SyncJobState, { status: "running" }>,
  opts: { storeKeys: CommerceStoreKey[]; withCollections: boolean; onPromoted: () => void },
): Promise<void> {
  try {
    const result: SyncResult = await syncCatalog(opts.storeKeys);
    opts.onPromoted();
    let collections: CollectionsStep | undefined;
    if (opts.withCollections) {
      try {
        collections = { outcomes: await syncCollections({ storeKeys: opts.storeKeys.length > 0 ? opts.storeKeys : undefined }) };
        opts.onPromoted();
      } catch (err) {
        collections = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    finishSyncJobSuccess(running.startedAt, result, collections);
  } catch (err) {
    finishSyncJobFailure(running.startedAt, err);
  }
}
