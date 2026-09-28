import "server-only";
import { allCities } from "../geo/cities";
import { REGION_SLUGS, type CommerceStoreKey } from "../geo/regions";
import { getCatalog } from "./repository";

export const GARMENT_REVALIDATE_STORES: readonly CommerceStoreKey[] = ["use-sul", "use-norte", "use-centro"];

/**
 * City pages whose garment tabs can change when the piece index of `storeKeys` is promoted: the cities whose
 * families' primary product comes from one of those stores (the index is looked up by the primary's store and
 * cluster, see `Catalog#garmentTabsForCity`). Exact and independent of the region-to-store mapping, so it stays
 * right after a store consolidation. An empty list means every store.
 */
export function garmentRevalidationPaths(storeKeys: readonly CommerceStoreKey[]): string[] {
  const wanted = storeKeys.length > 0 ? new Set(storeKeys) : null;
  const catalog = getCatalog();
  const covered = new Set<string>();
  for (const region of REGION_SLUGS) for (const id of catalog.coveredCityIds(region)) covered.add(id);

  const paths: string[] = [];
  for (const city of allCities()) {
    if (!covered.has(city.id)) continue;
    const affected = wanted === null || catalog.cityFamilies(city.id).some((entry) => wanted.has(entry.primary.commerceStoreKey));
    if (affected) paths.push(`/${city.regionSlug}/${city.uf.toLowerCase()}/${city.slug}`);
  }
  return paths;
}

/**
 * Marks those city pages for revalidation (`revalidatePath` in a Route Handler only marks; the page is rebuilt on
 * its next visit, so this is cheap even for ~1,200 cities and causes no burst of renders). Reads nothing from the
 * index file and writes nothing: a failure here can never touch the promoted index.
 */
export function revalidateGarmentCityPages(storeKeys: readonly CommerceStoreKey[], revalidate: (path: string) => void): number {
  const paths = garmentRevalidationPaths(storeKeys);
  for (const path of paths) revalidate(path);
  return paths.length;
}

/**
 * City pages that show at least one of the given clusters: the same lookup `Catalog#garmentTabsForCity` performs
 * (primary's store + `product_cluster_id`), so a daily pass that touched a handful of clusters marks a handful of
 * pages instead of every city of the store.
 */
export function garmentRevalidationPathsForClusters(affected: Partial<Record<CommerceStoreKey, ReadonlySet<string>>>): string[] {
  const catalog = getCatalog();
  const covered = new Set<string>();
  for (const region of REGION_SLUGS) for (const id of catalog.coveredCityIds(region)) covered.add(id);

  const paths: string[] = [];
  for (const city of allCities()) {
    if (!covered.has(city.id)) continue;
    const shows = catalog.cityFamilies(city.id).some((entry) => {
      const cluster = entry.primary.productClusterId;
      return cluster !== undefined && affected[entry.primary.commerceStoreKey]?.has(cluster) === true;
    });
    if (shows) paths.push(`/${city.regionSlug}/${city.uf.toLowerCase()}/${city.slug}`);
  }
  return paths;
}
