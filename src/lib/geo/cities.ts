import municipiosData from "../../../data/geo/municipios.json";
import { ALIASES } from "./aliases";
import { UF_TO_REGION, type RegionSlug } from "./regions";
import { normalizeText, slugify } from "./text";

export type City = {
  /** IBGE municipality code, as a string. */
  id: string;
  slug: string;
  name: string;
  uf: string;
  regionSlug: RegionSlug;
  /**
   * Public label of the city's IBGE Região Geográfica Intermediária (2017 division): "Região de Chapecó".
   * "" when IBGE has not placed the municipality yet. Never guessed.
   */
  area: string;
  areaSlug: string;
  /** Deliberate, curated nicknames only (see aliases.ts). */
  aliases: readonly string[];
};

const rows = municipiosData as unknown as [number, string, string, string][];

const cities: City[] = rows.map(([id, name, uf, intermediate]) => {
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

/** Cities of a state grouped by IBGE intermediate region, groups ordered by size then name. */
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

/** Other cities of the same IBGE intermediate region (empty when the city has none). */
export function citiesOfSameArea(city: City): City[] {
  if (!city.areaSlug) return [];
  return cities.filter((c) => c.uf === city.uf && c.areaSlug === city.areaSlug && c.id !== city.id);
}
