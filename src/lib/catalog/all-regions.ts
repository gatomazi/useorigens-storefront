import "server-only";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import { REGION_SLUGS, type CommerceStoreKey } from "../geo/regions";
import { homeBundle, siteConfigHomeEnabled } from "../site-config/flag";
import { PAGE_SLUG, RESERVED_SLUGS, type CollectionRef } from "../site-config/schema";
import { collectionPageLookup } from "./collection-source";
import { completeMembers, type CollectionsSnapshot } from "./collections";
import { getCollections } from "./collections-file";
import { storeForRegion } from "./commerce-mode";
import { getCatalog, type StoreProducts } from "./repository";

export const ALL_REGIONS_PATH = "/regioes";
export const ALL_REGIONS_PAGE_SIZE = 24;
export const allRegionsCollectionHref = (slug: string, page = 1): string => `${ALL_REGIONS_PATH}/colecoes/${slug}${page > 1 ? `/${page}` : ""}`;

export type AllRegionsCollection = { slug: string; name: string; href: string; position: number; items: CarouselItem[]; total: number; featured: boolean };

/** Public, complete collections of the selling stores. No geographic filter, regional arrangement or regional URL is applied here. */
export function buildAllRegionsCatalog(input: {
  stores: readonly CommerceStoreKey[];
  collections: CollectionsSnapshot;
  productsOf: (store: CommerceStoreKey) => StoreProducts;
  featured?: readonly CollectionRef[];
  filePath?: string;
}) {
  const groups = new Map<string, AllRegionsCollection>();
  const seen = new Map<string, Set<string>>();
  // The lookup already knows how to validate purchase URLs and render real product cards. Omitting its region is deliberate.
  const lookup = collectionPageLookup(input.productsOf, () => new Set(), input.filePath);
  for (const store of new Set(input.stores)) {
    for (const record of input.collections.stores[store]?.collections ?? []) {
      if (!record.isAvailable || record.needsResync || !completeMembers(record) || !PAGE_SLUG.test(record.slug) || record.slug.length > 60 || RESERVED_SLUGS.includes(record.slug)) continue;
      const found = lookup({ kind: "ink-category", store, collectionId: record.id, order: "category", limit: Number.MAX_SAFE_INTEGER }, 1);
      if (found.status !== "ok") continue;
      const group = groups.get(record.slug) ?? { slug: record.slug, name: record.name.trim(), href: allRegionsCollectionHref(record.slug), position: record.position, items: [], total: 0, featured: false };
      const ids = seen.get(record.slug) ?? new Set<string>();
      for (const item of found.items) {
        const key = `${store}:${item.id}`;
        if (!ids.has(key)) { ids.add(key); group.items.push({ ...item, key }); }
      }
      group.total = group.items.length;
      group.position = Math.min(group.position, record.position);
      group.featured ||= input.featured?.some((ref) => ref.store === store && ref.collectionId === record.id) ?? false;
      seen.set(record.slug, ids);
      groups.set(record.slug, group);
    }
  }
  const collections = [...groups.values()].filter((c) => c.total > 0).sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug, "pt-BR"));
  const featured = collections.filter((c) => c.featured);
  return { collections, featured: (featured.length ? featured : collections).slice(0, 6), find: (slug: string) => groups.get(slug) ?? null };
}

let cache: { catalog: ReturnType<typeof getCatalog>; collections: CollectionsSnapshot; bundle: ReturnType<typeof homeBundle> | null; stores: string; value: ReturnType<typeof buildAllRegionsCatalog> } | null = null;

/** The same mtime-cached snapshots as regional storefronts, never an INK call or an inferred visitor region. */
export function allRegionsCatalog() {
  const catalog = getCatalog();
  const collections = getCollections();
  const bundle = siteConfigHomeEnabled() ? homeBundle() : null;
  const stores = [...new Set(REGION_SLUGS.map(storeForRegion))];
  const key = stores.join(",");
  if (cache?.catalog === catalog && cache.collections === collections && cache.bundle === bundle && cache.stores === key) return cache.value;
  const featured = REGION_SLUGS.flatMap((r) => (bundle?.docs[r]?.home?.sections ?? []).flatMap((s) => s.active && s.source?.kind === "ink-category" ? [{ store: s.source.store, collectionId: s.source.collectionId }] : []));
  const value = buildAllRegionsCatalog({ stores, collections, productsOf: (store) => catalog.productsOfStore(store), featured });
  cache = { catalog, collections, bundle, stores: key, value };
  return value;
}
