import { ALIASES } from "../geo/aliases";
import { STATE_NAMES } from "../geo/regions";
import { normalizeText } from "../geo/text";
import { PRODUCT_SORTS, PRODUCT_SORT_LABEL, isProductSort, sortProducts, type ProductSort, type ProductSortData, type ProductSalesUnits } from "../catalog/product-sort";

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

// ── Filters, facets and sort (Catalog UX V1) ─────────────────────────────────────────────────────────────────

import { CLASSIC_GARMENT_TYPE_ID, garmentTypeById } from "../catalog/garments";
import { DESIGN_FAMILIES } from "../catalog/families";

/**
 * The commercial filters of a collection page, over the cards the snapshot already has (never a hot query to INK): the piece (INK's
 * `product_type`), the state, the city and the design family. A card that lacks the attribute (a merch product has no city or family;
 * a product of an unknown piece type) simply never matches that filter and never counts in its facet: nothing is guessed.
 */
export type FilterableProduct = FilterableCard & ProductSortData & { id?: string; garmentTypeId?: number; city?: string; family?: string };

export type CollectionFilters = { garment?: number; state?: string; city?: string; family?: string };
export const COLLECTION_SORTS = PRODUCT_SORTS;
export type CollectionSort = ProductSort;
export const COLLECTION_SORT_LABEL = PRODUCT_SORT_LABEL;
/** Fresh net units over the last 30 days, or null when unavailable. */
export type SalesUnits = ProductSalesUnits;

export type FacetOption = { value: string; label: string; count: number };
export type CollectionFacets = { garment: FacetOption[]; state: FacetOption[]; city: FacetOption[]; family: FacetOption[] };
export type FacetKey = keyof CollectionFacets;
export const FACET_LABEL: Record<FacetKey, string> = { garment: "Peça", state: "Estado", city: "Cidade", family: "Estilo" };

const matchesFilter = (card: FilterableProduct, key: FacetKey, value: string | number | undefined): boolean => {
  if (value === undefined || value === "") return true;
  switch (key) {
    case "garment":
      return card.garmentTypeId === Number(value);
    case "state":
      // A product of no state ("Bah | Dizeres", in no state's collection) is every state's: the state pages show it in all of them, so does the filter.
      return card.state === value || !card.state;
    case "city":
      return card.city === value;
    case "family":
      return card.family === value;
  }
};

const FILTER_KEYS: readonly FacetKey[] = ["garment", "state", "city", "family"];

export function applyCollectionFilters<T extends FilterableProduct>(cards: readonly T[], filters: CollectionFilters, except?: FacetKey): T[] {
  return cards.filter((card) => FILTER_KEYS.every((key) => key === except || matchesFilter(card, key, filters[key])));
}

export const activeFilterCount = (filters: CollectionFilters): number => FILTER_KEYS.filter((key) => filters[key] !== undefined && filters[key] !== "").length;

/** A price sort keeps the collection's order among equal prices; a card with no price goes last. */
export function sortCollection<T extends FilterableProduct>(cards: readonly T[], sort: CollectionSort, sales: SalesUnits = null): T[] {
  return sortProducts(cards, sort, sales);
}

function facetOf<T extends FilterableProduct>(cards: readonly T[], key: FacetKey, selected: string | number | undefined): FacetOption[] {
  const counts = new Map<string, { label: string; count: number; order: number }>();
  for (const card of cards) {
    let value: string | undefined;
    let label: string | undefined;
    let order = 0;
    if (key === "garment") {
      const type = card.garmentTypeId !== undefined ? garmentTypeById(card.garmentTypeId) : undefined;
      if (!type) continue;
      value = String(type.id);
      label = type.label;
      order = type.sortOrder;
    } else if (key === "state") {
      if (!card.state) continue;
      value = card.state;
      label = STATE_NAMES[card.state] ?? card.state;
    } else if (key === "city") {
      if (!card.city) continue;
      value = card.city;
      label = card.city;
    } else {
      const family = card.family ? DESIGN_FAMILIES.find((f) => f.id === card.family) : undefined;
      if (!family) continue;
      value = family.id;
      label = family.name;
      order = family.sortOrder;
    }
    const entry = counts.get(value) ?? { label, count: 0, order };
    entry.count += 1;
    counts.set(value, entry);
  }
  // Products of no state are in every state's filter (matchesFilter), so each state's count includes them.
  const everyState = key === "state" ? cards.filter((card) => !card.state).length : 0;
  const options = [...counts].map(([value, { label, count, order }]) => ({ value, label, count: count + everyState, order }));
  // Pieces and families in their own commercial order; states and cities by name. A selected value stays listed even when nothing else matches it.
  options.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "pt-BR"));
  if (selected !== undefined && selected !== "" && !options.some((o) => o.value === String(selected))) options.push({ value: String(selected), label: String(selected), count: 0, order: 0 });
  return options.map(({ value, label, count }) => ({ value, label, count }));
}

/**
 * What each filter can still choose: the options of a facet are counted over the cards that pass every OTHER filter (and the text query), so
 * choosing a state narrows the cities but never hides the other states. The city facet only exists once a state is chosen: a region-wide
 * collection has over a thousand cities, and the text search already finds one by name (with its nicknames).
 */
export function collectionFacets<T extends FilterableProduct>(cards: readonly T[], filters: CollectionFilters): CollectionFacets {
  return {
    garment: facetOf(applyCollectionFilters(cards, filters, "garment"), "garment", filters.garment),
    state: facetOf(applyCollectionFilters(cards, filters, "state"), "state", filters.state),
    city: filters.state ? facetOf(applyCollectionFilters(cards, filters, "city"), "city", filters.city) : [],
    family: facetOf(applyCollectionFilters(cards, filters, "family"), "family", filters.family),
  };
}

/** A facet with one option (or none) offers no choice: the UI leaves it out. */
export const usefulFacets = (facets: CollectionFacets): FacetKey[] => FILTER_KEYS.filter((key) => facets[key].length > 1 || (facets[key].length === 1 && facets[key][0].count === 0));

export type CollectionQuery = { q: string; filters: CollectionFilters; sort: CollectionSort };

const UF = /^[A-Z]{2}$/;
const SLUG = /^[a-z][a-z0-9-]{0,40}$/;

/** The query string of the collection API (`?q=&peca=&uf=&cidade=&estilo=&ordem=`), validated: anything malformed is simply ignored. */
export function parseCollectionQuery(params: URLSearchParams, defaultSort: CollectionSort = "collection"): CollectionQuery {
  const q = (params.get("q") ?? "").slice(0, MAX_COLLECTION_QUERY);
  const garmentRaw = params.get("peca") ?? "";
  const garment = /^\d{1,5}$/.test(garmentRaw) && garmentTypeById(Number(garmentRaw)) ? Number(garmentRaw) : undefined;
  const state = UF.test(params.get("uf") ?? "") ? params.get("uf")! : undefined;
  const cityRaw = (params.get("cidade") ?? "").trim().slice(0, 80);
  const city = cityRaw.length > 0 && !/[<>]/.test(cityRaw) ? cityRaw : undefined;
  const familyRaw = params.get("estilo") ?? "";
  const family = SLUG.test(familyRaw) && DESIGN_FAMILIES.some((f) => f.id === familyRaw) ? familyRaw : undefined;
  const sortRaw = params.get("ordem") ?? "";
  const sort = isProductSort(sortRaw) ? sortRaw : defaultSort;
  return { q, filters: { garment, state, city, family }, sort };
}

/** The query string the client sends for a query (the inverse of `parseCollectionQuery`); empty when nothing is asked. */
export function collectionQueryString({ q, filters, sort }: CollectionQuery, defaultSort: CollectionSort = "collection"): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (filters.garment !== undefined) params.set("peca", String(filters.garment));
  if (filters.state) params.set("uf", filters.state);
  if (filters.city) params.set("cidade", filters.city);
  if (filters.family) params.set("estilo", filters.family);
  if (sort !== defaultSort) params.set("ordem", sort);
  return params.toString();
}

/** Whether the query asks for anything at all (otherwise the page as the server drew it is the answer). */
export const isCollectionQueryActive = (query: CollectionQuery, defaultSort: CollectionSort = "collection"): boolean => collectionQueryTerms(query.q).length > 0 || activeFilterCount(query.filters) > 0 || query.sort !== defaultSort;

/**
 * The cards a query selects, in the order asked: the text search (every term starts a word), then the filters, then the sort. The cards of a
 * query with no text and no filter are the whole collection (sorted, when a sort is asked).
 */
export function runCollectionQuery<T extends FilterableProduct>(cards: readonly T[], query: CollectionQuery, sales: SalesUnits = null): { items: T[]; facets: CollectionFacets } {
  const terms = collectionQueryTerms(query.q);
  const searched = terms.length > 0 ? cards.filter((card) => matchesCollectionQuery(card, terms)) : [...cards];
  const facets = collectionFacets(searched, query.filters);
  const items = sortCollection(applyCollectionFilters(searched, query.filters), query.sort, sales);
  return { items, facets };
}

/** The classic piece a city design IS (the family's primary product; garments.ts): the piece facet of a city collection. */
export const CITY_DESIGN_GARMENT_TYPE_ID = CLASSIC_GARMENT_TYPE_ID;
