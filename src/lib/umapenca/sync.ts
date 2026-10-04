import "server-only";
import { umaPencaFeedUrl } from "../config/env";
import { parseUmaPencaFeed } from "./parse";
import { readUmaPencaSnapshot, writeUmaPencaSnapshot } from "./snapshot";
import type { ExcludedArticle, UmaPencaSnapshot } from "./types";

export type UmaPencaSyncResult =
  | { ok: true; changed: boolean; entryCount: number; articleCount: number; excluded: ExcludedArticle[] }
  | { ok: false; error: string };

const FETCH_TIMEOUT_MS = 20_000;
// Same thresholds as the INK catalog's `shouldPromoteStore`: a feed that suddenly shrinks this much is more likely broken than real.
const REGRESSION_THRESHOLD = 0.5;
const REGRESSION_FLOOR = 5;

/** Pure gate, unit-tested: last-known-good wins over a feed that comes back empty or far smaller than before. */
export function shouldPromoteArticles(previousCount: number, nextCount: number): { promote: true } | { promote: false; reason: string } {
  if (nextCount === 0 && previousCount > 0) {
    return { promote: false, reason: `feed has 0 usable articles but the snapshot has ${previousCount} — refusing to blank the section` };
  }
  if (previousCount > REGRESSION_FLOOR && nextCount < previousCount * REGRESSION_THRESHOLD) {
    return { promote: false, reason: `feed has only ${nextCount} usable articles, down from ${previousCount} — looks like a partial feed, refusing to promote` };
  }
  return { promote: true };
}

/**
 * Fetches the Uma Penca feed once (a single GET, read-only), parses it and promotes the result. The URL answers an HTML
 * 404 page with status 404 while the store's feed is not live, and an HTML store page with status 200 on a wrong path, so
 * anything that is not an XML feed is an error, never "zero articles". Used by `npm run umapenca:sync` and
 * `POST /api/admin/umapenca-sync`; revalidating pages is the route's job.
 */
export async function syncUmaPenca(options: { fetchImpl?: typeof fetch; filePath?: string; now?: () => Date } = {}): Promise<UmaPencaSyncResult> {
  const feedUrl = umaPencaFeedUrl();
  if (!feedUrl) return { ok: false, error: "UMAPENCA_FEED_URL is not configured" };
  const fetchImpl = options.fetchImpl ?? fetch;

  let xml: string;
  try {
    const res = await fetchImpl(feedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "application/xml, text/xml;q=0.9, */*;q=0.1" } });
    if (!res.ok) return { ok: false, error: `feed answered HTTP ${res.status}` };
    xml = await res.text();
  } catch (err) {
    return { ok: false, error: `could not fetch the feed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!/<(feed|rss)\b/.test(xml.slice(0, 2000))) return { ok: false, error: "response is not an Atom/RSS feed (got an HTML page?)" };

  const parsed = parseUmaPencaFeed(xml);
  const previous = readUmaPencaSnapshot(options.filePath);
  const gate = shouldPromoteArticles(previous?.articles.length ?? 0, parsed.articles.length);
  if (!gate.promote) return { ok: false, error: gate.reason };

  const changed = JSON.stringify(previous?.articles ?? null) !== JSON.stringify(parsed.articles);
  if (changed) {
    const snapshot: UmaPencaSnapshot = { version: 1, syncedAt: (options.now?.() ?? new Date()).toISOString(), articles: parsed.articles };
    await writeUmaPencaSnapshot(snapshot, options.filePath);
  }
  return { ok: true, changed, entryCount: parsed.entryCount, articleCount: parsed.articles.length, excluded: parsed.excluded };
}
