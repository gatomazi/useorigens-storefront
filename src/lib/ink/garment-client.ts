import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { InkApiError } from "./client";
import { INK_API_BASE_URL, tokenFor } from "./config";
import { normalizeGarmentSourceProduct, type GarmentSourceProduct } from "./normalize";

/**
 * Same store budget as the main product client (100 req/min/store, shared with every other INK
 * integration) — never parallel within a store, 1.5s apart. Unlike `client.ts`'s `fetchStoreProducts`, this
 * one does NOT send `visible_in_store=true`: the whole point is to also see the hidden-but-sellable garment
 * siblings (docs/storefront/city-garment-tabs-round.md). It supports `begin_date` (documented INK filter,
 * confirmed live: narrows by `created_at`) for incremental runs, and can be paused/resumed by page — a full
 * crawl of one store is ~300-1100 pages depending on store size, deliberately never run unattended without
 * the product owner's explicit go-ahead (see docs/storefront/city-garment-catalog-rollout.md).
 */
const PACE_MS = 1500;
const BASE_BACKOFF_MS = [15_000, 30_000, 60_000, 60_000] as const;
const PER_PAGE = 100;

/** Full jitter (AWS-style): random delay in [0, ms] added on top of the base backoff step, so many
 * concurrent callers hitting 429 together don't all retry in lockstep. Injectable for deterministic tests. */
function defaultJitter(ms: number): number {
  return Math.floor(Math.random() * ms);
}

export type GarmentFetchDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  paceMs?: number;
  backoffMs?: readonly number[];
  jitter?: (ms: number) => number;
};

export type GarmentPageProgress = (info: {
  storeKey: CommerceStoreKey;
  page: number;
  totalPages: number;
  requestsUsedThisCall: number;
}) => void;

export type GarmentFetchOptions = {
  /** `begin_date` filter (YYYY-MM-DD), confirmed live to narrow by `created_at`. Omit for a full crawl. */
  sinceCreatedAt?: string;
  /** Resume from this page (1-based) instead of page 1 — the checkpoint's `lastPageCompleted + 1`. */
  startPage?: number;
  /** Safety cap: this single call never issues more than this many HTTP requests, regardless of pages left.
   * Reaching it stops cleanly mid-crawl (never mid-page) and reports `truncated: true` so the caller can
   * checkpoint and resume later — this is what makes the crawl interruptible/resumable by design, not just
   * by accident. */
  maxRequests?: number;
  onProgress?: GarmentPageProgress;
  deps?: GarmentFetchDeps;
};

export type GarmentFetchResult = {
  products: GarmentSourceProduct[];
  requestsUsedThisCall: number;
  /** Last page whose products were fully read and normalized this call (not necessarily the store's last page). */
  lastPageCompleted: number;
  /** INK's own `total_pages` for this filter, as of this call — changes over time as the catalog grows. */
  totalPages: number;
  /** True when `maxRequests` was hit before `lastPageCompleted === totalPages`. */
  truncated: boolean;
  /** Newest `created_at` seen this call, ISO 8601 — the watermark for the next incremental `sinceCreatedAt`. */
  maxCreatedAtSeen: string | null;
  /** Raw products dropped by field validation (no https image/URL, missing id/name/slug) before linking. */
  rejected: number;
  /** Set when a transient failure outlived its retries AFTER at least one page was read: the pages already
   * read are returned (`truncated` is true) so the caller can checkpoint them instead of losing the run. */
  interruptedBy?: string;
};

/**
 * Paginated, resumable, rate-limited crawl of `GET /v1/stores/products` WITHOUT the `visible_in_store`
 * filter — sees both the classic (published/visible) product and its hidden-but-sellable garment-type
 * siblings. Pure I/O boundary: all pacing/backoff/jitter are injectable via `deps` so this is fully
 * unit-testable against a fake `fetchImpl`, no real network or timers in tests.
 */
export async function fetchGarmentSourceProducts(storeKey: CommerceStoreKey, options: GarmentFetchOptions = {}): Promise<GarmentFetchResult> {
  const token = tokenFor(storeKey);
  if (!token) throw new InkApiError(`missing credential for ${storeKey}`, 0);

  const doFetch = options.deps?.fetchImpl ?? fetch;
  const sleep = options.deps?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const pace = options.deps?.paceMs ?? PACE_MS;
  const backoff = options.deps?.backoffMs ?? BASE_BACKOFF_MS;
  const jitter = options.deps?.jitter ?? defaultJitter;

  const products: GarmentSourceProduct[] = [];
  let requestsUsedThisCall = 0;
  let page = options.startPage && options.startPage > 0 ? options.startPage : 1;
  let totalPages = page;
  let lastPageCompleted = page - 1;
  let maxCreatedAtSeen: string | null = null;
  let truncated = false;
  let rejected = 0;
  let interruptedBy: string | undefined;

  while (page <= totalPages) {
    if (options.maxRequests !== undefined && requestsUsedThisCall >= options.maxRequests) {
      truncated = true;
      break;
    }

    const qs = new URLSearchParams({ per_page: String(PER_PAGE), page: String(page) });
    if (options.sinceCreatedAt) qs.set("begin_date", options.sinceCreatedAt);
    const url = `${INK_API_BASE_URL}/v1/stores/products?${qs.toString()}`;

    let body: unknown;
    let interrupted: string | undefined;
    for (let attempt = 0; ; attempt++) {
      // The cap counts every HTTP attempt, retries included: a retry must not push past it.
      if (options.maxRequests !== undefined && requestsUsedThisCall >= options.maxRequests) {
        truncated = true;
        break;
      }
      requestsUsedThisCall++;
      let status: number;
      try {
        const res = await doFetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        status = res.status;
        if (res.ok) {
          body = await res.json();
          break;
        }
      } catch (err) {
        // Network-level failure (connection reset/terminated, timeout, body cut short): transient by nature.
        status = 0;
        interrupted = String(err);
      }
      const transient = status === 0 || status === 429 || status >= 500;
      if (transient && attempt < backoff.length) {
        await sleep(backoff[attempt] + jitter(backoff[attempt]));
        continue;
      }
      if (transient && lastPageCompleted >= (options.startPage ?? 1)) {
        truncated = true; // salvage: hand back the pages already read instead of losing the whole run
        interrupted = interrupted ?? `INK responded ${status}`;
        break;
      }
      throw new InkApiError(status === 0 ? `INK request failed: ${interrupted}` : `INK responded ${status}`, status);
    }
    if (truncated) {
      if (interrupted) interruptedBy = interrupted;
      break;
    }

    const parsed = body as { products?: unknown; total_pages?: unknown };
    if (!Array.isArray(parsed.products) || typeof parsed.total_pages !== "number") {
      throw new InkApiError("unexpected INK response shape", 200);
    }
    totalPages = parsed.total_pages;

    for (const raw of parsed.products) {
      const product = normalizeGarmentSourceProduct(raw, storeKey);
      if (!product) {
        rejected++;
        continue;
      }
      products.push(product);
      if (product.createdAt && (!maxCreatedAtSeen || product.createdAt > maxCreatedAtSeen)) maxCreatedAtSeen = product.createdAt;
    }

    options.onProgress?.({ storeKey, page, totalPages, requestsUsedThisCall });
    lastPageCompleted = page;
    page++;
    const moreToDo = page <= totalPages && !(options.maxRequests !== undefined && requestsUsedThisCall >= options.maxRequests);
    if (moreToDo) await sleep(pace);
  }

  return { products, requestsUsedThisCall, lastPageCompleted, totalPages, truncated, maxCreatedAtSeen, rejected, ...(interruptedBy ? { interruptedBy } : {}) };
}
