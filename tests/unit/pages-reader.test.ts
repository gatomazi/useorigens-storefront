import { describe, expect, test } from "vitest";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { seedForEnv } from "@/lib/admin/publishing";
import { changedLabel } from "@/lib/admin/scope";
import { resolveCustomizerCard } from "@/lib/site-config/resolve";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import type { PublishedBundle, ScopeDoc } from "@/lib/site-config/schema";

let n = 0;
const ctx = () => ({ newId: () => `r${++n}` });
const seed = seedForEnv();
const SUL_COLLECTION = { store: "use-sul", collectionId: 152188 } as const;
const PIC = { assetId: "legacy:sul/fala-daqui-desktop", alt: "", decorative: true };
const run = (doc: ScopeDoc, op: DraftOp) => {
  const r = applyOp(doc, op, ctx());
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};

/** A Sul document with one hotpage, one live model and a carousel whose first card points at it. */
function withPagesAndModel(): ScopeDoc {
  let doc = structuredClone(seed.docs.sul);
  doc = run(doc, { type: "create-page", kind: "hotpage", title: "Dia dos Pais" });
  doc = run(doc, { type: "create-customizer", name: "Pai Paranaense", source: SUL_COLLECTION });
  const model = doc.customizers![0];
  doc = run(doc, { type: "update-customizer", id: model.id, patch: { active: true, pageMockup: PIC } });
  const carousel = doc.home!.sections.find((s) => s.template === "product-carousel")!;
  return run(doc, { type: "update", id: carousel.id, patch: { customizerCard: { customizerId: model.id, title: "Personalize a sua", button: "Personalizar" } } });
}
const bundleOf = (sul: unknown): unknown => ({ schemaVersion: 1, releaseId: "r-1", docs: { ...seed.docs, sul }, media: seed.media });
const read = (sul: unknown, diagnostics: string[] = []) => {
  const result = sanitizeBundle(bundleOf(sul), seed as PublishedBundle);
  diagnostics.push(...result.diagnostics);
  return result.bundle!.docs.sul;
};

describe("tolerant reader with pages and models", () => {
  test("given a valid document, when read, then pages, models and the first card survive untouched", () => {
    const doc = withPagesAndModel();
    const out = read(doc);
    expect(out.pages).toHaveLength(1);
    expect(out.customizers).toHaveLength(1);
    expect(out.home!.sections.some((s) => s.customizerCard)).toBe(true);
  });

  test("given one invalid page, when read, then only that page is dropped: the home and the model keep working", () => {
    const doc = structuredClone(withPagesAndModel()) as ScopeDoc & { pages: unknown[] };
    doc.pages.push({ id: "pg-bad", kind: "hotpage", slug: "Bad Slug!", title: "", sections: [] });
    const diagnostics: string[] = [];
    const out = read(doc, diagnostics);
    expect(out.pages).toHaveLength(1);
    expect(out.customizers).toHaveLength(1);
    expect(out.home!.sections.length).toBe(seed.docs.sul.home!.sections.length);
    expect(diagnostics.join("\n")).toContain("page #2 dropped");
  });

  test("given an invalid model that a carousel's first card points at, when read, then the model and the card go away but the carousel stays", () => {
    const doc = structuredClone(withPagesAndModel()) as ScopeDoc & { customizers: Array<Record<string, unknown>> };
    (doc.customizers[0] as Record<string, unknown>).fields = "not a list";
    const diagnostics: string[] = [];
    const out = read(doc, diagnostics);
    expect(out.customizers ?? []).toHaveLength(0);
    expect(out.home!.sections.some((s) => s.customizerCard)).toBe(false);
    expect(out.home!.sections.filter((s) => s.template === "product-carousel").length).toBe(seed.docs.sul.home!.sections.filter((s) => s.template === "product-carousel").length);
    expect(diagnostics.join("\n")).toMatch(/model #1 dropped[\s\S]*first card/);
  });

  test("given two pages with the same kind and slug, when read, then the second is dropped", () => {
    const doc = structuredClone(withPagesAndModel()) as ScopeDoc & { pages: unknown[] };
    doc.pages.push({ ...(doc.pages[0] as object), id: "pg-copy" });
    expect(read(doc).pages).toHaveLength(1);
  });
});

describe("first card of a carousel", () => {
  const media = { ...seed.media };
  test("given a live model of this region, when resolved, then the card links to its page with the mockup as picture", () => {
    const doc = withPagesAndModel();
    const section = doc.home!.sections.find((s) => s.customizerCard)!;
    const card = resolveCustomizerCard(section, doc, media, "sul");
    expect(card).toMatchObject({ href: "/sul/personalizar/pai-paranaense", title: "Personalize a sua", button: "Personalizar" });
    expect(card!.image.src).toBeTruthy();
  });

  test("given a foreign region, an inactive model or a missing picture, when resolved, then there is no card (the carousel is just its products)", () => {
    const doc = withPagesAndModel();
    const section = doc.home!.sections.find((s) => s.customizerCard)!;
    expect(resolveCustomizerCard(section, doc, media, "norte")).toBeNull();
    const inactive = structuredClone(doc);
    inactive.customizers![0].active = false;
    expect(resolveCustomizerCard(section, inactive, media, "sul")).toBeNull();
    expect(resolveCustomizerCard(section, doc, {}, "sul")).toBeNull();
    expect(resolveCustomizerCard({ ...section, customizerCard: undefined }, doc, media, "sul")).toBeNull();
  });
});

describe("history labels", () => {
  test("given regions, global and page / model markers, then every item has a readable label and none throws", () => {
    expect(changedLabel("sul")).toBe("Sul");
    expect(changedLabel("global")).toBe("Global");
    expect(changedLabel("page:hotpage/dia-dos-pais")).toBe("Página dia-dos-pais");
    expect(changedLabel("customizer:pai-paranaense")).toBe("Modelo pai-paranaense");
    expect(changedLabel("unknown")).toBe("unknown");
  });
});
