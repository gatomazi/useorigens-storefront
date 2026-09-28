import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/cart-mirror/route";
import { CART_MIRROR_STORES, cartRefStorageKey, inkCartUrlFor, inkOriginFor, upstreamCartRefUrlFor } from "@/lib/cart-mirror/constants";
import { resolveCartRef } from "@/lib/cart-mirror/resolve";
import { REGION_SLUGS } from "@/lib/geo/regions";

// Each region's INK store has its OWN Worker and KV: the token minted by /norte lives only in the Norte Worker, so the storefront must read it
// there and send the visitor back to the Norte INK cart (never to the Sul). Region defaults to "sul" everywhere (the original behavior).
const REF = "AbCdEfGhIjKlMnOpQrStUv";
const IMG = "https://gcp-images.majestic.ink.rsvcloud.com/images/product_art/final_image/1880b16e4d326a02dea0508acc56925d.jpg";
const body = JSON.stringify({
  v: 1, count: 1, items: [{ productId: "4159992", name: "Lábrea Origem", color: "Preta", size: "M", variant: "Preta-Masculino-M", quantity: 1, linePriceText: "R$ 109,90", linePrice: 109.9, image: IMG }],
  subtotal: 109.9, discount: 0, total: 109.9, totalText: "R$ 109,90", ageSeconds: 5, expiresInSeconds: 1795,
});
const upstream = () => new Response(body, { status: 200, headers: { "content-type": "application/json" } });

describe("regional cart mirror: constants", () => {
  test("every region has its own INK origin, Worker URL and cart page; nothing is shared and nothing points to another region", () => {
    expect(new Set(REGION_SLUGS)).toEqual(new Set(Object.keys(CART_MIRROR_STORES)));
    const origins = REGION_SLUGS.map(inkOriginFor);
    expect(new Set(origins).size).toBe(REGION_SLUGS.length);
    expect(inkOriginFor("sul")).toBe("https://www.usesul.com.br");
    expect(inkOriginFor("norte")).toBe("https://www.usenorte.com.br");
    expect(inkOriginFor("centro-oeste")).toBe("https://www.usecentro.com.br");
    for (const region of REGION_SLUGS) {
      const store = CART_MIRROR_STORES[region];
      expect(store.origin.startsWith("https://www.use")).toBe(true);
      expect(upstreamCartRefUrlFor(region)).toBe(`${store.origin}/__origens/cart-ref/`);
      const cart = new URL(inkCartUrlFor(region));
      expect(cart.origin).toBe(store.origin);
      expect(cart.searchParams.get("origens_open_cart")).toBe("1");
      expect(cart.pathname).toMatch(/^\/use(sul|norte|centro)\/product\/[a-z0-9_-]+$/);
      expect(cart.pathname.startsWith(`/${store.origin.match(/www\.(use[a-z]+)\./)![1]}/`)).toBe(true);
    }
    expect(inkCartUrlFor("sul")).toBe("https://www.usesul.com.br/usesul/product/serra-catarinense?origens_open_cart=1");
  });
  test("the session key is per region and the Sul keeps the original key", () => {
    expect(cartRefStorageKey("sul")).toBe("origens:cart_ref");
    expect(cartRefStorageKey("norte")).toBe("origens:cart_ref:norte");
    expect(cartRefStorageKey("centro-oeste")).toBe("origens:cart_ref:centro-oeste");
  });
});

describe("regional cart mirror: server → the region's own Worker", () => {
  test.each([
    ["sul", "https://www.usesul.com.br"],
    ["norte", "https://www.usenorte.com.br"],
    ["centro-oeste", "https://www.usecentro.com.br"],
  ] as const)("resolveCartRef for %s asks %s and nowhere else", async (region, origin) => {
    const fetchMock = vi.fn(async () => upstream());
    const result = await resolveCartRef(REF, fetchMock as unknown as typeof fetch, region);
    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`${origin}/__origens/cart-ref/${REF}`);
  });
  test("without a region the original Sul lookup is kept", async () => {
    const fetchMock = vi.fn(async () => upstream());
    await resolveCartRef(REF, fetchMock as unknown as typeof fetch);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`https://www.usesul.com.br/__origens/cart-ref/${REF}`);
  });
});

describe("GET /api/cart-mirror?region=", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const call = (query: string) => GET(new Request(`https://useorigens.com.br/api/cart-mirror${query}`, { headers: { cookie: "session=secret", authorization: "Bearer secret" } }));
  beforeEach(() => {
    fetchMock = vi.fn(async () => upstream());
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test.each([
    ["norte", "https://www.usenorte.com.br"],
    ["centro-oeste", "https://www.usecentro.com.br"],
    ["sul", "https://www.usesul.com.br"],
  ])("region=%s reads the token at %s only; the visitor's cookies never travel", async (region, origin) => {
    const response = await call(`?ref=${REF}&region=${region}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${origin}/__origens/cart-ref/${REF}`);
    expect(JSON.stringify(init.headers)).toBe("{}");
    expect(init.credentials).toBe("omit");
  });
  test("no region = Sul (backward compatible)", async () => {
    await call(`?ref=${REF}`);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`https://www.usesul.com.br/__origens/cart-ref/${REF}`);
  });
  test.each(["", "centro", "use-norte", "NORTE", "norte,sul", "../sul", "https://evil.example", "sul%0d"])("an unknown region %j is a plain 404, never a lookup anywhere", async (region) => {
    const response = await call(`?ref=${REF}&region=${encodeURIComponent(region)}`);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("a token from another region simply is not found there (the Worker answers 404): neutral state, no fallback to another Worker", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    const response = await call(`?ref=${REF}&region=norte`);
    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("regional token store", () => {
  let session: Map<string, string>;
  const mk = (data: Map<string, string>) => ({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
  beforeEach(() => {
    vi.resetModules();
    session = new Map();
    vi.stubGlobal("window", { sessionStorage: mk(session) });
  });
  afterEach(() => vi.unstubAllGlobals());
  const OTHER = "ZyXwVuTsRqPoNmLkJiHgFe";

  test("tokens of different regions live under different keys and never see each other", async () => {
    const store = await import("@/lib/cart-mirror/token-store");
    store.setToken(REF, "norte");
    store.setToken(OTHER, "centro-oeste");
    expect(Object.fromEntries(session)).toEqual({ "origens:cart_ref:norte": REF, "origens:cart_ref:centro-oeste": OTHER });
    expect(store.getToken("norte")).toBe(REF);
    expect(store.getToken("centro-oeste")).toBe(OTHER);
    expect(store.getToken("sul")).toBeNull();
    expect(store.getToken()).toBeNull();
    store.clearToken("norte");
    expect(store.getToken("norte")).toBeNull();
    expect(store.getToken("centro-oeste")).toBe(OTHER);
  });
  test("the Sul key is unchanged and blocked storage falls back to memory per region", async () => {
    const store = await import("@/lib/cart-mirror/token-store");
    store.setToken(REF);
    expect([...session.keys()]).toEqual(["origens:cart_ref"]);
    const boom = () => { throw new Error("blocked"); };
    vi.stubGlobal("window", { sessionStorage: { getItem: boom, setItem: boom, removeItem: boom } });
    store.setToken(OTHER, "norte");
    expect(store.getToken("norte")).toBe(OTHER);
    expect(store.getToken("sul")).toBeNull();
    store.clearToken("norte");
    expect(store.getToken("norte")).toBeNull();
  });
});
