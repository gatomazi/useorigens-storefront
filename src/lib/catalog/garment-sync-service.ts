import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { fetchGarmentSourceProducts, type GarmentFetchDeps, type GarmentPageProgress } from "../ink/garment-client";
import { requireAtLeastOneInkToken } from "../config/env";
import { INK_STORES, tokenFor } from "../ink/config";
import { buildGarmentBindings } from "./garments-link";
import { readGarmentCheckpoint, writeGarmentCheckpoint, type GarmentSyncStoreCheckpoint } from "./garment-checkpoint";
import { readSnapshot, writeSnapshot } from "./snapshot-file";

export type GarmentSyncOutcome =
  | {
      storeKey: CommerceStoreKey;
      ok: true;
      mode: "full" | "incremental";
      requestsUsedThisRun: number;
      pagesThisRun: number;
      totalPages: number;
      truncated: boolean;
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
    return { startPage: 1, sinceCreatedAt: checkpoint.maxCreatedAtSeen.slice(0, 10), mode: "incremental" };
  }
  return { startPage: 1, sinceCreatedAt: undefined, mode: "full" };
}

/**
 * Runs one bounded, resumable garment-sync pass per requested store: fetches up to `maxRequestsPerStore`
 * pages (continuing from the checkpoint, if any), links results to the already-trusted canonical bindings
 * via `buildGarmentBindings` (unchanged from the previous round — only the data SOURCE changes here, from 3
 * manual fixtures to the real paginated crawl), and merges them additively into the snapshot's
 * `garmentBindings` for that store. Never widens scope beyond what the caller authorized: `maxRequestsPerStore`
 * is a hard ceiling, not a target. Stores run in parallel with each other (never within one store), same as
 * the main `syncCatalog`. A store whose fetch throws is reported as a failure and leaves the snapshot AND
 * checkpoint for that store completely untouched — last-known-good, exactly like `shouldPromoteStore`.
 */
export async function runGarmentSync(options: GarmentSyncRunOptions): Promise<GarmentSyncRunResult> {
  requireAtLeastOneInkToken();
  const startedAt = new Date().toISOString();
  const keys = (Object.keys(INK_STORES) as CommerceStoreKey[]).filter(
    (key) => (!options.storeKeys || options.storeKeys.length === 0 || options.storeKeys.includes(key)) && tokenFor(key),
  );

  const snapshot = await readSnapshot();
  const checkpointDoc = await readGarmentCheckpoint();

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

      const linked = buildGarmentBindings(result.products, storeIndex.bindings, new Date().toISOString());
      // Upsert by `inkProductId` (the real product identity) — NEVER wholesale-replace by (city, family):
      // a resumed run only ever crawls a SUBSET of pages, so a pair whose siblings are split across two
      // separate calls (page N this run, page N+1 next run) must accumulate, not have its first half
      // discarded when the second half links. A product re-seen with fresher data simply overwrites its own
      // single entry; every other product's entry, from this run or an earlier one, is left untouched.
      const byId = new Map((storeIndex.garmentBindings ?? []).map((g) => [g.inkProductId, g]));
      for (const g of linked) byId.set(g.inkProductId, g);
      const merged = [...byId.values()];

      const completedFullPass = !result.truncated && result.lastPageCompleted >= result.totalPages;
      const newCheckpoint: GarmentSyncStoreCheckpoint = {
        storeKey,
        status: completedFullPass ? "complete" : "in_progress",
        mode,
        lastPageCompleted: result.lastPageCompleted,
        totalPages: result.totalPages,
        sinceCreatedAt: sinceCreatedAt ?? null,
        maxCreatedAtSeen: pickNewerIso(previousCheckpoint?.maxCreatedAtSeen ?? null, result.maxCreatedAtSeen),
        requestsUsedAllTime: (previousCheckpoint?.requestsUsedAllTime ?? 0) + result.requestsUsedThisCall,
        updatedAt: new Date().toISOString(),
      };

      return {
        storeKey,
        mode,
        merged,
        newCheckpoint,
        outcome: {
          storeKey,
          ok: true as const,
          mode,
          requestsUsedThisRun: result.requestsUsedThisCall,
          pagesThisRun: Math.max(0, result.lastPageCompleted - (startPage - 1)),
          totalPages: result.totalPages,
          truncated: result.truncated,
          completedFullPass,
          newGarmentBindings: linked.length,
          totalGarmentBindingsForStore: merged.length,
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
    const { merged, newCheckpoint, outcome } = result.value;
    snapshot.stores[storeKey] = { ...snapshot.stores[storeKey]!, garmentBindings: merged };
    checkpointDoc.stores[storeKey] = newCheckpoint;
    outcomes.push(outcome);
  }

  // One atomic write for everything that succeeded this run; a store that failed was never mutated above,
  // so its prior snapshot/checkpoint entries are written back completely unchanged.
  await writeSnapshot(snapshot);
  await writeGarmentCheckpoint(checkpointDoc);

  return { startedAt, finishedAt: new Date().toISOString(), outcomes };
}

function pickNewerIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
