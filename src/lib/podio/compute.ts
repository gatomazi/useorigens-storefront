import type { UnrankedBinding } from "../catalog/types";
import { REGIONS, type RegionSlug } from "../geo/regions";
import { eligibleLines } from "./orders";
import { addToTally, emptyTally, rankState, type StateTally } from "./rank";
import { resolveSoldProduct } from "./resolve";
import type { PodioOrder, PodioSnapshot, PodioUnmapped, StateRanking } from "./types";
import { addDays, type PodioWindow } from "./window";

export type ComputeInput = {
  region: RegionSlug;
  window: PodioWindow;
  /** Every order the paged fetch returned (already complete — a partial fetch never gets here). */
  orders: readonly PodioOrder[];
  /** City-design bindings of the region's store in the current catalog snapshot, by INK product id. */
  bindingsById: ReadonlyMap<string, UnrankedBinding>;
  /** The snapshot of D−1 for this region, if one exists. Any other date is ignored (no movement against an older day). */
  previous: PodioSnapshot | null;
  requests: number;
  now: Date;
};

const MAX_UNMAPPED_LISTED = 200;

/** Pure: orders + catalog mapping + yesterday → today's full internal snapshot. Zero eligible sales is a valid, complete result. */
export function computePodioSnapshot(input: ComputeInput): PodioSnapshot {
  const { region, window } = input;
  const storeKey = REGIONS[region].storeKey;
  const { lines, excluded, ordersEligible } = eligibleLines(storeKey, input.orders, window);

  const tallies = new Map<string, StateTally>();
  const unmapped = new Map<string, PodioUnmapped>();
  let unitsEligible = 0;
  let unitsMapped = 0;
  for (const line of lines) {
    unitsEligible += line.units;
    const resolved = resolveSoldProduct(line.product, region, input.bindingsById);
    if (!resolved.ok) {
      const u = unmapped.get(line.productId) ?? { productId: line.productId, name: line.product.name, units: 0, reason: resolved.reason };
      u.units += line.units;
      unmapped.set(line.productId, u);
      continue;
    }
    unitsMapped += line.units;
    const tally = tallies.get(resolved.uf) ?? emptyTally();
    addToTally(tally, { localityKey: resolved.localityKey, family: resolved.family, units: line.units });
    tallies.set(resolved.uf, tally);
  }

  const expectedPrevious = addDays(window.referenceDate, -1);
  const previous = input.previous && input.previous.referenceDate === expectedPrevious && input.previous.region === region ? input.previous : null;

  const states: Record<string, StateRanking> = {};
  for (const uf of REGIONS[region].ufs) {
    const tally = tallies.get(uf);
    if (!tally) continue;
    const ranking = rankState(tally, previous?.states[uf], previous !== null);
    if (ranking.localities.length > 0 || ranking.families.length > 0) states[uf] = ranking;
  }

  return {
    version: 1,
    region,
    storeKey,
    referenceDate: window.referenceDate,
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    computedAt: input.now.toISOString(),
    comparedWith: previous?.referenceDate ?? null,
    sync: { status: "complete", requests: input.requests, ordersFetched: input.orders.length, ordersEligible, unitsEligible, unitsMapped, excluded },
    states,
    unmapped: [...unmapped.values()].sort((a, b) => b.units - a.units || a.productId.localeCompare(b.productId)).slice(0, MAX_UNMAPPED_LISTED),
  };
}
