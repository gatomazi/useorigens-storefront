import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchGarmentSourceProducts } from "@/lib/ink/garment-client";
import { InkApiError } from "@/lib/ink/client";

const pageOf = (u: string | URL | Request): number => Number(new URL(String(u)).searchParams.get("page"));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const product = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Tijucas | Traço SC",
  slug: "tijucas-traco-sc",
  store_product_url: "https://www.usesul.com.br/usesul/product/tijucas-traco-sc",
  main_image_url: "https://gcp-images.majestic.ink.rsvcloud.com/x.jpg",
  price: "109.9",
  product_cluster_id: 441506,
  product_type: { id: 1, name: "Camiseta" },
  created_at: "2026-05-06T21:29:36-03:00",
  status: "published",
  visible_in_store: true,
  ...over,
});
const page = (items: unknown[], meta: Partial<{ page: number; total_pages: number }> = {}) => ({ products: items, page: 1, per_page: 100, total_pages: 1, ...meta });
const noSleep = async () => undefined;

describe("fetchGarmentSourceProducts (no visible_in_store filter, resumable, incremental)", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, INK_TOKEN_SUL: "test-token-not-real" };
  });
  afterEach(() => {
    process.env = env;
  });

  test("given two pages, when fetched, then no visible_in_store param is sent and both pages are read in order", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (u: string | URL | Request) => {
      calls.push(String(u));
      return pageOf(u) === 1 ? json(page([product({ id: 1 })], { page: 1, total_pages: 2 })) : json(page([product({ id: 2 })], { page: 2, total_pages: 2 }));
    }) as unknown as typeof fetch;

    const result = await fetchGarmentSourceProducts("use-sul", { deps: { fetchImpl, sleep: noSleep } });
    expect(result.products.map((p) => p.id)).toEqual(["1", "2"]);
    expect(result.requestsUsedThisCall).toBe(2);
    expect(result.lastPageCompleted).toBe(2);
    expect(result.truncated).toBe(false);
    expect(calls.every((u) => !u.includes("visible_in_store"))).toBe(true);
  });

  test("given sinceCreatedAt, when fetched, then begin_date is sent with that exact value", async () => {
    let seenUrl = "";
    const fetchImpl = (async (u: string | URL | Request) => {
      seenUrl = String(u);
      return json(page([product()]));
    }) as unknown as typeof fetch;
    await fetchGarmentSourceProducts("use-sul", { sinceCreatedAt: "2026-09-20", deps: { fetchImpl, sleep: noSleep } });
    expect(seenUrl).toContain("begin_date=2026-09-20");
  });

  test("given maxRequests below the total page count, when fetched, then it stops mid-crawl and reports truncated with the correct resume page", async () => {
    const fetchImpl = (async (u: string | URL | Request) => json(page([product({ id: pageOf(u) })], { page: pageOf(u), total_pages: 5 }))) as unknown as typeof fetch;
    const result = await fetchGarmentSourceProducts("use-sul", { maxRequests: 2, deps: { fetchImpl, sleep: noSleep } });
    expect(result.requestsUsedThisCall).toBe(2);
    expect(result.lastPageCompleted).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.totalPages).toBe(5);
  });

  test("given startPage, when fetched, then it resumes exactly there instead of restarting from page 1", async () => {
    const seenPages: number[] = [];
    const fetchImpl = (async (u: string | URL | Request) => {
      seenPages.push(pageOf(u));
      return json(page([product({ id: pageOf(u) })], { page: pageOf(u), total_pages: 5 }));
    }) as unknown as typeof fetch;
    const result = await fetchGarmentSourceProducts("use-sul", { startPage: 4, maxRequests: 2, deps: { fetchImpl, sleep: noSleep } });
    expect(seenPages).toEqual([4, 5]);
    expect(result.lastPageCompleted).toBe(5);
    expect(result.truncated).toBe(false); // reached total_pages exactly at the cap — not a forced cutoff
  });

  test("given a 429, when fetched, then it retries the same page after base backoff plus jitter", async () => {
    const sleeps: number[] = [];
    let attempt = 0;
    const fetchImpl = (async () => (++attempt === 1 ? json({}, 429) : json(page([product()])))) as unknown as typeof fetch;
    const result = await fetchGarmentSourceProducts("use-sul", {
      deps: { fetchImpl, sleep: async (ms) => void sleeps.push(ms), backoffMs: [10], jitter: () => 3 },
    });
    expect(sleeps).toEqual([13]); // base 10 + injected jitter 3
    expect(result.requestsUsedThisCall).toBe(2);
  });

  test("given persistent 429 beyond the backoff table, when fetched, then it gives up with the status", async () => {
    const fetchImpl = (async () => json({}, 429)) as unknown as typeof fetch;
    await expect(fetchGarmentSourceProducts("use-sul", { deps: { fetchImpl, sleep: noSleep, backoffMs: [1], jitter: () => 0 } })).rejects.toMatchObject({ status: 429 });
  });

  test("given a hidden (not_published) sibling, when normalized, then it is still returned — this client never filters by status/visible_in_store", async () => {
    const fetchImpl = (async () => json(page([product({ id: 2, product_type: { id: 178, name: "Camiseta Oversized" }, status: "not_published", visible_in_store: false })]))) as unknown as typeof fetch;
    const result = await fetchGarmentSourceProducts("use-sul", { deps: { fetchImpl, sleep: noSleep } });
    expect(result.products).toHaveLength(1);
    expect(result.products[0].garmentTypeId).toBe(178);
  });

  test("given the newest created_at across pages, when fetched, then it is reported as the watermark", async () => {
    const fetchImpl = (async (u: string | URL | Request) =>
      pageOf(u) === 1
        ? json(page([product({ id: 1, created_at: "2026-05-01T00:00:00Z" })], { page: 1, total_pages: 2 }))
        : json(page([product({ id: 2, created_at: "2026-09-20T00:00:00Z" })], { page: 2, total_pages: 2 }))) as unknown as typeof fetch;
    const result = await fetchGarmentSourceProducts("use-sul", { deps: { fetchImpl, sleep: noSleep } });
    expect(result.maxCreatedAtSeen).toBe("2026-09-20T00:00:00Z");
  });

  test("given a store without a token, when fetched, then it fails before any request", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(fetchGarmentSourceProducts("use-norte", { deps: { fetchImpl } })).rejects.toBeInstanceOf(InkApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("given an unexpected response shape, when fetched, then it throws instead of silently returning nothing", async () => {
    const fetchImpl = (async () => json({ nope: true })) as unknown as typeof fetch;
    await expect(fetchGarmentSourceProducts("use-sul", { deps: { fetchImpl, sleep: noSleep } })).rejects.toThrow(/unexpected/);
  });
});
