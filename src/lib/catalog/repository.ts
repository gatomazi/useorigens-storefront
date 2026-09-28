import "server-only";
import { commerceStorePriorityOverride } from "../config/env";
import { allCities, cityById, type City } from "../geo/cities";
import { localityById } from "../geo/localities";
import { REGIONS, REGION_SLUGS, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { buildLore, type Lore } from "../editorial/lore";
import { DESIGN_FAMILIES, type DesignFamily, type DesignFamilyId } from "./families";
import { isSubLocality, localityKeyOf, withLocality } from "./locality-binding";
import { compareIds, rankBindings } from "./ranking";
import { readSnapshotSync, snapshotMtimeMs } from "./snapshot-file";
import type { CityDesignBinding, MerchProduct, UnrankedBinding } from "./types";

export type CityFamilyEntry = {
  family: DesignFamily;
  /** The one product that represents this family for the city. Chosen deterministically. */
  primary: CityDesignBinding;
  /** Other real products of the same family for the same municipality (regional, custom...). */
  variants: CityDesignBinding[];
};

export type Catalog = {
  syncedAt: string | null;
  /** Ordered families available for a locality (a municipality id or an administrative region's locality id). Empty when nothing is indexed. */
  cityFamilies(localityId: string): CityFamilyEntry[];
  /** Products about places INSIDE the municipality ("Lugares de Torres"). Never a Federal District administrative region: those are localities of their own. */
  cityLocalities(cityId: string): CityDesignBinding[];
  merch(region: RegionSlug): MerchProduct[];
  /** Real local-voice products (expressions, patron saints, state expressions) of a region. */
  lore(region: RegionSlug): Lore;
  /** Municipalities with at least one family, per region. Administrative regions are NOT cities and are never in here. */
  coveredCityIds(region: RegionSlug): Set<string>;
  /** Every locality with at least one family: municipalities AND administrative regions with real products. */
  coveredLocalityIds(region: RegionSlug): Set<string>;
  /** Every real product bound to the locality, variants included (0 when it has none). */
  localityProductCount(localityId: string): number;
  /** Every product of ONE store's snapshot, by INK product id (merch and city designs). Used to resolve INK collection members. */
  productsOfStore(store: CommerceStoreKey): StoreProducts;
};

export type StoreProducts = { merch: ReadonlyMap<string, MerchProduct>; cityDesigns: ReadonlyMap<string, UnrankedBinding> };

/**
 * `regional` (default): a region's own INK store wins, matching how commerce runs today.
 * A comma list (e.g. `use-origens,use-sul`) overrides it globally once stores are consolidated.
 */
function storeOrderFor(region: RegionSlug): CommerceStoreKey[] {
  const override = commerceStorePriorityOverride();
  if (override) return override;
  const own = REGIONS[region].storeKey;
  const others = (Object.values(REGIONS).map((r) => r.storeKey) as CommerceStoreKey[]).filter((k) => k !== own);
  return [own, ...others];
}

let cache: { mtimeMs: number; catalog: Catalog } | null = null;

function build(): { catalog: Catalog; mtimeMs: number } {
  const { snapshot, mtimeMs } = readSnapshotSync();
  const stores = Object.values(snapshot.stores);

  const byRegion = new Map<RegionSlug, UnrankedBinding[]>();
  const merchByRegion = new Map<RegionSlug, MerchProduct[]>();
  for (const store of stores) {
    for (const binding of store.bindings) {
      const region = cityById(binding.cityId)?.regionSlug;
      if (!region) continue;
      const list = byRegion.get(region) ?? [];
      list.push(binding);
      byRegion.set(region, list);
    }
    for (const item of store.merch) {
      const list = merchByRegion.get(item.regionSlug) ?? [];
      list.push(item);
      merchByRegion.set(item.regionSlug, list);
    }
  }

  // Keyed by locality: a municipality id, or an administrative region's own id (its products never mix with Brasília's).
  const ranked = new Map<string, CityDesignBinding[]>();
  for (const region of REGION_SLUGS) {
    for (const binding of rankBindings(byRegion.get(region) ?? [], storeOrderFor(region))) {
      const key = localityKeyOf(binding);
      const list = ranked.get(key) ?? [];
      list.push(binding);
      ranked.set(key, list);
    }
  }

  const familyOrder = new Map<DesignFamilyId, DesignFamily>(DESIGN_FAMILIES.map((f) => [f.id, f]));
  const coveredCities = new Map<RegionSlug, Set<string>>();
  const coveredLocalities = new Map<RegionSlug, Set<string>>();

  const cityFamilies = (localityId: string): CityFamilyEntry[] => {
    const all = ranked.get(localityId) ?? [];
    const entries: CityFamilyEntry[] = [];
    for (const family of DESIGN_FAMILIES) {
      const ofFamily = all.filter((b) => b.designFamily === family.id && !isSubLocality(b));
      const primary = ofFamily.find((b) => b.isPrimary);
      if (!primary) continue;
      entries.push({ family: familyOrder.get(family.id)!, primary, variants: ofFamily.filter((b) => !b.isPrimary) });
    }
    return entries;
  };

  for (const [key, list] of ranked) {
    if (!list.some((b) => b.isPrimary)) continue;
    const locality = localityById(key);
    if (!locality) continue;
    const into = locality.type === "municipality" ? [coveredCities, coveredLocalities] : [coveredLocalities];
    for (const target of into) {
      const set = target.get(locality.regionSlug) ?? new Set<string>();
      set.add(key);
      target.set(locality.regionSlug, set);
    }
  }

  const productsCache = new Map<CommerceStoreKey, StoreProducts>();
  const loreCache = new Map<RegionSlug, Lore>();
  const syncedTimes = stores.map((s) => s.syncedAt).sort();
  const catalog: Catalog = {
    syncedAt: syncedTimes.at(-1) ?? null,
    cityFamilies,
    cityLocalities: (cityId) => (ranked.get(cityId) ?? []).filter(isSubLocality),
    merch: (region) =>
      [...(merchByRegion.get(region) ?? [])].sort(
        (a, b) => b.totalSalesCount - a.totalSalesCount || compareIds(b.inkProductId, a.inkProductId),
      ),
    lore: (region) => {
      const cached = loreCache.get(region);
      if (cached) return cached;
      const built = buildLore(merchByRegion.get(region) ?? [], REGIONS[region].ufs);
      loreCache.set(region, built);
      return built;
    },
    coveredCityIds: (region) => coveredCities.get(region) ?? new Set(),
    coveredLocalityIds: (region) => coveredLocalities.get(region) ?? new Set(),
    localityProductCount: (localityId) => ranked.get(localityId)?.length ?? 0,
    productsOfStore: (store) => {
      const cached = productsCache.get(store);
      if (cached) return cached;
      const index = snapshot.stores[store];
      const built: StoreProducts = {
        merch: new Map((index?.merch ?? []).map((m) => [m.inkProductId, m])),
        // `withLocality`: an older snapshot carries a DF administrative region only as `localityLabel`; the id is derived here, once.
        cityDesigns: new Map((index?.bindings ?? []).map((b) => [b.inkProductId, withLocality(b)])),
      };
      productsCache.set(store, built);
      return built;
    },
  };
  return { catalog, mtimeMs };
}

/** Cached per process; rebuilt only when the snapshot file changes (a stat per call is cheap). */
export function getCatalog(): Catalog {
  const mtimeMs = snapshotMtimeMs();
  if (cache && cache.mtimeMs === mtimeMs) return cache.catalog;
  const built = build();
  cache = { mtimeMs: built.mtimeMs, catalog: built.catalog };
  return built.catalog;
}

export function citiesOfState(uf: string): City[] {
  return allCities().filter((c) => c.uf === uf.toUpperCase());
}
