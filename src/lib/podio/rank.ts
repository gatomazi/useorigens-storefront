import { compareIds } from "../catalog/ranking";
import type { FamilyRankEntry, Movement, RankEntry, StateRanking } from "./types";

/** The public podium shows this many places; movement "NOVO" means entering this group. */
export const PODIUM_SIZE = 3;
const MAX_REPRESENTATIVES = 5;

/** Units per UF, per locality and per family (with which localities fed each family). Positive units only. */
export type StateTally = {
  localities: Map<string, number>;
  families: Map<string, { units: number; byLocality: Map<string, number> }>;
};

export function emptyTally(): StateTally {
  return { localities: new Map(), families: new Map() };
}

export function addToTally(tally: StateTally, item: { localityKey: string | null; family: string | null; units: number }): void {
  if (item.units <= 0) return;
  if (item.localityKey) tally.localities.set(item.localityKey, (tally.localities.get(item.localityKey) ?? 0) + item.units);
  if (item.family) {
    const f = tally.families.get(item.family) ?? { units: 0, byLocality: new Map<string, number>() };
    f.units += item.units;
    if (item.localityKey) f.byLocality.set(item.localityKey, (f.byLocality.get(item.localityKey) ?? 0) + item.units);
    tally.families.set(item.family, f);
  }
}

/**
 * Deterministic order — the same input always gives the same podium, whatever order INK returned the orders in:
 *  1. more net units first;
 *  2. on a tie, the relative order of the previous day's snapshot is kept (an entity that was ranked yesterday goes before one that was
 *     not) — so two places tied on units never swap places day to day just because of query order;
 *  3. finally the canonical id (numeric-aware), which is also the only tie-break on the first snapshot.
 */
export function orderEntities(units: ReadonlyMap<string, number>, previous: ReadonlyMap<string, number> | null): string[] {
  return [...units.entries()]
    .filter(([, n]) => n > 0)
    .sort(([a, ua], [b, ub]) => {
      if (ua !== ub) return ub - ua;
      if (previous) {
        const pa = previous.get(a);
        const pb = previous.get(b);
        if (pa !== undefined && pb !== undefined && pa !== pb) return pa - pb;
        if (pa !== undefined && pb === undefined) return -1;
        if (pa === undefined && pb !== undefined) return 1;
      }
      return compareIds(a, b);
    })
    .map(([id]) => id);
}

/**
 * previous position − current position: positive = moved up. With no previous-day snapshot at all, movement is null (never "everything is
 * new"). `new` = entered the podium (top 3) from outside it, or from nowhere; that wins over the numeric move, which stays in `from`.
 */
export function movementOf(position: number, previousPosition: number | null, hasPrevious: boolean): Movement | null {
  if (!hasPrevious) return null;
  if (previousPosition === null) return { kind: "new", from: null };
  if (position <= PODIUM_SIZE && previousPosition > PODIUM_SIZE) return { kind: "new", from: previousPosition };
  const delta = previousPosition - position;
  if (delta > 0) return { kind: "up", by: delta };
  if (delta < 0) return { kind: "down", by: -delta };
  return { kind: "same" };
}

function positionsOf(entries: readonly RankEntry[] | undefined): Map<string, number> | null {
  return entries ? new Map(entries.map((e) => [e.id, e.position])) : null;
}

/**
 * Full classification for one UF (every entity with positive units, not just the podium: movement from 4th place and below needs it).
 * `previous` is the same UF's ranking from the previous day's snapshot; `hasPreviousSnapshot` tells "no snapshot yesterday" (no movement
 * at all) from "yesterday's snapshot had no sales in this UF" (everything is new).
 */
export function rankState(tally: StateTally, previous: StateRanking | undefined, hasPreviousSnapshot: boolean): StateRanking {
  const prevLoc = positionsOf(previous?.localities) ?? (hasPreviousSnapshot ? new Map() : null);
  const prevFam = positionsOf(previous?.families) ?? (hasPreviousSnapshot ? new Map() : null);

  const localities: RankEntry[] = orderEntities(tally.localities, prevLoc).map((id, i) => {
    const previousPosition = prevLoc?.get(id) ?? null;
    return { id, units: tally.localities.get(id)!, position: i + 1, previousPosition, movement: movementOf(i + 1, previousPosition, hasPreviousSnapshot) };
  });

  const familyUnits = new Map([...tally.families].map(([id, f]) => [id, f.units]));
  const families: FamilyRankEntry[] = orderEntities(familyUnits, prevFam).map((id, i) => {
    const previousPosition = prevFam?.get(id) ?? null;
    const byLocality = tally.families.get(id)!.byLocality;
    return {
      id,
      units: familyUnits.get(id)!,
      position: i + 1,
      previousPosition,
      movement: movementOf(i + 1, previousPosition, hasPreviousSnapshot),
      representatives: orderEntities(byLocality, null).slice(0, MAX_REPRESENTATIVES),
    };
  });
  return { localities, families };
}
