import { allAdministrativeRegions } from "./administrative-regions";
import { numberPt, pluralCidades } from "../format";
import { allCities, cityById, cityBySlug, mesoGroupsOfState, type Locality } from "./cities";
import type { RegionSlug } from "./regions";
import { normalizeText } from "./text";

/**
 * Where a product can live: a municipality (IBGE) OR an administrative region of the Federal District. `cities.ts` stays the
 * municipality-only index (counts of "cidades", IBGE coverage); everything that must also accept an administrative region — routes,
 * search, sections, sitemap — goes through here. Only the DF has administrative regions; every other state is municipalities only.
 */
const regions = allAdministrativeRegions();
const byId = new Map<string, Locality>(regions.map((r) => [r.id, r]));
const byUfSlug = new Map<string, Locality>(regions.map((r) => [`${r.uf}:${r.slug}`, r]));

export function localityById(id: string): Locality | undefined {
  return byId.get(id) ?? cityById(id);
}

/** `/[region]/[uf]/[slug]`: a municipality or an administrative region of that UF. */
export function localityBySlug(uf: string, slug: string): Locality | undefined {
  const key = `${uf.toUpperCase()}:${slug}`;
  return byUfSlug.get(key) ?? cityBySlug(uf, slug);
}

export function localitiesOfRegion(region: RegionSlug): Locality[] {
  return [...allCities().filter((c) => c.regionSlug === region), ...regions.filter((r) => r.regionSlug === region)];
}

export const isAdministrativeRegion = (locality: Pick<Locality, "type">): boolean => locality.type === "administrative_region";

/** "Cidade" / "Região Administrativa": what the interface calls the place. */
export function localityKindLabel(locality: Pick<Locality, "type">): string {
  return locality.type === "administrative_region" ? "Região Administrativa" : "Cidade";
}

/** The line under a locality's name that names its parent: "Distrito Federal · Região Administrativa" for an RA, else the state and the editorial mesoregion. */
export function localitySubtitle(locality: Locality): string {
  if (locality.type === "administrative_region") return `${locality.parentLabel} · ${localityKindLabel(locality)}`;
  return locality.meso ? `${locality.parentLabel} · ${locality.meso}` : locality.parentLabel;
}

export const compareLocalityNames = (a: Pick<Locality, "name">, b: Pick<Locality, "name">): number =>
  normalizeText(a.name).localeCompare(normalizeText(b.name));

// ── State-level copy and grouping (a state that has administrative regions is not "N cidades") ───────────────

const plural = (n: number, one: string, many: string): string => `${numberPt.format(n)} ${n === 1 ? one : many}`;
export const pluralRegioesAdministrativas = (n: number): string => plural(n, "Região Administrativa", "Regiões Administrativas");

export type StateLocalityCounts = { cities: number; administrativeRegions: number };

export function stateLocalityCounts(localities: readonly Pick<Locality, "type">[]): StateLocalityCounts {
  const administrativeRegions = localities.filter(isAdministrativeRegion).length;
  return { cities: localities.length - administrativeRegions, administrativeRegions };
}

/**
 * How a state counts its places. A state of municipalities keeps "N cidades"; the Federal District, whose places are Brasília plus its
 * administrative regions, says exactly that — a bare "N cidades" would call an RA a city.
 */
export function stateLocalityLabel(counts: StateLocalityCounts, capitalName = "Brasília"): string {
  if (counts.administrativeRegions === 0) return pluralCidades(counts.cities);
  const cities = counts.cities === 1 ? capitalName : pluralCidades(counts.cities);
  return counts.cities === 0 ? pluralRegioesAdministrativas(counts.administrativeRegions) : `${cities} e ${pluralRegioesAdministrativas(counts.administrativeRegions)}`;
}

/** The link that opens a state's places: "cidades" only when every place is a city. */
export function stateBrowseLabel(counts: StateLocalityCounts, stateName: string): string {
  return counts.administrativeRegions === 0 ? `Ver todas as cidades de ${stateName}` : `Ver as localidades de ${stateName}`;
}

export type LocalityGroup = { name: string; slug: string; localities: Locality[] };

/**
 * The groups a state page and the home's state cards navigate by. A state with administrative regions groups its municipality/ies and its
 * administrative regions apart (never one "cidades" list); every other state keeps the editorial mesoregion grouping (ADR 0004), unchanged.
 */
export function stateLocalityGroups(uf: string, localities: readonly Locality[]): LocalityGroup[] {
  const regionsHere = localities.filter(isAdministrativeRegion);
  const cities = localities.filter((l) => !isAdministrativeRegion(l));
  if (regionsHere.length === 0) {
    return mesoGroupsOfState(uf, new Set(cities.map((c) => c.id))).map((g) => ({ name: g.name, slug: g.slug, localities: g.cities }));
  }
  const groups: LocalityGroup[] = [];
  if (cities.length > 0) groups.push({ name: cities.length === 1 ? cities[0].name : "Cidades", slug: cities.length === 1 ? cities[0].slug : "cidades", localities: cities });
  groups.push({ name: "Regiões Administrativas", slug: "regioes-administrativas", localities: [...regionsHere].sort(compareLocalityNames) });
  return groups;
}
