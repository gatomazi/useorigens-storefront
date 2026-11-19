import { describe, expect, test } from "vitest";
import { closingSlot, insertAt, reviewsAreInTheDocument } from "@/components/home/closingSlot";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { renderableSections } from "@/lib/site-config/resolve";

const of = (...templates: string[]) => templates.map((template) => ({ template }));

describe("closingSlot", () => {
  test("goes just before the closing campaign when it is the last section", () => {
    expect(closingSlot(of("hero", "states", "product-carousel", "campaign"))).toBe(3);
  });

  test("goes at the end when the last section is not a campaign (a home edited in the panel is never cut in the middle)", () => {
    expect(closingSlot(of("hero", "campaign", "product-carousel"))).toBe(3);
    expect(closingSlot(of("hero"))).toBe(1);
  });

  test("an empty home puts it first and only", () => {
    expect(closingSlot([])).toBe(0);
  });

  test("the seed Sul home (what production serves) puts the reviews between the DDD carousel and the closing campaign", () => {
    const sections = renderableSections(buildSeedBundle().docs.sul);
    const at = closingSlot(sections);
    expect(sections[at].id).toBe("seed-origem");
    expect(sections[at - 1].id).toBe("seed-geografia");
  });
});

describe("insertAt", () => {
  test("inserts without touching the original, at the start, the middle and the end", () => {
    const items = ["a", "b", "c"];
    expect(insertAt(items, 0, "x")).toEqual(["x", "a", "b", "c"]);
    expect(insertAt(items, 2, "x")).toEqual(["a", "b", "x", "c"]);
    expect(insertAt(items, 3, "x")).toEqual(["a", "b", "c", "x"]);
    expect(items).toEqual(["a", "b", "c"]);
  });
});

describe("reviewsAreInTheDocument", () => {
  test("a home with a reviews section, on or off, is in the panel's hands; one without keeps the block before the closing campaign", () => {
    expect(reviewsAreInTheDocument(of("hero", "reviews", "campaign"))).toBe(true);
    expect(reviewsAreInTheDocument([{ template: "reviews", active: false } as { template: string }])).toBe(true);
    expect(reviewsAreInTheDocument(of("hero", "campaign"))).toBe(false);
    expect(reviewsAreInTheDocument(undefined)).toBe(false);
  });
});
