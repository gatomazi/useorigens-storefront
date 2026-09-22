import municipiosData from "../../../data/geo/municipios.json";
import { ALIASES } from "./aliases";
import { UF_TO_REGION, type RegionSlug } from "./regions";
import { normalizeText, slugify } from "./text";

/**
 * Two geographic facts live on every city, deliberately kept apart (ADR 0004):
 *
 * - `area`/`areaSlug`: the CURRENT administrative division (IBGE's Região Geográfica Intermediária, 2017).
 *   The true fact, not shown in the storefront's navigation right now, kept so it is never confused with the
 *   editorial grouping below and is ready if a future page needs the current official division.
 * - `meso`/`mesoSlug`: the EDITORIAL grouping the storefront actually navigates and writes copy with (the
 *   discontinued IBGE mesoregion — "Vale do Itajaí", "Grande Florianópolis"). It reads naturally to someone
 *   from the region; the storefront never claims it is the current official division.
 *
 * Both come from the same IBGE municipalities endpoint (scripts/build-geo.mts), deterministic per municipality,
 * never guessed or inferred from proximity.
 */
export type City = {
  /** IBGE municipality code, as a string. */
  id: string;
  slug: string;
  name: string;
  uf: string;
  regionSlug: RegionSlug;
  /** Current administrative fact (IBGE Região Geográfica Intermediária, 2017): "Região de Chapecó". Not used in navigation today. "" when IBGE has not placed the municipality yet. */
  area: string;
  areaSlug: string;
  /** Editorial navigation grouping (IBGE mesoregion): "Vale do Itajaí". "" on the one municipality IBGE has not placed yet (outside the Sul). */
  meso: string;
  mesoSlug: string;
  /** Deliberate, curated nicknames only (see aliases.ts). */
  aliases: readonly string[];
};

const rows = municipiosData as unknown as [number, string, string, string, string][];

const cities: City[] = rows.map(([id, name, uf, intermediate, meso]) => {
  const slug = slugify(name);
  const area = intermediate ? `Região de ${intermediate}` : "";
  return {
    id: String(id),
    slug,
    name,
    uf,
    regionSlug: UF_TO_REGION[uf],
    area,
    areaSlug: area ? slugify(area) : "",
    meso,
    mesoSlug: meso ? slugify(meso) : "",
    aliases: ALIASES[`${uf}:${slug}`] ?? [],
  };
});

const byId = new Map<string, City>();
const byUfSlug = new Map<string, City>();
const byName = new Map<string, City[]>();

for (const city of cities) {
  byId.set(city.id, city);
  byUfSlug.set(`${city.uf}:${city.slug}`, city);
  const key = normalizeText(city.name);
  const list = byName.get(key);
  if (list) list.push(city);
  else byName.set(key, [city]);
}

export function allCities(): readonly City[] {
  return cities;
}

export function cityById(id: string): City | undefined {
  return byId.get(id);
}

export function cityBySlug(uf: string, slug: string): City | undefined {
  return byUfSlug.get(`${uf.toUpperCase()}:${slug}`);
}

/** Every municipality with this name (accent/case-insensitive) inside the allowed UFs. */
export function citiesByName(name: string, ufs: readonly string[]): City[] {
  const matches = byName.get(normalizeText(name)) ?? [];
  return matches.filter((c) => ufs.includes(c.uf));
}

export function citiesOfRegion(region: RegionSlug): City[] {
  return cities.filter((c) => c.regionSlug === region);
}

export type AreaGroup = { name: string; slug: string; cities: City[] };

/** Cities of a state grouped by the current IBGE intermediate region, groups ordered by size then name. Not used in navigation today (ADR 0004) — kept for a future page that needs the current official division. */
export function areaGroupsOfState(uf: string, only?: ReadonlySet<string>): AreaGroup[] {
  const groups = new Map<string, AreaGroup>();
  for (const city of cities) {
    if (city.uf !== uf.toUpperCase() || !city.area) continue;
    if (only && !only.has(city.id)) continue;
    const group = groups.get(city.areaSlug) ?? { name: city.area, slug: city.areaSlug, cities: [] };
    group.cities.push(city);
    groups.set(city.areaSlug, group);
  }
  return [...groups.values()].sort((a, b) => b.cities.length - a.cities.length || a.name.localeCompare(b.name, "pt-BR"));
}

/** Other cities of the same current IBGE intermediate region (empty when the city has none). */
export function citiesOfSameArea(city: City): City[] {
  if (!city.areaSlug) return [];
  return cities.filter((c) => c.uf === city.uf && c.areaSlug === city.areaSlug && c.id !== city.id);
}

export type MesoGroup = { name: string; slug: string; cities: City[] };

/** Cities of a state grouped by the editorial mesoregion, groups ordered by size then name. This is the grouping the storefront navigates by (ADR 0004). */
export function mesoGroupsOfState(uf: string, only?: ReadonlySet<string>): MesoGroup[] {
  const groups = new Map<string, MesoGroup>();
  for (const city of cities) {
    if (city.uf !== uf.toUpperCase() || !city.meso) continue;
    if (only && !only.has(city.id)) continue;
    const group = groups.get(city.mesoSlug) ?? { name: city.meso, slug: city.mesoSlug, cities: [] };
    group.cities.push(city);
    groups.set(city.mesoSlug, group);
  }
  return [...groups.values()].sort((a, b) => b.cities.length - a.cities.length || a.name.localeCompare(b.name, "pt-BR"));
}

/** Other cities of the same editorial mesoregion (empty when the city has none). */
export function citiesOfSameMeso(city: City): City[] {
  if (!city.mesoSlug) return [];
  return cities.filter((c) => c.uf === city.uf && c.mesoSlug === city.mesoSlug && c.id !== city.id);
}
