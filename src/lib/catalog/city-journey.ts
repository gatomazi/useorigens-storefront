import "server-only";
import { localityBySlug, localitySubtitle } from "../geo/localities";
import type { RegionSlug } from "../geo/regions";
import { SHOWCASE } from "../site";
import { purchaseUrl } from "./commerce";
import type { DesignFamilyId } from "./families";
import { CLASSIC_GARMENT_TYPE_ID, garmentTypeById } from "./garments";
import { getCatalog, type CityFamilyEntry, type GarmentTabsForCity } from "./repository";
import { resolveCity } from "./resolver";
import type { CityDesignBinding } from "./types";

/**
 * The data of the "Sua cidade" journey (src/components/city-journey/CityJourney.tsx): one place, its designs ("modelos") in the store's family
 * order and, for each design, the real pieces it is sold as: the classic tee first, then the garment types of the city page's piece tabs, in
 * the same order. Built from what the city page already renders from (catalog snapshot + garment index), so the journey never offers a
 * product, a piece or a price the city page would not show. Every piece has a verified INK purchase URL and a real price; a design left
 * without any piece is not offered at all.
 *
 * A design with versions (regional, personalizada…: `versions`) is offered by its primary product, the one the city page shows as the card;
 * the versions stay on the design's own page (`page`), which the journey links to.
 */
export type JourneyPiece = {
  /** INK's `product_type.id` (src/lib/catalog/garments.ts); the classic tee is 1. */
  garmentTypeId: number;
  slug: string;
  label: string;
  productId: string;
  image: string;
  price: number;
  /** INK's regular price, only while a promotion is on. */
  listPrice?: number;
  /** The INK product page (verified host). */
  href: string;
};
export type JourneyModel = { familyId: DesignFamilyId; name: string; description: string; pieces: JourneyPiece[]; versions: number; page: string };
export type JourneyPlace = { name: string; uf: string; slug: string; kind: "city" | "ra"; subtitle: string; page: string };
export type CityJourneyData = { v: 1; region: RegionSlug; place: JourneyPlace; models: JourneyModel[] };

/** One piece of a design, or null without a verified purchase URL, a known garment type or a real price (never a piece without a destination). */
export function journeyPiece(binding: CityDesignBinding, garmentTypeId: number): JourneyPiece | null {
  const href = purchaseUrl(binding);
  const type = garmentTypeById(garmentTypeId);
  if (!href || !type || typeof binding.price !== "number" || binding.price <= 0) return null;
  return {
    garmentTypeId,
    slug: type.slug,
    label: type.label,
    productId: binding.inkProductId,
    image: binding.imageUrl,
    price: binding.price,
    ...(binding.listPrice !== undefined ? { listPrice: binding.listPrice } : {}),
    href,
  };
}

/** The place's designs as the journey offers them: family order, each with its pieces (classic first, then the tabs' order). */
export function journeyModels(families: readonly CityFamilyEntry[], garment: GarmentTabsForCity, placePage: string): JourneyModel[] {
  const otherTabs = garment.tabs.filter((tab) => tab.id !== CLASSIC_GARMENT_TYPE_ID);
  return families.flatMap((entry) => {
    const pieces = [
      journeyPiece(entry.primary, CLASSIC_GARMENT_TYPE_ID),
      ...otherTabs.map((tab) => {
        const sibling = garment.entriesByGarment[tab.id]?.find((e) => e.family.id === entry.family.id);
        return sibling ? journeyPiece(sibling.primary, tab.id) : null;
      }),
    ].filter((piece): piece is JourneyPiece => piece !== null);
    if (pieces.length === 0) return [];
    return [{ familyId: entry.family.id, name: entry.family.name, description: entry.family.description, pieces, versions: entry.variants.length, page: `${placePage}/${entry.family.id}` }];
  });
}

export type JourneyPick = { name: string; uf: string; slug: string };

/**
 * Shortcuts under the journey's field ("Em destaque"): the region's curated showcase (src/lib/site.ts, capitals first), only places that have
 * designs right now. None when the region's showcase has fewer than three such places: a lone chip reads as a mistake, not as a choice.
 */
export function journeyPicks(region: RegionSlug, limit = 8): JourneyPick[] {
  const covered = getCatalog().coveredLocalityIds(region);
  const picks: JourneyPick[] = [];
  for (const [uf, slug] of [...SHOWCASE[region].wall, SHOWCASE[region].hero]) {
    const place = localityBySlug(uf, slug);
    if (!place || place.regionSlug !== region || !covered.has(place.id) || picks.some((p) => p.uf === place.uf && p.slug === place.slug)) continue;
    picks.push({ name: place.name, uf: place.uf, slug: place.slug });
    if (picks.length >= limit) break;
  }
  return picks.length >= 3 ? picks : [];
}

/** Everything the journey needs about one place of `region`. Null = no such place in the region (the route answers 404). */
export function cityJourney(region: RegionSlug, uf: string, slug: string): CityJourneyData | null {
  const resolved = resolveCity(region, uf.toUpperCase(), slug);
  if (!resolved) return null;
  const { city } = resolved;
  const page = `/${region}/${city.uf.toLowerCase()}/${city.slug}`;
  return {
    v: 1,
    region,
    place: { name: city.name, uf: city.uf, slug: city.slug, kind: city.type === "administrative_region" ? "ra" : "city", subtitle: localitySubtitle(city), page },
    models: journeyModels(resolved.families, getCatalog().garmentTabsForCity(city.id), page),
  };
}
