import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ageLabel } from "@/lib/cart-mirror/age";
import { parseSnapshot, safeImage } from "@/lib/cart-mirror/schema";
import { extractCartRef, withoutCartRef } from "@/lib/cart-mirror/url";
import { isValidRef, resolveCartRef } from "@/lib/cart-mirror/resolve";
import { GET, POST } from "@/app/api/cart-mirror/route";

const REF = "AbCdEfGhIjKlMnOpQrStUv"; // 22 chars, base64url
const IMG = "https://gcp-images.majestic.ink.rsvcloud.com/images/product_art/final_image/1880b16e4d326a02dea0508acc56925d.jpg";

type Raw = Record<string, unknown>;
const item = (over: Raw = {}): Raw => ({
  productId: "4932916", name: "Serra Catarinense", color: "Preta", size: "M", variant: "Preta-Masculino-M", quantity: 1,
  linePriceText: "R$ 109,90", linePrice: 109.9, image: IMG, ...over,
});
const snapshot = (over: Raw = {}): Raw => ({
  v: 1, count: 1, items: [item()], subtotal: 109.9, discount: 0, total: 109.9, totalText: "R$ 109,90", ageSeconds: 42, expiresInSeconds: 1758, ...over,
});
const many = (n: number): Raw => snapshot({ count: n, items: Array.from({ length: n }, (_, i) => item({ productId: String(1000 + i), size: ["P", "M", "G", "GG"][i % 4] })) });
const promo: Raw = snapshot({
  count: 3,
  items: [0, 1, 2].map((i) => item({ productId: String(2000 + i), linePriceText: "R$ 99,28", listPriceText: "R$ 109,90", linePrice: 99.28, listPrice: 109.9 })),
  totalText: "R$ 297,84",
});

const upstream = (body: unknown, init: ResponseInit = { status: 200, headers: { "content-type": "application/json" } }) => new Response(typeof body === "string" ? body : JSON.stringify(body), init);

describe("parseSnapshot (schema v1)", () => {
  test("given one item, then whitelisted typed fields come out", () => {
    const parsed = parseSnapshot(snapshot());
    expect(parsed).toEqual({
      v: 1, count: 1, totalText: "R$ 109,90", ageSeconds: 42, expiresInSeconds: 1758,
      items: [{ productId: "4932916", name: "Serra Catarinense", color: "Preta", size: "M", quantity: 1, linePriceText: "R$ 109,90", listPriceText: null, image: IMG }],
    });
  });

  test("given an empty cart, then count 0 and no items is valid", () => {
    expect(parseSnapshot(snapshot({ count: 0, items: [], totalText: undefined }))?.items).toEqual([]);
  });

  test("given 8 items, then all are kept in order", () => {
    const parsed = parseSnapshot(many(8));
    expect(parsed?.items).toHaveLength(8);
    expect(parsed?.items.map((i) => i.productId)).toEqual(["1000", "1001", "1002", "1003", "1004", "1005", "1006", "1007"]);
  });

  test("given a promotional cart, then struck list price and effective price are kept as printed", () => {
    const parsed = parseSnapshot(promo);
    expect(parsed?.items[0]).toMatchObject({ linePriceText: "R$ 99,28", listPriceText: "R$ 109,90" });
    expect(parsed?.totalText).toBe("R$ 297,84");
  });

  test("given unknown fields, then they are dropped, never forwarded", () => {
    const parsed = parseSnapshot(snapshot({ cookie: "x", items: [item({ csrf: "y", extra: 1 })] }));
    expect(JSON.stringify(parsed)).not.toMatch(/cookie|csrf|extra|variant|linePrice"|subtotal|discount/);
  });

  test.each([
    ["wrong version", snapshot({ v: 2 })],
    ["not an object", "x"],
    ["items not an array", snapshot({ items: "x" })],
    ["21 items", snapshot({ count: 21, items: Array.from({ length: 21 }, () => item()) })],
    ["count 0 with items", snapshot({ count: 0 })],
    ["items empty with count", snapshot({ items: [] })],
    ["negative age", snapshot({ ageSeconds: -1 })],
    ["fractional age", snapshot({ ageSeconds: 1.5 })],
    ["missing name", snapshot({ items: [item({ name: undefined })] })],
    ["zero quantity", snapshot({ items: [item({ quantity: 0 })] })],
    ["price without R$", snapshot({ items: [item({ linePriceText: "109,90" })] })],
    ["price with markup", snapshot({ items: [item({ linePriceText: "R$ 1<b>09,90" })] })],
    ["invalid struck price", snapshot({ items: [item({ listPriceText: "abc" })] })],
    ["invalid total text", snapshot({ totalText: "total" })],
    ["control chars in name", snapshot({ items: [item({ name: "a\u0000b" })] })],
    ["name too long", snapshot({ items: [item({ name: "x".repeat(161) })] })],
  ])("given %s, then it is rejected", (_label, raw) => {
    expect(parseSnapshot(raw)).toBeNull();
  });

  test("given a foreign or non-product_art image, then the photo is dropped but the cart survives", () => {
    for (const image of ["https://evil.example/images/product_art/x.jpg", "http://gcp-images.majestic.ink.rsvcloud.com/images/product_art/x.jpg", "https://gcp-images.majestic.ink.rsvcloud.com/images/other/x.jpg", "https://gcp-images.majestic.ink.rsvcloud.com/images/product_art/x.jpg?a=1", "https://user@gcp-images.majestic.ink.rsvcloud.com/images/product_art/x.jpg", "javascript:alert(1)"]) {
      expect(safeImage(image)).toBeNull();
      expect(parseSnapshot(snapshot({ items: [item({ image })] }))?.items[0].image).toBeNull();
    }
    expect(safeImage(IMG)).toBe(IMG);
  });
});

describe("cart_ref in the URL", () => {
  test("given a valid token and other params, then the token is extracted and the rest is preserved in order", () => {
    expect(extractCartRef(`?utm=a&cart_ref=${REF}&q=1`)).toEqual({ token: REF, present: true, search: "?utm=a&q=1" });
  });
  test("given only the token, then the query is empty", () => {
    expect(extractCartRef(`?cart_ref=${REF}`)).toEqual({ token: REF, present: true, search: "" });
  });
  test.each(["short", "x".repeat(23), "has space in it!!!!!!!", "<script>alert(1)</script>"])("given malformed token %j, then it is not a token but is still removed", (bad) => {
    const result = extractCartRef(`?a=1&cart_ref=${encodeURIComponent(bad)}`);
    expect(result).toEqual({ token: null, present: true, search: "?a=1" });
  });
  test("given no param, then nothing is present", () => {
    expect(extractCartRef("?a=1")).toEqual({ token: null, present: false, search: "?a=1" });
    expect(extractCartRef("")).toEqual({ token: null, present: false, search: "" });
  });
  test("given repeated params, then the first valid one wins and all are removed", () => {
    expect(extractCartRef(`?cart_ref=bad&cart_ref=${REF}`)).toEqual({ token: REF, present: true, search: "" });
  });
  test("given analytics queries, then the token is stripped and the rest kept", () => {
    expect(withoutCartRef(`a=1&cart_ref=${REF}`)).toBe("a=1");
    expect(withoutCartRef(`cart_ref=${REF}`)).toBe("");
  });
});

describe("age label", () => {
  test.each([[0, "Atualizado há poucos segundos"], [30, "Atualizado há poucos segundos"], [31, "Última atualização há 1 min"], [59, "Última atualização há 1 min"], [120, "Última atualização há 2 min"], [1500, "Última atualização há 25 min"]])("%is → %s", (seconds, label) => {
    expect(ageLabel(seconds)).toBe(label);
  });
  test("never says real time", () => {
    for (const s of [0, 10, 40, 900]) expect(ageLabel(s).toLowerCase()).not.toContain("tempo real");
  });
});

describe("sessionStorage token store", () => {
  let session: Map<string, string>;
  let local: Map<string, string>;
  const mkStorage = (data: Map<string, string>) => ({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
  beforeEach(() => {
    vi.resetModules();
    session = new Map();
    local = new Map();
    vi.stubGlobal("window", { sessionStorage: mkStorage(session), localStorage: mkStorage(local) });
  });
  afterEach(() => vi.unstubAllGlobals());

  test("given a valid token, then only the token is in sessionStorage and nothing is in localStorage", async () => {
    const store = await import("@/lib/cart-mirror/token-store");
    store.setToken(REF);
    expect([...session.entries()]).toEqual([["origens:cart_ref", REF]]);
    expect(local.size).toBe(0);
    expect(store.getToken()).toBe(REF); // a reload reads it back
  });
  test("given a malformed token, then nothing is persisted", async () => {
    const store = await import("@/lib/cart-mirror/token-store");
    store.setToken("nope");
    expect(session.size).toBe(0);
    expect(store.getToken()).toBeNull();
  });
  test("given malformed leftovers in storage, then they are discarded", async () => {
    session.set("origens:cart_ref", "junk");
    const store = await import("@/lib/cart-mirror/token-store");
    expect(store.getToken()).toBeNull();
    expect(session.has("origens:cart_ref")).toBe(false);
  });
  test("given blocked storage, then it falls back to memory without throwing", async () => {
    const boom = () => { throw new Error("blocked"); };
    vi.stubGlobal("window", { sessionStorage: { getItem: boom, setItem: boom, removeItem: boom } });
    const store = await import("@/lib/cart-mirror/token-store");
    store.setToken(REF);
    expect(store.getToken()).toBe(REF);
    store.clearToken();
    expect(store.getToken()).toBeNull();
  });
  test("given subscribers, then set and clear notify them", async () => {
    const store = await import("@/lib/cart-mirror/token-store");
    const listener = vi.fn();
    const off = store.subscribeToken(listener);
    store.setToken(REF);
    store.clearToken();
    off();
    store.setToken(REF);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("resolveCartRef (server → Worker)", () => {
  afterEach(() => vi.restoreAllMocks());

  test("given a valid ref, then the request is bare: fixed origin, no cookies, no Authorization, no-store, 2 s timeout", async () => {
    const fetchMock = vi.fn(async () => upstream(snapshot()));
    const result = await resolveCartRef(REF, fetchMock as unknown as typeof fetch);
    expect(result.status).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://www.usesul.com.br/__origens/cart-ref/${REF}`);
    expect(init).toMatchObject({ method: "GET", cache: "no-store", credentials: "omit", redirect: "manual", headers: {} });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(Object.keys(init.headers as object)).toEqual([]);
  });
  test("given an invalid ref, then no upstream call is made", async () => {
    const fetchMock = vi.fn();
    for (const bad of ["", "short", "../../etc/passwd", `${REF}x`, "a b c d e f g h i j k l"]) {
      expect(await resolveCartRef(bad, fetchMock as unknown as typeof fetch)).toEqual({ status: "not_found" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isValidRef(REF)).toBe(true);
    expect(isValidRef(undefined)).toBe(false);
  });
  test("given upstream 404 (unknown, expired or cart-mirror off), then not_found", async () => {
    expect(await resolveCartRef(REF, (async () => new Response("<html>404</html>", { status: 404 })) as typeof fetch)).toEqual({ status: "not_found" });
  });
  test.each([[500], [501], [429], [302], [403]])("given upstream %i, then unavailable without detail", async (status) => {
    expect(await resolveCartRef(REF, (async () => new Response("x", { status })) as typeof fetch)).toEqual({ status: "unavailable" });
  });
  test("given a timeout or network error, then unavailable", async () => {
    expect(await resolveCartRef(REF, (async () => { throw new DOMException("t", "TimeoutError"); }) as typeof fetch)).toEqual({ status: "unavailable" });
    expect(await resolveCartRef(REF, (async () => { throw new TypeError("fetch failed"); }) as typeof fetch)).toEqual({ status: "unavailable" });
  });
  test("given a 200 that is not JSON, invalid JSON or schema-invalid, then unavailable", async () => {
    expect(await resolveCartRef(REF, (async () => upstream("<html/>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch)).toEqual({ status: "unavailable" });
    expect(await resolveCartRef(REF, (async () => upstream("{oops")) as typeof fetch)).toEqual({ status: "unavailable" });
    expect(await resolveCartRef(REF, (async () => upstream(snapshot({ v: 9 }))) as typeof fetch)).toEqual({ status: "unavailable" });
  });
  test("given an oversized body, then unavailable", async () => {
    expect(await resolveCartRef(REF, (async () => upstream(JSON.stringify({ pad: "x".repeat(20_000) }))) as typeof fetch)).toEqual({ status: "unavailable" });
  });
  test("given a snapshot older than 30 minutes or already expired, then not_found", async () => {
    expect(await resolveCartRef(REF, (async () => upstream(snapshot({ ageSeconds: 1801 }))) as typeof fetch)).toEqual({ status: "not_found" });
    expect(await resolveCartRef(REF, (async () => upstream(snapshot({ expiresInSeconds: 0 }))) as typeof fetch)).toEqual({ status: "not_found" });
  });
  test("given an empty cart, 1 item, 8 items and a promo cart, then all resolve", async () => {
    for (const body of [snapshot({ count: 0, items: [], totalText: undefined }), snapshot(), many(8), promo]) {
      expect((await resolveCartRef(REF, (async () => upstream(body)) as typeof fetch)).status).toBe("ok");
    }
  });
});

describe("GET /api/cart-mirror", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const call = (query: string) => GET(new Request(`https://useorigens.com.br/api/cart-mirror${query}`, { headers: { cookie: "session=secret", authorization: "Bearer secret" } }));
  beforeEach(() => {
    fetchMock = vi.fn(async () => upstream(snapshot()));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("given a valid ref, then 200, no-store and the whitelisted snapshot", async () => {
    const response = await call(`?ref=${REF}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body.items[0].name).toBe("Serra Catarinense");
    expect(body).not.toHaveProperty("subtotal");
  });
  test("given the visitor's cookies and Authorization, then none of them reaches the Worker", async () => {
    await call(`?ref=${REF}`);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.stringify(init.headers)).toBe("{}");
    expect(init.credentials).toBe("omit");
  });
  test.each(["", "?ref=", "?ref=short", `?ref=${REF}x`, "?ref=<script>", "?other=1"])("given invalid ref %j, then 404 no-store and no upstream call", async (query) => {
    const response = await call(query);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("ref");
  });
  test("given upstream 404, then 404 no-store", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    const response = await call(`?ref=${REF}`);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  test("given a timeout, then 502 with no detail and no-store", async () => {
    fetchMock.mockRejectedValue(new DOMException(`timeout for https://www.usesul.com.br/__origens/cart-ref/${REF}`, "TimeoutError"));
    const response = await call(`?ref=${REF}`);
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).toBe('{"error":"unavailable"}');
    expect(text).not.toContain(REF);
  });
  test("given an invalid schema upstream, then 502 with no detail", async () => {
    fetchMock.mockResolvedValue(upstream({ v: 1, count: "many" }));
    const response = await call(`?ref=${REF}`);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('{"error":"unavailable"}');
  });
  test("given any outcome, then the ref is never logged", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    fetchMock.mockRejectedValueOnce(new Error(`connect ECONNRESET /__origens/cart-ref/${REF}`));
    await call(`?ref=${REF}`);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    await call(`?ref=${REF}`);
    await call(`?ref=${REF}`);
    await call(`?ref=bad`);
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(REF);
  });
  test("given POST, then 405", async () => {
    expect(POST().status).toBe(405);
  });
});
