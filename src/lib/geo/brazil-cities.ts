import { normalizeText } from "./text";

/**
 * Every municipality of Brazil (IBGE, data/geo/municipios-brasil.json), for the city field of a personalized print ("PR - SANTA TEREZINHA
 * DE ITAIPU"). Not the storefront's geography (cities.ts, only the store's regions): a customer from anywhere picks their own city.
 * A field keeps a city as "Nome/UF", readable in a request and unique (no two municipalities share a name in one state).
 */
export type BrazilCity = { id: string; name: string; uf: string };

/** The 27 states by their abbreviation, in alphabetical order of it (the order of the state picker). */
export const BRAZIL_UF_NAMES: Readonly<Record<string, string>> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí",
  PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina",
  SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};
export const BRAZIL_UFS = Object.keys(BRAZIL_UF_NAMES);

export const cityValue = (city: { name: string; uf: string }): string => `${city.name}/${city.uf}`;

/** "Santa Terezinha de Itaipu/PR" → its name and UF; null for anything else. Only the shape: the server checks the list (brazil-cities-server). */
export function parseCityValue(value: string): { name: string; uf: string } | null {
  const m = /^([^/]{1,60})\/([A-Z]{2})$/.exec(value.trim());
  if (!m || !BRAZIL_UFS.includes(m[2]) || !/^[\p{L}][\p{L} '’.-]*$/u.test(m[1])) return null;
  return { name: m[1], uf: m[2] };
}

/** The list, loaded on demand: the client gets it as a separate chunk only on a page with a city field. */
export async function loadBrazilCities(): Promise<BrazilCity[]> {
  const rows = (await import("../../../data/geo/municipios-brasil.json")).default as [string, string, string][];
  return rows.map(([id, name, uf]) => ({ id, name, uf }));
}

/**
 * The cities of `uf` matching what was typed, accents and case aside ("sao jose" finds São José): names starting with it first, then names
 * with a word starting with it, then any match; alphabetical within each.
 */
export function searchCities(cities: readonly BrazilCity[], uf: string, query: string, limit = 8): BrazilCity[] {
  const q = normalizeText(query);
  const inUf = cities.filter((c) => c.uf === uf);
  if (!q) return inUf.slice(0, limit);
  const ranked: { city: BrazilCity; rank: number }[] = [];
  for (const city of inUf) {
    const name = normalizeText(city.name);
    const rank = name.startsWith(q) ? 0 : ` ${name}`.includes(` ${q}`) ? 1 : name.includes(q) ? 2 : -1;
    if (rank >= 0) ranked.push({ city, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank || a.city.name.localeCompare(b.city.name, "pt-BR")).slice(0, limit).map((r) => r.city);
}

/** The one city of `uf` whose name is exactly what was typed (accents and case aside), so a full name typed without picking still counts. */
export function exactCity(cities: readonly BrazilCity[], uf: string, query: string): BrazilCity | null {
  const q = normalizeText(query);
  return q ? cities.find((c) => c.uf === uf && normalizeText(c.name) === q) ?? null : null;
}
