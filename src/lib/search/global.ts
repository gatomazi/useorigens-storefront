import { normalizeText } from "../geo/text";
import type { RegionSlug } from "../geo/regions";

/**
 * The storefront's global search: places, designs and editorial pages in ONE ranked list, grouped by kind (docs/storefront/global-search-round.md).
 * Pure: no I/O, no `server-only`. The documents are built from the published snapshots/config by `global-index.ts`; nothing here invents a field.
 *
 * Ranking (no fuzzy matching on purpose — a wrong place is worse than none). Each document gets a MATCH CLASS, best first:
 *   6 exact   — the whole query equals one of the names the document IS (a place and its aliases, "Bagé Traço", a page title);
 *   5 prefix  — one of those names starts with the query ("tij" → Tijucas);
 *   4 words   — every term is a whole word of a strong field (title, place, family, collection);
 *   3 partial — every term is a word prefix (or, from 3 letters, a substring) of a strong field;
 *   2 extra   — every term matches somewhere, but at least one only in an auxiliary keyword (state, UF, a page's description).
 * Within a class: places before designs before editorial pages (the order asked for: exact place, exact design, exact collection/page, then
 * prefix, whole words, partial, keywords). Ties: the document's own editorial/commercial `rank`, more sales, shorter title, then title — so the
 * order never depends on file or API order.
 */
export type GlobalKind = "state" | "locality" | "design" | "page";
export type GlobalGroup = "places" | "designs" | "editorial";

export type GlobalDoc = {
  /** Unique within its region. */
  key: string;
  kind: GlobalKind;
  region: RegionSlug;
  title: string;
  subtitle: string;
  href: string;
  /** The destination is outside the storefront (an INK collection page): opened as a plain link, never prefetched. */
  external?: boolean;
  image?: string;
  /** Design only: real pieces of the same `product_cluster_id` (classic tee + garment types), and the lowest real price among them. */
  pieces?: number;
  minPrice?: number;
  /** Merchandise design only: the INK product the result opens (GoToInk on click, like every other INK product link of the storefront). */
  inkProductId?: string;
  /** Small type tag shown on the row ("Região Administrativa", "Coleção", "Hotpage"…). */
  tag: string;
  /** Analytics context: the place (SelectCity), the UF, an administrative region. Never anything personal. */
  city?: string;
  uf?: string;
  administrativeRegion?: boolean;
  /** Lower first among equal scores (editorial/commercial order). */
  rank: number;
  sales?: number;
  /** Names the document IS: exact and prefix matches are only checked here. */
  names: readonly string[];
  strong: readonly string[];
  weak: readonly string[];
};

type Field = { key: string; words: string[] };
export type PreparedGlobalDoc = { doc: GlobalDoc; names: string[]; strong: Field[]; weak: Field[] };

const toField = (text: string): Field => {
  const key = normalizeText(text);
  return { key, words: key === "" ? [] : key.split(" ") };
};

export function prepareGlobalDocs(docs: readonly GlobalDoc[]): PreparedGlobalDoc[] {
  return docs.map((doc) => {
    const names = doc.names.map(normalizeText).filter(Boolean);
    return { doc, names, strong: [...names.map(toField), ...doc.strong.map(toField)].filter((f) => f.key !== ""), weak: doc.weak.map(toField).filter((f) => f.key !== "") };
  });
}

export const MAX_GLOBAL_QUERY = 80;
const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para", "com"]);

export function globalTerms(query: string): string[] {
  const all = normalizeText(query.slice(0, MAX_GLOBAL_QUERY)).split(" ").filter(Boolean).slice(0, 8);
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  return meaningful.length > 0 ? meaningful : all;
}

/** 2 whole word, 1 prefix/substring, 0 none. */
function termIn(term: string, fields: readonly Field[]): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = 0;
  for (const f of fields) {
    if (f.words.includes(term)) return 2;
    if (f.words.some((w) => w.startsWith(term)) || (term.length >= 3 && f.key.includes(term))) best = 1;
  }
  return best;
}

export function matchClass(p: PreparedGlobalDoc, phrase: string, terms: readonly string[]): number {
  if (phrase === "" || terms.length === 0) return 0;
  if (p.names.includes(phrase)) return 6;
  if (p.names.some((n) => n.startsWith(phrase))) return 5;
  let allWhole = true;
  let allStrong = true;
  for (const term of terms) {
    const strong = termIn(term, p.strong);
    if (strong === 2) continue;
    allWhole = false;
    if (strong === 1) continue;
    allStrong = false;
    if (termIn(term, p.weak) === 0) return 0; // every term must match somewhere
  }
  return allWhole ? 4 : allStrong ? 3 : 2;
}

const KIND_ORDER: Record<GlobalKind, number> = { state: 3, locality: 3, design: 2, page: 1 };
export const GROUP_OF: Record<GlobalKind, GlobalGroup> = { state: "places", locality: "places", design: "designs", page: "editorial" };

export type GlobalHit = { doc: GlobalDoc; score: number };

function compareHits(a: GlobalHit, b: GlobalHit): number {
  return (
    b.score - a.score ||
    a.doc.rank - b.doc.rank ||
    (b.doc.sales ?? 0) - (a.doc.sales ?? 0) ||
    a.doc.title.length - b.doc.title.length ||
    a.doc.title.localeCompare(b.doc.title, "pt-BR") ||
    (a.doc.key < b.doc.key ? -1 : a.doc.key > b.doc.key ? 1 : 0)
  );
}

export function rankGlobal(prepared: readonly PreparedGlobalDoc[], query: string): GlobalHit[] {
  const terms = globalTerms(query);
  // The phrase keeps the stopwords ("tijucas do sul" must equal the place's own name).
  const phrase = normalizeText(query.slice(0, MAX_GLOBAL_QUERY));
  const hits: GlobalHit[] = [];
  for (const p of prepared) {
    const cls = matchClass(p, phrase, terms);
    if (cls > 0) hits.push({ doc: p.doc, score: cls * 10 + KIND_ORDER[p.doc.kind] });
  }
  return hits.sort(compareHits);
}

/** What the browser receives: the document without its matching fields (and never a sales count). */
export type GlobalResult = Omit<GlobalDoc, "names" | "strong" | "weak" | "rank" | "sales">;
export type GlobalSearchResponse = {
  query: string;
  region: RegionSlug;
  groups: { group: GlobalGroup; total: number; items: GlobalResult[] }[];
  /** Clearly relevant results of OTHER launched regions (match class ≥ whole words), after the current region's. */
  others: GlobalResult[];
  total: number;
};

export const GROUP_LIMITS: Record<GlobalGroup, number> = { places: 6, designs: 6, editorial: 5 };
export const OTHERS_LIMIT = 6;
const OTHERS_MIN_CLASS = 4;

const toResult = ({ names: _n, strong: _s, weak: _w, rank: _r, sales: _sa, ...rest }: GlobalDoc): GlobalResult => {
  void _n; void _s; void _w; void _r; void _sa;
  return rest;
};

/**
 * The response for one query asked FROM `region`: that region's matches grouped by kind (each group capped, `total` says how many there were),
 * then the other launched regions' clearly relevant matches in one "Em outras regiões" block. Regions not present in `byRegion` (not launched)
 * are simply never searched.
 */
export function searchGlobal(byRegion: ReadonlyMap<RegionSlug, readonly PreparedGlobalDoc[]>, region: RegionSlug, rawQuery: string): GlobalSearchResponse {
  const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, MAX_GLOBAL_QUERY);
  const empty: GlobalSearchResponse = { query, region, groups: [], others: [], total: 0 };
  if (normalizeText(query).length === 0) return empty;

  const own = rankGlobal(byRegion.get(region) ?? [], query);
  const groups: GlobalSearchResponse["groups"] = [];
  for (const group of ["places", "designs", "editorial"] as const) {
    const all = own.filter((h) => GROUP_OF[h.doc.kind] === group);
    if (all.length > 0) groups.push({ group, total: all.length, items: all.slice(0, GROUP_LIMITS[group]).map((h) => toResult(h.doc)) });
  }

  // A page every region has (e.g. "Outros artigos") is the same destination concept: shown once, in the current region.
  const ownKeys = new Set(own.map((h) => h.doc.key));
  const elsewhere: GlobalHit[] = [];
  for (const [other, docs] of byRegion) {
    if (other === region) continue;
    for (const hit of rankGlobal(docs, query)) if (Math.floor(hit.score / 10) >= OTHERS_MIN_CLASS && !ownKeys.has(hit.doc.key)) elsewhere.push(hit);
  }
  const others = elsewhere.sort(compareHits).slice(0, OTHERS_LIMIT).map((h) => toResult(h.doc));
  return { query, region, groups, others, total: own.length };
}
