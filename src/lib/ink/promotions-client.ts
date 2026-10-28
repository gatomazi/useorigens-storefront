import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { InkApiError } from "./client";
import { INK_API_BASE_URL, tokenFor } from "./config";
import { normalizeProgressivePromotion, type InkProgressivePromotion } from "./progressive-promotions";

/**
 * Reads the store's progressive promotions from INK (scope `store.promotions.read`, the same read token as the syncs). GET only, no retry loop: the panel
 * and the public kit route call it on a request path, so a slow INK must fail fast (4 s) instead of holding the page. INK allows 100 req/min per store,
 * shared by every integration: the public route goes through `cachedProgressivePromotion` (one INK read per promotion every few minutes at most).
 */
const TIMEOUT_MS = 4000;
const PER_PAGE = 100;
const MAX_PAGES = 3;

async function inkGet(storeKey: CommerceStoreKey, path: string): Promise<{ status: number; body: unknown }> {
  const token = tokenFor(storeKey);
  if (!token) throw new InkApiError(`missing credential for ${storeKey}`, 0);
  const res = await fetch(`${INK_API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) throw new InkApiError(`INK responded ${res.status}`, res.status);
  return { status: res.status, body: await res.json() };
}

/** Every progressive promotion of the store (the panel's list). `ignored` = the ones INK sent off the documented shape. Throws when INK cannot be read. */
export async function listProgressivePromotions(storeKey: CommerceStoreKey): Promise<{ promotions: InkProgressivePromotion[]; ignored: number }> {
  const promotions: InkProgressivePromotion[] = [];
  let ignored = 0;
  for (let page = 1, total = 1; page <= total && page <= MAX_PAGES; page++) {
    const { body } = await inkGet(storeKey, `/v1/stores/promotions?type=progressive&per_page=${PER_PAGE}&page=${page}`);
    const data = body as { promotions?: unknown; total_pages?: unknown } | null;
    if (!data || !Array.isArray(data.promotions) || typeof data.total_pages !== "number") throw new InkApiError("unexpected INK response shape", 200);
    total = data.total_pages;
    for (const raw of data.promotions) {
      const p = normalizeProgressivePromotion(raw);
      if (p) promotions.push(p);
      else ignored++;
    }
  }
  return { promotions, ignored };
}

/** One promotion, read now. null = INK says it does not exist (deleted) or it is not a usable progressive promotion. Throws when INK cannot be read. */
export async function fetchProgressivePromotion(storeKey: CommerceStoreKey, id: number): Promise<InkProgressivePromotion | null> {
  const { status, body } = await inkGet(storeKey, `/v1/stores/promotions/${id}`);
  if (status === 404) return null;
  const p = normalizeProgressivePromotion((body as { promotion?: unknown } | null)?.promotion);
  return p && p.id === id ? p : null;
}

/** Fresh for this long; after it, the next request reads INK again. */
export const KIT_PROMOTION_FRESH_MS = 5 * 60_000;
/** While INK is failing (timeout, 5xx, 429), the last good answer is still served for this long; after it, the block goes away. */
export const KIT_PROMOTION_STALE_MS = 30 * 60_000;

/** After a failed read, INK is not asked again for this long (the 100 req/min are shared with the syncs): the stale answer, or nothing, meanwhile. */
export const KIT_PROMOTION_RETRY_MS = 60_000;

type Entry = { at: number; value: InkProgressivePromotion | null };
const cache = new Map<string, Entry>();
const failures = new Map<string, number>();
const pending = new Map<string, Promise<InkProgressivePromotion | null>>();
const staleOf = (hit: Entry | undefined, now: number): InkProgressivePromotion | null => (hit && now - hit.at < KIT_PROMOTION_STALE_MS ? hit.value : null);

/**
 * The promotion for the public kit route, cached per process. A definitive answer (found, or INK's 404) replaces the entry; a failure keeps the last good
 * one while it is younger than KIT_PROMOTION_STALE_MS, and is null after that (no block is better than an old discount). A failure is remembered for
 * KIT_PROMOTION_RETRY_MS (no new INK read meanwhile). Concurrent misses share one read.
 */
export function cachedProgressivePromotion(storeKey: CommerceStoreKey, id: number, now: number = Date.now(), read: typeof fetchProgressivePromotion = fetchProgressivePromotion): Promise<InkProgressivePromotion | null> {
  const key = `${storeKey}:${id}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < KIT_PROMOTION_FRESH_MS && hit.at <= now) return Promise.resolve(hit.value);
  const failedAt = failures.get(key);
  if (failedAt !== undefined && now - failedAt < KIT_PROMOTION_RETRY_MS && failedAt <= now) return Promise.resolve(staleOf(hit, now));
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const job = read(storeKey, id)
    .then((value) => {
      if (cache.size > 32) cache.clear();
      cache.set(key, { at: now, value });
      failures.delete(key);
      return value;
    })
    .catch((error: unknown) => {
      console.warn(JSON.stringify({ event: "post-add-kit.ink-error", store: storeKey, promotion: id, reason: String(error instanceof Error ? error.message : error).slice(0, 60) }));
      failures.set(key, now);
      return staleOf(hit, now);
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

/** Tests only. */
export function clearKitPromotionCache(): void {
  cache.clear();
  failures.clear();
  pending.clear();
}
