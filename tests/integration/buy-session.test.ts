import { beforeEach, describe, expect, test, vi } from "vitest";
import { allCities } from "@/lib/geo/cities";
import type { Catalog } from "@/lib/catalog/repository";
import type { UnrankedBinding, MerchProduct } from "@/lib/catalog/types";

const city = allCities().find((c) => c.uf === "SC")!;

const binding = (over: Partial<UnrankedBinding> = {}): UnrankedBinding => ({
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
  ...over,
});

const merch = (over: Partial<MerchProduct> = {}): MerchProduct => ({
  inkProductId: "222",
  commerceStoreKey: "use-sul",
  regionSlug: "sul",
  name: "Camiseta Expressão",
  slug: "expressao",
  storeProductUrl: "https://www.usesul.com.br/usesul/product/expressao",
  imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/y.jpg",
  price: 99.9,
  totalSalesCount: 10,
  syncedAt: new Date().toISOString(),
  ...over,
});

const bindings = new Map<string, UnrankedBinding>([
  ["111", binding()],
  ["333", binding({ inkProductId: "333", price: 129.9 })],
]);
const merchMap = new Map<string, MerchProduct>([["222", merch()]]);

const fakeCatalog: Pick<Catalog, "productsOfStore"> = {
  productsOfStore: (store) => (store === "use-sul" ? { merch: merchMap, cityDesigns: bindings } : { merch: new Map(), cityDesigns: new Map() }),
};

vi.mock("@/lib/catalog/repository", () => ({ getCatalog: () => fakeCatalog }));

const SECRET = "b".repeat(32);

describe("POST /api/buy-session", () => {
  beforeEach(() => {
    process.env.LIST_SESSION_SECRET = SECRET;
    vi.resetModules();
  });

  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/buy-session/route");
    return POST(new Request("https://useorigens.com.br/api/buy-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  };

  test("given a valid store and eligible ids, then it mints a session and returns the first product's URL", async () => {
    const response = await post({ storeKey: "use-sul", inkProductIds: ["111", "222", "333"] });
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.sessionId).toEqual(expect.any(String));
    expect(data.firstProductUrl).toBe(binding().storeProductUrl);
    expect(data.total).toBe(3);
  });

  test("given ids that don't resolve in the catalog, then they are silently dropped", async () => {
    const response = await post({ storeKey: "use-sul", inkProductIds: ["111", "does-not-exist"] });
    const data = await response.json();
    expect(data.total).toBe(1);
  });

  test("given no eligible items at all, then 422", async () => {
    const response = await post({ storeKey: "use-sul", inkProductIds: ["nope"] });
    expect(response.status).toBe(422);
  });

  test("given a store with nothing in the catalog, then 422 (no open redirect to a foreign store's guess)", async () => {
    const response = await post({ storeKey: "use-norte", inkProductIds: ["111"] });
    expect(response.status).toBe(422);
  });

  test("given a malformed body, then 400", async () => {
    expect((await post({ storeKey: 123, inkProductIds: ["111"] })).status).toBe(400);
    expect((await post({ storeKey: "use-sul" })).status).toBe(400);
  });

  test("given the secret is not configured, then 501", async () => {
    delete process.env.LIST_SESSION_SECRET;
    const response = await post({ storeKey: "use-sul", inkProductIds: ["111"] });
    expect(response.status).toBe(501);
  });

  test("GET is not allowed", async () => {
    const { GET } = await import("@/app/api/buy-session/route");
    expect(GET().status).toBe(405);
  });
});

describe("GET /api/buy-session/[id]", () => {
  beforeEach(() => {
    process.env.LIST_SESSION_SECRET = SECRET;
    vi.resetModules();
  });

  const get = async (id: string, query = "") => {
    const { GET } = await import("@/app/api/buy-session/[id]/route");
    return GET(new Request(`https://useorigens.com.br/api/buy-session/${id}${query}`), { params: Promise.resolve({ id }) });
  };
  const mint = async (ids: string[]) => {
    const { mintListSession } = await import("@/lib/favorites/session");
    return mintListSession("use-sul", ids)!;
  };

  test("given a fresh session, then the first item is next and position is 0", async () => {
    const id = await mint(["111", "222", "333"]);
    const response = await get(id);
    const data = await response.json();
    expect(data.next.inkProductId).toBe("111");
    expect(data.position).toBe(0);
    expect(data.total).toBe(3);
  });

  test("given the first item marked done, then the second is next — repeating the same call is idempotent", async () => {
    const id = await mint(["111", "222", "333"]);
    const first = await (await get(id, "?done=111")).json();
    const second = await (await get(id, "?done=111")).json();
    expect(first.next.inkProductId).toBe("222");
    expect(first.position).toBe(1);
    expect(second).toEqual(first); // same input, same output: nothing advances on its own
  });

  test("given every item done, then next is null without inventing a suggestion", async () => {
    const id = await mint(["111", "222"]);
    const data = await (await get(id, "?done=111,222")).json();
    expect(data).toEqual({ next: null, position: 2, total: 2 });
  });

  test("given a done id that was delisted since minting, then it is skipped for the next real candidate", async () => {
    const id = await mint(["111", "does-not-resolve", "333"]);
    const data = await (await get(id)).json();
    expect(data.next.inkProductId).toBe("111"); // first candidate still resolves
    const data2 = await (await get(id, "?done=111")).json();
    expect(data2.next.inkProductId).toBe("333"); // skips the delisted middle one
  });

  test("given an invalid or unsigned id, then 404", async () => {
    expect((await get("garbage")).status).toBe(404);
    expect((await get("")).status).toBe(404);
  });

  test("given an expired session, then 404", async () => {
    vi.useFakeTimers();
    try {
      const id = await mint(["111"]);
      const { LIST_SESSION_TTL_SECONDS } = await import("@/lib/favorites/session");
      vi.advanceTimersByTime((LIST_SESSION_TTL_SECONDS + 1) * 1000);
      expect((await get(id)).status).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  });

  test("POST is not allowed", async () => {
    const { POST } = await import("@/app/api/buy-session/[id]/route");
    expect(POST().status).toBe(405);
  });
});
