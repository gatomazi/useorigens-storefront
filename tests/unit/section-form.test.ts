import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { parseCollectionRef, parseSectionForm } from "@/lib/admin/section-form";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.sul);
const terra = () => seed().home!.sections.find((s) => s.id === "seed-terra")!;
const form = (o: Record<string, string>) => ({ get: (n: string) => (n in o ? o[n] : null) });
const apply = (o: Record<string, string>) => {
  const doc = seed();
  const patch = parseSectionForm(form(o), terra());
  return applyOp(doc, { type: "update", id: "seed-terra", patch }, { newId: () => "z" });
};

describe("section form parsing", () => {
  test("given collection references, when parsed, then only real store:id pairs are accepted", () => {
    expect(parseCollectionRef("use-sul:152188")).toEqual({ store: "use-sul", collectionId: 152188 });
    for (const bad of ["", "152188", "use-mars:1", "use-sul:abc", "use-sul:1;drop", "use-sul:1 2", "use-origens:5"]) expect(parseCollectionRef(bad), bad).toBeNull();
  });

  test("given a full carousel form, when applied, then title, source, layout, colour and overlay land in the section", () => {
    const r = apply({
      title: "Novo título", subtitle: "Sub", source_kind: "ink-category", source_collection: "use-sul:152188", source_limit: "8",
      layout_variant: "poster", layout_tone: "dark", layout_surface: "plain", fill_kind: "solid", fill_color_choice: "token:region-primary",
      overlay_kind: "preset", overlay_preset: "regional-wash-dark", cta_kind: "ink-collection", cta_collection: "use-sul:152188", cta_label: "Ver tudo",
      focal_mx: "10", focal_my: "20", focal_dx: "30", focal_dy: "40",
    });
    if (!r.ok) throw new Error(r.errors.join());
    const s = r.doc.home!.sections.find((x) => x.id === "seed-terra")!;
    expect(s.title).toBe("Novo título");
    expect(s.source).toEqual({ kind: "ink-category", store: "use-sul", collectionId: 152188, order: "category", limit: 8 });
    expect(s.layout).toEqual({ variant: "poster", tone: "dark", surface: "plain" });
    expect(s.appearance.fill).toEqual({ kind: "solid", color: "token:region-primary" });
    expect(s.appearance.focal).toEqual({ mobile: { x: 10, y: 20 }, desktop: { x: 30, y: 40 } });
    expect(s.cta).toEqual({ label: "Ver tudo", dest: { kind: "ink-collection", store: "use-sul", collectionId: 152188 } });
  });

  test("given out-of-range numbers, when parsed, then they are clamped (limit 3..24, focal 0..100, overlay ≤ 0.85)", () => {
    const patch = parseSectionForm(form({ source_kind: "ink-category", source_collection: "use-sul:1", source_limit: "500", overlay_kind: "custom", overlay_color: "#000000", overlay_opacity: "9", focal_mx: "-50", focal_dx: "999" }), terra());
    expect(patch.source).toMatchObject({ limit: 24 });
    expect(patch.appearance!.overlay).toEqual({ color: "#000000", opacity: 0.85 });
    expect(patch.appearance!.focal.mobile.x).toBe(0);
    expect(patch.appearance!.focal.desktop.x).toBe(100);
  });

  test("given a decorative image, when parsed, then alt is forced empty; a meaningful one keeps its alt, and a missing alt is rejected by validation", () => {
    const deco = parseSectionForm(form({ img_mobile: "legacy:sul/fala-daqui-mobile", img_decorative: "on", img_alt: "ignored" }), terra());
    expect(deco.appearance!.image!.mobile).toEqual({ assetId: "legacy:sul/fala-daqui-mobile", alt: "", decorative: true });
    const noAlt = apply({ img_mobile: "legacy:sul/fala-daqui-mobile" });
    expect(noAlt.ok).toBe(false);
    const alt = apply({ img_mobile: "legacy:sul/fala-daqui-mobile", img_alt: "Costa catarinense ao entardecer" });
    expect(alt.ok).toBe(true);
  });

  test("given hostile input (script in text, javascript: URL, foreign host, bad colour, traversal route), when applied, then nothing is changed", () => {
    expect(apply({ cta_kind: "external", cta_url: "javascript:alert(1)", cta_label: "x" }).ok).toBe(false);
    expect(apply({ cta_kind: "external", cta_url: "https://evil.example/", cta_label: "x" }).ok).toBe(false);
    expect(apply({ cta_kind: "route", cta_route: "/sul/../admin", cta_label: "x" }).ok).toBe(false);
    expect(apply({ fill_kind: "solid", fill_color_choice: "custom", fill_color: "red" }).ok).toBe(false);
    expect(apply({ fill_kind: "solid", fill_color_choice: "token:evil" }).ok).toBe(false);
    expect(apply({ source_kind: "ink-category", source_collection: "use-sul:1', 'x" }).ok).toBe(true); // unparseable ref: the source is left as it was
    // Text is data, never markup: it is stored verbatim and rendered as text by React.
    const r = apply({ title: "<img src=x onerror=alert(1)>" });
    if (r.ok) expect(r.doc.home!.sections.find((s) => s.id === "seed-terra")!.title).toBe("<img src=x onerror=alert(1)>");
  });

  test("given a gradient, when parsed, then both ends and the angle are kept", () => {
    const r = apply({ fill_kind: "gradient", grad_from: "#112233", grad_to: "token:near-black", grad_angle: "45" });
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.doc.home!.sections.find((s) => s.id === "seed-terra")!.appearance.fill).toEqual({ kind: "gradient", from: "#112233", to: "token:near-black", angle: 45 });
  });
});
