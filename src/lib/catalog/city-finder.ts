import "server-only";
import { SOURCES } from "../analytics/sources";
import { localitiesOfRegion, localitySubtitle } from "../geo/localities";
import { STATE_NAMES, type RegionSlug } from "../geo/regions";
import type { FinderCity, FinderState } from "./city-finder-shared";
import { familyCardModel } from "./family-card";
import { getCatalog } from "./repository";
import { resolveCity } from "./resolver";

/** The states of the launched `regions` with places that have designs, the regions in the order given, states by name; real counts only. */
export function finderStates(regions: readonly RegionSlug[]): FinderState[] {
  return regions.flatMap((region) => {
    const covered = getCatalog().coveredLocalityIds(region);
    const count = new Map<string, number>();
    for (const place of localitiesOfRegion(region)) if (covered.has(place.id)) count.set(place.uf, (count.get(place.uf) ?? 0) + 1);
    return [...count]
      .map(([uf, places]): FinderState => ({ uf, name: STATE_NAMES[uf] ?? uf, region, places }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  });
}

/**
 * One place of `region` with its designs as the cards of its own page (classic piece; a card opens the product in the store, or the design's page
 * when the design has versions), measured as `minha_cidade`. Null = no such place in the region.
 */
export function finderCity(region: RegionSlug, uf: string, slug: string): FinderCity | null {
  const resolved = resolveCity(region, uf.toUpperCase(), slug);
  if (!resolved) return null;
  const { city, families } = resolved;
  const page = `/${region}/${city.uf.toLowerCase()}/${city.slug}`;
  return {
    v: 1,
    place: { name: city.name, uf: city.uf, slug: city.slug, subtitle: localitySubtitle(city), page },
    cards: families.map((entry) =>
      familyCardModel(entry, { href: `${page}/${entry.family.id}`, cityName: city.name, stateUf: city.uf, sourceSection: SOURCES.minhaCidade, directToInk: true }),
    ),
  };
}
