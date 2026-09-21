import "server-only";
import { cityBySlug, type City } from "../geo/cities";
import { REGIONS, STATE_NAMES, isRegionSlug, type Region } from "../geo/regions";
import { purchaseUrl } from "./commerce";
import { familyById, type DesignFamily } from "./families";
import { getCatalog, type CityFamilyEntry } from "./repository";
import type { CityDesignBinding } from "./types";

export type ResolvedCity = {
  city: City;
  region: Region;
  stateName: string;
  families: CityFamilyEntry[];
  localities: CityDesignBinding[];
};

export type ResolvedCityProduct = {
  city: City;
  region: Region;
  stateName: string;
  family: DesignFamily;
  primary: CityDesignBinding;
  variants: CityDesignBinding[];
  /** Verified purchase link, or null when INK returned an unusable URL (CTA must be disabled). */
  purchaseUrl: string | null;
};

/** URL params → municipality. Never trusts params: region, UF and slug must all agree. */
export function findCity(regionSlug: string, uf: string, citySlug: string): City | null {
  if (!isRegionSlug(regionSlug)) return null;
  const city = cityBySlug(uf, citySlug);
  return city && city.regionSlug === regionSlug ? city : null;
}

/** Everything a city page needs: only the families that really exist for the city. */
export function resolveCity(regionSlug: string, uf: string, citySlug: string): ResolvedCity | null {
  const city = findCity(regionSlug, uf, citySlug);
  if (!city) return null;
  const catalog = getCatalog();
  return {
    city,
    region: REGIONS[city.regionSlug],
    stateName: STATE_NAMES[city.uf],
    families: catalog.cityFamilies(city.id),
    localities: catalog.cityLocalities(city.id),
  };
}

/** region + state + city + designFamily → the real INK product, its variants and its buy link. */
export function resolveCityProduct(
  regionSlug: string,
  uf: string,
  citySlug: string,
  familySlug: string,
): ResolvedCityProduct | null {
  const family = familyById(familySlug);
  const resolved = resolveCity(regionSlug, uf, citySlug);
  if (!family || !resolved) return null;

  const entry = resolved.families.find((e) => e.family.id === family.id);
  if (!entry) return null;

  return {
    city: resolved.city,
    region: resolved.region,
    stateName: resolved.stateName,
    family,
    primary: entry.primary,
    variants: entry.variants,
    purchaseUrl: purchaseUrl(entry.primary),
  };
}
