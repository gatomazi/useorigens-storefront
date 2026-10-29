import { describe, expect, test } from "vitest";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { composeDoc } from "@/lib/admin/publishing";
import { readabilityProblems } from "@/lib/admin/validate-draft";
import { followedDoc } from "@/lib/site-config/follow";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { mediaRefsOfDoc, validateScopeDoc, type PageBackdrop, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

/** "Fundo da home": the ground of a home theme (colour, text tone, optional pattern), the same as a page's, kept and swapped with its theme. */

const seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const sul = (): ScopeDoc => structuredClone(seed.docs.sul);
let n = 0;
const ctx = { newId: () => `g${++n}` };
const run = (doc: ScopeDoc, op: DraftOp) => {
  const r = applyOp(doc, op, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};
const PATTERN = { image: { assetId: "01JPATTERN", alt: "", decorative: true }, size: 160, opacity: 0.25 };
const BLACK: PageBackdrop = { color: "#0a0a0a", tone: "dark", pattern: PATTERN };
/** Sul with the Black theme created (kept, not in use) and its ground saved while editing it, as the panel does. */
const withBlackGround = () => {
  const created = run(sul(), { type: "create-home-theme", theme: "black" });
  return run(created, { type: "in-home-theme", theme: "black", op: { type: "set-home-backdrop", backdrop: BLACK } });
};

describe("the ground of a home theme (Fundo da home)", () => {
  test("given the Black theme being edited, when its ground is saved, then only that theme has it and the theme in use keeps the region's ground", () => {
    const doc = withBlackGround();
    expect(validateScopeDoc(doc).ok).toBe(true);
    expect(doc.homeTheme).toBeUndefined();
    expect(doc.home).not.toHaveProperty("backdrop");
    expect(doc.homeThemes?.black?.backdrop).toEqual(BLACK);
  });

  test("given a theme with a ground, when it is put on the store and swapped back, then the ground comes and goes with it, losslessly", () => {
    const doc = withBlackGround();
    const black = run(doc, { type: "set-home-theme", theme: "black" });
    expect(black.home?.backdrop).toEqual(BLACK);
    expect(black.homeThemes?.original).not.toHaveProperty("backdrop");
    const back = run(black, { type: "set-home-theme", theme: "original" });
    expect(back.home).not.toHaveProperty("backdrop");
    expect(back.homeThemes?.black?.backdrop).toEqual(BLACK);
    // Switching it off gives the home the region's ground again.
    const off = run(black, { type: "set-home-backdrop", backdrop: null });
    expect(off.home).not.toHaveProperty("backdrop");
  });

  test("given a seasonal theme created while a ground is in use, when it is created, then it starts as a copy of that ground too", () => {
    const black = run(withBlackGround(), { type: "set-home-theme", theme: "black" });
    const natal = run(black, { type: "create-home-theme", theme: "natal" });
    expect(natal.homeThemes?.natal?.backdrop).toEqual(BLACK);
  });

  test("given a malformed ground, when validated, then the document is refused (in use and kept)", () => {
    const doc = sul();
    expect(validateScopeDoc({ ...doc, home: { ...doc.home!, backdrop: { color: "black", tone: "dark" } as never } }).ok).toBe(false);
    const kept = withBlackGround();
    expect(validateScopeDoc({ ...kept, homeThemes: { black: { ...kept.homeThemes!.black!, backdrop: { ...BLACK, pattern: { ...PATTERN, opacity: 0 } } } } }).ok).toBe(false);
    expect(applyOp(structuredClone(seed.docs.global), { type: "set-home-backdrop", backdrop: BLACK }, ctx).ok).toBe(false);
  });

  test("given the ground in use, when the region is published, then its pattern is resolved and carried, and an unreadable one blocks the publish", () => {
    const black = run(withBlackGround(), { type: "set-home-theme", theme: "black" });
    expect(mediaRefsOfDoc(black).map((r) => r.assetId)).toContain("01JPATTERN");
    expect(composeDoc(sul(), black, { kind: "region" }).home?.backdrop).toEqual(BLACK);
    expect(readabilityProblems(black).filter((p) => p.startsWith("Fundo da home"))).toEqual([]);
    const unreadable = run(black, { type: "set-home-backdrop", backdrop: { color: "#0a0a0a", tone: "light" } });
    expect(readabilityProblems(unreadable).some((p) => p.startsWith("Fundo da home"))).toBe(true);
  });

  test("given a published file, when the storefront reads it, then a valid ground is kept and a broken one is dropped without touching the home", () => {
    const black = run(withBlackGround(), { type: "set-home-theme", theme: "black" });
    const read = (home: unknown) => sanitizeBundle(JSON.parse(JSON.stringify({ ...seed, docs: { ...seed.docs, sul: { ...black, home } } })), seed);
    expect(read(black.home).bundle?.docs.sul.home?.backdrop).toEqual(BLACK);
    const broken = read({ ...black.home, backdrop: { color: "#0a0a0a", tone: "medium" } });
    expect(broken.bundle?.docs.sul.home).not.toHaveProperty("backdrop");
    expect(broken.bundle?.docs.sul.home?.sections.length).toBe(black.home!.sections.length);
    expect(broken.diagnostics.join(" ")).toContain("home backdrop is invalid");
  });

  test("given a region that follows Sul's home, when Sul has a ground in use, then the region shows it with Sul's sections", () => {
    const black = run(withBlackGround(), { type: "set-home-theme", theme: "black" });
    const norte = { ...structuredClone(seed.docs.norte), follow: ["home"] } as ScopeDoc;
    expect(followedDoc(norte, black, true).home?.backdrop).toEqual(BLACK);
    expect(followedDoc(norte, sul(), true).home).not.toHaveProperty("backdrop");
    // Sul itself, read by the public (its sections filtered by region), keeps its ground.
    expect(followedDoc(black, undefined, false).home?.backdrop).toEqual(BLACK);
  });
});
