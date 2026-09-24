import "server-only";
import { parseCollectionsPage, sortCollections, type CollectionRecord, type IdMatcher } from "../catalog/collections";
import type { CommerceStoreKey } from "../geo/regions";
import { INK_API_BASE_URL, tokenFor } from "./config";

/**
 * Read-only, paginated reader of `GET /v1/stores/collections` (scope `store.categories.read`). GET only; the credential travels
 * only in the Authorization header. Same pacing and 429 back-off as the product client (INK allows 100 req/min per store, shared).
 *
 * Measured on 2026-09-23: `per_page=100` is accepted; Sul = 176 collections in 2 pages (3.7 MiB + 0.3 MiB), Norte = 22 in 1 page
 * (0.6 MiB), Centro = 26 in 1 page (0.7 MiB). The body is read as a stream and refused past MAX_BODY_BYTES so a pathological
 * response can never exhaust memory. Never called while serving a page.
 */
const PER_PAGE = 100;
const PACE_MS = 1500;
const BACKOFF_MS = [15_000, 30_000, 60_000, 60_000] as const;
const MAX_PAGES = 10;
export const MAX_BODY_BYTES = 40 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;

export class InkCollectionsError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "InkCollectionsError";
  }
}

export type CollectionsFetchDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  paceMs?: number;
  backoffMs?: readonly number[];
};

async function readCapped(res: Response): Promise<unknown> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new InkCollectionsError(`response declares ${declared} bytes (> ${MAX_BODY_BYTES})`);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new InkCollectionsError(`response exceeded ${MAX_BODY_BYTES} bytes`);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Fetches every collection of one store, reducing each page as it arrives. Throws on any non-recoverable problem. */
export async function fetchStoreCollections(
  storeKey: CommerceStoreKey,
  match: IdMatcher,
  deps: CollectionsFetchDeps = {},
): Promise<{ collections: CollectionRecord[]; totalCount: number; requests: number }> {
  const token = tokenFor(storeKey);
  if (!token) throw new InkCollectionsError(`missing credential for ${storeKey}`);
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pace = deps.paceMs ?? PACE_MS;
  const backoff = deps.backoffMs ?? BACKOFF_MS;

  const all: CollectionRecord[] = [];
  let totalPages = 1;
  let totalCount = 0;
  let requests = 0;

  for (let page = 1; page <= totalPages; page++) {
    if (page > MAX_PAGES) throw new InkCollectionsError(`refusing to read more than ${MAX_PAGES} pages`);
    let body: unknown;
    for (let attempt = 0; ; attempt++) {
      requests++;
      const res = await doFetch(`${INK_API_BASE_URL}/v1/stores/collections?per_page=${PER_PAGE}&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.status === 429 && attempt < backoff.length) {
        await sleep(backoff[attempt]);
        continue;
      }
      if (!res.ok) throw new InkCollectionsError(`INK responded ${res.status}`, res.status);
      body = await readCapped(res);
      break;
    }
    const parsed = parseCollectionsPage(body, match);
    if (!parsed.ok) throw new InkCollectionsError(`unexpected INK response: ${parsed.error}`, 200);
    if (parsed.value.page !== page) throw new InkCollectionsError(`asked for page ${page}, INK answered page ${parsed.value.page}`, 200);
    totalPages = parsed.value.totalPages;
    totalCount = parsed.value.totalCount;
    all.push(...parsed.value.collections);
    if (page < totalPages) await sleep(pace);
  }
  // A collection can move between pages while we read; a duplicate id would double-count, so it is an error, not a merge.
  if (new Set(all.map((c) => c.id)).size !== all.length) throw new InkCollectionsError("duplicate collection ids across pages");
  return { collections: sortCollections(all), totalCount, requests };
}
