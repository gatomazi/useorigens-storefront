import { variantRank } from "./families";
import type { CityDesignBinding, UnrankedBinding } from "./types";
import type { CommerceStoreKey } from "../geo/regions";

export function compareIds(a: string, b: string): number {
  const diff = BigInt(a) - BigInt(b);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

/**
 * Ranks bindings deterministically. For each (city, family) the primary is the lowest by:
 *   1. variant rank (base > regional > ...), 2. store priority, 3. INK product id (numeric).
 * API order never matters. Locality-bound products are never primary: they are alternatives
 * shown as "Também de <cidade>", not the card that represents a municipality.
 */
export function rankBindings(
  bindings: readonly UnrankedBinding[],
  storeOrder: readonly CommerceStoreKey[],
): CityDesignBinding[] {
  const storeRank = (key: CommerceStoreKey) => {
    const index = storeOrder.indexOf(key);
    return index === -1 ? storeOrder.length : index;
  };

  const sorted = [...bindings].sort(
    (a, b) =>
      Number(Boolean(a.localityLabel)) - Number(Boolean(b.localityLabel)) ||
      variantRank(a.designFamily, a.designVariant) - variantRank(b.designFamily, b.designVariant) ||
      storeRank(a.commerceStoreKey) - storeRank(b.commerceStoreKey) ||
      compareIds(a.inkProductId, b.inkProductId),
  );

  const primaryTaken = new Set<string>();
  return sorted.map((binding, priority) => {
    const key = `${binding.cityId}:${binding.designFamily}`;
    const isPrimary = !binding.localityLabel && !primaryTaken.has(key);
    if (isPrimary) primaryTaken.add(key);
    return { ...binding, isPrimary, priority };
  });
}
