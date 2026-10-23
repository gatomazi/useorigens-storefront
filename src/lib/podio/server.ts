import "server-only";
import { getCatalog, storesServing, type StoreProducts } from "../catalog/repository";
import { localityById } from "../geo/localities";
import type { RegionSlug } from "../geo/regions";
import type { ScopeDoc } from "../site-config/schema";
import { podioEnabled } from "./enabled";
import { freshnessOf, projectLeaders, projectPodium, type PodioCatalogView, type PodiumLeader, type PublicPodium } from "./public";
import { readLatestSnapshot, readProductSales, readRunState } from "./snapshot";
import { cumulativeUnits, freshUnits } from "./product-sales";

function catalogView(): PodioCatalogView {
  const catalog = getCatalog();
  return {
    locality: (id) => localityById(id),
    hasPage: (id) => {
      const place = localityById(id);
      if (!place) return false;
      // Same rule as the locality route (catalog/resolver.ts): a municipality always has its page, an administrative region only with products.
      return place.type === "municipality" || catalog.cityFamilies(id).length > 0;
    },
    familyImage: (localityId, familyId) => {
      const url = catalog.cityFamilies(localityId).find((e) => e.family.id === familyId)?.primary.imageUrl;
      return url && url.startsWith("https://") ? url : null;
    },
  };
}

const warned = new Set<string>();
/** A hidden podium because of a missing/old snapshot is an operational problem: say so in the server log, once per region and snapshot. */
function logIfHidden(region: RegionSlug): void {
  const snapshot = readLatestSnapshot(region);
  const fresh = freshnessOf(snapshot, readRunState(region), new Date());
  if (fresh.visible) return;
  const key = `${region}:${fresh.reason}:${snapshot?.computedAt ?? "none"}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[podio] ${region}: hidden (${fresh.reason === "missing" ? "no snapshot yet" : `snapshot from ${snapshot?.computedAt} is older than 72 h`})`);
}

/** The state page's podium. Null = render nothing (switched off, no snapshot, stale, or no eligible sales in this UF). */
export function getStatePodium(region: RegionSlug, uf: string): PublicPodium | null {
  if (!podioEnabled(region)) return null;
  logIfHidden(region);
  return projectPodium(readLatestSnapshot(region), readRunState(region), region, uf, catalogView(), new Date());
}

/** The home teaser's leaders — same snapshot, same projection as the state page. `doc`: the document being rendered (a draft, in the admin preview); omitted = the published one. */
export function getPodiumLeaders(region: RegionSlug, ufs: readonly string[], doc?: ScopeDoc): PodiumLeader[] {
  if (!podioEnabled(region, doc)) return [];
  logIfHidden(region);
  return projectLeaders(readLatestSnapshot(region), readRunState(region), region, ufs, catalogView(), new Date());
}

const cumulativeCache = new WeakMap<StoreProducts, Record<string, number> | null>();
function cumulativeOf(store: StoreProducts): Record<string, number> | null {
  if (!cumulativeCache.has(store)) cumulativeCache.set(store, cumulativeUnits([store]));
  return cumulativeCache.get(store)!;
}

/**
 * Units sold per product, for the collection pages' "Mais vendidas" sort. The pódio's fresh 30-day count when there is one; otherwise (the pódio
 * never ran, is switched off and its last file aged out, or the run is older than 72 h) INK's cumulative sales of the catalog, so the sort does not
 * depend on the pódio being on. Null only when neither exists: the sort is then not offered.
 */
export function productSalesUnits(region: RegionSlug): Readonly<Record<string, number>> | null {
  const fresh = freshUnits(readProductSales(region), region, new Date());
  if (fresh) return fresh;
  const catalog = getCatalog();
  const perStore = storesServing(region).map((store) => cumulativeOf(catalog.productsOfStore(store))).filter((u): u is Record<string, number> => u !== null);
  // Lower-priority stores first, so the store the region sells from wins for an id present in two.
  if (perStore.length <= 1) return perStore[0] ?? null;
  return Object.assign({}, ...perStore.reverse());
}
