import { describe, expect, test } from "vitest";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { parseSectionForm } from "@/lib/admin/section-form";
import { MAX_CAROUSEL_PRODUCTS, MAX_GRID_PRODUCTS, validatePage, validateSection, type ScopeDoc, type Section } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.sul);
const terra = (doc: ScopeDoc = seed()) => doc.home!.sections.find((s) => s.id === "seed-terra")!;
const form = (o: Record<string, string>) => ({ get: (n: string) => (n in o ? o[n] : null) });
const SUL = { store: "use-sul", collectionId: 152188 } as const;
const inkForm = (limit: string, extra: Record<string, string> = {}) => ({ title: "Black Friday", source_kind: "ink-category", source_collection: "use-sul:152188", source_limit: limit, layout_variant: "standard", layout_tone: "light", layout_surface: "plain", ...extra });
const collection = (limit: number, display?: "grid"): Section => ({ ...terra(), source: { kind: "ink-category", ...SUL, order: "category", limit }, layout: { variant: "standard", tone: "light", surface: "plain", ...(display ? { display } : {}) } });
let n = 0;
const ctx = () => ({ newId: () => `g${++n}` });

describe("product sections as a carousel or a grid", () => {
  test("given a section without `display`, when validated, then it is still a valid carousel (sections saved before the grid existed are untouched)", () => {
    expect(validateSection(terra()).ok).toBe(true);
    expect(terra().layout!.display).toBeUndefined();
    expect(validateSection(collection(6, "grid")).ok).toBe(true);
    expect(validateSection({ ...collection(6), layout: { ...collection(6).layout!, display: "carousel" } }).ok).toBe(true);
  });

  test("given an unknown display, or a display on a section that is not a product section, when validated, then it is rejected", () => {
    expect(validateSection({ ...collection(6), layout: { ...collection(6).layout!, display: "mosaic" as never } }).ok).toBe(false);
    const hero = seed().home!.sections.find((s) => s.template === "hero")!;
    expect(validateSection({ ...hero, layout: { variant: "standard", tone: "dark", surface: "region-primary", display: "grid" } }).ok).toBe(false);
  });

  test("given more cards than a carousel scrolls through, when validated, then only a grid accepts them, up to 48", () => {
    expect(validateSection(collection(MAX_CAROUSEL_PRODUCTS)).ok).toBe(true);
    expect(validateSection(collection(MAX_CAROUSEL_PRODUCTS + 1)).ok).toBe(false);
    expect(validateSection(collection(MAX_GRID_PRODUCTS, "grid")).ok).toBe(true);
    expect(validateSection(collection(MAX_GRID_PRODUCTS + 1, "grid")).ok).toBe(false);
    const umapenca = (limit: number, display?: "grid"): Section => ({ ...collection(6, display), source: { kind: "umapenca", articleKinds: ["caneca"], limit } });
    expect(validateSection(umapenca(40, "grid")).ok).toBe(true);
    expect(validateSection(umapenca(40)).ok).toBe(false);
  });

  test("given the editor's form with 'Grade', when parsed and applied, then the layout says grid and the limit may go up to 48", () => {
    const patch = parseSectionForm(form(inkForm("40", { layout_display: "grid" })), terra());
    expect(patch.layout).toEqual({ variant: "standard", tone: "light", surface: "plain", display: "grid" });
    expect(patch.source).toMatchObject({ kind: "ink-category", limit: 40 });
    const r = applyOp(seed(), { type: "update", id: "seed-terra", patch }, ctx());
    if (!r.ok) throw new Error(r.errors.join());
    expect(terra(r.doc).layout!.display).toBe("grid");
    expect(parseSectionForm(form(inkForm("90", { layout_display: "grid" })), terra()).source).toMatchObject({ limit: MAX_GRID_PRODUCTS });
  });

  test("given 'Carrossel' (or a grid turned back into one), when parsed, then nothing is stored for the display and the limit is clamped to 24", () => {
    const grid = collection(40, "grid");
    const patch = parseSectionForm(form(inkForm("40", { layout_display: "carousel" })), grid);
    expect(patch.layout).toEqual({ variant: "standard", tone: "light", surface: "plain" });
    expect(patch.source).toMatchObject({ limit: MAX_CAROUSEL_PRODUCTS });
    // A source the form could not re-read (the collection did not resolve) is kept, but still fits the carousel's ceiling.
    const kept = parseSectionForm(form(inkForm("40", { layout_display: "carousel", source_collection: "" })), grid);
    expect(kept.source).toMatchObject({ kind: "ink-category", limit: MAX_CAROUSEL_PRODUCTS });
  });

  test("given a form without the display field, when parsed, then the saved display is kept", () => {
    const patch = parseSectionForm(form(inkForm("12")), collection(12, "grid"));
    expect(patch.layout!.display).toBe("grid");
  });

  test("given a new collection section created as a grid on a page, when added, then it is a grid and the page stays valid", () => {
    let doc = seed();
    const created = applyOp(doc, { type: "create-page", kind: "hotpage", title: "Black Friday" }, ctx());
    if (!created.ok) throw new Error(created.errors.join());
    doc = created.doc;
    const page = doc.pages![0];
    const op: DraftOp = { type: "in-page", page: page.id, op: { type: "add-carousel", title: "Ofertas", source: { kind: "ink-category", ...SUL, order: "category", limit: 32 }, display: "grid" } };
    const r = applyOp(doc, op, ctx());
    if (!r.ok) throw new Error(r.errors.join());
    const section = r.doc.pages![0].sections[1];
    expect(section.layout).toEqual({ variant: "standard", tone: "light", surface: "plain", display: "grid" });
    expect(validatePage(r.doc.pages![0], "sul").ok).toBe(true);
    // The same 32 cards as a carousel are refused: it scrolls through at most 24.
    expect(applyOp(doc, { type: "in-page", page: page.id, op: { type: "add-carousel", title: "Ofertas", source: { kind: "ink-category", ...SUL, order: "category", limit: 32 } } }, ctx()).ok).toBe(false);
  });
});
