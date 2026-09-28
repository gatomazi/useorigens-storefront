import "server-only";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CommerceStoreKey } from "../geo/regions";
import { fetchGarmentSourceProducts, type GarmentFetchOptions, type GarmentFetchResult } from "../ink/garment-client";
import { assertCanonicalClusterCoverage } from "./garment-sync-service";
import { linkGarmentBindings } from "./garments-link";
import { garmentIndexPath, readGarmentIndex, toTuple, type GarmentIndex, type GarmentTuple } from "./garment-index-file";
import { promoteGarmentIndex } from "./garment-index-promote";
import {
  readGarmentSyncState,
  readIncrementalCheckpoint,
  writeGarmentSyncState,
  writeIncrementalCheckpoint,
  type GarmentRunMetrics,
  type IncrementalStoreCheckpoint,
  type PendingPiece,
} from "./garment-sync-state";
import { readSnapshot } from "./snapshot-file";

/** INK's `begin_date` is a whole day in an undocumented timezone: re-reading this many days before the newest product seen is cheap and idempotent. */
export const OVERLAP_DAYS = 2;
/** Hard ceiling of INK GETs per store and run. A normal daily window is a handful of pages; hitting this means something is off, so the run parks a checkpoint instead of hammering INK. */
export const MAX_REQUESTS_PER_STORE = 150;
/** A parked checkpoint older than this is not resumed: page boundaries drift as the catalog grows. */
export const CHECKPOINT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type StoreOutcome =
  | {
      storeKey: CommerceStoreKey;
      ok: true;
      /** `unchanged`: pass completed, index untouched. `promoted`: pieces added/changed and promoted. `deferred`: cut short, progress parked in the checkpoint, cursor untouched. */
      status: "unchanged" | "promoted" | "deferred";
      cursorBefore: string;
      cursorAfter: string;
      metrics: GarmentRunMetrics;
      interruptedBy?: string;
    }
  | { storeKey: CommerceStoreKey; ok: false; error: string };

export type IncrementalResult = {
  startedAt: string;
  finishedAt: string;
  stores: StoreOutcome[];
  indexPromoted: boolean;
  citiesRevalidated: number;
  revalidationError?: string;
};

export type IncrementalOptions = {
  storeKeys: readonly CommerceStoreKey[];
  /** Marks the given city pages for revalidation. Only called with the cities of clusters that changed. */
  revalidatePaths: (paths: string[]) => void;
  /** Paths of the cities that show any of the given clusters (see garment-revalidate.ts). */
  pathsForClusters: (affected: Partial<Record<CommerceStoreKey, ReadonlySet<string>>>) => string[];
  fetchStore?: (storeKey: CommerceStoreKey, options: GarmentFetchOptions) => Promise<GarmentFetchResult>;
  now?: () => Date;
  maxRequestsPerStore?: number;
  /** Plausibility floor handed to the index validator; tests with tiny fixtures lower it. */
  minPieces?: number;
};

function dayMinus(isoOrDate: string, days: number): string {
  const day = new Date(`${isoOrDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) throw new Error(`invalid date "${isoOrDate}"`);
  day.setUTCDate(day.getUTCDate() - days);
  return day.toISOString().slice(0, 10);
}

/** Cursors only ever move forward. */
export function advanceCursor(previous: string, maxCreatedAtSeen: string | null): string {
  if (!maxCreatedAtSeen) return previous;
  const candidate = dayMinus(maxCreatedAtSeen, OVERLAP_DAYS);
  return candidate > previous ? candidate : previous;
}

const sameTuple = (a: GarmentTuple, b: GarmentTuple): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * Upserts pieces into one store's clusters (copy-on-write, `clusters` itself is mutated) and reports what actually
 * changed. A piece equal to the stored one changes nothing, so replaying a window is a no-op.
 */
export function applyPieces(clusters: Record<string, GarmentTuple[]>, pieces: readonly PendingPiece[]): { productsChanged: number; clustersChanged: Set<string> } {
  const clustersChanged = new Set<string>();
  const copied = new Set<string>();
  let productsChanged = 0;
  for (const { cluster, tuple } of pieces) {
    const current = clusters[cluster];
    const at = current ? current.findIndex((existing) => existing[1] === tuple[1]) : -1;
    if (at >= 0 && sameTuple(current[at], tuple)) continue;
    if (!copied.has(cluster)) {
      clusters[cluster] = [...(current ?? [])];
      copied.add(cluster);
    }
    if (at >= 0) clusters[cluster][at] = tuple;
    else clusters[cluster].push(tuple);
    clustersChanged.add(cluster);
    productsChanged++;
  }
  return { productsChanged, clustersChanged };
}

function dedupePieces(pieces: readonly PendingPiece[]): PendingPiece[] {
  const byKey = new Map<string, PendingPiece>();
  for (const piece of pieces) byKey.set(`${piece.cluster}:${piece.tuple[1]}`, piece);
  return [...byKey.values()];
}

const newerIso = (a: string | null, b: string | null): string | null => (!a ? b : !b ? a : a > b ? a : b);

type Prepared = {
  storeKey: CommerceStoreKey;
  status: "unchanged" | "promoted" | "deferred";
  cursorBefore: string;
  cursorAfter: string;
  metrics: GarmentRunMetrics;
  interruptedBy?: string;
  /** Present when the store's clusters changed. */
  clusters?: Record<string, GarmentTuple[]>;
  clustersChanged: Set<string>;
  parked?: IncrementalStoreCheckpoint;
};

/**
 * The incremental pass: for each store reads only the products created since its cursor (`begin_date`), links them by
 * `product_cluster_id` against the CURRENT base catalog, upserts just the changed pieces and — only if something
 * really changed — validates and promotes a new `garment-index.json` by atomic rename (keeping exactly one `.prev`).
 * The cursor moves only after that promotion; an interrupted pass parks its progress in the checkpoint instead.
 * The caller must hold the lock and must already have refreshed the base catalog. Read-only against INK.
 */
export async function runIncrementalGarmentSync(options: IncrementalOptions): Promise<IncrementalResult> {
  const now = options.now ?? (() => new Date());
  const fetchStore = options.fetchStore ?? fetchGarmentSourceProducts;
  const startedAt = now().toISOString();

  // A candidate left behind by a process that died mid-promotion is garbage, never input.
  await rm(path.join(path.dirname(garmentIndexPath()), "garment-index.incoming.json"), { force: true });

  const [snapshot, state, checkpoint, index] = await Promise.all([readSnapshot(), readGarmentSyncState(), readIncrementalCheckpoint(), readGarmentIndex()]);

  const settled = await Promise.allSettled(
    options.storeKeys.map(async (storeKey): Promise<Prepared> => {
      const began = Date.now();
      const storeSnapshot = snapshot.stores[storeKey];
      if (!storeSnapshot) throw new Error(`no base catalog for ${storeKey}`);
      assertCanonicalClusterCoverage(storeKey, storeSnapshot.bindings);
      const base = index.stores[storeKey];
      // Never turn the daily job into a hidden full crawl: without an index for the store there is nothing to extend.
      if (!base) throw new Error(`no garment index for ${storeKey}; a full crawl (garments:sync) is required first`);

      const cursorBefore = state.stores[storeKey]?.cursor ?? dayMinus(base.syncedAt, OVERLAP_DAYS);
      const parked = checkpoint.stores[storeKey];
      const resume = parked && parked.sinceCreatedAt === cursorBefore && now().getTime() - Date.parse(parked.updatedAt) < CHECKPOINT_MAX_AGE_MS ? parked : undefined;

      const fetched = await fetchStore(storeKey, {
        sinceCreatedAt: cursorBefore,
        startPage: resume ? resume.lastPageCompleted + 1 : 1,
        maxRequests: options.maxRequestsPerStore ?? MAX_REQUESTS_PER_STORE,
      });

      const { bindings } = linkGarmentBindings(fetched.products, storeSnapshot.bindings, now().toISOString());
      const fresh: PendingPiece[] = [];
      for (const binding of bindings) {
        const tuple = toTuple(binding);
        if (tuple) fresh.push({ cluster: binding.productClusterId, tuple });
      }
      const pieces = dedupePieces([...(resume?.pending ?? []), ...fresh]);
      const maxSeen = newerIso(resume?.maxCreatedAtSeen ?? null, fetched.maxCreatedAtSeen);
      const metrics: GarmentRunMetrics = {
        requests: (resume?.requests ?? 0) + fetched.requestsUsedThisCall,
        retries: (resume?.retries ?? 0) + fetched.retries,
        throttled: (resume?.throttled ?? 0) + fetched.throttled,
        productsSeen: (resume?.productsSeen ?? 0) + fetched.products.length,
        piecesLinked: pieces.length,
        productsChanged: 0,
        clustersChanged: 0,
        durationMs: 0,
      };

      if (fetched.truncated) {
        metrics.durationMs = Date.now() - began;
        return {
          storeKey,
          status: "deferred",
          cursorBefore,
          cursorAfter: cursorBefore,
          metrics,
          ...(fetched.interruptedBy ? { interruptedBy: fetched.interruptedBy } : {}),
          clustersChanged: new Set(),
          parked: {
            sinceCreatedAt: cursorBefore,
            lastPageCompleted: fetched.lastPageCompleted,
            maxCreatedAtSeen: maxSeen,
            pending: pieces,
            productsSeen: metrics.productsSeen,
            requests: metrics.requests,
            retries: metrics.retries,
            throttled: metrics.throttled,
            updatedAt: now().toISOString(),
          },
        };
      }

      const clusters = { ...base.clusters };
      const { productsChanged, clustersChanged } = applyPieces(clusters, pieces);
      metrics.productsChanged = productsChanged;
      metrics.clustersChanged = clustersChanged.size;
      metrics.durationMs = Date.now() - began;
      return {
        storeKey,
        status: productsChanged > 0 ? "promoted" : "unchanged",
        cursorBefore,
        cursorAfter: advanceCursor(cursorBefore, maxSeen),
        metrics,
        ...(productsChanged > 0 ? { clusters } : {}),
        clustersChanged,
      };
    }),
  );

  const outcomes = new Map<CommerceStoreKey, StoreOutcome>();
  const prepared: Prepared[] = [];
  settled.forEach((result, i) => {
    const storeKey = options.storeKeys[i];
    if (result.status === "rejected") outcomes.set(storeKey, { storeKey, ok: false, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
    else prepared.push(result.value);
  });

  // Promote first (one atomic rename covering every changed store), and only then let any cursor move.
  const changed = prepared.filter((p) => p.clusters);
  let indexPromoted = false;
  let promotionError: string | undefined;
  if (changed.length > 0) {
    const candidate: GarmentIndex = { version: 1, stores: { ...index.stores } };
    for (const p of changed) candidate.stores[p.storeKey] = { syncedAt: now().toISOString(), clusters: p.clusters! };
    const incoming = path.join(path.dirname(garmentIndexPath()), "garment-index.incoming.json");
    try {
      await writeFile(incoming, JSON.stringify(candidate));
      await promoteGarmentIndex(incoming, { expectStores: Object.keys(candidate.stores) as CommerceStoreKey[], minPieces: options.minPieces });
      indexPromoted = true;
    } catch (err) {
      promotionError = err instanceof Error ? err.message : String(err);
    } finally {
      await rm(incoming, { force: true }); // no-op after a successful rename
    }
  }

  let citiesRevalidated = 0;
  let revalidationError: string | undefined;
  if (indexPromoted) {
    try {
      const affected: Partial<Record<CommerceStoreKey, ReadonlySet<string>>> = {};
      for (const p of changed) affected[p.storeKey] = p.clustersChanged;
      const paths = options.pathsForClusters(affected);
      options.revalidatePaths(paths);
      citiesRevalidated = paths.length;
    } catch (err) {
      // The promoted index is good; pages then refresh when their normal revalidate window expires.
      revalidationError = err instanceof Error ? err.message : String(err);
    }
  }

  const finishedAt = now().toISOString();
  let stateTouched = false;
  let checkpointTouched = false;
  for (const p of prepared) {
    if (p.clusters && !indexPromoted) {
      outcomes.set(p.storeKey, { storeKey: p.storeKey, ok: false, error: `index promotion failed: ${promotionError}` });
      continue;
    }
    outcomes.set(p.storeKey, { storeKey: p.storeKey, ok: true, status: p.status, cursorBefore: p.cursorBefore, cursorAfter: p.cursorAfter, metrics: p.metrics, ...(p.interruptedBy ? { interruptedBy: p.interruptedBy } : {}) });
    if (p.status === "deferred") {
      checkpoint.stores[p.storeKey] = p.parked;
      checkpointTouched = true;
    } else {
      state.stores[p.storeKey] = { cursor: p.cursorAfter, lastSuccessAt: finishedAt, lastRun: p.metrics };
      stateTouched = true;
      if (checkpoint.stores[p.storeKey]) {
        delete checkpoint.stores[p.storeKey];
        checkpointTouched = true;
      }
    }
  }
  if (stateTouched) await writeGarmentSyncState(state);
  if (checkpointTouched) await writeIncrementalCheckpoint(checkpoint);

  return {
    startedAt,
    finishedAt,
    stores: options.storeKeys.map((key) => outcomes.get(key)!),
    indexPromoted,
    citiesRevalidated,
    ...(revalidationError ? { revalidationError } : {}),
  };
}
