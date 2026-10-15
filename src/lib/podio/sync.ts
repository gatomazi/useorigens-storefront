import "server-only";
import { commercePlan, SINGLE_STORE_KEY, singleStoreDataDir } from "../catalog/commerce-mode";
import { readSnapshot, snapshotPath } from "../catalog/snapshot-file";
import type { UnrankedBinding } from "../catalog/types";
import { REGIONS, REGION_SLUGS, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { tokenFor } from "../ink/config";
import { fetchStorePaidOrders } from "../ink/orders-client";
import { computePodioSnapshot } from "./compute";
import { podioEnabled } from "./enabled";
import { publishSnapshot, readDatedSnapshot, readRunState, writeRunState } from "./snapshot";
import type { PodioOrder } from "./types";
import { addDays, windowFor } from "./window";

export type RegionPodioResult =
  | { region: RegionSlug; ok: true; referenceDate: string; requests: number; ordersFetched: number; unitsEligible: number; unitsMapped: number; states: string[]; comparedWith: string | null }
  | { region: RegionSlug; ok: false; referenceDate: string; error: string }
  /** The region's pódio is switched off (panel or PODIO_PUBLIC=off): nothing was read from INK, nothing was written. */
  | { region: RegionSlug; ok: true; skipped: "disabled" };

export type PodioSyncDeps = {
  now?: () => Date;
  /** Whether the region's pódio is on (default: the published configuration and PODIO_PUBLIC, see enabled.ts). */
  enabled?: (region: RegionSlug) => boolean;
  fetchOrders?: (region: RegionSlug, range: { beginDate: string; endDate: string }) => Promise<{ orders: PodioOrder[]; requests: number }>;
  bindings?: (region: RegionSlug) => Promise<UnrankedBinding[] | null>;
  baseDir?: string;
};

/**
 * The stores whose orders count for a region's pódio. Regional mode: the region's own store. Single-store mode: the single store AND the region's
 * old store while it still has a credential, so the 30-day window does not lose the sales made there before the switch.
 */
export function podioStoresFor(region: RegionSlug): CommerceStoreKey[] {
  const own = REGIONS[region].storeKey;
  if (commercePlan().effective !== "single-store") return [own];
  return own === SINGLE_STORE_KEY || !tokenFor(own) ? [SINGLE_STORE_KEY] : [SINGLE_STORE_KEY, own];
}

/** The city-design bindings of every store of the region's pódio: the single store's from its own snapshot, a regional store's from the regional one. */
async function catalogBindings(region: RegionSlug): Promise<UnrankedBinding[] | null> {
  const singleStore = commercePlan().effective === "single-store";
  const out: UnrankedBinding[] = [];
  for (const store of podioStoresFor(region)) {
    const file = singleStore && store === SINGLE_STORE_KEY ? snapshotPath(singleStoreDataDir()) : snapshotPath();
    out.push(...((await readSnapshot(file)).stores[store]?.bindings ?? []));
  }
  return out.length > 0 ? out : null;
}

/** Paid orders of the region's pódio stores. An order id is only unique inside its store, so it is prefixed when there is more than one. */
async function podioOrders(region: RegionSlug, range: { beginDate: string; endDate: string }, cache: Map<string, Promise<{ orders: PodioOrder[]; requests: number }>>) {
  const stores = podioStoresFor(region);
  const orders: PodioOrder[] = [];
  let requests = 0;
  for (const store of stores) {
    // The single store serves three regions in one run: its orders are read once and shared (each region keeps only its own UFs).
    const key = `${store}|${range.beginDate}|${range.endDate}`;
    if (!cache.has(key)) cache.set(key, fetchStorePaidOrders(store, range));
    const fetched = await cache.get(key)!;
    requests += fetched.requests;
    orders.push(...(stores.length > 1 ? fetched.orders.map((o) => ({ ...o, orderId: `${store}:${o.orderId}` })) : fetched.orders));
  }
  return { orders, requests };
}

/**
 * Daily pódio calculation for one region: read every paid order of the window from the region's INK store, map it through the current
 * catalog, rank, publish atomically. Any failure (INK error, incomplete paging, missing catalog) publishes NOTHING and records the failed
 * attempt: pages keep the last good snapshot (up to 72 h) and say the update is pending. A complete run with zero sales is published as
 * such and clears the podium.
 */
export async function syncRegionPodio(region: RegionSlug, deps: PodioSyncDeps = {}, ordersCache = new Map<string, Promise<{ orders: PodioOrder[]; requests: number }>>()): Promise<RegionPodioResult> {
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
    fetched = await (deps.fetchOrders ?? ((r, rg) => podioOrders(r, rg, ordersCache)))(region, range);
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

/**
 * Regions run one after another (one store at a time against INK). A second call while one runs is refused, never queued. A region whose pódio is
 * switched off is skipped before anything is read: its last files stay on the Volume untouched (they are hidden anyway, and age out after 72 h).
 */
export async function syncPodio(regions: readonly RegionSlug[] = REGION_SLUGS, deps: PodioSyncDeps = {}): Promise<RegionPodioResult[]> {
  if (running) throw new PodioSyncRunningError();
  const enabled = deps.enabled ?? ((region: RegionSlug) => podioEnabled(region));
  running = (async () => {
    const results: RegionPodioResult[] = [];
    const ordersCache = new Map<string, Promise<{ orders: PodioOrder[]; requests: number }>>();
    for (const region of regions) results.push(enabled(region) ? await syncRegionPodio(region, deps, ordersCache) : { region, ok: true, skipped: "disabled" });
    return results;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}
