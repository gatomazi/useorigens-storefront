import "server-only";
import { REGION_SLUGS, type RegionSlug } from "../geo/regions";
import { SUL_INK, SUL_INK_ORIGIN } from "../ink/sul-domain";
import { reviewKey } from "./key";
import { HOME_REVIEWS_MAX, isFeatured, parseInkReviews, selectHomeReviews, type InkReviewsPage } from "./parse";

/**
 * The home's "Quem usa, recomenda!" / "O que nossos clientes dizem" block, read from the store's PUBLIC reviews page on INK (INK's API has no reviews
 * endpoint). Server only, like every INK read (never from the browser). The region homes are ISR pages (`revalidate = 60`), so the read goes through
 * Next's data cache (`next.revalidate`): INK is asked at most once every REVIEWS_REVALIDATE_S, and the page keeps its static ISR. An explicit
 * `no-store` here would count as revalidate 0 and turn every region home dynamic.
 */
export const REVIEWS_REVALIDATE_S = 30 * 60;
/** While INK is failing, the last good answer is still served for this long; after it, the section goes away. Reviews do not go stale like a discount. */
export const REVIEWS_STALE_MS = 6 * 60 * 60_000;
/** One page for the modal's list: a person is waiting, so it gives up early and offers "Tentar de novo". */
const TIMEOUT_MS = 6000;
/**
 * The home's read runs behind ISR (visitors get the built page while it is renewed in the background), so nobody waits on it: INK's pages take 0.5–4 s
 * from Railway with the odd spike past 6 s, and giving up on a page there used to drop the cards (a page of five has only two with text).
 */
export const HOME_READ_TIMEOUT_MS = 15_000;
const USER_AGENT = "UseOrigensStorefront/1.0 (+https://useorigens.com.br)";

/**
 * The Cloudflare of the store's domain challenges this server (`cf-mitigated: challenge`, 403, whatever the user-agent): its "Not Brazil" rule applies a
 * Managed Challenge to requests from outside Brazil, and Railway's egress is in the US. So the read is sent with a secret header that a Skip rule on the
 * reviews path lets through. Unset (REVIEWS_READ_KEY), nothing is added and the read
 * is as before. The value is only ever sent to the INK store's hosts: the URL is built from them and nothing here takes a URL from INK's pages.
 */
export const READ_KEY_HEADER = "x-reviews-read-key";
const readHeaders = (): Record<string, string> => {
  const key = process.env.REVIEWS_READ_KEY?.trim();
  return { accept: "text/html", "user-agent": USER_AGENT, ...(key ? { [READ_KEY_HEADER]: key } : {}) };
};

/** The reviews are the single INK store's (Use Sul, which sells Sul, Norte and Centro-Oeste prints): every region's home can tell them, from that one store. */
export const REVIEWS_REGIONS: readonly RegionSlug[] = REGION_SLUGS;

/** Kill switch: REVIEWS_HOME=off hides the block everywhere without a deploy of code (runtime env, read at render). Anything else leaves it on. */
export const homeReviewsEnabled = (): boolean => process.env.REVIEWS_HOME !== "off";

const storeReviewsUrl = (): string => `${SUL_INK_ORIGIN}${SUL_INK.base}/reviews`;
/** The whole list on INK, unfiltered: where "Ver todas as avaliações" goes (a link to an INK store host, so the visit's campaign is carried over). */
export const allReviewsUrl = (): string => storeReviewsUrl();

/** Many reviews are stars only (no text), so a page of five often gives two cards: up to this many pages are read to fill the home. */
const MAX_PAGES = 3;

/** One page of INK's reviews list (five reviews, newest first), parsed. Throws when INK does not answer 200. The full list in the modal asks for these one by one. */
export async function readReviewsPage(page: number, fetcher: typeof fetch = fetch, timeoutMs: number = TIMEOUT_MS): Promise<InkReviewsPage> {
  const res = await fetcher(`${storeReviewsUrl()}?sort=recents${page > 1 ? `&page=${page}` : ""}`, {
    headers: readHeaders(),
    next: { revalidate: REVIEWS_REVALIDATE_S },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // A challenge or error page must never be read as "no reviews". The log says when it is Cloudflare's challenge (see READ_KEY_HEADER).
  if (!res.ok) throw new Error(`INK responded ${res.status}${res.headers.get("cf-mitigated") === "challenge" ? " (Cloudflare challenge)" : ""}`);
  return parseInkReviews(await res.text());
}

const featuredCount = (reviews: InkReviewsPage["reviews"]): number => reviews.filter(isFeatured).length;

/** What the home reads. `partial`: a page the home needed failed, so there are fewer cards than a full read would give (it never replaces a fuller one still in the window). */
export type HomeRead = InkReviewsPage & { partial?: true };

const reason = (error: unknown): string => String(error instanceof Error ? error.message : error).slice(0, 80);

/**
 * Reads and parses the pages the home needs: all of them AT ONCE (INK answers in 0.5–4 s, so one after the other adds the waits up, and one slow page used
 * to end the reading with two cards, below the minimum, leaving only the photos). The summary and the photo gallery come with every page; page 1 gives
 * them, and the next pages fill the cards while the home still lacks them. Throws when page 1 is not a 200 with something the home needs; a later page
 * that fails ends the reading there (and is logged), never the whole block.
 */
export async function readInkReviews(fetcher: typeof fetch = fetch): Promise<HomeRead> {
  const [firstRead, ...laterReads] = await Promise.allSettled(Array.from({ length: MAX_PAGES }, (_, i) => readReviewsPage(i + 1, fetcher, HOME_READ_TIMEOUT_MS)));
  if (firstRead.status === "rejected") throw firstRead.reason;
  const first = firstRead.value;
  if (first.reviews.length === 0 && first.photos.length === 0) throw new Error("unexpected reviews page");
  let merged: InkReviewsPage = first;
  let partial = false;
  const seen = new Set(first.reviews.map(reviewKey));
  for (const [i, later] of laterReads.entries()) {
    const n = i + 2;
    if (merged.nextPage !== n || featuredCount(merged.reviews) >= HOME_REVIEWS_MAX) break;
    if (later.status === "rejected") {
      partial = true;
      console.warn(JSON.stringify({ event: "reviews.page-error", page: n, reason: reason(later.reason) }));
      break;
    }
    const fresh = later.value.reviews.filter((r) => !seen.has(reviewKey(r)));
    for (const r of fresh) seen.add(reviewKey(r));
    merged = { ...merged, reviews: [...merged.reviews, ...fresh], nextPage: later.value.nextPage };
  }
  return partial ? { ...merged, partial: true } : merged;
}

let lastGood: { at: number; value: InkReviewsPage } | null = null;

/**
 * The page, with the last good one as the answer while INK fails (up to REVIEWS_STALE_MS); null when there is none. Never throws. A PARTIAL read (a later
 * page failed: fewer cards) does not replace a fuller one still inside the window: INK being slow for a moment must not take the cards off the home.
 */
export async function cachedReviewsPage(now: number = Date.now(), read: () => Promise<HomeRead> = readInkReviews): Promise<InkReviewsPage | null> {
  try {
    const { partial, ...value } = await read();
    if (partial && lastGood && now - lastGood.at < REVIEWS_STALE_MS && featuredCount(lastGood.value.reviews) > featuredCount(value.reviews)) return lastGood.value;
    lastGood = { at: now, value };
    return value;
  } catch (error) {
    console.warn(JSON.stringify({ event: "reviews.ink-error", reason: reason(error) }));
    return lastGood && now - lastGood.at < REVIEWS_STALE_MS ? lastGood.value : null;
  }
}

/** Tests only. */
export function clearReviewsCache(): void {
  lastGood = null;
}

/** What the region's home shows, or null (other region, switched off, INK unreadable, or too little to show). */
export async function homeReviews(region: RegionSlug, read?: () => Promise<HomeRead>): Promise<InkReviewsPage | null> {
  if (!REVIEWS_REGIONS.includes(region) || !homeReviewsEnabled()) return null;
  const page = await cachedReviewsPage(Date.now(), read);
  return page ? selectHomeReviews(page) : null;
}
