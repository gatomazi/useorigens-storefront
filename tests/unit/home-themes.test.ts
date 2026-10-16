import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { editorialSeed, withHomeTheme, type EditorialCollections } from "@/lib/site-config/home-themes";
import { EDITORIAL_COLORS, homeThemeCssVars, resolveTheme } from "@/lib/site-config/navigation";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

/** The two themes of a region's home: "original" (the store's look) and "editorial", each with its own sections, swapped without losing anything. */

const seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const sul = (): ScopeDoc => structuredClone(seed.docs.sul);
let n = 0;
const ctx = { newId: () => `t${++n}` };
const SUL = "use-sul" as const;
const all: EditorialCollections = { terra: { store: SUL, collectionId: 152188 }, fala: { store: SUL, collectionId: 152079 }, jeito: { store: SUL, collectionId: 152187 }, novidades: { store: SUL, collectionId: 153383 } };
const toEditorial = (doc: ScopeDoc, collections: EditorialCollections = all) => {
  const r = applyOp(doc, { type: "set-home-theme", theme: "editorial", collections }, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};

describe("switching the home theme", () => {
  test("given the original home, when the editorial theme is chosen the first time, then it is built from the current sections and the original ones are kept", () => {
    const before = sul();
    const doc = toEditorial(before);
    expect(doc.homeTheme).toBe("editorial");
    expect(doc.homeThemes?.original?.sections).toEqual(before.home!.sections);
    const t = doc.home!.sections;
    expect(t[0]).toMatchObject({ template: "hero", variant: "feature" });
    expect(t.map((s) => s.template).slice(0, 6)).toEqual(["hero", "states", "city-styles", "image-grid", "campaign", "product-carousel"]);
    expect(t.at(-1)!.template).toBe("footer");
    // The curated showcases the editorial composition already covers come along switched off, never deleted.
    expect(t.filter((s) => s.source?.kind === "editorial-module").every((s) => !s.active)).toBe(true);
    expect(validateScopeDoc(doc).ok).toBe(true);
  });

  test("given the editorial theme edited, when the owner switches to the original and back, then each theme returns exactly as it was left", () => {
    const editorial = toEditorial(sul());
    editorial.home!.sections[0] = { ...editorial.home!.sections[0], title: "Título editado" };
    const original = applyOp(editorial, { type: "set-home-theme", theme: "original" }, ctx);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    expect(original.doc.homeTheme).toBeUndefined();
    expect(original.doc.home!.sections).toEqual(sul().home!.sections);
    expect(original.doc.homeThemes?.editorial?.sections[0].title).toBe("Título editado");
    const back = applyOp(original.doc, { type: "set-home-theme", theme: "editorial", collections: {} }, ctx);
    expect(back.ok && back.doc.home!.sections).toEqual(editorial.home!.sections);
    expect(back.ok && back.doc.homeThemes?.original?.sections).toEqual(sul().home!.sections);
  });

  test("given collections missing from the store, when the editorial theme is built, then the parts that need them are left out (never pointed elsewhere)", () => {
    const doc = toEditorial(sul(), { terra: all.terra });
    const t = doc.home!.sections;
    expect(t.some((s) => s.template === "image-grid")).toBe(false); // one card alone is not a grid
    expect(t.some((s) => s.anchor === "selecao")).toBe(false);
    expect(t.find((s) => s.template === "campaign")!.cta).toEqual(sul().home!.sections.find((s) => s.template === "campaign")!.cta);
  });

  test("given a theme kept as the one in use, an unknown theme or a theme on the global scope, when validated, then it is rejected", () => {
    const doc = toEditorial(sul());
    expect(validateScopeDoc({ ...doc, homeThemes: { editorial: { sections: doc.home!.sections } } }).ok).toBe(false);
    expect(validateScopeDoc({ ...doc, homeThemes: { ...doc.homeThemes, minimal: { sections: [] } } as never }).ok).toBe(false);
    expect(validateScopeDoc({ ...doc, homeTheme: "original" as never }).ok).toBe(false);
    expect(validateScopeDoc({ ...structuredClone(seed.docs.global), homeTheme: "editorial" }).ok).toBe(false);
    // A kept theme obeys the home's rules too (hero first, footer last).
    const broken = { ...doc, homeThemes: { original: { sections: doc.homeThemes!.original!.sections.slice(1) } } };
    expect(validateScopeDoc(broken).ok).toBe(false);
  });

  test("given a published file whose kept theme is broken, when the storefront reads it, then only the kept theme is dropped and the home stays", () => {
    const doc = toEditorial(sul());
    const broken = { ...doc, homeThemes: { original: { sections: [] as never[] } } };
    const raw = { ...seed, docs: { ...seed.docs, sul: { ...broken, homeThemes: { original: { sections: "nope" } } } } };
    const { bundle, diagnostics } = sanitizeBundle(JSON.parse(JSON.stringify(raw)), seed);
    expect(bundle?.docs.sul.homeTheme).toBe("editorial");
    expect(bundle?.docs.sul.homeThemes).toBeUndefined();
    expect(bundle?.docs.sul.home!.sections[0].variant).toBe("feature");
    expect(diagnostics.join(" ")).toContain("homeThemes is invalid");
  });

  test("given a kept theme, when previewed, then its sections are drawn without changing the document; a theme never set up has no preview", () => {
    const doc = toEditorial(sul());
    expect(withHomeTheme(doc, "original")!.home!.sections).toEqual(sul().home!.sections);
    expect(withHomeTheme(doc, "editorial")).toBe(doc);
    expect(withHomeTheme(sul(), "editorial")).toBeNull();
  });

  test("given the switch in the draft, when the publish screen lists the changes, then the theme comes first and says the other one is kept", () => {
    const texts = diffDocs(sul(), toEditorial(sul())).map((c) => c.text);
    expect(texts[0]).toBe("Tema da home: Original → Editorial (as seções do Original ficam guardadas)");
  });
});

describe("the editorial theme's colours", () => {
  test("given the editorial theme and no palette of its own, when resolved, then the editorial palette is the base and is emitted, green strip and footer too", () => {
    const doc = toEditorial(sul());
    const theme = resolveTheme("sul", doc, undefined);
    expect(theme.effective).toEqual(EDITORIAL_COLORS);
    expect(theme.origin.accent).toBe("theme");
    expect(theme.configured.pageBackground).toBe("#f7f3ec");
    expect(homeThemeCssVars(doc, theme.effective)).toEqual({ "--strip-bg": "#213b30", "--footer-bg": "#213b30" });
  });

  test("given the owner's own colour over the editorial theme, when resolved, then it wins over the theme's, one colour at a time", () => {
    const doc = { ...toEditorial(sul()), theme: { mode: "override" as const, colors: { accent: "#8a3b2b" } } };
    const theme = resolveTheme("sul", doc, undefined);
    expect(theme.effective.accent).toBe("#8a3b2b");
    expect(theme.origin.accent).toBe("own");
    expect(theme.effective.brandPrimary).toBe("#213b30");
  });

  test("given the original theme, when resolved, then nothing changes from today (no colour, no strip, no footer)", () => {
    const theme = resolveTheme("sul", sul(), undefined);
    expect(theme.configured).toEqual({});
    expect(homeThemeCssVars(sul(), theme.effective)).toEqual({});
  });
});

describe("the editorial seed alone", () => {
  test("given a region without the singletons (no states, no styles, no campaign), when seeded, then they are created with the region's own defaults", () => {
    const doc = sul();
    const bare = doc.home!.sections.filter((s) => s.template === "hero" || s.template === "footer");
    const out = editorialSeed("sul", bare, {}, () => `x${++n}`);
    expect(out.map((s) => s.template)).toEqual(["hero", "states", "city-styles", "campaign", "footer"]);
    expect(new Set(out.map((s) => s.anchor)).size).toBe(out.length);
  });
});
