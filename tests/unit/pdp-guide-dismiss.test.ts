import { describe, expect, it } from "vitest";
import { GUIDE_DISMISS_KEY, guideCityQuery, guideDismissValue, guideDismissed, inkProductSlug } from "@/lib/guide/dismiss";
import { pdpGuideEnabled } from "@/lib/guide/flag";

const DAY = 24 * 60 * 60 * 1000;

describe("guided help: dismissal remembered 30 days, versioned", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");

  it("given the invite was just dismissed, when read back, then it stays dismissed for 30 days and shows again after", () => {
    const stored = guideDismissValue(now);
    expect(GUIDE_DISMISS_KEY).toBe("origens:guia:v1:dispensado");
    expect(guideDismissed(stored, now)).toBe(true);
    expect(guideDismissed(stored, now + 29 * DAY)).toBe(true);
    expect(guideDismissed(stored, now + 30 * DAY)).toBe(false);
  });

  it("given another version, a clock set back, or garbage, then the invite shows (fail open to the visitor, never to a broken state)", () => {
    expect(guideDismissed(JSON.stringify({ v: 0, at: now }), now)).toBe(false);
    expect(guideDismissed(JSON.stringify({ v: 1, at: now + DAY }), now)).toBe(false);
    expect(guideDismissed(JSON.stringify({ v: 1 }), now)).toBe(false);
    expect(guideDismissed("{not json", now)).toBe(false);
    expect(guideDismissed(null, now)).toBe(false);
    expect(guideDismissed("", now)).toBe(false);
  });
});

describe("guided help: slugs and queries", () => {
  it("takes the INK product slug from a verified purchase URL only", () => {
    expect(inkProductSlug("https://www.usesul.com.br/usesul/product/feito-em-florianopolis")).toBe("feito-em-florianopolis");
    expect(inkProductSlug("https://www.usesul.com.br/usesul/product/Tijucas-Origem-SC?utm=x")).toBe("tijucas-origem-sc");
    expect(inkProductSlug("https://www.usesul.com.br/usesul/")).toBeNull();
    expect(inkProductSlug(null)).toBeNull();
  });

  it("turns a locality result of this region into the API's city query, and nothing else", () => {
    expect(guideCityQuery("/sul/sc/florianopolis", "sul")).toBe("sc/florianopolis");
    expect(guideCityQuery("/centro-oeste/df/aguas-claras/", "centro-oeste")).toBe("df/aguas-claras");
    expect(guideCityQuery("/norte/pa/belem", "sul")).toBeNull(); // another region: its own page
    expect(guideCityQuery("/sul/sc", "sul")).toBeNull(); // a state
    expect(guideCityQuery("/sul/sc/florianopolis/feito-em", "sul")).toBeNull(); // a design
  });
});

describe("guided help: the storefront switch", () => {
  it("is on unless PDP_GUIDE=off", () => {
    expect(pdpGuideEnabled({})).toBe(true);
    expect(pdpGuideEnabled({ PDP_GUIDE: "on" })).toBe(true);
    expect(pdpGuideEnabled({ PDP_GUIDE: "off" })).toBe(false);
    expect(pdpGuideEnabled({ PDP_GUIDE: " OFF " })).toBe(false);
  });
});
