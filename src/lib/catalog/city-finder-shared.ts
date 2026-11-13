import type { RegionSlug } from "../geo/regions";
import type { FamilyCardModel } from "./family-card";

/**
 * The data of "Quero minha cidade" (src/components/city-finder/CityFinder.tsx), safe for the browser: the states with how many places have designs
 * there, and, for the place chosen, the same design cards its own page shows (src/lib/catalog/city-finder.ts builds both from the catalog).
 */

/** A state of a launched region with at least one place with designs. */
export type FinderState = { uf: string; name: string; region: RegionSlug; places: number };
/** One place's designs, as its page's cards (classic piece, straight to the store, the same rules: src/lib/catalog/family-card.ts). */
export type FinderCity = {
  v: 1;
  place: { name: string; uf: string; slug: string; subtitle: string; page: string };
  cards: FamilyCardModel[];
};

/** The page of "Quero minha cidade" in a region. */
export const minhaCidadeHref = (region: RegionSlug): string => `/${region}/minha-cidade`;
