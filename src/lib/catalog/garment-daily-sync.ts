import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CommerceStoreKey } from "../geo/regions";
import { INK_STORES, tokenFor } from "../ink/config";
import { GARMENT_REVALIDATE_STORES, garmentRevalidationPathsForClusters } from "./garment-revalidate";
import { runIncrementalGarmentSync, type IncrementalOptions, type IncrementalResult } from "./garment-incremental-sync";
import { acquireGarmentSyncLock } from "./garment-sync-state";
import { syncCatalog, type SyncResult } from "./sync-service";
import { runGarmentSync } from "./garment-sync-service";
import { SINGLE_STORE_KEY, singleStoreDataDir } from "./commerce-mode";
import { IDENTITY_FILE, syncLojaUnica, type LojaUnicaSyncResult } from "./unificado/sync-loja-unica";
import { inkFeedUrl, refreshMerchantFeed, type MerchantRefresh } from "../merchant/generate";

/**
 * Regional stores the daily job no longer reads: Use Norte and Use Centro-Oeste had their INK plans switched off after the single store went live
 * (16/10/2026) and their sites redirect to it (worker-lojas legacy-redirect). Their products live in the single store, refreshed by its own step.
 * An explicit `storeKeys` (a manual POST) still reaches them.
 */
export const RETIRED_STORES: readonly CommerceStoreKey[] = ["use-norte", "use-centro"];
export const DAILY_STORES: readonly CommerceStoreKey[] = GARMENT_REVALIDATE_STORES.filter((key) => !RETIRED_STORES.includes(key));

/** INK requests the single store's piece crawl may spend per daily run (it resumes from its checkpoint the next day). */
const LOJA_UNICA_GARMENT_REQUESTS = 300;

/** The single store is kept in sync once it has been prepared on this Volume (its migrated-products identity is there), in both modes. */
export const lojaUnicaPreparada = (): boolean => existsSync(path.join(singleStoreDataDir(), IDENTITY_FILE));

export type LojaUnicaDailyStep = {
  catalog: LojaUnicaSyncResult;
  garments: { ok: boolean; error?: string; truncated?: boolean; newGarmentBindings?: number } | null;
  /** Google Merchant feed (covers of new products, then the feed). Reported only: it never makes the run unclean. */
  merchant?: MerchantRefresh;
};

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
      /** The single store (<snapshot dir>/loja-unica/), when prepared: its catalog + collections, then a capped, resumable piece crawl. */
      lojaUnica?: LojaUnicaDailyStep;
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
  /** Tests: the single store's step (default: run it only when `lojaUnicaPreparada()`). */
  lojaUnicaImpl?: (() => Promise<LojaUnicaDailyStep>) | null;
};

/** The single store's daily step. Never throws: a failure is reported and leaves its last-known-good files in place. */
async function syncLojaUnicaDaily(): Promise<LojaUnicaDailyStep> {
  const catalog = await syncLojaUnica();
  if (!catalog.ok) return { catalog, garments: null };
  let garments: LojaUnicaDailyStep["garments"];
  try {
    const run = await runGarmentSync({ storeKeys: [SINGLE_STORE_KEY], maxRequestsPerStore: LOJA_UNICA_GARMENT_REQUESTS, dataDir: singleStoreDataDir() });
    const o = run.outcomes[0];
    garments = !o ? { ok: false, error: "no outcome" } : o.ok ? { ok: true, truncated: o.truncated, newGarmentBindings: o.newGarmentBindings } : { ok: false, error: o.error };
  } catch (err) {
    garments = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  // Skipped (and silent) until INK_GOOGLE_FEED_URL is configured.
  const merchant = inkFeedUrl() ? await refreshMerchantFeed() : undefined;
  return { catalog, garments, ...(merchant ? { merchant } : {}) };
}

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
    const requested = (options.storeKeys?.length ? options.storeKeys : DAILY_STORES).filter((key) => key in INK_STORES && tokenFor(key));
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

    const lojaUnicaStep = options.lojaUnicaImpl === undefined ? (lojaUnicaPreparada() ? syncLojaUnicaDaily : null) : options.lojaUnicaImpl;
    const lojaUnica = lojaUnicaStep ? await lojaUnicaStep() : undefined;
    if (lojaUnica) {
      if (lojaUnica.catalog.ok && lojaUnica.catalog.changed) options.onCatalogChanged();
      log("loja-unica", { catalog: lojaUnica.catalog, garments: lojaUnica.garments, ...(lojaUnica.merchant ? { merchant: lojaUnica.merchant } : {}) });
    }

    const garmentRequests = garments.stores.reduce((sum, s) => sum + (s.ok ? s.metrics.requests : 0), 0);
    const lojaUnicaOk = !lojaUnica || (lojaUnica.catalog.ok && lojaUnica.garments?.ok === true);
    const clean = failedStores.length === 0 && !garments.revalidationError && garments.stores.every((s) => s.ok && s.status !== "deferred") && lojaUnicaOk;
    const result: DailyGarmentSyncResult = {
      status: "done",
      startedAt,
      finishedAt: now().toISOString(),
      durationMs: Date.now() - began,
      inkRequests: catalogRequests + garmentRequests,
      catalog: { changed: catalogChanged, requests: catalogRequests, failedStores },
      garments,
      ...(lojaUnica ? { lojaUnica } : {}),
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
