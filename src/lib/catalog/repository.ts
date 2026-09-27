import "server-only";
import { commerceStorePriorityOverride } from "../config/env";
import { allCities, cityById, type City } from "../geo/cities";
import { REGIONS, REGION_SLUGS, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { buildLore, type Lore } from "../editorial/lore";
import { DESIGN_FAMILIES, type DesignFamily, type DesignFamilyId } from "./families";
import { CLASSIC_GARMENT_TYPE_ID, GARMENT_TYPES } from "./garments";
import { compareIds, rankBindings } from "./ranking";
import { readSnapshotSync, snapshotMtimeMs } from "./snapshot-file";
import type { CityDesignBinding, GarmentBinding, MerchProduct, UnrankedBinding } from "./types";

export type CityFamilyEntry = {
  family: DesignFamily;
  /** The one product that represents this family for the city. Chosen deterministically. */
  primary: CityDesignBinding;
  /** Other real products of the same family for the same municipality (regional, custom...). */
  variants: CityDesignBinding[];
};

export type GarmentTabOption = { id: number; slug: string; label: string; count: number };

export type GarmentTabsForCity = {
  /** Empty when the city has no real garment-type data beyond the classic piece — the caller hides the
   * selector entirely (MD §1: "avaliar esconder o seletor de uma opção"), never rendering a single-tab bar. */
  tabs: GarmentTabOption[];
  /** Keyed by `GarmentTabOption.id`. Each entry array is shaped exactly like `cityFamilies()`'s output so the
   * existing `FamilyGrid`/`FamilyCard` render it with zero changes — a family missing this exact piece is
   * simply absent from the array (MD Caso C: never a fabricated card). */
  entriesByGarment: Record<number, CityFamilyEntry[]>;
};

export type Catalog = {
  syncedAt: string | null;
  /** Ordered families available for a city. Empty when nothing is indexed. */
  cityFamilies(cityId: string): CityFamilyEntry[];
  /** Products about localities inside the municipality ("Também de Torres"). */
  cityLocalities(cityId: string): CityDesignBinding[];
  /** Real, hidden-but-sellable garment-type siblings of this city's families (src/lib/catalog/garments.ts). */
  garmentTabsForCity(cityId: string): GarmentTabsForCity;
  merch(region: RegionSlug): MerchProduct[];
  /** Real local-voice products (expressions, patron saints, state expressions) of a region. */
  lore(region: RegionSlug): Lore;
  /** Number of cities with at least one family, per region. */
  coveredCityIds(region: RegionSlug): Set<string>;
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
  const garmentByCity = new Map<string, GarmentBinding[]>();
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
    // Additive, never merged into `bindings`/`byRegion` above — the city search index and `cityFamilies`
    // stay built exclusively from canonical bindings (MD §2's three-way separation).
    for (const garment of store.garmentBindings ?? []) {
      const list = garmentByCity.get(garment.cityId) ?? [];
      list.push(garment);
      garmentByCity.set(garment.cityId, list);
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

  const garmentTypesByOrder = [...GARMENT_TYPES].filter((t) => t.id !== CLASSIC_GARMENT_TYPE_ID).sort((a, b) => a.sortOrder - b.sortOrder);

  const garmentTabsForCity = (cityId: string): GarmentTabsForCity => {
    const classicEntries = cityFamilies(cityId);
    const bindings = garmentByCity.get(cityId) ?? [];
    if (classicEntries.length === 0 || bindings.length === 0) return { tabs: [], entriesByGarment: {} };

    const byType = new Map<number, Map<DesignFamilyId, GarmentBinding>>();
    for (const b of bindings) {
      const perFamily = byType.get(b.garmentTypeId) ?? new Map<DesignFamilyId, GarmentBinding>();
      perFamily.set(b.designFamily, b);
      byType.set(b.garmentTypeId, perFamily);
    }

    const entriesByGarment: Record<number, CityFamilyEntry[]> = { [CLASSIC_GARMENT_TYPE_ID]: classicEntries };
    const tabs: GarmentTabOption[] = [{ id: CLASSIC_GARMENT_TYPE_ID, slug: "classica", label: "Camiseta clássica", count: classicEntries.length }];

    for (const type of garmentTypesByOrder) {
      const perFamily = byType.get(type.id);
      if (!perFamily) continue;
      const entries: CityFamilyEntry[] = [];
      for (const classicEntry of classicEntries) {
        const garment = perFamily.get(classicEntry.family.id);
        if (!garment) continue; // MD Caso C: this family simply has no card on this tab, never a fabricated one
        // Stale-link guard (spec §6, next round: "não exibir peça obsoleta quando um cluster principal sair
        // do catálogo"): a `garmentBinding` is only trustworthy while it still points at the SAME cluster as
        // the family's current canonical binding. A later main catalog sync can rotate a city+family onto a
        // different INK product (new cluster, or the cluster disappears entirely) without this round's
        // garment index having been re-run yet — trusting the old link then would show a piece from a design
        // this city+family no longer represents. Comparing the stored cluster ids catches that without any
        // extra I/O; a real re-sync (`garments:sync`) is still what actually refreshes the data.
        if (garment.productClusterId !== classicEntry.primary.productClusterId) continue;
        entries.push({
          family: classicEntry.family,
          primary: {
            cityId: garment.cityId,
            designFamily: garment.designFamily,
            designVariant: "garment",
            variantLabel: type.label,
            productClusterId: garment.productClusterId,
            isPrimary: true,
            priority: 0,
            commerceStoreKey: garment.commerceStoreKey,
            inkProductId: garment.inkProductId,
            slug: garment.slug,
            storeProductUrl: garment.storeProductUrl,
            imageUrl: garment.imageUrl,
            price: garment.price,
            syncedAt: garment.syncedAt,
          },
          variants: [],
        });
      }
      if (entries.length === 0) continue;
      entriesByGarment[type.id] = entries;
      tabs.push({ id: type.id, slug: type.slug, label: type.label, count: entries.length });
    }

    // Only the classic tab has real data: MD §1 says to hide a one-option selector rather than show it empty.
    if (tabs.length <= 1) return { tabs: [], entriesByGarment: {} };
    return { tabs, entriesByGarment };
  };

  const productsCache = new Map<CommerceStoreKey, StoreProducts>();
  const loreCache = new Map<RegionSlug, Lore>();
  const syncedTimes = stores.map((s) => s.syncedAt).sort();
  const catalog: Catalog = {
    syncedAt: syncedTimes.at(-1) ?? null,
    cityFamilies,
    garmentTabsForCity,
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
    productsOfStore: (store) => {
      const cached = productsCache.get(store);
      if (cached) return cached;
      const index = snapshot.stores[store];
      const built: StoreProducts = {
        merch: new Map((index?.merch ?? []).map((m) => [m.inkProductId, m])),
        cityDesigns: new Map((index?.bindings ?? []).map((b) => [b.inkProductId, b])),
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
