import "server-only";
import type { InkProductNormalized } from "../catalog/types";
import type { CommerceStoreKey } from "../geo/regions";
import { INK_API_BASE_URL, tokenFor } from "./config";
import { normalizeInkProduct } from "./normalize";

/**
 * INK allows 100 req/min per store, shared by every integration on that store.
 * Stay far below it: one request every 1.5 s (~40/min), never parallel within a store.
 */
const PACE_MS = 1500;
const BACKOFF_MS = [15_000, 30_000, 60_000, 60_000] as const;
const PER_PAGE = 100;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class InkApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InkApiError";
  }
}

async function getJson(url: string, token: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    // Read-only integration: GET only. Credentials travel only in the Authorization header.
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.status === 429 && attempt < BACKOFF_MS.length) {
      await sleep(BACKOFF_MS[attempt]);
      continue;
    }
    if (!res.ok) throw new InkApiError(`INK responded ${res.status}`, res.status);
    return res.json();
  }
}

export type FetchProgress = (info: { storeKey: CommerceStoreKey; page: number; totalPages: number }) => void;

/** Fetches every visible, published product of one store. Throws on any non-recoverable failure. */
export async function fetchStoreProducts(
  storeKey: CommerceStoreKey,
  onProgress?: FetchProgress,
): Promise<{ products: InkProductNormalized[]; rejected: number }> {
  const token = tokenFor(storeKey);
  if (!token) throw new InkApiError(`missing credential for ${storeKey}`, 0);

  const products: InkProductNormalized[] = [];
  let rejected = 0;
  let totalPages = 1;

  for (let page = 1; page <= totalPages; page++) {
    const url = `${INK_API_BASE_URL}/v1/stores/products?visible_in_store=true&per_page=${PER_PAGE}&page=${page}`;
    const body = (await getJson(url, token)) as { products?: unknown; total_pages?: unknown };
    if (!Array.isArray(body.products) || typeof body.total_pages !== "number") {
      throw new InkApiError("unexpected INK response shape", 200);
    }
    totalPages = body.total_pages;

    for (const raw of body.products) {
      const product = normalizeInkProduct(raw, storeKey);
      if (product) products.push(product);
      else rejected++;
    }
    onProgress?.({ storeKey, page, totalPages });
    if (page < totalPages) await sleep(PACE_MS);
  }
  return { products, rejected };
}
