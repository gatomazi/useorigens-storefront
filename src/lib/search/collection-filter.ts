import { ALIASES } from "../geo/aliases";
import { STATE_NAMES } from "../geo/regions";
import { normalizeText } from "../geo/text";

/**
 * The mini search of a collection page ("Buscar nesta coleção"): which of the collection's cards match what the visitor typed. Pure, no I/O.
 * A card reads as its name, its place ("Tijucas · SC") and that state's name, so "tijucas", "santa catarina", "ponto de origem" and "camiseta
 * floripa" all work. Rules: case, accents and punctuation never matter; the city nicknames of the global search ("floripa", "poa") stand for their
 * city; EVERY term must start a word of the card (so "flor" finds Florianópolis, but "polis" finds nothing: no fuzzy matching, a wrong product is
 * worse than none). The collection's own order is kept: it is the owner's.
 */
export const MIN_COLLECTION_QUERY = 2;
export const MAX_COLLECTION_QUERY = 80;
/** At most this many cards come back; the visitor refines the search for the rest. */
export const MAX_COLLECTION_RESULTS = 60;

export type FilterableCard = { name: string; context?: string; eyebrow?: string; state?: string };

/** Nickname → the city it stands for, both normalised ("floripa" → "florianopolis"), longest first so "ilha da magia" wins over a shorter one. */
const NICKNAMES: readonly [string, string][] = Object.entries(ALIASES)
  .flatMap(([key, names]) => names.map((name): [string, string] => [normalizeText(name), normalizeText(key.split(":")[1].replace(/-/g, " "))]))
  .sort((a, b) => b[0].length - a[0].length);

/** The terms of a query, after normalising it and replacing the nicknames by their city. Empty when the query is too short to search. */
export function collectionQueryTerms(query: string): string[] {
  let text = ` ${normalizeText(query.slice(0, MAX_COLLECTION_QUERY))} `;
  if (text.trim().length < MIN_COLLECTION_QUERY) return [];
  for (const [nickname, city] of NICKNAMES) text = text.split(` ${nickname} `).join(` ${city} `);
  return [...new Set(text.trim().split(" ").filter(Boolean))];
}

/** Everything a card can be found by, normalised, with a space on both ends (so a term is matched at the start of a word). */
function cardText(card: FilterableCard): string {
  const state = card.state ? STATE_NAMES[card.state] ?? "" : "";
  return ` ${normalizeText([card.eyebrow, card.name, card.context, state].filter(Boolean).join(" "))} `;
}

export function matchesCollectionQuery(card: FilterableCard, terms: readonly string[]): boolean {
  if (terms.length === 0) return false;
  const text = cardText(card);
  return terms.every((term) => text.includes(` ${term}`));
}

/** The cards that match, in the collection's order. A query too short to search matches nothing. */
export function filterCollection<T extends FilterableCard>(cards: readonly T[], query: string): T[] {
  const terms = collectionQueryTerms(query);
  return terms.length === 0 ? [] : cards.filter((card) => matchesCollectionQuery(card, terms));
}
