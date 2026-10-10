import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { parseSectionForm } from "@/lib/admin/section-form";
import { discountPercent } from "@/lib/format";
import { validateSection, type Section } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.sul);
const terra = (): Section => seed().home!.sections.find((s) => s.id === "seed-terra")!;
const form = (o: Record<string, string>) => ({ get: (n: string) => (n in o ? o[n] : null) });
const layoutForm = (extra: Record<string, string>) => ({ title: "Terra", source_kind: "editorial-module", source_module: "terra", layout_variant: "standard", layout_tone: "light", layout_surface: "plain", ...extra });
const withTags = (tags: unknown): Section => ({ ...terra(), layout: { ...terra().layout!, tags } as Section["layout"] });

describe("the % OFF of a promotion", () => {
  test("given the prices INK's own pages showed on 2026-10-10, when worked out, then the percent is the one INK shows (truncated)", () => {
    expect(discountPercent({ price: 94.9, listPrice: 104.9 })).toBe(9); // 9.53% → "9% OFF"
    expect(discountPercent({ price: 79.9, listPrice: 89.9 })).toBe(11);
    expect(discountPercent({ price: 89.9, listPrice: 109.9 })).toBe(18);
    expect(discountPercent({ price: 89.9, listPrice: 104.9 })).toBe(14);
  });

  test("given an exact discount, when worked out, then floating point never takes a point off", () => {
    expect(discountPercent({ price: 80, listPrice: 100 })).toBe(20);
    expect(discountPercent({ price: 87.92, listPrice: 109.9 })).toBe(20);
    expect(discountPercent({ price: 54.95, listPrice: 109.9 })).toBe(50);
  });

  test("given no promotion, no price, or a discount under 1%, when worked out, then there is no tag", () => {
    expect(discountPercent({ price: 109.9 })).toBeUndefined();
    expect(discountPercent({ price: null, listPrice: 109.9 })).toBeUndefined();
    expect(discountPercent({ price: 109.9, listPrice: 109.9 })).toBeUndefined();
    expect(discountPercent({ price: 109.5, listPrice: 109.9 })).toBeUndefined();
  });
});

describe("section tags (layout.tags)", () => {
  test("given the discount tag, the section's own text, or both, when validated, then they pass; sections without tags are unchanged", () => {
    expect(validateSection(withTags({ discount: true })).ok).toBe(true);
    expect(validateSection(withTags({ text: "Black Friday" })).ok).toBe(true);
    expect(validateSection(withTags({ discount: true, text: "Lançamento" })).ok).toBe(true);
    expect(terra().layout!.tags).toBeUndefined();
  });

  test("given an empty, long, padded or unknown tag, or tags outside a product section, when validated, then they are rejected", () => {
    for (const bad of [{}, { discount: false }, { text: "" }, { text: "x".repeat(25) }, { text: " BF" }, { color: "red", text: "BF" }, "BF"]) expect(validateSection(withTags(bad)).ok, JSON.stringify(bad)).toBe(false);
    const hero = seed().home!.sections.find((s) => s.template === "hero")!;
    expect(validateSection({ ...hero, layout: { variant: "standard", tone: "dark", surface: "region-primary", tags: { discount: true } } }).ok).toBe(false);
  });

  test("given the editor's checkboxes, when parsed and applied, then the tags land in the layout", () => {
    const patch = parseSectionForm(form(layoutForm({ tags_present: "1", tags_discount: "on", tags_custom: "on", tags_text: "  Black Friday  " })), terra());
    expect(patch.layout!.tags).toEqual({ discount: true, text: "Black Friday" });
    const r = applyOp(seed(), { type: "update", id: "seed-terra", patch }, { newId: () => "x" });
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.doc.home!.sections.find((s) => s.id === "seed-terra")!.layout!.tags).toEqual({ discount: true, text: "Black Friday" });
  });

  test("given both boxes unticked, or the own tag ticked with no text, then no tag is stored; a form without the block keeps the saved tags", () => {
    expect(parseSectionForm(form(layoutForm({ tags_present: "1" })), withTags({ discount: true })).layout).not.toHaveProperty("tags");
    expect(parseSectionForm(form(layoutForm({ tags_present: "1", tags_custom: "on", tags_text: "   " })), terra()).layout).not.toHaveProperty("tags");
    expect(parseSectionForm(form(layoutForm({})), withTags({ text: "Lançamento" })).layout!.tags).toEqual({ text: "Lançamento" });
  });
});
