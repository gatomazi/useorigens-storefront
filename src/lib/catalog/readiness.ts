import "server-only";
import { getCatalog } from "./repository";
import { snapshotStatus } from "./snapshot-file";
import { citiesOfRegion } from "../geo/cities";
import type { RegionSlug } from "../geo/regions";

/**
 * How much of a region's municipalities must have at least one product for the region to count as "ready".
 * Deliberately a ratio, not a fixed city/product count (bootstrap review §5: "sem impor contagens imutáveis
 * que impeçam crescimento ou mudanças legítimas") — it scales with the real dataset (today 1191/1191 for the
 * Sul, well above this) instead of breaking the moment the catalog grows or a handful of cities lose their
 * only product. 50% is deliberately conservative: it comfortably passes real, healthy syncs while still
 * catching a catastrophic partial sync (e.g. "1 product, 1 city") that a bare ">0" check would call ready.
 */
export const READY_COVERAGE_THRESHOLD = 0.5;

export type RegionReadiness = { region: RegionSlug; coveredCities: number; totalCities: number; ratio: number; ready: boolean };

/** Pure threshold decision, isolated so it is directly unit-testable without a real catalog/snapshot. */
export function isCoverageReady(coveredCities: number, totalCities: number): boolean {
  if (totalCities === 0) return false;
  return coveredCities / totalCities >= READY_COVERAGE_THRESHOLD;
}

export function regionReadiness(region: RegionSlug): RegionReadiness {
  const catalog = getCatalog();
  const totalCities = citiesOfRegion(region).length;
  const coveredCities = catalog.coveredCityIds(region).size;
  const ratio = totalCities === 0 ? 0 : coveredCities / totalCities;
  return { region, coveredCities, totalCities, ratio, ready: isCoverageReady(coveredCities, totalCities) };
}

export type CatalogReadiness = {
  ready: boolean;
  reason: string | null;
  regions: RegionReadiness[];
  snapshot: ReturnType<typeof snapshotStatus>;
};

/** Never touches INK or IBGE — only the local snapshot file and the build-time-bundled geo dataset. */
export function catalogReadiness(regions: readonly RegionSlug[]): CatalogReadiness {
  const snapshot = snapshotStatus();
  if (!snapshot.present) {
    return { ready: false, reason: "no catalog snapshot on disk (never synced)", regions: [], snapshot };
  }
  const regionResults = regions.map(regionReadiness);
  const notReady = regionResults.filter((r) => !r.ready);
  if (notReady.length > 0) {
    const detail = notReady.map((r) => `${r.region}: ${r.coveredCities}/${r.totalCities} cities (${Math.round(r.ratio * 100)}%)`).join(", ");
    return {
      ready: false,
      reason: `insufficient catalog coverage — ${detail} (need >= ${Math.round(READY_COVERAGE_THRESHOLD * 100)}%) — looks like a partial sync`,
      regions: regionResults,
      snapshot,
    };
  }
  return { ready: true, reason: null, regions: regionResults, snapshot };
}
