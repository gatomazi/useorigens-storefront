import "server-only";
import { readSnapshot } from "../catalog/snapshot-file";
import type { UnrankedBinding } from "../catalog/types";
import { REGIONS, REGION_SLUGS, type RegionSlug } from "../geo/regions";
import { fetchStorePaidOrders } from "../ink/orders-client";
import { computePodioSnapshot } from "./compute";
import { publishSnapshot, readDatedSnapshot, readRunState, writeRunState } from "./snapshot";
import type { PodioOrder } from "./types";
import { addDays, windowFor } from "./window";

export type RegionPodioResult =
  | { region: RegionSlug; ok: true; referenceDate: string; requests: number; ordersFetched: number; unitsEligible: number; unitsMapped: number; states: string[]; comparedWith: string | null }
  | { region: RegionSlug; ok: false; referenceDate: string; error: string };

export type PodioSyncDeps = {
  now?: () => Date;
  fetchOrders?: (region: RegionSlug, range: { beginDate: string; endDate: string }) => Promise<{ orders: PodioOrder[]; requests: number }>;
  bindings?: (region: RegionSlug) => Promise<UnrankedBinding[] | null>;
  baseDir?: string;
};

async function catalogBindings(region: RegionSlug): Promise<UnrankedBinding[] | null> {
  const index = (await readSnapshot()).stores[REGIONS[region].storeKey];
  return index && index.bindings.length > 0 ? index.bindings : null;
}

/**
 * Daily pódio calculation for one region: read every paid order of the window from the region's INK store, map it through the current
 * catalog, rank, publish atomically. Any failure (INK error, incomplete paging, missing catalog) publishes NOTHING and records the failed
 * attempt: pages keep the last good snapshot (up to 72 h) and say the update is pending. A complete run with zero sales is published as
 * such and clears the podium.
 */
export async function syncRegionPodio(region: RegionSlug, deps: PodioSyncDeps = {}): Promise<RegionPodioResult> {
  const now = (deps.now ?? (() => new Date()))();
  const window = windowFor(now);
  const previousState = readRunState(region, deps.baseDir);
  const fail = async (error: string): Promise<RegionPodioResult> => {
    await writeRunState(region, { version: 1, lastAttempt: { at: now.toISOString(), ok: false, referenceDate: window.referenceDate, error }, lastSuccess: previousState?.lastSuccess ?? null }, deps.baseDir).catch(() => undefined);
    return { region, ok: false, referenceDate: window.referenceDate, error };
  };

  const bindings = await (deps.bindings ?? catalogBindings)(region);
  if (!bindings) return fail("catalog snapshot for the region's store is missing or empty — cannot map sold products");

  let fetched: { orders: PodioOrder[]; requests: number };
  try {
    // INK filters by creation DAY in an undocumented time zone: pad one day on each side, the exact instants are filtered later.
    const range = { beginDate: addDays(window.referenceDate, -31), endDate: window.referenceDate };
    fetched = await (deps.fetchOrders ?? ((r, rg) => fetchStorePaidOrders(REGIONS[r].storeKey, rg)))(region, range);
  } catch (err) {
    return fail(`orders fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const previous = await readDatedSnapshot(region, addDays(window.referenceDate, -1), deps.baseDir);
  const snapshot = computePodioSnapshot({
    region,
    window,
    orders: fetched.orders,
    bindingsById: new Map(bindings.map((b) => [b.inkProductId, b])),
    previous,
    requests: fetched.requests,
    now,
  });
  try {
    await publishSnapshot(snapshot, deps.baseDir);
  } catch (err) {
    return fail(`publish failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  await writeRunState(region, { version: 1, lastAttempt: { at: now.toISOString(), ok: true, referenceDate: window.referenceDate }, lastSuccess: { at: now.toISOString(), referenceDate: window.referenceDate } }, deps.baseDir);
  return {
    region,
    ok: true,
    referenceDate: snapshot.referenceDate,
    requests: snapshot.sync.requests,
    ordersFetched: snapshot.sync.ordersFetched,
    unitsEligible: snapshot.sync.unitsEligible,
    unitsMapped: snapshot.sync.unitsMapped,
    states: Object.keys(snapshot.states),
    comparedWith: snapshot.comparedWith,
  };
}

let running: Promise<RegionPodioResult[]> | null = null;

export class PodioSyncRunningError extends Error {
  constructor() {
    super("a pódio sync is already running");
    this.name = "PodioSyncRunningError";
  }
}

/** Regions run one after another (one store at a time against INK). A second call while one runs is refused, never queued. */
export async function syncPodio(regions: readonly RegionSlug[] = REGION_SLUGS, deps: PodioSyncDeps = {}): Promise<RegionPodioResult[]> {
  if (running) throw new PodioSyncRunningError();
  running = (async () => {
    const results: RegionPodioResult[] = [];
    for (const region of regions) results.push(await syncRegionPodio(region, deps));
    return results;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}
