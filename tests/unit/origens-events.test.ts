import { setActiveGa4 } from "@/lib/analytics/active-ids";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ARRIVAL_PRODUCT_PARAM, ARRIVAL_SRC_PARAM, cartItemsBucket, extractArrival, mirrorAgeBucket, ORIGENS_PRODUCT_SLUGS, referrerAllowsArrival } from "@/lib/analytics/origens-events";
import { trackCartMirrorView, trackGoToCartClick, trackStorefrontArrived, whenAnalyticsReady } from "@/lib/analytics/track";
import { withoutCartRef } from "@/lib/cart-mirror/url";

const consent = vi.hoisted(() => ({ granted: true }));
vi.mock("@/lib/consent/store", () => ({ hasAnalyticsConsent: () => consent.granted }));

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const SERRA = ORIGENS_PRODUCT_SLUGS[0];

describe("extractArrival — the one-time marker is a closed enum, consumed and stripped", () => {
  test("given a valid marker among other parameters, then it is returned and removed while UTMs and order are preserved", () => {
    const r = extractArrival(`?utm_source=meta&${ARRIVAL_SRC_PARAM}=ink_cart_drawer&${ARRIVAL_PRODUCT_PARAM}=${SERRA}&x=1`);
    expect(r).toEqual({ entryPoint: "ink_cart_drawer", productSlug: SERRA, present: true, search: "?utm_source=meta&x=1" });
  });
  test("given each of the four entry points, then all are accepted", () => {
    for (const value of ["ink_cart_drawer", "ink_post_add", "ink_product_detail", "ink_product_return"]) expect(extractArrival(`?origens_src=${value}`).entryPoint).toBe(value);
  });
  test("given an unknown/injected entry point or a slug outside the five, then nothing is accepted but both parameters are still removed", () => {
    for (const bad of ["storefront_cart_mirror", "INK_CART_DRAWER", "ink_cart_drawer,x", "<script>", "", "https://evil.example", TOKEN]) {
      const r = extractArrival(`?origens_src=${encodeURIComponent(bad)}&origens_p=nao-e-um-dos-cinco`);
      expect(r.entryPoint).toBeNull();
      expect(r.productSlug).toBeNull();
      expect(r.present).toBe(true);
      expect(r.search).toBe("");
    }
  });
  test("given a repeated parameter, then it is ambiguous and rejected (no last-one-wins tricks)", () => {
    expect(extractArrival("?origens_src=ink_post_add&origens_src=ink_cart_drawer").entryPoint).toBeNull();
  });
  test("given no marker, then it is absent and the query is unchanged", () => {
    expect(extractArrival("?a=1")).toEqual({ entryPoint: null, productSlug: null, present: false, search: "?a=1" });
    expect(extractArrival("")).toEqual({ entryPoint: null, productSlug: null, present: false, search: "" });
  });
  test("the five verified slugs are distinct and shaped like the Worker's allowlist entries", () => {
    expect(new Set(ORIGENS_PRODUCT_SLUGS).size).toBe(5);
    for (const slug of ORIGENS_PRODUCT_SLUGS) expect(slug).toMatch(/^[a-z0-9][a-z0-9_-]{0,127}$/);
  });
});

describe("analytics query never carries the cart token nor the arrival markers", () => {
  test("given cart_ref and both markers, then withoutCartRef keeps only the legitimate parameters", () => {
    expect(withoutCartRef(`cart_ref=${TOKEN}&origens_src=ink_post_add&origens_p=${SERRA}&utm_campaign=x`)).toBe("utm_campaign=x");
    expect(withoutCartRef(`cart_ref=${TOKEN}`)).toBe("");
  });
});

describe("buckets", () => {
  test("cart items bucket", () => {
    expect([0, -1, NaN, 1, 2, 3, 5, 6, 40].map(cartItemsBucket)).toEqual(["0", "0", "0", "1", "2", "3_5", "3_5", "6_plus", "6_plus"]);
  });
  test("mirror age bucket", () => {
    expect([0, 59, 60, 299, 300, 1800, NaN].map(mirrorAgeBucket)).toEqual(["under_1m", "under_1m", "1_5m", "1_5m", "5_30m", "5_30m", "under_1m"]);
  });
});

describe("referrerAllowsArrival", () => {
  test("accepts the INK origin and an empty (blocked) referrer; refuses any other origin and malformed values", () => {
    const ink = "https://www.usesul.com.br";
    expect(referrerAllowsArrival(`${ink}/usesul/product/${SERRA}`, ink)).toBe(true);
    expect(referrerAllowsArrival("", ink)).toBe(true);
    for (const bad of ["https://evil.example/", "http://www.usesul.com.br/", "https://www.usesul.com.br.evil.example/", "não é url"]) expect(referrerAllowsArrival(bad, ink)).toBe(false);
  });
});

describe("the three events — consent-gated, closed parameter set, no token/URL/text", () => {
  let calls: unknown[][];
  beforeEach(() => {
    consent.granted = true;
    setActiveGa4("G-8GYTEJ1F77");
    calls = [];
    vi.stubGlobal("window", { gtag: (...args: unknown[]) => { const [c, n, params] = args as [string, string, Record<string, unknown>]; const { send_to: to, ...rest } = params; expect(to).toBe("G-8GYTEJ1F77"); calls.push([c, n, rest]); } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("given consent, then each event carries exactly its documented parameters", () => {
    trackGoToCartClick({ cartItemsBucket: "3_5" });
    trackCartMirrorView({ cartItemsBucket: "2", mirrorAgeBucket: "1_5m" });
    trackStorefrontArrived({ entryPoint: "ink_post_add", productSlug: SERRA });
    trackStorefrontArrived({ entryPoint: "ink_product_return", productSlug: null });
    expect(calls).toEqual([
      ["event", "origens_go_to_cart_click", { entry_point: "storefront_cart_mirror", region: "sul", cart_items_bucket: "3_5", transport_type: "beacon" }],
      ["event", "origens_cart_mirror_view", { entry_point: "storefront_cart_mirror", region: "sul", cart_items_bucket: "2", mirror_age_bucket: "1_5m" }],
      ["event", "origens_storefront_arrived", { entry_point: "ink_post_add", region: "sul", product_slug: SERRA }],
      ["event", "origens_storefront_arrived", { entry_point: "ink_product_return", region: "sul" }],
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/cart_ref|http|purchase|checkout/i);
  });

  test("given consent NOT granted, then nothing is sent, even though gtag exists", () => {
    consent.granted = false;
    trackGoToCartClick({ cartItemsBucket: "1" });
    trackCartMirrorView({ cartItemsBucket: "1", mirrorAgeBucket: "under_1m" });
    trackStorefrontArrived({ entryPoint: "ink_cart_drawer", productSlug: SERRA });
    expect(calls).toEqual([]);
  });

  test("given a gtag that throws (blocked/broken), then the caller never sees it (navigation stays intact)", () => {
    vi.stubGlobal("window", { gtag: () => { throw new Error("blocked"); } });
    expect(() => trackGoToCartClick({ cartItemsBucket: "1" })).not.toThrow();
    expect(() => trackStorefrontArrived({ entryPoint: "ink_post_add", productSlug: null })).not.toThrow();
  });

  test("given no gtag at all, then the events are silent no-ops", () => {
    vi.stubGlobal("window", {});
    expect(() => trackGoToCartClick({ cartItemsBucket: "1" })).not.toThrow();
  });
});

describe("whenAnalyticsReady — sends once, only when really available, then gives up", () => {
  beforeEach(() => setActiveGa4("G-8GYTEJ1F77"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("given gtag appears after two ticks, then it sends exactly once", () => {
    vi.useFakeTimers();
    consent.granted = true;
    const w: { gtag?: () => void } = {};
    vi.stubGlobal("window", w);
    const send = vi.fn();
    whenAnalyticsReady(send, 250, 40);
    vi.advanceTimersByTime(500);
    expect(send).not.toHaveBeenCalled();
    w.gtag = () => undefined;
    vi.advanceTimersByTime(5_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("given consent never arrives, then it stops after the window and never sends later", () => {
    vi.useFakeTimers();
    consent.granted = false;
    vi.stubGlobal("window", { gtag: () => undefined });
    const send = vi.fn();
    whenAnalyticsReady(send, 250, 40);
    vi.advanceTimersByTime(20_000);
    consent.granted = true;
    vi.advanceTimersByTime(20_000);
    expect(send).not.toHaveBeenCalled();
  });

  test("given consent is granted within the window, then it sends once", () => {
    vi.useFakeTimers();
    consent.granted = false;
    vi.stubGlobal("window", { gtag: () => undefined });
    const send = vi.fn();
    whenAnalyticsReady(send, 250, 40);
    vi.advanceTimersByTime(3_000);
    consent.granted = true;
    vi.advanceTimersByTime(1_000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
