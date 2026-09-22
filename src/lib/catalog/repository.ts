import "server-only";
import { commerceStorePriorityOverride } from "../config/env";
import { allCities, cityById, type City } from "../geo/cities";
import { REGIONS, REGION_SLUGS, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { buildLore, type Lore } from "../editorial/lore";
import { DESIGN_FAMILIES, type DesignFamily, type DesignFamilyId } from "./families";
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
  /** Ordered families available for a city. Empty when nothing is indexed. */
  cityFamilies(cityId: string): CityFamilyEntry[];
  /** Products about localities inside the municipality ("Também de Torres"). */
  cityLocalities(cityId: string): CityDesignBinding[];
  merch(region: RegionSlug): MerchProduct[];
  /** Real local-voice products (expressions, patron saints, state expressions) of a region. */
  lore(region: RegionSlug): Lore;
  /** Number of cities with at least one family, per region. */
  coveredCityIds(region: RegionSlug): Set<string>;
};

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

  const ranked = new Map<string, CityDesignBinding[]>();
  for (const region of REGION_SLUGS) {
    for (const binding of rankBindings(byRegion.get(region) ?? [], storeOrderFor(region))) {
      const list = ranked.get(binding.cityId) ?? [];
      list.push(binding);
      ranked.set(binding.cityId, list);
    }
  }

  const familyOrder = new Map<DesignFamilyId, DesignFamily>(DESIGN_FAMILIES.map((f) => [f.id, f]));
  const covered = new Map<RegionSlug, Set<string>>();

  const cityFamilies = (cityId: string): CityFamilyEntry[] => {
    const all = ranked.get(cityId) ?? [];
    const entries: CityFamilyEntry[] = [];
    for (const family of DESIGN_FAMILIES) {
      const ofFamily = all.filter((b) => b.designFamily === family.id && !b.localityLabel);
      const primary = ofFamily.find((b) => b.isPrimary);
      if (!primary) continue;
      entries.push({ family: familyOrder.get(family.id)!, primary, variants: ofFamily.filter((b) => !b.isPrimary) });
    }
    return entries;
  };

  for (const [cityId, list] of ranked) {
    if (!list.some((b) => b.isPrimary)) continue;
    const region = cityById(cityId)?.regionSlug;
    if (!region) continue;
    const set = covered.get(region) ?? new Set<string>();
    set.add(cityId);
    covered.set(region, set);
  }

  const loreCache = new Map<RegionSlug, Lore>();
  const syncedTimes = stores.map((s) => s.syncedAt).sort();
  const catalog: Catalog = {
    syncedAt: syncedTimes.at(-1) ?? null,
    cityFamilies,
    cityLocalities: (cityId) => (ranked.get(cityId) ?? []).filter((b) => b.localityLabel),
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
    coveredCityIds: (region) => covered.get(region) ?? new Set(),
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
