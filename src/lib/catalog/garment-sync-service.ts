import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { fetchGarmentSourceProducts, type GarmentFetchDeps, type GarmentPageProgress } from "../ink/garment-client";
import { requireAtLeastOneInkToken } from "../config/env";
import { INK_STORES, tokenFor } from "../ink/config";
import { linkGarmentBindings, type GarmentLinkStats } from "./garments-link";
import { garmentCheckpointPath, readGarmentCheckpoint, writeGarmentCheckpoint, type GarmentExclusionTotals, type GarmentSyncStoreCheckpoint } from "./garment-checkpoint";
import { countPieces, garmentIndexPath, readGarmentIndex, upsertPieces, writeGarmentIndex, type GarmentTuple } from "./garment-index-file";
import { readSnapshot, snapshotPath } from "./snapshot-file";

export type GarmentSyncOutcome =
  | {
      storeKey: CommerceStoreKey;
      ok: true;
      mode: "full" | "incremental";
      requestsUsedThisRun: number;
      pagesThisRun: number;
      totalPages: number;
      truncated: boolean;
      /** Set when a transient failure cut the run short after some pages were already saved. */
      interruptedBy?: string;
      /** True only when this run reached the store's own last page without being capped — the one condition
       * that allows `status: "complete"` in the checkpoint (MD §6/§8: never claim full coverage otherwise). */
      completedFullPass: boolean;
      newGarmentBindings: number;
      totalGarmentBindingsForStore: number;
    }
  | { storeKey: CommerceStoreKey; ok: false; error: string };

export type GarmentSyncRunOptions = {
  storeKeys?: readonly CommerceStoreKey[];
  /** Hard cap on HTTP requests to INK, per store, for this invocation. Required by design — there is no
   * "just run it all" default; the caller (CLI) must pass a number, matching the MD's explicit budget gate. */
  maxRequestsPerStore: number;
  /** Force a brand-new full crawl even if the checkpoint says a previous full pass completed (re-discovers
   * everything from page 1, ignoring any `sinceCreatedAt` watermark). Off by default. */
  forceFull?: boolean;
  onProgress?: GarmentPageProgress;
  deps?: GarmentFetchDeps;
  /**
   * Data set to read the canonical catalog from and write the piece index + checkpoint to. Default: the snapshot directory (regional
   * mode). The single store passes its own directory (commerce-mode.ts `singleStoreDataDir()`): same crawl, same linker, linked against
   * the single-store catalog — the regional files are never touched.
   */
  dataDir?: string;
};

export type GarmentSyncRunResult = { startedAt: string; finishedAt: string; outcomes: GarmentSyncOutcome[] };

/** Below this many canonical bindings a store is too small for the coverage guard to mean anything. */
const CLUSTER_GUARD_MIN_BINDINGS = 50;
const CLUSTER_GUARD_MIN_RATIO = 0.5;

/**
 * `buildGarmentBindings` can only link a piece to a canonical binding that already carries its
 * `productClusterId`, and only the routine catalog sync (`indexer.ts`) writes that field. Crawling ~1,000 pages
 * against a snapshot that lacks it would spend the whole budget and link almost nothing, so refuse up front,
 * before a single request is made.
 */
export function assertCanonicalClusterCoverage(storeKey: CommerceStoreKey, bindings: readonly { productClusterId?: string }[]): void {
  if (bindings.length < CLUSTER_GUARD_MIN_BINDINGS) return;
  const withCluster = bindings.filter((b) => b.productClusterId).length;
  if (withCluster / bindings.length >= CLUSTER_GUARD_MIN_RATIO) return;
  throw new Error(
    `only ${withCluster} of ${bindings.length} canonical bindings in ${storeKey} carry a product_cluster_id — ` +
      `run the routine catalog sync first (npm run catalog:sync ${storeKey}) so pieces can be linked; no INK request was made`,
  );
}

function nextRunParams(checkpoint: GarmentSyncStoreCheckpoint | undefined, forceFull: boolean): { startPage: number; sinceCreatedAt: string | undefined; mode: "full" | "incremental" } {
  if (!checkpoint || forceFull) return { startPage: 1, sinceCreatedAt: undefined, mode: "full" };
  if (checkpoint.status === "in_progress") {
    // Resume exactly where the last run stopped, same filter — never restart a page already completed.
    return { startPage: checkpoint.lastPageCompleted + 1, sinceCreatedAt: checkpoint.sinceCreatedAt ?? undefined, mode: checkpoint.mode };
  }
  // Previous pass completed in full: the next one is incremental, watermarked at the newest `created_at` seen.
  if (checkpoint.maxCreatedAtSeen) {
    return { startPage: 1, sinceCreatedAt: dayBefore(checkpoint.maxCreatedAtSeen), mode: "incremental" };
  }
  return { startPage: 1, sinceCreatedAt: undefined, mode: "full" };
}

/**
 * Runs one bounded, resumable garment-sync pass per requested store: fetches up to `maxRequestsPerStore`
 * pages (continuing from the checkpoint, if any), links results to the already-trusted canonical bindings
 * via `linkGarmentBindings` (by `product_cluster_id` only), and upserts them into the compact garment index
 * file (`garment-index-file.ts`) — the base snapshot is only READ (for the canonical bindings), never
 * rewritten. Never widens scope beyond what the caller authorized: `maxRequestsPerStore` is a hard ceiling,
 * not a target. Stores run in parallel with each other (never within one store), same as the main
 * `syncCatalog`. A store whose fetch throws is reported as a failure and leaves its index entry AND
 * checkpoint completely untouched — last-known-good, exactly like `shouldPromoteStore`.
 */
export async function runGarmentSync(options: GarmentSyncRunOptions): Promise<GarmentSyncRunResult> {
  requireAtLeastOneInkToken();
  const startedAt = new Date().toISOString();
  const keys = (Object.keys(INK_STORES) as CommerceStoreKey[]).filter(
    (key) => (!options.storeKeys || options.storeKeys.length === 0 || options.storeKeys.includes(key)) && tokenFor(key),
  );

  const files = options.dataDir
    ? { snapshot: snapshotPath(options.dataDir), checkpoint: garmentCheckpointPath(options.dataDir), index: garmentIndexPath(options.dataDir) }
    : { snapshot: undefined, checkpoint: undefined, index: undefined };
  const snapshot = await readSnapshot(files.snapshot);
  const checkpointDoc = await readGarmentCheckpoint(files.checkpoint);
  const garmentIndex = await readGarmentIndex(files.index);

  const settled = await Promise.allSettled(
    keys.map(async (storeKey) => {
      const storeIndex = snapshot.stores[storeKey];
      if (!storeIndex) throw new Error(`no base catalog synced yet for ${storeKey} — run the main catalog sync first`);
      assertCanonicalClusterCoverage(storeKey, storeIndex.bindings);

      const previousCheckpoint = checkpointDoc.stores[storeKey];
      const { startPage, sinceCreatedAt, mode } = nextRunParams(previousCheckpoint, options.forceFull ?? false);

      const result = await fetchGarmentSourceProducts(storeKey, {
        sinceCreatedAt,
        startPage,
        maxRequests: options.maxRequestsPerStore,
        onProgress: options.onProgress,
        deps: options.deps,
      });

      const { bindings: linked, stats } = linkGarmentBindings(result.products, storeIndex.bindings, new Date().toISOString());
      // Upsert by INK product id inside the piece's cluster — NEVER wholesale-replace a cluster: a resumed
      // run only ever crawls a SUBSET of pages, so a cluster whose pieces are split across two separate calls
      // (page N this run, page N+1 next run) must accumulate, not have its first half discarded. A product
      // re-seen with fresher data overwrites only its own tuple. The store's clusters are copied shallowly
      // (arrays are copied on write) so a failed store never mutates what is written back for it.
      const clusters: Record<string, GarmentTuple[]> = { ...(garmentIndex.stores[storeKey]?.clusters ?? {}) };
      upsertPieces(clusters, linked);

      const completedFullPass = !result.truncated && result.lastPageCompleted >= result.totalPages;
      // A finished pass may drop clusters whose canonical product is gone (the base catalog rotated them);
      // a partial pass never deletes anything.
      if (completedFullPass) {
        const live = new Set(storeIndex.bindings.flatMap((b) => (b.productClusterId ? [b.productClusterId] : [])));
        for (const clusterId of Object.keys(clusters)) if (!live.has(clusterId)) delete clusters[clusterId];
      }
      const newCheckpoint: GarmentSyncStoreCheckpoint = {
        storeKey,
        status: completedFullPass ? "complete" : "in_progress",
        mode,
        lastPageCompleted: result.lastPageCompleted,
        totalPages: result.totalPages,
        sinceCreatedAt: sinceCreatedAt ?? null,
        maxCreatedAtSeen: pickNewerIso(previousCheckpoint?.maxCreatedAtSeen ?? null, result.maxCreatedAtSeen),
        requestsUsedAllTime: (previousCheckpoint?.requestsUsedAllTime ?? 0) + result.requestsUsedThisCall,
        exclusions: addExclusions(mode === "full" && startPage === 1 ? undefined : previousCheckpoint?.exclusions, stats, result.rejected),
        updatedAt: new Date().toISOString(),
      };

      return {
        storeKey,
        mode,
        clusters,
        newCheckpoint,
        outcome: {
          storeKey,
          ok: true as const,
          mode,
          requestsUsedThisRun: result.requestsUsedThisCall,
          pagesThisRun: Math.max(0, result.lastPageCompleted - (startPage - 1)),
          totalPages: result.totalPages,
          truncated: result.truncated,
          ...(result.interruptedBy ? { interruptedBy: result.interruptedBy } : {}),
          completedFullPass,
          newGarmentBindings: linked.length,
          totalGarmentBindingsForStore: countPieces({ syncedAt: "", clusters }),
        } satisfies GarmentSyncOutcome,
      };
    }),
  );

  const outcomes: GarmentSyncOutcome[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const storeKey = keys[i];
    if (result.status === "rejected") {
      outcomes.push({ storeKey, ok: false, error: String(result.reason) });
      continue;
    }
    const { clusters, newCheckpoint, outcome } = result.value;
    garmentIndex.stores[storeKey] = { syncedAt: new Date().toISOString(), clusters };
    checkpointDoc.stores[storeKey] = newCheckpoint;
    outcomes.push(outcome);
  }

  // One atomic write per file for everything that succeeded this run; a store that failed was never mutated
  // above, so its prior index/checkpoint entries are written back completely unchanged. Index first: a crash
  // between the two leaves the checkpoint behind the index, and re-reading a few pages is idempotent.
  if (outcomes.some((o) => o.ok)) {
    await writeGarmentIndex(garmentIndex, files.index);
    await writeGarmentCheckpoint(checkpointDoc, files.checkpoint);
  }

  return { startedAt, finishedAt: new Date().toISOString(), outcomes };
}

/** `begin_date` is a plain date whose timezone INK does not document; one day of overlap costs a page or two
 * (re-seen products are upserted by id, so it is idempotent) and removes any off-by-a-day gap. */
function dayBefore(iso: string): string {
  const day = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

function addExclusions(previous: GarmentExclusionTotals | undefined, stats: GarmentLinkStats, rejected: number): GarmentExclusionTotals {
  const base: GarmentExclusionTotals = previous ?? { candidates: 0, linked: 0, classicType: 0, noClusterId: 0, unknownType: 0, noCanonicalForCluster: 0, noPrice: 0, unsellableUrl: 0, urlShape: 0, rejectedByValidation: 0 };
  return {
    candidates: base.candidates + stats.candidates,
    linked: base.linked + stats.linked,
    classicType: base.classicType + stats.classicType,
    noClusterId: base.noClusterId + stats.noClusterId,
    unknownType: base.unknownType + stats.unknownType,
    noCanonicalForCluster: base.noCanonicalForCluster + stats.noCanonicalForCluster,
    noPrice: base.noPrice + stats.noPrice,
    unsellableUrl: base.unsellableUrl + stats.unsellableUrl,
    urlShape: (base.urlShape ?? 0) + stats.urlShape,
    rejectedByValidation: base.rejectedByValidation + rejected,
  };
}

function pickNewerIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
