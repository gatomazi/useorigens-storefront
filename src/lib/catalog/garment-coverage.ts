import type { CommerceStoreKey } from "../geo/regions";
import { CLASSIC_GARMENT_TYPE_ID, GARMENT_TYPES } from "./garments";
import type { CatalogSnapshot } from "./types";

/** How many non-classic garment types a fully-covered (city, family) pair could have — the ceiling used to
 * call a cluster "complete". Derived from the central map, never hardcoded, so a future confirmed type
 * (added to `garments.ts` only after being observed live — see that file's header) updates this automatically. */
const MAX_NON_CLASSIC_TYPES = GARMENT_TYPES.filter((t) => t.id !== CLASSIC_GARMENT_TYPE_ID).length;

export type ClusterCoverageStatus = "complete" | "partial" | "no_variants" | "no_cluster";

export type StoreGarmentCoverage = {
  storeKey: CommerceStoreKey;
  totalCanonicalBindings: number;
  complete: number;
  partial: number;
  noVariants: number;
  noCluster: number;
  /** `complete + partial + noVariants` over `totalCanonicalBindings` — the honest "how much of the store's
   * families have ANY garment-index data" figure. Never presented as "coverage %" without this context: a
   * `noVariants` pair may really have no siblings in INK, or may simply not have been crawled yet — the two
   * are indistinguishable from this data alone (see the rollout report's stated limitation). */
  ratioWithAnyClusterData: number;
};

/**
 * Categorizes every canonical (city, family) binding of one store by how much real garment-type data the
 * snapshot currently holds for it. Pure and synchronous — no I/O — so it's fully unit-testable against
 * hand-built snapshot fixtures. Never claims "complete" coverage for the whole store; only for individual
 * (city, family) pairs that actually have `MAX_NON_CLASSIC_TYPES` linked siblings.
 */
export function garmentCoverageByStore(snapshot: CatalogSnapshot): StoreGarmentCoverage[] {
  const out: StoreGarmentCoverage[] = [];
  for (const [storeKey, index] of Object.entries(snapshot.stores)) {
    if (!index) continue;
    const garmentCountByPair = new Map<string, number>();
    for (const g of index.garmentBindings ?? []) {
      const key = `${g.cityId}:${g.designFamily}`;
      garmentCountByPair.set(key, (garmentCountByPair.get(key) ?? 0) + 1);
    }

    let complete = 0;
    let partial = 0;
    let noVariants = 0;
    let noCluster = 0;
    let total = 0;
    for (const binding of index.bindings) {
      total++;
      if (!binding.productClusterId) {
        noCluster++;
        continue;
      }
      const count = garmentCountByPair.get(`${binding.cityId}:${binding.designFamily}`) ?? 0;
      if (count === 0) noVariants++;
      else if (count >= MAX_NON_CLASSIC_TYPES) complete++;
      else partial++;
    }

    out.push({
      storeKey: storeKey as CommerceStoreKey,
      totalCanonicalBindings: total,
      complete,
      partial,
      noVariants,
      noCluster,
      ratioWithAnyClusterData: total === 0 ? 0 : (complete + partial + noVariants) / total,
    });
  }
  return out;
}
