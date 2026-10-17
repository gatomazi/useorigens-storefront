import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { EDITORIAL_PALETTE, editorialSeed, withHomeTheme, type EditorialCollections } from "@/lib/site-config/home-themes";
import { homeThemeCssVars, resolveTheme } from "@/lib/site-config/navigation";
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
    // Each theme has its own colours: the editorial one starts with the editorial palette, as an ordinary, editable palette.
    expect(doc.theme).toEqual(EDITORIAL_PALETTE);
    expect(doc.homeThemes?.original?.theme).toBeUndefined();
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

describe("each theme's own colours", () => {
  test("given the editorial theme in use, when resolved, then its palette is an ordinary one (own colours), and the strip and footer follow its main colour", () => {
    const doc = toEditorial(sul());
    const theme = resolveTheme("sul", doc, undefined);
    expect(theme.mode).toBe("override");
    expect(theme.origin.accent).toBe("own");
    expect(theme.effective.pageBackground).toBe("#f7f3ec");
    expect(homeThemeCssVars(doc, theme.effective)).toEqual({ "--strip-bg": "#213b30", "--footer-bg": "#213b30" });
    const edited = { ...doc, theme: { mode: "override" as const, colors: { ...EDITORIAL_PALETTE.colors, brandPrimary: "#1f4a3a" } } };
    expect(homeThemeCssVars(edited, resolveTheme("sul", edited, undefined).effective)["--strip-bg"]).toBe("#1f4a3a");
  });

  test("given the palette edited while the editorial theme is in use, when the owner switches to the original and back, then each theme keeps its own colours", () => {
    const doc = toEditorial(sul());
    const recoloured = applyOp(doc, { type: "set-theme", theme: { mode: "override", colors: { ...EDITORIAL_PALETTE.colors, accent: "#8a3b2b" } } }, ctx);
    expect(recoloured.ok).toBe(true);
    if (!recoloured.ok) return;
    const original = applyOp(recoloured.doc, { type: "set-home-theme", theme: "original" }, ctx);
    expect(original.ok && original.doc.theme).toBeUndefined();
    const back = original.ok ? applyOp(original.doc, { type: "set-home-theme", theme: "editorial" }, ctx) : null;
    expect(back?.ok && back.doc.theme?.colors.accent).toBe("#8a3b2b");
  });

  test("given the original theme, when resolved, then nothing changes from today (no colour, no strip, no footer)", () => {
    const theme = resolveTheme("sul", sul(), undefined);
    expect(theme.configured).toEqual({});
    expect(homeThemeCssVars(sul(), theme.effective)).toEqual({});
  });
});

describe("editing a theme that is not on the store", () => {
  test("given the editorial theme created without using it, when it is edited, then only its sections and colours change and the store keeps the original", () => {
    const created = applyOp(sul(), { type: "create-home-theme", theme: "editorial", collections: all }, ctx);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.doc.homeTheme).toBeUndefined(); // the store still uses the original
    expect(created.doc.home!.sections).toEqual(sul().home!.sections);
    const kept = created.doc.homeThemes!.editorial!;
    expect(kept.theme).toEqual(EDITORIAL_PALETTE);
    const heroId = kept.sections[0].id;
    // A section added and the hero edited, inside the editorial theme only.
    const added = applyOp(created.doc, { type: "in-home-theme", theme: "editorial", op: { type: "add-structured", template: "image-grid" } }, ctx);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const edited = applyOp(added.doc, { type: "in-home-theme", theme: "editorial", op: { type: "update", id: heroId, patch: { title: "Só no editorial" } } }, ctx);
    const recoloured = edited.ok ? applyOp(edited.doc, { type: "in-home-theme", theme: "editorial", op: { type: "set-theme", theme: { mode: "override", colors: { ...EDITORIAL_PALETTE.colors, accent: "#8a3b2b" } } } }, ctx) : null;
    expect(recoloured?.ok).toBe(true);
    if (!recoloured?.ok) return;
    const doc = recoloured.doc;
    expect(doc.homeTheme).toBeUndefined();
    expect(doc.home!.sections).toEqual(sul().home!.sections);
    expect(doc.theme).toBeUndefined();
    expect(doc.homeThemes!.editorial!.sections.length).toBe(kept.sections.length + 1);
    expect(doc.homeThemes!.editorial!.sections[0].title).toBe("Só no editorial");
    expect(doc.homeThemes!.editorial!.theme?.colors.accent).toBe("#8a3b2b");
    expect(validateScopeDoc(doc).ok).toBe(true);
  });

  test("given a theme never created, when an operation is aimed at it, then it is refused (nothing is created by accident)", () => {
    const r = applyOp(sul(), { type: "in-home-theme", theme: "editorial", op: { type: "update", id: "seed-hero", patch: { title: "x" } } }, ctx);
    expect(r.ok).toBe(false);
  });

  test("given changes in the theme that is not on the store, when the publish screen lists the changes, then it says which theme and what changed", () => {
    const created = applyOp(sul(), { type: "create-home-theme", theme: "editorial", collections: all }, ctx);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(diffDocs(sul(), created.doc).map((c) => c.text)).toContain("Tema Editorial (fora da loja): criado");
    const recoloured = applyOp(created.doc, { type: "in-home-theme", theme: "editorial", op: { type: "set-theme", theme: { mode: "override", colors: { accent: "#8a3b2b" } } } }, ctx);
    expect(recoloured.ok && diffDocs(created.doc, recoloured.doc).map((c) => c.text)).toEqual(["Tema Editorial (fora da loja): cores alteradas"]);
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
