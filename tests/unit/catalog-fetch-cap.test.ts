import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchStoreProducts, InkApiError } from "@/lib/ink/client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rawProduct = (id: number) => ({
  id,
  name: `Tijucas | Traço SC ${id}`,
  slug: `tijucas-traco-sc-${id}`,
  store_product_url: "https://www.usesul.com.br/usesul/product/x",
  main_image_url: "https://gcp-images.majestic.ink.rsvcloud.com/x.jpg",
  price: "109.9",
  status: "published",
  visible_in_store: true,
});

describe("fetchStoreProducts request cap", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, INK_TOKEN_SUL: "test-token-not-real" };
  });
  afterEach(() => {
    process.env = env;
    vi.unstubAllGlobals();
  });

  test("given a catalog longer than the cap, when fetched, then it throws instead of returning a truncated catalog", async () => {
    const fetchMock = vi.fn(async () => json({ products: [rawProduct(1)], total_pages: 5 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchStoreProducts("use-sul", undefined, 2)).rejects.toBeInstanceOf(InkApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("given a catalog within the cap, when fetched, then it reports the real number of GETs", async () => {
    const fetchMock = vi.fn(async () => json({ products: [rawProduct(1)], total_pages: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchStoreProducts("use-sul", undefined, 3);
    expect(result.requests).toBe(1);
    expect(result.products).toHaveLength(1);
  });
});
