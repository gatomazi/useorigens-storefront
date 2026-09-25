import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setActiveGa4, setActiveMetaPixel } from "@/lib/analytics/active-ids";
import { trackGoToInk, trackPageView, trackSearch, trackSelectCity, trackSelectState } from "@/lib/analytics/track";

// Every event is now ADDRESSED to the visited region's ID (Meta trackSingle / GA4 send_to). The sinks below assert the address and hand the rest
// to the (unchanged) payload assertions; the addressing rules themselves are in tracking-routing.test.ts.
const PIXEL = "1558923262073052";
const GA = "G-8GYTEJ1F77";
const fbqSink = (calls: unknown[][]) => (...args: unknown[]) => {
  const [method, id, ...rest] = args;
  expect(id).toBe(PIXEL);
  calls.push([method === "trackSingle" ? "track" : method === "trackSingleCustom" ? "trackCustom" : method, ...rest]);
};
const gtagSink = (calls: unknown[][]) => (...args: unknown[]) => {
  const [command, name, params] = args as [string, string, Record<string, unknown>];
  expect(params.send_to).toBe(GA);
  const { send_to: _sendTo, ...rest } = params;
  void _sendTo;
  calls.push([command, name, rest]);
};

// track.ts asks the consent store whether an "accepted" decision is live; these tests drive that answer directly.
const consent = vi.hoisted(() => ({ granted: true }));
vi.mock("@/lib/consent/store", () => ({ hasAnalyticsConsent: () => consent.granted }));

// No jsdom/happy-dom in this project (kept out on purpose — CLAUDE_USE_ORIGENS_META_PIXEL_INK_ESTADOS.md §1
// asks to avoid new dependencies without need). `typeof window === "undefined"` under plain Node is enough to
// test the "Pixel absent" no-op path for free; a minimal `vi.stubGlobal` stands in for `window.fbq` itself.
beforeEach(() => {
  consent.granted = true;
  setActiveMetaPixel(PIXEL);
  setActiveGa4(GA);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("track.ts — no window/fbq/gtag at all (SSR-like, or neither provider loaded)", () => {
  test("given no window, when any track function is called, then it does not throw", () => {
    expect(() => trackSearch("Tijucas")).not.toThrow();
    expect(() => trackSelectCity({ city: "Tijucas", state: "SC", region: "sul" })).not.toThrow();
    expect(() => trackSelectState({ state: "SC", region: "sul" })).not.toThrow();
    expect(() => trackGoToInk({ productId: "1", sourceSection: "city_styles" })).not.toThrow();
    expect(() => trackPageView({ pageLocation: "https://example.com/sul", pagePath: "/sul" })).not.toThrow();
  });
});

describe("track.ts — fbq/gtag blocked or not yet loaded (window exists, neither is a function)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  test("given window.fbq/gtag are not functions, when any track function runs, then it is a silent no-op", () => {
    expect(() => trackSearch("Tijucas")).not.toThrow();
    expect(() => trackSelectCity({ city: "Tijucas", state: "SC", region: "sul" })).not.toThrow();
    expect(() => trackSelectState({ state: "SC", region: "sul" })).not.toThrow();
    expect(() => trackGoToInk({ productId: "1", sourceSection: "city_styles" })).not.toThrow();
    expect(() => trackPageView({ pageLocation: "https://example.com/sul", pagePath: "/sul" })).not.toThrow();
  });
});

describe("track.ts — fbq loaded", () => {
  let calls: unknown[][];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal("window", { fbq: fbqSink(calls) });
  });

  test("given a completed search, when trackSearch runs, then it fires the standard Search event with search_string", () => {
    trackSearch("Bagé - RS");
    expect(calls).toEqual([["track", "Search", { search_string: "Bagé - RS" }]]);
  });

  test("given an explicit city choice, when trackSelectCity runs, then it fires the custom SelectCity event with city/state/region", () => {
    trackSelectCity({ city: "Tijucas", state: "SC", region: "sul" });
    expect(calls).toEqual([["trackCustom", "SelectCity", { city: "Tijucas", state: "SC", region: "sul" }]]);
  });

  test("given a city_id is known, when trackSelectCity runs, then it is included", () => {
    trackSelectCity({ city: "Tijucas", state: "SC", region: "sul", cityId: "4218004" });
    expect(calls[0][2]).toMatchObject({ city_id: "4218004" });
  });

  test("given a real INK click, when trackGoToInk runs, then it fires the custom GoToInk event with product_id, source_section and currency", () => {
    trackGoToInk({ productId: "999", sourceSection: "city_styles", city: "Tijucas", state: "SC", family: "ponto-de-origem", value: 109.9 });
    expect(calls).toEqual([
      ["trackCustom", "GoToInk", { product_id: "999", source_section: "city_styles", currency: "BRL", city: "Tijucas", state: "SC", family: "ponto-de-origem", value: 109.9 }],
    ]);
  });

  test("given no confirmed price, when trackGoToInk runs, then value is omitted rather than invented as 0 or null", () => {
    trackGoToInk({ productId: "999", sourceSection: "home_terra" });
    const params = calls[0][2] as Record<string, unknown>;
    expect("value" in params).toBe(false);
    expect("city" in params).toBe(false);
    expect("state" in params).toBe(false);
    expect("family" in params).toBe(false);
  });

  test("given only fbq is loaded (gtag absent), when trackSelectCity/trackGoToInk run with GA4-only fields, then the Meta payload is exactly the same as without them", () => {
    trackSelectCity({ city: "Tijucas", state: "SC", region: "sul", source: "hero_search" });
    trackGoToInk({ productId: "999", sourceSection: "city_styles", productName: "Ponto de Origem", destinationUrl: "https://www.usesul.com.br/x" });
    // `source`/`productName`/`destinationUrl` never leak into the Meta payload — toEqual (not toMatchObject)
    // proves nothing extra was added.
    expect(calls[0]).toEqual(["trackCustom", "SelectCity", { city: "Tijucas", state: "SC", region: "sul" }]);
    expect(calls[1]).toEqual(["trackCustom", "GoToInk", { product_id: "999", source_section: "city_styles", currency: "BRL" }]);
  });
});

describe("track.ts — gtag loaded (fbq absent)", () => {
  let calls: unknown[][];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal("window", { gtag: gtagSink(calls) });
  });

  test("given a completed search, when trackSearch runs, then it fires view_search_results with search_term and the GA4-only extras", () => {
    trackSearch("Bagé - RS", { region: "sul", resultsCount: 3 });
    expect(calls).toEqual([["event", "view_search_results", { search_term: "Bagé - RS", region: "sul", results_count: 3 }]]);
  });

  test("given no extras, when trackSearch runs, then region/results_count are omitted rather than invented", () => {
    trackSearch("Bagé - RS");
    const params = calls[0][2] as Record<string, unknown>;
    expect("region" in params).toBe(false);
    expect("results_count" in params).toBe(false);
  });

  test("given an explicit city choice with a source, when trackSelectCity runs, then select_city carries city/state/region/source", () => {
    trackSelectCity({ city: "Tijucas", state: "SC", region: "sul", source: "state_mesoregion" });
    expect(calls).toEqual([["event", "select_city", { city: "Tijucas", state: "SC", region: "sul", source: "state_mesoregion" }]]);
  });

  test("given an explicit state choice, when trackSelectState runs, then select_state fires with state/region/source — no Meta equivalent exists for this event", () => {
    trackSelectState({ state: "RS", region: "sul", source: "state_selector" });
    expect(calls).toEqual([["event", "select_state", { state: "RS", region: "sul", source: "state_selector" }]]);
  });

  test("given a real INK click, when trackGoToInk runs, then select_item fires before go_to_ink, sharing the same click", () => {
    trackGoToInk({
      productId: "999",
      sourceSection: "city_styles",
      city: "Tijucas",
      state: "SC",
      family: "ponto-de-origem",
      value: 109.9,
      productName: "Ponto de Origem",
      destinationUrl: "https://www.usesul.com.br/usesul/product/tijucas-origem-sc",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      "event",
      "select_item",
      { item_list_name: "city_styles", items: [{ item_id: "999", item_name: "Ponto de Origem", item_category: "ponto-de-origem", price: 109.9, currency: "BRL" }] },
    ]);
    expect(calls[1]).toEqual([
      "event",
      "go_to_ink",
      {
        product_id: "999",
        source_section: "city_styles",
        product_name: "Ponto de Origem",
        city: "Tijucas",
        state: "SC",
        family: "ponto-de-origem",
        value: 109.9,
        currency: "BRL",
        destination_url: "https://www.usesul.com.br/usesul/product/tijucas-origem-sc",
      },
    ]);
    // Never a commerce event — those stay exclusively on the INK domain.
    const eventNames = calls.map((c) => c[1]);
    expect(eventNames).not.toContain("view_item");
    expect(eventNames).not.toContain("add_to_cart");
    expect(eventNames).not.toContain("purchase");
  });

  test("given no confirmed price, when trackGoToInk runs, then price/currency are omitted from select_item and value/currency from go_to_ink, rather than invented", () => {
    trackGoToInk({ productId: "999", sourceSection: "home_terra" });
    const selectItemParams = calls[0][2] as { items: Record<string, unknown>[] };
    expect("price" in selectItemParams.items[0]).toBe(false);
    expect("currency" in selectItemParams.items[0]).toBe(false);
    const goToInkParams = calls[1][2] as Record<string, unknown>;
    expect("value" in goToInkParams).toBe(false);
    expect("currency" in goToInkParams).toBe(false);
    expect("destination_url" in goToInkParams).toBe(false);
    expect("product_name" in goToInkParams).toBe(false);
  });

  test("given a real navigation, when trackPageView runs, then page_view fires with page_location/page_path", () => {
    trackPageView({ pageLocation: "https://www.useorigens.com.br/sul/sc/tijucas", pagePath: "/sul/sc/tijucas", pageTitle: "Tijucas", region: "sul" });
    expect(calls).toEqual([
      ["event", "page_view", { page_location: "https://www.useorigens.com.br/sul/sc/tijucas", page_path: "/sul/sc/tijucas", page_title: "Tijucas", region: "sul" }],
    ]);
  });
});

describe("track.ts — consent revoked or never given while both SDKs are still on window", () => {
  test("given fbq/gtag exist but consent is not granted, when every track function runs, then nothing is sent to either", () => {
    const fbqCalls: unknown[][] = [];
    const gtagCalls: unknown[][] = [];
    vi.stubGlobal("window", { fbq: fbqSink(fbqCalls), gtag: gtagSink(gtagCalls) });
    consent.granted = false;
    trackSearch("Tijucas");
    trackSelectCity({ city: "Tijucas", state: "SC", region: "sul" });
    trackSelectState({ state: "SC", region: "sul" });
    trackGoToInk({ productId: "1", sourceSection: "city_styles" });
    trackPageView({ pageLocation: "https://example.com/sul", pagePath: "/sul" });
    expect(fbqCalls).toEqual([]);
    expect(gtagCalls).toEqual([]);
  });

  test("given consent is granted then revoked mid-session, when an event follows, then only the pre-revoke one was sent", () => {
    const gtagCalls: unknown[][] = [];
    vi.stubGlobal("window", { gtag: gtagSink(gtagCalls) });
    trackSelectState({ state: "SC", region: "sul" });
    consent.granted = false;
    trackSelectState({ state: "RS", region: "sul" });
    expect(gtagCalls).toHaveLength(1);
  });

  test("given an SDK that throws (blocked/broken), when GoToInk runs, then it does not throw and the other provider still gets its events", () => {
    const gtagCalls: unknown[][] = [];
    vi.stubGlobal("window", {
      fbq: () => {
        throw new Error("blocked");
      },
      gtag: gtagSink(gtagCalls),
    });
    expect(() => trackGoToInk({ productId: "1", sourceSection: "city_styles" })).not.toThrow();
    expect(gtagCalls.map((c) => c[1])).toEqual(["select_item", "go_to_ink"]);
  });
});
