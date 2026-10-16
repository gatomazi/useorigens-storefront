import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CAMPAIGN_STORAGE_KEY, extractCampaign, withCampaign } from "@/lib/analytics/campaign";

const INK = "https://www.usesul.com.br/usesul/product/tijucas-origem-sc";
const ad = extractCampaign("?utm_source=meta&utm_medium=paid&utm_campaign=sul-outubro&fbclid=IwAR0abc");

describe("extractCampaign", () => {
  test("given a landing query, then only the known campaign names come out, in a fixed order, first value of each", () => {
    expect(extractCampaign("?q=tij&fbclid=IwAR0abc&utm_source=meta&utm_source=other&cart_ref=x&utm_campaign=c1")).toEqual([
      ["utm_source", "meta"],
      ["utm_campaign", "c1"],
      ["fbclid", "IwAR0abc"],
    ]);
  });

  test("given empty or oversized values, then they are dropped", () => {
    expect(extractCampaign(`?utm_source=&gclid=${"x".repeat(501)}&utm_medium=cpc`)).toEqual([["utm_medium", "cpc"]]);
  });

  test("given no campaign at all, then it is empty", () => {
    expect(extractCampaign("")).toEqual([]);
    expect(extractCampaign("?q=floripa")).toEqual([]);
  });
});

describe("withCampaign", () => {
  test("given an INK product link, then every campaign parameter is appended", () => {
    const url = new URL(withCampaign(INK, ad));
    expect(url.origin + url.pathname).toBe(INK);
    expect(Object.fromEntries(url.searchParams)).toEqual({ utm_source: "meta", utm_medium: "paid", utm_campaign: "sul-outubro", fbclid: "IwAR0abc" });
  });

  test("given every INK store host, then each one is carried", () => {
    for (const host of ["www.usesul.com.br", "www.usenorte.com.br", "www.usecentro.com.br", "loja.useorigens.com.br"]) {
      expect(new URL(withCampaign(`https://${host}/x/product/y`, ad)).searchParams.get("fbclid")).toBe("IwAR0abc");
    }
  });

  test("given a link that already has parameters, then they are kept and never replaced (ls, origens_open_cart, a click id of its own)", () => {
    const url = new URL(withCampaign(`${INK}?ls=abc.def&origens_open_cart=1&fbclid=OWN#medidas`, ad));
    expect(url.searchParams.get("ls")).toBe("abc.def");
    expect(url.searchParams.get("origens_open_cart")).toBe("1");
    expect(url.searchParams.getAll("fbclid")).toEqual(["OWN"]);
    expect(url.searchParams.get("utm_source")).toBe("meta");
    expect(url.hash).toBe("#medidas");
  });

  test("given a link with its own utm_*, then its UTM set is kept whole and only the click id is added", () => {
    const url = new URL(withCampaign(`${INK}?utm_source=useorigens`, ad));
    expect(Object.fromEntries(url.searchParams)).toEqual({ utm_source: "useorigens", fbclid: "IwAR0abc" });
  });

  test("given anything that is not an INK store link, then it is returned untouched", () => {
    for (const href of ["https://artigos.useorigens.com.br/produto/x", "https://useorigens.com.br/sul/sc", "http://www.usesul.com.br/usesul/product/x", "/sul/sc/tijucas", "not a url"]) {
      expect(withCampaign(href, ad)).toBe(href);
    }
  });

  test("given no campaign, then the link is returned untouched", () => {
    expect(withCampaign(INK, [])).toBe(INK);
  });
});

describe("rememberCampaign / carryCampaign", () => {
  function stubWindow(search: string) {
    const session = new Map<string, string>();
    const location = { search };
    vi.stubGlobal("window", {
      location,
      sessionStorage: { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => void session.set(k, v) },
      localStorage: { getItem: () => null },
      addEventListener: () => undefined,
    });
    return { session, location };
  }

  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("given a landing with a campaign, when the visitor moves on to a page without it, then the INK link still carries it", async () => {
    const { session, location } = stubWindow("?utm_source=meta&fbclid=IwAR0abc");
    const { rememberCampaign, carryCampaign } = await import("@/lib/analytics/campaign");
    rememberCampaign(location.search);
    location.search = "";
    expect(session.get(CAMPAIGN_STORAGE_KEY)).toBe("utm_source=meta&fbclid=IwAR0abc");
    expect(carryCampaign(INK)).toBe(`${INK}?utm_source=meta&fbclid=IwAR0abc`);
  });

  test("given a second landing with another campaign, then it replaces the first one whole", async () => {
    const { location } = stubWindow("?utm_source=meta&utm_content=video&fbclid=IwAR0abc");
    const { rememberCampaign, carryCampaign } = await import("@/lib/analytics/campaign");
    rememberCampaign(location.search);
    location.search = "?utm_source=google&gclid=Cj0abc";
    rememberCampaign(location.search);
    location.search = "";
    expect(carryCampaign(INK)).toBe(`${INK}?utm_source=google&gclid=Cj0abc`);
  });

  test("given a tampered stored value, then only known, valid names reach the link", async () => {
    const { session } = stubWindow("");
    session.set(CAMPAIGN_STORAGE_KEY, "utm_source=meta&evil=1&cart_ref=abc");
    const { carryCampaign } = await import("@/lib/analytics/campaign");
    expect(carryCampaign(INK)).toBe(`${INK}?utm_source=meta`);
  });

  test("given the strict consent gate and no acceptance, then nothing is carried", async () => {
    vi.stubEnv("NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT", "true");
    stubWindow("?utm_source=meta&fbclid=IwAR0abc");
    const { carryCampaign } = await import("@/lib/analytics/campaign");
    expect(carryCampaign(INK)).toBe(INK);
  });

  test("given single-store mode, then a link to the single store carries the browsed region, even without consent; other hosts and a link with its own region keep theirs", async () => {
    vi.stubEnv("NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT", "true");
    stubWindow("?utm_source=meta");
    const { carryCampaign, setCarryRegion } = await import("@/lib/analytics/campaign");
    const sul = "https://www.usesul.com.br/usesul/product/belem-territorio-pa";
    expect(carryCampaign(sul)).toBe(sul); // regional mode: nothing
    setCarryRegion({ region: "norte", host: "www.usesul.com.br" });
    expect(carryCampaign(sul)).toBe(`${sul}?origens_r=norte`); // no utm: measurement not allowed
    expect(carryCampaign(`${sul}?origens_r=sul`)).toBe(`${sul}?origens_r=sul`);
    expect(carryCampaign("https://www.usenorte.com.br/usenorte/product/x")).toBe("https://www.usenorte.com.br/usenorte/product/x");
  });
});
