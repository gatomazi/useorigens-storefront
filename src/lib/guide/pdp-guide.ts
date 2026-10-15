import "server-only";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import { collectionMenuEntries, type MenuEntry } from "../catalog/collection-menu";
import { categoryProps, collectionForPage } from "../catalog/collection-source";
import { findCollection } from "../catalog/collections-file";
import { purchaseUrl } from "../catalog/commerce";
import { localityOfBinding } from "../catalog/locality-binding";
import { getCatalog, type CityFamilyEntry } from "../catalog/repository";
import { resolveCity } from "../catalog/resolver";
import type { Locality } from "../geo/cities";
import { REGIONS, STATE_NAMES, type RegionSlug } from "../geo/regions";
import { SITE_URL } from "../site";
import { livePage } from "../site-config/pages";
import { readPublished } from "../site-config/published";
import type { ScopeDoc } from "../site-config/schema";

/**
 * Data of the guided help on the INK product page ("Procurando sua cidade ou outra estampa?"), served by `/api/guia/<region>` to the Worker that
 * draws the guide there. Everything comes from what the storefront already renders from — the synced catalog snapshot, the synced collections and
 * the PUBLISHED configuration — never from INK at request time and never from a hand-written list. Every item is a real INK product of the
 * region's own store with a verified purchase URL, a real photo and INK's current price; a city or collection without products is simply empty.
 */
export const GUIDE_CITY_ITEMS = 3;
export const GUIDE_COLLECTION_ITEMS = 4;
export const GUIDE_COLLECTIONS = 8;

export type GuideItem = {
  productId: string;
  title: string;
  /** "Florianópolis · SC" for a city design; absent for merchandise. */
  context?: string;
  image: string;
  price: number;
  listPrice?: number;
  /** The INK product page (same store the visitor is on). */
  href: string;
};
export type GuideCity = { name: string; uf: string; slug: string; kind: "city" | "ra"; url: string };
export type GuideCollection = { id: number; name: string; slug: string; url: string; image?: string; total: number };

const site = () => SITE_URL.replace(/\/$/, "");
const cityUrl = (region: RegionSlug, place: Locality) => `${site()}/${region}/${place.uf.toLowerCase()}/${place.slug}`;
const collectionUrlOf = (region: RegionSlug, slug: string) => `${site()}/${region}/colecoes/${slug}`;
const guideCityOf = (region: RegionSlug, place: Locality): GuideCity => ({ name: place.name, uf: place.uf, slug: place.slug, kind: place.type === "administrative_region" ? "ra" : "city", url: cityUrl(region, place) });

/** A city design as the guide shows it: the family is the name, the place the context. Null without a verified purchase URL or price. */
export function cityFamilyItem(entry: CityFamilyEntry, place: Pick<Locality, "name" | "uf">): GuideItem | null {
  const href = purchaseUrl(entry.primary);
  const price = entry.primary.price;
  if (!href || typeof price !== "number" || price <= 0) return null;
  return {
    productId: entry.primary.inkProductId,
    title: entry.family.name,
    context: `${place.name} · ${place.uf}`,
    image: entry.primary.imageUrl,
    price,
    ...(entry.primary.listPrice !== undefined ? { listPrice: entry.primary.listPrice } : {}),
    href,
  };
}

/** A collection card as the guide shows it. Null without a real price (the card shows none, so the guide never does). */
export function carouselGuideItem(item: CarouselItem): GuideItem | null {
  if (typeof item.rawPrice !== "number" || item.rawPrice <= 0) return null;
  const listPrice = item.listPrice ? Number(item.listPrice.replace(/[^\d,]/g, "").replace(",", ".")) : undefined;
  return {
    productId: item.id,
    title: item.name,
    ...(item.context ? { context: item.context } : {}),
    image: item.imageUrl,
    price: item.rawPrice,
    ...(listPrice && listPrice > item.rawPrice ? { listPrice } : {}),
    href: item.href,
  };
}

/** Up to `limit` designs of a place, in family order, never the product the visitor is already looking at. */
export function pickCityItems(entries: readonly CityFamilyEntry[], place: Pick<Locality, "name" | "uf">, excludeProductId: string | null, limit = GUIDE_CITY_ITEMS): GuideItem[] {
  const items: GuideItem[] = [];
  for (const entry of entries) {
    if (excludeProductId && entry.primary.inkProductId === excludeProductId) continue;
    const item = cityFamilyItem(entry, place);
    if (item) items.push(item);
    if (items.length >= limit) break;
  }
  return items;
}

/**
 * The collections the guide offers: the region's own menu (what the owner publishes for the site header), only those with a page of ours, in menu order,
 * minus the state collections ("PR", "Santa Catarina"): the guide's city search already covers states, and a two-letter name is not a label a visitor reads.
 */
export function pickMenuCollections(entries: readonly MenuEntry[], ufs: readonly string[], limit = GUIDE_COLLECTIONS): MenuEntry[] {
  const stateNames = new Set(ufs.flatMap((uf) => [uf, STATE_NAMES[uf] ?? ""]).map((s) => s.toLowerCase()));
  const seen = new Set<number>();
  const out: MenuEntry[] = [];
  for (const entry of entries) {
    const name = entry.record.name.replace(/\s+/g, " ").trim();
    if (!entry.pagePath || seen.has(entry.record.id) || stateNames.has(name.toLowerCase()) || entry.record.matchedCount < 1) continue;
    seen.add(entry.record.id);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

const publishedDoc = (region: RegionSlug): ScopeDoc | undefined => readPublished().bundle.docs[region];

/** The place the product on the INK page is about (a municipality or a DF administrative region), when it is a city design of the region's store. */
export function guideProductContext(region: RegionSlug, productId: string): { v: 1; region: RegionSlug; productId: string; city: GuideCity | null } {
  const binding = getCatalog().productsOfStore(REGIONS[region].storeKey).cityDesigns.get(productId);
  const place = binding ? localityOfBinding(binding) : undefined;
  const city = place && place.regionSlug === region && getCatalog().cityFamilies(place.id).length > 0 ? guideCityOf(region, place) : null;
  return { v: 1, region, productId, city };
}

/** The designs of a place for the guide's "city" step. Null = no such place in the region (the Worker answers "not found"). */
export function guideCity(region: RegionSlug, uf: string, slug: string, excludeProductId: string | null): { v: 1; region: RegionSlug; city: GuideCity; items: GuideItem[]; total: number } | null {
  const resolved = resolveCity(region, uf.toUpperCase(), slug);
  if (!resolved) return null;
  const items = pickCityItems(resolved.families, resolved.city, excludeProductId);
  return { v: 1, region, city: guideCityOf(region, resolved.city), items, total: resolved.families.filter((e) => purchaseUrl(e.primary)).length };
}

/** The collections the guide offers for "Ver outras estampas", each with a real photo (its first product as the region arranges it). */
export function guideCollections(region: RegionSlug): { v: 1; region: RegionSlug; collections: GuideCollection[] } {
  const doc = publishedDoc(region);
  const store = REGIONS[region].storeKey;
  const { top, more } = collectionMenuEntries(region, doc);
  const catalog = getCatalog();
  const { categories } = categoryProps((s) => catalog.productsOfStore(s), doc);
  const collections = pickMenuCollections([...top, ...more], REGIONS[region].ufs).map((entry) => {
    const first = categories({ kind: "ink-category", store, collectionId: entry.record.id, order: "category", limit: 1 });
    const image = first.status === "ok" ? first.items[0]?.imageUrl : undefined;
    return { id: entry.record.id, name: entry.record.name.replace(/\s+/g, " ").trim(), slug: entry.record.slug, url: collectionUrlOf(region, entry.record.slug), ...(image ? { image } : {}), total: entry.record.matchedCount };
  });
  return { v: 1, region, collections };
}

/** A few products of one collection (as the region arranges it) and the link to its full page. Null = the region has no such collection page. */
export function guideCollection(region: RegionSlug, slug: string): { v: 1; region: RegionSlug; collection: GuideCollection; items: GuideItem[]; total: number } | null {
  const doc = publishedDoc(region);
  const store = REGIONS[region].storeKey;
  // The collection behind the address: the region's own collection with that slug or, for a landing the owner published there, the collection of its grid.
  let record = collectionForPage(region, doc, slug);
  if (!record) {
    const landing = livePage(doc, "categoryLanding", slug);
    const grid = landing?.sections.find((s) => s.active && s.layout?.display === "paged");
    record = grid?.source?.kind === "ink-category" && grid.source.store === store ? findCollection(store, grid.source.collectionId) : null;
  }
  if (!record) return null;
  const catalog = getCatalog();
  const { categories } = categoryProps((s) => catalog.productsOfStore(s), doc);
  const found = categories({ kind: "ink-category", store, collectionId: record.id, order: "category", limit: GUIDE_COLLECTION_ITEMS });
  const items = found.status === "ok" ? found.items.map(carouselGuideItem).filter((i): i is GuideItem => i !== null) : [];
  const collection: GuideCollection = { id: record.id, name: record.name.replace(/\s+/g, " ").trim(), slug: record.slug, url: collectionUrlOf(region, slug), ...(items[0] ? { image: items[0].image } : {}), total: record.matchedCount };
  return { v: 1, region, collection, items, total: record.matchedCount };
}
