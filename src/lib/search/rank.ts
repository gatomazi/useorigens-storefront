import { STATE_NAMES } from "../geo/regions";
import { normalizeText } from "../geo/text";

/** Compact city record shipped to the browser for instant, accent-insensitive search. */
export type SearchCity = {
  /** City name. */
  n: string;
  /** UF. */
  u: string;
  /** Slug. */
  s: string;
  /** Curated aliases (already lowercase/accent-free is NOT required; normalized on load). */
  a?: string[];
  /** Editorial mesoregion ("Grande Florianópolis"), used as microcontext in results (ADR 0004). Omitted when IBGE has none. */
  m?: string;
};

export type SearchResult =
  | { type: "city"; city: SearchCity; score: number }
  | { type: "state"; uf: string; name: string; score: number };

export type PreparedCity = { city: SearchCity; key: string; words: string[]; aliases: string[] };

export function prepareCities(cities: readonly SearchCity[]): PreparedCity[] {
  return cities.map((city) => {
    const key = normalizeText(city.n);
    return { city, key, words: key.split(" "), aliases: (city.a ?? []).map(normalizeText) };
  });
}

function scoreCity(p: PreparedCity, q: string): number {
  if (p.key === q) return 100;
  if (p.aliases.includes(q)) return 95;
  // Cities with curated aliases are the well-known ones: they lead among equal prefix matches.
  if (p.key.startsWith(q)) return p.aliases.length > 0 ? 88 : 80;
  if (p.aliases.some((a) => a.startsWith(q))) return 75;
  if (q.length >= 2 && p.words.some((w) => w.startsWith(q))) return 55;
  if (q.length >= 3 && p.key.includes(q)) return 30;
  return 0;
}

/**
 * Ranking rules (no fuzzy matching on purpose — a wrong city is worse than no city):
 * exact name > exact alias > name prefix > alias prefix > word prefix > substring (3+ chars).
 * Ties: shorter name first, then alphabetical.
 */
export function searchCities(
  prepared: readonly PreparedCity[],
  query: string,
  options: { ufs?: readonly string[]; limit?: number } = {},
): SearchResult[] {
  const q = normalizeText(query);
  if (q.length === 0) return [];
  const limit = options.limit ?? 8;
  const allowed = options.ufs ? new Set(options.ufs) : null;

  const results: SearchResult[] = [];

  for (const [uf, name] of Object.entries(STATE_NAMES)) {
    if (allowed && !allowed.has(uf)) continue;
    const nameKey = normalizeText(name);
    const score = q.length === 2 && normalizeText(uf) === q ? 90 : q.length >= 3 && nameKey.startsWith(q) ? 60 : 0;
    if (score > 0) results.push({ type: "state", uf, name, score });
  }

  for (const p of prepared) {
    if (allowed && !allowed.has(p.city.u)) continue;
    const score = scoreCity(p, q);
    if (score > 0) results.push({ type: "city", city: p.city, score });
  }

  const label = (r: SearchResult) => (r.type === "city" ? r.city.n : r.name);
  return results
    .sort((a, b) => b.score - a.score || label(a).length - label(b).length || label(a).localeCompare(label(b), "pt-BR"))
    .slice(0, limit);
}
