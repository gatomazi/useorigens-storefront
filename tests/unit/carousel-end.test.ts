import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { globalParts } from "@/lib/admin/pending";
import { carouselEndOf, carouselEndText, DEFAULT_CAROUSEL_END_LABEL, validateCarouselEnd } from "@/lib/site-config/carousel-end-schema";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "t1" };
const ok = (d: ScopeDoc, op: Parameters<typeof applyOp>[1]) => {
  const r = applyOp(d, op, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};

describe("last card of the product carousels (global scope)", () => {
  test("given the global document, when the card is turned on and off, then only `carouselEnd` changes and the document stays valid", () => {
    const global = structuredClone(seed().docs.global);
    const on = ok(global, { type: "set-carousel-end", carouselEnd: { label: DEFAULT_CAROUSEL_END_LABEL } });
    expect(on.carouselEnd).toEqual({ label: "Ver todas as {n} peças dessa coleção" });
    expect(validateScopeDoc(on).ok).toBe(true);
    const off = ok(on, { type: "set-carousel-end", carouselEnd: null });
    expect("carouselEnd" in off).toBe(false);
    expect(off).toEqual(global);
  });

  test("given a region, when the card is set there, then it is refused: it belongs to the global scope (every region)", () => {
    expect(applyOp(structuredClone(seed().docs.sul), { type: "set-carousel-end", carouselEnd: { label: "Ver tudo" } }, ctx).ok).toBe(false);
    expect(validateScopeDoc({ ...seed().docs.sul, carouselEnd: { label: "Ver tudo" } }).ok).toBe(false);
  });

  test("given bad labels, when validated, then each is refused", () => {
    for (const label of ["", " Ver tudo", "Ver tudo ", "x".repeat(61), "Ver\ntudo"]) expect(validateCarouselEnd({ label }, "global").ok).toBe(false);
    expect(validateCarouselEnd({ label: "Ver tudo", extra: 1 }, "global").ok).toBe(false);
    expect(validateCarouselEnd({ label: "Ver tudo" }, "global").ok).toBe(true);
  });

  test("given a published bundle, when read, then the card comes from the global document; an invalid one is dropped without touching the tracking", () => {
    const bundle = seed();
    expect(carouselEndOf(bundle)).toBeUndefined();
    const raw = { ...bundle, releaseId: "r1", docs: { ...bundle.docs, global: { ...bundle.docs.global, carouselEnd: { label: "Ver tudo" } } } };
    expect(carouselEndOf(sanitizeBundle(raw, bundle).bundle)).toEqual({ label: "Ver tudo" });
    const bad = { ...raw, docs: { ...raw.docs, global: { ...raw.docs.global, carouselEnd: { label: "" } } } };
    const read = sanitizeBundle(bad, bundle);
    expect(carouselEndOf(read.bundle)).toBeUndefined();
    expect(read.bundle?.docs.global.tracking).toEqual(bundle.docs.global.tracking);
    expect(read.diagnostics.some((d) => d.includes("carouselEnd is invalid"))).toBe(true);
  });

  test("given a change of the card, when the publish screen diffs the global document, then it says what changes and names the part", () => {
    const global = structuredClone(seed().docs.global);
    const on = ok(global, { type: "set-carousel-end", carouselEnd: { label: "Ver tudo" } });
    expect(diffDocs(global, on).map((c) => c.text)).toEqual(["Card no fim dos carrosséis: desligado → “Ver tudo”"]);
    expect(diffDocs(on, on)).toEqual([]);
    expect(globalParts(global, on)).toEqual(["card no fim dos carrosséis"]);
  });

  test("given the text with {n}, when drawn, then the number fills it, or leaves with its space when it is not known", () => {
    expect(carouselEndText(DEFAULT_CAROUSEL_END_LABEL, 1234)).toBe("Ver todas as 1.234 peças dessa coleção");
    expect(carouselEndText(DEFAULT_CAROUSEL_END_LABEL, null)).toBe("Ver todas as peças dessa coleção");
    expect(carouselEndText(DEFAULT_CAROUSEL_END_LABEL)).toBe("Ver todas as peças dessa coleção");
    expect(carouselEndText("Ver as {n}", 0)).toBe("Ver as");
    expect(carouselEndText("Ver a coleção inteira", 40)).toBe("Ver a coleção inteira");
  });
});
