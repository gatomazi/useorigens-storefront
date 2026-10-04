import { isUmaPencaImageUrl, isUmaPencaProductUrl } from "./hosts";
import type { ArticleKind, ExcludedArticle, UmaPencaArticle } from "./types";

/**
 * Pure parser for the Uma Penca product feeds (`.../feed/facebook.xml`, the one in use, and `.../feed/google.xml`): an Atom
 * `<feed>` of `<entry>`, every field in the `g:` namespace, most text wrapped in CDATA. Only the Meta feed carries `g:category`. RSS `<item>` is accepted too, since Merchant feeds come in both shapes.
 *
 * Deliberately not a general XML parser: the feed is flat (one level of `g:*` children per entry), so a tolerant scan of
 * those children is enough and keeps the app free of an XML dependency. An entry missing an id, title, a verified link or a
 * verified photo, out of stock, or of a kind the storefront does not show is excluded with a reason, never repaired.
 */

const ENTRY_RE = /<(entry|item)\b[^>]*>([\s\S]*?)<\/\1>/g;

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const n = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : match;
  });
}

/** Text of a child element: CDATA sections are taken verbatim, everything else entity-decoded. */
function textOf(raw: string): string {
  let out = "";
  let rest = raw;
  for (;;) {
    const start = rest.indexOf("<![CDATA[");
    if (start === -1) {
      out += decodeEntities(rest.replace(/<[^>]*>/g, ""));
      break;
    }
    out += decodeEntities(rest.slice(0, start).replace(/<[^>]*>/g, ""));
    const end = rest.indexOf("]]>", start);
    if (end === -1) break;
    out += rest.slice(start + 9, end);
    rest = rest.slice(end + 3);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Every value of `<g:name>` (or a bare `<name>`) inside one entry, in document order. */
function fieldValues(entry: string, name: string): string[] {
  const re = new RegExp(`<(?:g:)?${name}\\b[^>]*?(?:/>|>([\\s\\S]*?)</(?:g:)?${name}>)`, "g");
  const values: string[] = [];
  for (const m of entry.matchAll(re)) {
    const value = m[1] === undefined ? "" : textOf(m[1]);
    if (value) values.push(value);
  }
  return values;
}

function field(entry: string, name: string): string {
  return fieldValues(entry, name)[0] ?? "";
}

/** "59.99 BRL" / "59,99 BRL" / "59.99" → 59.99. Any other currency, or no number at all, is null (never converted or invented). */
export function parsePrice(raw: string): number | null {
  const m = raw.trim().match(/^(\d+(?:[.,]\d{1,2})?)\s*([A-Z]{3})?$/);
  if (!m || (m[2] && m[2] !== "BRL")) return null;
  const value = Number.parseFloat(m[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Decides the article kind from the feed's own category, then product type, then title, then URL path — first one that names a known kind wins. */
export function articleKindOf(candidates: readonly string[]): ArticleKind | null {
  for (const candidate of candidates) {
    const text = normalize(candidate);
    if (/\bcanecas?\b/.test(text)) return "caneca";
    if (/\beco ?bags?\b|\bsacolas?\b|\btote ?bags?\b/.test(text)) return "ecobag";
  }
  return null;
}

export type ParsedFeed = { articles: UmaPencaArticle[]; excluded: ExcludedArticle[]; entryCount: number };

export function parseUmaPencaFeed(xml: string): ParsedFeed {
  const articles: UmaPencaArticle[] = [];
  const excluded: ExcludedArticle[] = [];
  const seen = new Set<string>();
  let entryCount = 0;

  for (const [, , entry] of xml.matchAll(ENTRY_RE)) {
    entryCount++;
    const id = field(entry, "id");
    const title = field(entry, "title");
    const exclude = (reason: string) => excluded.push({ id, title, reason });

    if (!id || !title) {
      exclude("missing id or title");
      continue;
    }
    if (seen.has(id)) {
      exclude("duplicate id");
      continue;
    }
    const url = field(entry, "link");
    if (!isUmaPencaProductUrl(url)) {
      exclude(`link is not an https umapenca.com URL: ${url || "(empty)"}`);
      continue;
    }
    const imageUrl = field(entry, "image_link");
    if (!isUmaPencaImageUrl(imageUrl)) {
      exclude(`image is not on an allowed Uma Penca image host: ${imageUrl || "(empty)"}`);
      continue;
    }
    const availability = normalize(field(entry, "availability"));
    if (availability === "out of stock" || availability === "out_of_stock") {
      exclude("out of stock");
      continue;
    }
    // The Meta feed's g:category ("Caneca") decides. The Google feed has none and an empty g:product_type: there the title decides,
    // and the product URL's first segment (`/caneca/la-de-acegua-426949.html`) is the last resort.
    const kind = articleKindOf([field(entry, "category"), field(entry, "product_type"), title, new URL(url).pathname.split("/")[1] ?? ""]);
    if (!kind) {
      exclude("not a caneca or ecobag");
      continue;
    }

    const price = parsePrice(field(entry, "price"));
    const sale = parsePrice(field(entry, "sale_price"));
    seen.add(id);
    articles.push({
      id,
      kind,
      title,
      description: field(entry, "description"),
      url,
      imageUrl,
      additionalImageUrls: fieldValues(entry, "additional_image_link").filter(isUmaPencaImageUrl),
      price,
      salePrice: sale !== null && price !== null && sale < price ? sale : null,
      color: field(entry, "color") || null,
    });
  }

  return { articles, excluded, entryCount };
}
