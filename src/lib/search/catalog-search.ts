import { normalizeText } from "../geo/text";

/**
 * Text search over the storefront's REAL catalog (products a person can buy), as opposed to `rank.ts`, which only resolves cities and states.
 * Pure: no I/O, no `server-only`, so the ranking and paging rules are unit-tested directly. The documents are built from the synced catalog
 * by `catalog/search-docs.ts`; nothing here invents a field the catalog does not have.
 *
 * Rules (no fuzzy matching on purpose — a wrong product is worse than no product):
 *  - the query is normalised like every other comparison (case, accents, punctuation) and split into terms; EVERY term must match;
 *  - "strong" fields say what the product IS (its title, city, collection); "weak" fields are peripheral mentions (state, UF, mesoregion,
 *    family blurb). A term found in a strong field outweighs any number of weak hits, so "Santa Catarina" lists the product literally
 *    named that before the thousand city designs that merely belong to the state;
 *  - a whole-phrase hit in a strong field adds a bonus, so "porto alegre" prefers Porto Alegre over Alegrete/Porto União;
 *  - ties: better rank (a city's primary design before its variants), more sales, then title, then id — deterministic, API order never matters.
 */
export type SearchDoc = {
  /** INK product id (unique per product). */
  id: string;
  kind: "city-design" | "merch";
  /** Card title. */
  title: string;
  /** Second line ("Curitiba · PR"), when the product is tied to a place. */
  context: string | null;
  imageUrl: string;
  price: number | null;
  /** Verified INK purchase URL (the card navigates here). */
  href: string;
  /** UF when genuinely tied to one state (analytics `state`), never guessed. */
  uf: string | null;
  /** INK's own cumulative sales count (0 when unknown). */
  sales: number;
  /** Lower first among equal scores: a city's primary design before its regional/personalised variants. */
  order: number;
  strong: readonly string[];
  weak: readonly string[];
};

export type PreparedDoc = { doc: SearchDoc; strong: Field[]; weak: Field[] };
type Field = { key: string; words: string[] };

export const MAX_QUERY_CHARS = 80;
export const MAX_TERMS = 8;
export const PAGE_SIZE = 24;
/** Connectives that carry no meaning on their own ("camiseta de Gramado"); dropped only when other terms remain. */
const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para", "com"]);

const toField = (text: string): Field => {
  const key = normalizeText(text);
  return { key, words: key === "" ? [] : key.split(" ") };
};

export function prepareDocs(docs: readonly SearchDoc[]): PreparedDoc[] {
  return docs.map((doc) => ({ doc, strong: doc.strong.map(toField).filter((f) => f.key !== ""), weak: doc.weak.map(toField).filter((f) => f.key !== "") }));
}

/** The query as the page shows it in the box: trimmed, single-spaced, capped. Never changes what was meant, only what is safe to store/echo. */
export function cleanQuery(raw: unknown): string {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS).trim();
}

export function queryTerms(query: string): string[] {
  const all = normalizeText(query).split(" ").filter(Boolean).slice(0, MAX_TERMS);
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  return meaningful.length > 0 ? meaningful : all;
}

/** Best score of one term over a set of fields; 0 when it matches none. `weights` = [exact word, word prefix, substring]. */
function termScore(term: string, fields: readonly Field[], weights: readonly [number, number, number], minSubstring: number): number {
  let best = 0;
  for (const field of fields) {
    let score = 0;
    if (field.words.includes(term)) score = weights[0];
    else if (field.words.some((w) => w.startsWith(term))) score = weights[1];
    else if (term.length >= minSubstring && field.key.includes(term)) score = weights[2];
    if (score > best) best = score;
  }
  return best;
}

export function scoreDoc(p: PreparedDoc, terms: readonly string[], phrase: string): number {
  let total = 0;
  for (const term of terms) {
    const strong = termScore(term, p.strong, [100, 80, 40], 3);
    const weak = strong > 0 ? 0 : termScore(term, p.weak, [25, 20, 8], 4);
    const s = strong || weak;
    if (s === 0) return 0; // every term must match somewhere
    total += s;
  }
  if (terms.length > 1 && p.strong.some((f) => f.key.includes(phrase))) total += 60;
  if (p.strong.some((f) => f.key === phrase)) total += 40;
  return total;
}

export type SearchPage = {
  query: string;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  items: SearchDoc[];
};

/** Real, consistent paging: `total` is the number of matching products, `pageCount = ceil(total / pageSize)`, and `page` is clamped into range. */
export function searchDocs(prepared: readonly PreparedDoc[], rawQuery: string, options: { page?: number; pageSize?: number } = {}): SearchPage {
  const query = cleanQuery(rawQuery);
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const terms = queryTerms(query);
  if (terms.length === 0) return { query, total: 0, page: 1, pageCount: 0, pageSize, items: [] };
  const phrase = terms.join(" ");

  const hits: { doc: SearchDoc; score: number }[] = [];
  for (const p of prepared) {
    const score = scoreDoc(p, terms, phrase);
    if (score > 0) hits.push({ doc: p.doc, score });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.doc.order - b.doc.order ||
      b.doc.sales - a.doc.sales ||
      a.doc.title.localeCompare(b.doc.title, "pt-BR") ||
      (a.doc.id < b.doc.id ? -1 : a.doc.id > b.doc.id ? 1 : 0),
  );

  const total = hits.length;
  const pageCount = Math.ceil(total / pageSize);
  const requested = Number.isFinite(options.page) ? Math.trunc(options.page as number) : 1;
  const page = Math.min(Math.max(requested, 1), Math.max(pageCount, 1));
  return { query, total, page, pageCount, pageSize, items: hits.slice((page - 1) * pageSize, page * pageSize).map((h) => h.doc) };
}

/** `?page=` as typed by a person or a bot: anything that is not a positive integer becomes page 1. */
export function parsePage(raw: unknown): number {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text !== "string" || !/^\d{1,6}$/.test(text)) return 1;
  return Math.max(1, Number(text));
}
