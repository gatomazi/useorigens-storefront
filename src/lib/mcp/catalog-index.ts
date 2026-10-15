import { familyById, variantLabel, type DesignFamilyId } from "../catalog/families";
import { expandTuple, type GarmentIndex } from "../catalog/garment-index-file";
import { garmentTypeById } from "../catalog/garments";
import { localityKeyOf, withLocality } from "../catalog/locality-binding";
import type { CatalogSnapshot, ExcludedProduct, ExclusionReason, UnrankedBinding } from "../catalog/types";
import { cityById } from "../geo/cities";
import { localityById } from "../geo/localities";
import { REGIONS, UF_TO_REGION, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { fold } from "./sales";

/**
 * The product side of the MCP, read from what the storefront already has on its Volume — the catalog snapshot (city designs and merch
 * visible on INK) and the garment index (the hidden-but-sellable garment siblings, linked by INK's cluster id). No second product sync and
 * no call to the public site. A product here is always one real INK product of one store (`store` + `product_id`); nothing is merged
 * across stores. Prices are INK's current ones as of the snapshot's sync.
 */
export type ProductEntry = {
  store: CommerceStoreKey;
  productId: string;
  kind: "city_design" | "garment_variant" | "merch";
  /** visible = listed on INK (`visible_in_store`); hidden_sellable = garment sibling sold by direct link only. */
  visibility: "visible" | "hidden_sellable";
  name: string;
  family: DesignFamilyId | null;
  familyName: string | null;
  designVariant: string | null;
  garmentType: string | null;
  uf: string | null;
  designRegion: RegionSlug | null;
  localityKey: string | null;
  localityName: string | null;
  priceCents: number | null;
  listPriceCents: number | null;
  url: string;
  imageUrl: string;
  clusterId: string | null;
  syncedAt: string;
  search: string;
};

export type ProductIndex = {
  entries: ProductEntry[];
  byKey: Map<string, ProductEntry>;
  stores: { store: CommerceStoreKey; syncedAt: string; productCount: number; cityDesigns: number; merch: number; garmentVariants: number; excluded: number; excludedByReason: Partial<Record<ExclusionReason, number>> }[];
  /** Products visible on INK that the indexer could not tie to a place/family (they are not on the site), per store, as the snapshot has them. */
  excluded: Map<CommerceStoreKey, ExcludedProduct[]>;
  garmentIndexPresent: boolean;
};

const cents = (n: number | null | undefined): number | null => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : null);

function designOf(b: UnrankedBinding) {
  const located = withLocality(b);
  const localityKey = localityKeyOf(located);
  const locality = localityById(localityKey) ?? cityById(located.cityId);
  const uf = locality?.uf ?? null;
  const family = familyById(located.designFamily);
  return { localityKey, localityName: locality?.name ?? null, uf, designRegion: uf ? (UF_TO_REGION[uf] ?? null) : null, family: located.designFamily, familyName: family?.name ?? located.designFamily };
}

export function buildProductIndex(snapshot: CatalogSnapshot, garments: GarmentIndex | null): ProductIndex {
  const entries: ProductEntry[] = [];
  const stores: ProductIndex["stores"] = [];
  const excluded = new Map<CommerceStoreKey, ExcludedProduct[]>();
  for (const [store, index] of Object.entries(snapshot.stores) as [CommerceStoreKey, CatalogSnapshot["stores"][CommerceStoreKey]][]) {
    if (!index) continue;
    const byCluster = new Map<string, UnrankedBinding>();
    for (const b of index.bindings) {
      const d = designOf(b);
      const variant = b.designVariant === "base" ? "" : ` · ${b.variantLabel ?? variantLabel(b.designVariant)}`;
      const place = b.localityLabel && !b.localityId ? `${b.localityLabel}, ${d.localityName ?? ""}` : (d.localityName ?? b.cityId);
      const name = `${d.familyName} · ${place}${d.uf ? ` (${d.uf})` : ""}${variant}`;
      entries.push({ store, productId: b.inkProductId, kind: "city_design", visibility: "visible", name, family: d.family, familyName: d.familyName, designVariant: b.designVariant, garmentType: "Camiseta clássica", uf: d.uf, designRegion: d.designRegion, localityKey: d.localityKey, localityName: d.localityName, priceCents: cents(b.price), listPriceCents: cents(b.listPrice), url: b.storeProductUrl, imageUrl: b.imageUrl, clusterId: b.productClusterId ?? null, syncedAt: b.syncedAt, search: fold(`${name} ${b.localityLabel ?? ""} ${b.slug}`) });
      if (b.productClusterId && (!byCluster.has(b.productClusterId) || b.designVariant === "base")) byCluster.set(b.productClusterId, b);
    }
    let garmentVariants = 0;
    for (const [clusterId, tuples] of Object.entries(garments?.stores[store]?.clusters ?? {})) {
      const parent = byCluster.get(clusterId);
      if (!parent) continue;
      const d = designOf(parent);
      for (const tuple of tuples) {
        const piece = expandTuple(store, tuple);
        if (!piece) continue;
        const type = garmentTypeById(piece.garmentTypeId)?.label ?? `Peça ${piece.garmentTypeId}`;
        const name = `${d.familyName} · ${d.localityName ?? parent.cityId}${d.uf ? ` (${d.uf})` : ""} · ${type}`;
        garmentVariants++;
        entries.push({ store, productId: piece.inkProductId, kind: "garment_variant", visibility: "hidden_sellable", name, family: d.family, familyName: d.familyName, designVariant: parent.designVariant, garmentType: type, uf: d.uf, designRegion: d.designRegion, localityKey: d.localityKey, localityName: d.localityName, priceCents: cents(piece.price), listPriceCents: cents(piece.listPrice), url: piece.storeProductUrl, imageUrl: piece.imageUrl, clusterId, syncedAt: garments?.stores[store]?.syncedAt ?? parent.syncedAt, search: fold(`${name} ${piece.slug}`) });
      }
    }
    for (const m of index.merch) {
      entries.push({ store, productId: m.inkProductId, kind: "merch", visibility: "visible", name: m.name, family: null, familyName: null, designVariant: null, garmentType: null, uf: null, designRegion: null, localityKey: null, localityName: null, priceCents: cents(m.price), listPriceCents: cents(m.listPrice), url: m.storeProductUrl, imageUrl: m.imageUrl, clusterId: m.productClusterId ?? null, syncedAt: m.syncedAt, search: fold(`${m.name} ${m.slug}`) });
    }
    const excludedByReason: Partial<Record<ExclusionReason, number>> = {};
    for (const e of index.excluded) excludedByReason[e.reason] = (excludedByReason[e.reason] ?? 0) + 1;
    excluded.set(store, index.excluded);
    stores.push({ store, syncedAt: index.syncedAt, productCount: index.productCount, cityDesigns: index.bindings.length, merch: index.merch.length, garmentVariants, excluded: index.excluded.length, excludedByReason });
  }
  const byKey = new Map(entries.map((e) => [`${e.store}:${e.productId}`, e]));
  return { entries, byKey, stores, excluded, garmentIndexPresent: Boolean(garments && Object.keys(garments.stores).length > 0) };
}

export type ProductFilters = {
  text?: string;
  store?: CommerceStoreKey;
  design_region?: RegionSlug;
  uf?: string;
  locality_id?: string;
  city?: string;
  family?: DesignFamilyId;
  kind?: ProductEntry["kind"];
  visibility?: ProductEntry["visibility"];
};

/** Deterministic order: city designs first, then garment variants, then merch; inside, by name, store, id. */
const KIND_ORDER = { city_design: 0, garment_variant: 1, merch: 2 } as const;

export function searchProducts(index: ProductIndex, f: ProductFilters): ProductEntry[] {
  const words = f.text ? fold(f.text).split(/\s+/).filter(Boolean) : [];
  const city = f.city ? fold(f.city) : null;
  return index.entries
    .filter((e) => (!f.store || e.store === f.store) && (!f.design_region || e.designRegion === f.design_region) && (!f.uf || e.uf === f.uf))
    .filter((e) => (!f.locality_id || e.localityKey === f.locality_id) && (!city || fold(e.localityName ?? "") === city) && (!f.family || e.family === f.family))
    .filter((e) => (!f.kind || e.kind === f.kind) && (!f.visibility || e.visibility === f.visibility))
    .filter((e) => words.every((w) => e.search.includes(w)))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, "pt-BR") || a.store.localeCompare(b.store) || a.productId.localeCompare(b.productId));
}

export const regionOfStoreKey = (store: CommerceStoreKey): RegionSlug | null => (Object.values(REGIONS).find((r) => r.storeKey === store)?.slug ?? null);
