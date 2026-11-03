import { normalizeText } from "../geo/text";

/**
 * The city filter of "Outros artigos" (src/components/umapenca/ArticleShelf.tsx). Pure, unit-tested. The city comes from the title
 * (region.ts `articleCity`), never from a feed field. Rules (no fuzzy matching, like the rest of the store's searches):
 *  - the query is normalised (case, accents, punctuation); an article matches when its city starts with the query, or one of the city's words
 *    does, or — from 3 letters — the city contains it;
 *  - best first: the exact city, then cities that start with the query, then a word of the city, then anywhere; ties A–Z by city (then
 *    the feed's order, for two articles of one city);
 *  - the state chip keeps only that UF; with no query, everything (of that state) in the feed's order: the store's curated canecas first.
 */
export type CityFilterItem = { city: string | null; uf: string | null };

export const MAX_CITY_QUERY = 60;

function matchClass(city: string, words: readonly string[], q: string): number {
  if (city === q) return 4;
  if (city.startsWith(q)) return 3;
  if (words.some((w) => w.startsWith(q))) return 2;
  if (q.length >= 3 && city.includes(q)) return 1;
  return 0;
}

export function filterByCity<T extends CityFilterItem>(items: readonly T[], query: string, uf: string | null): T[] {
  const q = normalizeText(query.slice(0, MAX_CITY_QUERY));
  const inState = uf ? items.filter((item) => item.uf === uf) : items;
  if (q === "") return [...inState];
  const hits: { item: T; cls: number; city: string; i: number }[] = [];
  inState.forEach((item, i) => {
    if (!item.city) return;
    const city = normalizeText(item.city);
    const cls = matchClass(city, city.split(" "), q);
    if (cls > 0) hits.push({ item, cls, city, i });
  });
  return hits.sort((a, b) => b.cls - a.cls || a.city.localeCompare(b.city, "pt-BR") || a.i - b.i).map((h) => h.item);
}

/** The states the chips offer, in the region's order, each with how many articles it has. Only states that have one. */
export function stateCounts(items: readonly CityFilterItem[], order: readonly string[]): { uf: string; count: number }[] {
  return order.map((uf) => ({ uf, count: items.filter((item) => item.uf === uf).length })).filter((s) => s.count > 0);
}
