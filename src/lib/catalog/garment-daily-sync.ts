import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { INK_STORES, tokenFor } from "../ink/config";
import { GARMENT_REVALIDATE_STORES, garmentRevalidationPathsForClusters } from "./garment-revalidate";
import { runIncrementalGarmentSync, type IncrementalOptions, type IncrementalResult } from "./garment-incremental-sync";
import { acquireGarmentSyncLock } from "./garment-sync-state";
import { syncCatalog, type SyncResult } from "./sync-service";

export type DailyGarmentSyncResult =
  | { status: "skipped-locked"; startedAt: string; finishedAt: string }
  | {
      status: "done";
      startedAt: string;
      finishedAt: string;
      durationMs: number;
      /** INK GETs of the whole run: base catalog + garment windows. */
      inkRequests: number;
      catalog: { changed: boolean; requests: number; failedStores: CommerceStoreKey[] };
      garments: IncrementalResult;
      /** True when every store finished its pass (unchanged or promoted) and nothing was left parked or failed. */
      clean: boolean;
    };

export type DailyGarmentSyncOptions = {
  storeKeys?: readonly CommerceStoreKey[];
  /** The base catalog changed and was promoted: clear the page caches that read it. */
  onCatalogChanged: () => void;
  revalidatePaths: (paths: string[]) => void;
  syncCatalogImpl?: typeof syncCatalog;
  fetchStore?: IncrementalOptions["fetchStore"];
  now?: IncrementalOptions["now"];
  maxRequestsPerStore?: number;
  minPieces?: number;
  log?: (event: string, fields: Record<string, unknown>) => void;
};

/** One JSON line per event: Railway's log stream is the only history of these runs (nothing is persisted per run). */
export function logGarmentSync(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ scope: "garments-sync", event, ...fields }));
}

/**
 * The whole daily job, in the only safe order: refresh the base catalog (new products need their
 * `product_cluster_id` there before a piece can be linked), then the incremental garment pass, then promotion and
 * revalidation. Holds the Volume lock for the whole run; when another run holds it, returns without touching anything.
 * A store whose base catalog refresh failed is skipped by the garment pass: its new pieces could not be linked, and
 * moving its cursor would lose them.
 */
export async function runDailyGarmentSync(options: DailyGarmentSyncOptions): Promise<DailyGarmentSyncResult> {
  const log = options.log ?? logGarmentSync;
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const lock = await acquireGarmentSyncLock();
  if (!lock) {
    log("skipped", { reason: "another sync holds the lock" });
    return { status: "skipped-locked", startedAt, finishedAt: now().toISOString() };
  }
  const began = Date.now();
  try {
    const requested = (options.storeKeys?.length ? options.storeKeys : GARMENT_REVALIDATE_STORES).filter((key) => key in INK_STORES && tokenFor(key));
    log("start", { stores: requested });

    const catalog: SyncResult = await (options.syncCatalogImpl ?? syncCatalog)(requested, undefined, {}, { skipWriteWhenUnchanged: true });
    const catalogRequests = catalog.outcomes.reduce((sum, o) => sum + (o.ok ? (o.requests ?? 0) : 0), 0);
    const failedStores = catalog.outcomes.filter((o) => !o.ok).map((o) => o.storeKey);
    // `changed` is undefined only for injected implementations that do not report it; treat that as changed (safe side).
    const catalogChanged = catalog.changed !== false;
    if (catalogChanged) options.onCatalogChanged();
    log("catalog", { changed: catalogChanged, requests: catalogRequests, failedStores });

    const garments = await runIncrementalGarmentSync({
      storeKeys: requested.filter((key) => !failedStores.includes(key)),
      revalidatePaths: options.revalidatePaths,
      pathsForClusters: garmentRevalidationPathsForClusters,
      fetchStore: options.fetchStore,
      now: options.now,
      maxRequestsPerStore: options.maxRequestsPerStore,
      minPieces: options.minPieces,
    });
    for (const store of garments.stores) {
      if (store.ok) log("store", { store: store.storeKey, status: store.status, cursorBefore: store.cursorBefore, cursorAfter: store.cursorAfter, ...store.metrics, ...(store.interruptedBy ? { interruptedBy: store.interruptedBy } : {}) });
      else log("store", { store: store.storeKey, status: "failed", error: store.error });
    }

    const garmentRequests = garments.stores.reduce((sum, s) => sum + (s.ok ? s.metrics.requests : 0), 0);
    const clean = failedStores.length === 0 && !garments.revalidationError && garments.stores.every((s) => s.ok && s.status !== "deferred");
    const result: DailyGarmentSyncResult = {
      status: "done",
      startedAt,
      finishedAt: now().toISOString(),
      durationMs: Date.now() - began,
      inkRequests: catalogRequests + garmentRequests,
      catalog: { changed: catalogChanged, requests: catalogRequests, failedStores },
      garments,
      clean,
    };
    log("end", {
      result: clean ? "ok" : "attention",
      durationMs: result.durationMs,
      inkRequests: result.inkRequests,
      indexPromoted: garments.indexPromoted,
      citiesRevalidated: garments.citiesRevalidated,
      ...(garments.revalidationError ? { revalidationError: garments.revalidationError } : {}),
    });
    return result;
  } finally {
    await lock.release();
  }
}
