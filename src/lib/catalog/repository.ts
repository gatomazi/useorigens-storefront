import "server-only";
import { commerceStorePriorityOverride } from "../config/env";
import { allCities, cityById, type City } from "../geo/cities";
import { REGIONS, REGION_SLUGS, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { buildLore, type Lore } from "../editorial/lore";
import { DESIGN_FAMILIES, type DesignFamily, type DesignFamilyId } from "./families";
import { CLASSIC_GARMENT_TYPE_ID, GARMENT_TYPES, garmentTypeById } from "./garments";
import { emptyGarmentIndex, expandTuple, garmentIndexMtimeMs, readGarmentIndexSync, type ExpandedPiece, type GarmentIndex } from "./garment-index-file";
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

/**
 * The garment-piece index has its own mtime-keyed cache, independent of the base snapshot's: a re-sync of
 * pieces never forces a catalog rebuild, and a missing/corrupt file is just an empty index (no tabs), so the
 * optional index can never take the storefront down.
 */
let garmentIndexCache: { mtimeMs: number; index: GarmentIndex } | null = null;

function getGarmentIndex(): GarmentIndex {
  const mtimeMs = garmentIndexMtimeMs();
  if (garmentIndexCache && garmentIndexCache.mtimeMs === mtimeMs) return garmentIndexCache.index;
  const { index } = mtimeMs === 0 ? { index: emptyGarmentIndex() } : readGarmentIndexSync();
  garmentIndexCache = { mtimeMs, index };
  return index;
}

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

  const garmentTypesByOrder = [...GARMENT_TYPES].filter((t) => t.id !== CLASSIC_GARMENT_TYPE_ID).sort((a, b) => a.sortOrder - b.sortOrder);

  const garmentTabsForCity = (cityId: string): GarmentTabsForCity => {
    const classicEntries = cityFamilies(cityId);
    if (classicEntries.length === 0) return { tabs: [], entriesByGarment: {} };
    const garmentIndex = getGarmentIndex();

    // Association is EXCLUSIVELY by the primary's own `product_cluster_id`, inside the primary's own store: a
    // primary without a cluster id has no pieces (fail closed), and a cluster the base catalog has since
    // rotated away from simply is not found here, so a stale piece can never be shown.
    const entriesByType = new Map<number, CityFamilyEntry[]>();
    for (const classicEntry of classicEntries) {
      const primary = classicEntry.primary;
      if (!primary.productClusterId) continue;
      const tuples = garmentIndex.stores[primary.commerceStoreKey]?.clusters[primary.productClusterId];
      if (!Array.isArray(tuples)) continue;

      // Two products of one cluster and type: deterministic tie-break, lowest INK id (same rule as `rankBindings`).
      const best = new Map<number, ExpandedPiece>();
      for (const tuple of tuples) {
        const piece = expandTuple(primary.commerceStoreKey, tuple);
        if (!piece || piece.garmentTypeId === CLASSIC_GARMENT_TYPE_ID || !garmentTypeById(piece.garmentTypeId)) continue;
        const current = best.get(piece.garmentTypeId);
        if (!current || compareIds(piece.inkProductId, current.inkProductId) < 0) best.set(piece.garmentTypeId, piece);
      }

      for (const [typeId, piece] of best) {
        const type = garmentTypeById(typeId)!;
        const list = entriesByType.get(typeId) ?? [];
        list.push({
          family: classicEntry.family,
          primary: {
            cityId: primary.cityId,
            designFamily: primary.designFamily,
            designVariant: "garment",
            variantLabel: type.label,
            productClusterId: primary.productClusterId,
            isPrimary: true,
            priority: 0,
            commerceStoreKey: primary.commerceStoreKey,
            inkProductId: piece.inkProductId,
            slug: piece.slug,
            storeProductUrl: piece.storeProductUrl,
            imageUrl: piece.imageUrl,
            price: piece.price,
            syncedAt: garmentIndex.stores[primary.commerceStoreKey]?.syncedAt ?? "",
          },
          variants: [],
        });
        entriesByType.set(typeId, list);
      }
    }

    const entriesByGarment: Record<number, CityFamilyEntry[]> = { [CLASSIC_GARMENT_TYPE_ID]: classicEntries };
    const tabs: GarmentTabOption[] = [{ id: CLASSIC_GARMENT_TYPE_ID, slug: "classica", label: "Camiseta clássica", count: classicEntries.length }];
    for (const type of garmentTypesByOrder) {
      const entries = entriesByType.get(type.id);
      if (!entries || entries.length === 0) continue; // MD Caso C: never a fabricated card or empty tab
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
