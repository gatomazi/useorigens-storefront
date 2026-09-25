import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { activeGa4, activeMetaPixel, setActiveGa4, setActiveMetaPixel } from "@/lib/analytics/active-ids";
import { trackGoToInk, trackPageView, trackSearch, trackSelectCity, trackSelectState } from "@/lib/analytics/track";

vi.mock("@/lib/consent/store", () => ({ hasAnalyticsConsent: () => true }));

/** What the two SDKs receive when a visitor moves between regions in the same page session (no reload). */
let fbq: unknown[][];
let gtag: unknown[][];
beforeEach(() => {
  fbq = [];
  gtag = [];
  vi.stubGlobal("window", { fbq: (...a: unknown[]) => fbq.push(a), gtag: (...a: unknown[]) => gtag.push(a) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setActiveMetaPixel(null);
  setActiveGa4(null);
});

const fireEverything = () => {
  trackSearch("Belém", { region: "norte", resultsCount: 2 });
  trackSelectCity({ city: "Belém", state: "PA", region: "norte" });
  trackSelectState({ state: "PA", region: "norte" });
  trackGoToInk({ productId: "7", sourceSection: "city_styles", productName: "Camiseta" });
  trackPageView({ pageLocation: "https://x/norte", pagePath: "/norte" });
};

describe("events are addressed to the visited region's ID", () => {
  test("given Meta pixel A and GA4 X active, when events fire, then every Meta call is trackSingle/trackSingleCustom to A and every GA4 event carries send_to X (never an untargeted call)", () => {
    setActiveMetaPixel("1111111111111111");
    setActiveGa4("G-AAAA1111");
    fireEverything();
    expect(fbq.length).toBeGreaterThan(0);
    for (const c of fbq) {
      expect(["trackSingle", "trackSingleCustom"]).toContain(c[0]);
      expect(c[1]).toBe("1111111111111111");
    }
    expect(gtag.length).toBeGreaterThan(0);
    for (const c of gtag) expect((c[2] as { send_to: string }).send_to).toBe("G-AAAA1111");
    expect(fbq.some((c) => c[0] === "track" || c[0] === "trackCustom")).toBe(false);
  });

  test("given a client-side move Sul → Norte → Centro-Oeste → Sul, when each page registers its own IDs, then events reach only that page's IDs; a region with no ID sends nothing to that tool", () => {
    const pages: [string | null, string | null][] = [["1558923262073052", "G-8GYTEJ1F77"], ["2222222222222222", null], [null, "G-CENTRO0001"], ["1558923262073052", "G-8GYTEJ1F77"]];
    const seenMeta: (string | undefined)[] = [];
    const seenGa: (string | undefined)[] = [];
    for (const [meta, ga] of pages) {
      fbq.length = 0;
      gtag.length = 0;
      setActiveMetaPixel(meta);
      setActiveGa4(ga);
      trackSelectCity({ city: "X", state: "PA", region: "r" });
      seenMeta.push(fbq.length ? (fbq[0][1] as string) : undefined);
      seenGa.push(gtag.length ? ((gtag[0][2] as { send_to: string }).send_to) : undefined);
    }
    expect(seenMeta).toEqual(["1558923262073052", "2222222222222222", undefined, "1558923262073052"]);
    expect(seenGa).toEqual(["G-8GYTEJ1F77", undefined, "G-CENTRO0001", "G-8GYTEJ1F77"]);
  });

  test("given the same ID is active for two regions in a row, when one event fires, then it is sent exactly once per tool", () => {
    setActiveMetaPixel("3333333333333333");
    setActiveGa4("G-GLOBAL0001");
    trackSelectCity({ city: "X", state: "PA", region: "norte" });
    expect(fbq).toHaveLength(1);
    expect(gtag).toHaveLength(1);
  });

  test("given no ID registered (region without the tool, or still resolving), when events fire, then nothing is sent to that tool", () => {
    expect(activeMetaPixel()).toBeNull();
    expect(activeGa4()).toBeNull();
    fireEverything();
    expect(fbq).toEqual([]);
    expect(gtag).toEqual([]);
  });

  test("given only Meta is active, when events fire, then GA4 receives nothing and vice versa (independent tools)", () => {
    setActiveMetaPixel("4444444444444444");
    fireEverything();
    expect(gtag).toEqual([]);
    expect(fbq.length).toBeGreaterThan(0);
    fbq.length = 0;
    setActiveMetaPixel(null);
    setActiveGa4("G-ONLYGA001");
    fireEverything();
    expect(fbq).toEqual([]);
    expect(gtag.length).toBeGreaterThan(0);
  });

  test("given a caller's own send_to, when the event is addressed, then the region's ID wins (a component cannot redirect an event elsewhere)", () => {
    setActiveGa4("G-REGION0001");
    trackSelectState({ state: "PA", region: "norte" });
    expect((gtag[0][2] as { send_to: string }).send_to).toBe("G-REGION0001");
  });
});
