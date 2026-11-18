/**
 * The store's public reviews page on INK (`<store>/reviews?sort=recents`), read from its markup like the FAQ (assistant/ink-faq.ts): the summary
 * (`#rating`), the photo gallery (`<img alt="Foto enviada na avaliação">`) and the review cards (`#store_reviews_items`, one `md:flex-row` block
 * each). Pure, so the tests run on a saved copy. INK has no reviews endpoint in its API; this page is the only source.
 *
 * What it never does: guess. A card whose stars cannot be counted (not five of them, or none filled) is dropped, never defaulted to 5 stars; a
 * photo whose address is not on INK's own image hosts is dropped; a shape it does not recognise gives an empty page. A card WITHOUT text (stars
 * only, often with a photo) is a review all the same: the full list in the modal shows it; the home's cards need text (`isFeatured`).
 */
import { decodeHtmlEntities } from "../ink/html-text";

/** `text` is "" for a review of stars only. `photos`: the ones sent with this review. */
export type InkReview = { author: string; date: string; rating: number; text: string; verified: boolean; photos: InkReviewPhoto[] };
/**
 * `full`: the original JPEG INK keeps, shown through our image optimizer (it applies the camera's rotation); null when its address cannot be read.
 * `thumb`: INK's signed 320 px webp, which does NOT apply the rotation and is soft on a retina screen: only the fallback when `full` is null.
 */
export type InkReviewPhoto = { thumb: string; full: string | null };
/** `nextPage`: the page number INK's "Ver mais avaliações" asks for, null on the last one. Many reviews are stars only (no text), so one page rarely fills the home. */
export type InkReviewsPage = { score: number | null; count: number | null; reviews: InkReview[]; photos: InkReviewPhoto[]; nextPage: number | null };

export const REVIEW_THUMB_HOST = "gcp-mimis-blend.ink.rsvcloud.com";
export const REVIEW_ORIGINAL_HOST = "gcp-images.majestic.ink.rsvcloud.com";
const ORIGINAL_PATH = /^\/images\/review_image\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i;
const MAX_AUTHOR = 60;
const MAX_TEXT = 700;
const MAX_REVIEW_PHOTOS = 6;

// A tag's attributes, quoted values included: INK writes `data-action="click->…"`, so a bare `[^>]*` would end the tag inside the value.
const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const plain = (html: string): string => decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
const classesOf = (attrs: string): string[] => (/\bclass="([^"]*)"/.exec(attrs)?.[1] ?? "").split(/\s+/).filter(Boolean);

type Paragraph = { classes: string[]; text: string };
function paragraphs(html: string): Paragraph[] {
  return [...html.matchAll(new RegExp(`<p\\b(${ATTRS})>([\\s\\S]*?)</p>`, "gi"))].map((m) => ({ classes: classesOf(m[1]), text: plain(m[2]) }));
}
const hasAll = (p: Paragraph, ...tokens: string[]): boolean => tokens.every((t) => p.classes.includes(t));

function parseSummary(html: string): { score: number | null; count: number | null } {
  const start = html.indexOf('id="rating"');
  if (start < 0) return { score: null, count: null };
  const end = html.indexOf('id="rating-bar-', start);
  const box = html.slice(start, end > start ? end : start + 4000);
  const scoreText = paragraphs(box).find((p) => hasAll(p, "text-4xl"))?.text.replace(",", ".");
  const score = scoreText ? Number(scoreText) : NaN;
  const countText = new RegExp(`<span\\b(${ATTRS})>([\\s\\S]*?)</span>`, "gi");
  let count: number | null = null;
  for (const m of box.matchAll(countText)) {
    if (!classesOf(m[1]).includes("underline")) continue;
    const digits = /([0-9][0-9.]*)\s*avalia/i.exec(plain(m[2]))?.[1];
    if (digits) count = Number(digits.replace(/\./g, ""));
    break;
  }
  return { score: Number.isFinite(score) && score >= 0 && score <= 5 ? Math.round(score * 10) / 10 : null, count: count !== null && Number.isFinite(count) && count > 0 ? count : null };
}

/** "03 de Setembro de 2026" → "3 de setembro de 2026" (INK capitalises the month). Empty when the text is not a date. */
function normalizeDate(raw: string): string {
  return /^\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4}$/u.test(raw) ? raw.toLocaleLowerCase("pt-BR").replace(/^0(\d)/, "$1") : "";
}

/** The inside of a card's star row (the first `<div>` with `gap-1`): five spans, `text-yellow-300` filled and `text-gray-300` empty. */
function starRow(chunk: string): string | null {
  for (const m of chunk.matchAll(new RegExp(`<div\\b(${ATTRS})>`, "gi"))) {
    if (!classesOf(m[1]).includes("gap-1")) continue;
    const from = (m.index ?? 0) + m[0].length;
    const to = chunk.indexOf("</div>", from);
    return to < 0 ? null : chunk.slice(from, to);
  }
  return null;
}

function parseCard(chunk: string): InkReview | null {
  const row = starRow(chunk);
  if (row === null) return null;
  let filled = 0;
  let empty = 0;
  for (const span of row.matchAll(new RegExp(`<span\\b(${ATTRS})>`, "gi"))) {
    const classes = classesOf(span[1]);
    if (classes.includes("text-yellow-300")) filled++;
    else if (classes.includes("text-gray-300")) empty++;
  }
  // Never default an unreadable rating to 5: without exactly five stars and one filled at least, the card is dropped.
  if (filled < 1 || filled + empty !== 5) return null;

  const ps = paragraphs(chunk);
  const author = ps.find((p) => hasAll(p, "text-gray-900", "font-semibold", "text-base"))?.text ?? "";
  const text = ps.find((p) => hasAll(p, "text-base", "text-gray-500", "leading-6") && !p.classes.includes("font-semibold"))?.text ?? "";
  if (!author || author.length > MAX_AUTHOR) return null;
  const date = normalizeDate(ps.find((p) => hasAll(p, "text-gray-500", "text-sm") && normalizeDate(p.text) !== "")?.text ?? "");
  return {
    author,
    date,
    rating: filled,
    text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1).trimEnd()}…` : text,
    verified: /Compra verificada/i.test(chunk),
    photos: parsePhotos(chunk).slice(0, MAX_REVIEW_PHOTOS),
  };
}

function parseReviews(html: string): InkReview[] {
  const start = html.indexOf('id="store_reviews_items"');
  if (start < 0) return [];
  const end = html.indexOf('id="store_reviews_pagination"', start);
  const frame = html.slice(start, end > start ? end : html.length);
  const chunks = frame.split(new RegExp(`<div\\b${ATTRS}\\bclass="[^"]*\\bmd:flex-row\\b[^"]*"${ATTRS}>`, "i")).slice(1);
  // No de-duplication inside a page: its cards are distinct by construction (two stars-only reviews of one person on one day are two reviews).
  // Between pages it is `reviewKey`'s job (a review posted while the pages are read shifts them by one).
  return chunks.map(parseCard).filter((r): r is InkReview => r !== null);
}

/** INK's signed thumbnail address carries the original's address as its last path segment, base64url. Only an original on INK's image host is returned. */
function originalOf(thumb: URL): string | null {
  const last = thumb.pathname.split("/").pop();
  if (!last) return null;
  try {
    const url = new URL(Buffer.from(last, "base64url").toString("utf8"));
    return url.protocol === "https:" && url.host === REVIEW_ORIGINAL_HOST && !url.search && !url.hash && ORIGINAL_PATH.test(url.pathname) ? `${url.origin}${url.pathname}` : null;
  } catch {
    return null;
  }
}

function parsePhotos(html: string): InkReviewPhoto[] {
  const seen = new Set<string>();
  const photos: InkReviewPhoto[] = [];
  for (const m of html.matchAll(new RegExp(`<img\\b${ATTRS}>`, "gi"))) {
    const tag = m[0];
    if (!/\balt="Foto enviada na avalia/i.test(tag)) continue;
    const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
    if (!src) continue;
    let url: URL;
    try {
      url = new URL(decodeHtmlEntities(src));
    } catch {
      continue;
    }
    // Every picture shown comes from INK's own host: a different one is never rendered, whatever the page says.
    if (url.protocol !== "https:" || url.host !== REVIEW_THUMB_HOST || seen.has(url.href)) continue;
    seen.add(url.href);
    photos.push({ thumb: url.href, full: originalOf(url) });
  }
  return photos;
}

function parseNextPage(html: string): number | null {
  const start = html.indexOf('id="store_reviews_pagination"');
  if (start < 0) return null;
  const next = /name="page"\s+value="?(\d+)"?/i.exec(html.slice(start, start + 600))?.[1];
  return next ? Number(next) : null;
}

export function parseInkReviews(html: string): InkReviewsPage {
  const { score, count } = parseSummary(html);
  return { score, count, reviews: parseReviews(html), photos: parsePhotos(html), nextPage: parseNextPage(html) };
}

/**
 * The home shows at most this many cards. The photo strip gets the store's whole gallery (INK's page lists the same 33 on every page, down to the oldest
 * review: it is all of them), capped here as a guard; the strip itself shows them in batches and loads each picture only when it comes near.
 */
export const HOME_REVIEWS_MAX = 6;
export const HOME_PHOTOS_MAX = 36;
/** A card needs this many stars to be featured. The summary above the cards still counts EVERY review, and "Ver todas" opens the whole list, unfiltered. */
export const FEATURED_MIN_RATING = 4;
/** Fewer than these and the block stays out: a lone card or a short strip reads as a leftover, not as social proof. */
export const MIN_CARDS = 3;
export const MIN_PHOTOS = 4;

/** What the home's cards show: enough stars AND something written (a stars-only review is in the full list, not a card). */
export const isFeatured = (r: InkReview): boolean => r.rating >= FEATURED_MIN_RATING && r.text !== "";

/** The part of a page the home shows (same shape, fewer items); null when there is too little of both cards and photos for a section. */
export function selectHomeReviews(page: InkReviewsPage): InkReviewsPage | null {
  const featured = page.reviews.filter(isFeatured).slice(0, HOME_REVIEWS_MAX);
  const reviews = featured.length >= MIN_CARDS ? featured : [];
  const photos = page.photos.length >= MIN_PHOTOS ? page.photos.slice(0, HOME_PHOTOS_MAX) : [];
  if (reviews.length === 0 && photos.length === 0) return null;
  return { ...page, reviews, photos };
}
