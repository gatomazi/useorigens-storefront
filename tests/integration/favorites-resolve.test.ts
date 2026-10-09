import { describe, expect, test, vi } from "vitest";
import { allCities } from "@/lib/geo/cities";
import type { Catalog } from "@/lib/catalog/repository";
import type { UnrankedBinding } from "@/lib/catalog/types";

const city = allCities().find((c) => c.uf === "SC")!;

const binding: UnrankedBinding = {
  cityId: city.id,
  designFamily: "ponto-de-origem",
  designVariant: "base",
  commerceStoreKey: "use-sul",
  inkProductId: "111",
  slug: "produto-111",
  storeProductUrl: "https://www.usesul.com.br/usesul/product/produto-111",
  imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/x.jpg",
  price: 109.9,
  syncedAt: new Date().toISOString(),
};

const fakeCatalog: Pick<Catalog, "productsOfStore"> = {
  productsOfStore: (store) => (store === "use-sul" ? { merch: new Map(), cityDesigns: new Map([["111", binding]]) } : { merch: new Map(), cityDesigns: new Map() }),
};
vi.mock("@/lib/catalog/repository", () => ({ getCatalog: () => fakeCatalog }));

describe("GET /api/favorites/resolve", () => {
  const get = async (qs: string) => {
    const { GET } = await import("@/app/api/favorites/resolve/route");
    return GET(new Request(`https://useorigens.com.br/api/favorites/resolve${qs}`));
  };

  test("given a known id, then it comes back available with live title/price/url", async () => {
    const data = await (await get("?store=use-sul&ids=111")).json();
    expect(data.items).toEqual([{ inkProductId: "111", title: "Ponto de Origem", context: `${city.name} · ${city.uf}`, imageUrl: binding.imageUrl, price: 109.9, url: binding.storeProductUrl, available: true, purchaseId: "111", purchaseStoreKey: "use-sul" }]);
  });

  test("given a removed/unknown id, then it comes back unavailable, never a 500", async () => {
    const data = await (await get("?store=use-sul&ids=111,gone")).json();
    expect(data.items).toEqual([expect.objectContaining({ inkProductId: "111", available: true }), { inkProductId: "gone", available: false }]);
  });

  test("given no store, then 400", async () => {
    expect((await get("?ids=111")).status).toBe(400);
  });

  test("given an invalid store, then 400", async () => {
    expect((await get("?store=not-a-store&ids=111")).status).toBe(400);
  });

  test("given no ids, then an empty (not erroring) list", async () => {
    const data = await (await get("?store=use-sul")).json();
    expect(data.items).toEqual([]);
  });

  test("POST is not allowed", async () => {
    const { POST } = await import("@/app/api/favorites/resolve/route");
    expect(POST().status).toBe(405);
  });
});
