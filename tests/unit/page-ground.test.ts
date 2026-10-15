import { describe, expect, test } from "vitest";
import { patternSrc } from "@/components/pages/PageGround";
import { groundReadability, toneFor } from "@/lib/admin/contrast";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { parsePageBackdrop } from "@/lib/admin/page-form";
import { composeDoc, seedForEnv } from "@/lib/admin/publishing";
import { pageGroundProblems } from "@/lib/admin/validate-draft";
import { mediaRefsOfDoc, validatePage, type Page, type PageBackdrop, type ScopeDoc } from "@/lib/site-config/schema";

let n = 0;
const ctx = () => ({ newId: () => `b${++n}` });
const seed = seedForEnv();
const run = (doc: ScopeDoc, op: DraftOp) => {
  const r = applyOp(doc, op, ctx());
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};
const withPage = (): { doc: ScopeDoc; page: () => Page } => {
  const doc = run(structuredClone(seed.docs.sul), { type: "create-page", kind: "hotpage", title: "Black Friday" });
  return { doc, page: () => doc.pages![0] };
};
const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });
const PATTERN = { image: { assetId: "01JPATTERN", alt: "", decorative: true }, size: 160, opacity: 0.25 };
const BLACK: PageBackdrop = { color: "#0a0a0a", tone: "dark", pattern: PATTERN };

describe("a page's own ground (Fundo da página)", () => {
  test("given a colour, a tone and a pattern, when saved on a page, then the page keeps them and stays valid; null takes it back to the region's ground", () => {
    const { doc, page } = withPage();
    const saved = run(doc, { type: "update-page", id: page().id, patch: { backdrop: BLACK } });
    expect(saved.pages![0].backdrop).toEqual(BLACK);
    expect(validatePage(saved.pages![0], "sul").ok).toBe(true);
    const cleared = run(saved, { type: "update-page", id: page().id, patch: { backdrop: null } });
    expect(cleared.pages![0]).not.toHaveProperty("backdrop");
    // Editing the title alone never touches the ground.
    const renamed = run(saved, { type: "update-page", id: page().id, patch: { title: "Black Friday 2026" } });
    expect(renamed.pages![0].backdrop).toEqual(BLACK);
  });

  test("given a malformed ground, when validated, then each problem is rejected", () => {
    const { page } = withPage();
    const bad = (backdrop: unknown) => validatePage({ ...page(), backdrop } as Page, "sul").ok;
    expect(bad({ color: "black", tone: "dark" })).toBe(false);
    expect(bad({ color: "#000000", tone: "medium" })).toBe(false);
    expect(bad({ color: "#000000", tone: "dark", pattern: { ...PATTERN, size: 20 } })).toBe(false);
    expect(bad({ color: "#000000", tone: "dark", pattern: { ...PATTERN, size: 900 } })).toBe(false);
    expect(bad({ color: "#000000", tone: "dark", pattern: { ...PATTERN, opacity: 0 } })).toBe(false);
    expect(bad({ color: "#000000", tone: "dark", pattern: { ...PATTERN, image: { assetId: "01JPATTERN", alt: "Etiquetas", decorative: false } } })).toBe(false); // texture, never content
    expect(bad({ color: "#000000", tone: "dark" })).toBe(true);
  });

  test("given a pattern, when the document's media are collected, then the pattern is part of what a publish resolves and carries", () => {
    const { doc, page } = withPage();
    const saved = run(doc, { type: "update-page", id: page().id, patch: { backdrop: BLACK } });
    expect(mediaRefsOfDoc(saved).map((r) => r.assetId)).toContain("01JPATTERN");
    const published = composeDoc(structuredClone(seed.docs.sul), saved, { kind: "page", id: page().id });
    expect(published.pages![0].backdrop).toEqual(BLACK);
  });

  test("given the editor's form, when parsed, then values are clamped into the contract and an unchecked box means no ground", () => {
    expect(parsePageBackdrop(form({}))).toEqual({ backdrop: null, problems: [] });
    expect(parsePageBackdrop(form({ backdrop_on: "on", backdrop_color: "#FF0000", backdrop_tone: "light" })).backdrop).toEqual({ color: "#ff0000", tone: "light" });
    const parsed = parsePageBackdrop(form({ backdrop_on: "on", backdrop_color: "#0a0a0a", backdrop_tone: "dark", backdrop_pattern: "01JPATTERN", backdrop_size: "5000", backdrop_opacity: "0.333" })).backdrop!;
    expect(parsed.pattern).toEqual({ image: { assetId: "01JPATTERN", alt: "", decorative: true }, size: 600, opacity: 0.33 });
    expect(parsePageBackdrop(form({ backdrop_on: "on", backdrop_color: "preto" })).problems).toHaveLength(1);
  });

  test("given text that barely reads on the ground, when checked, then the publish is blocked; a strong pattern only warns", () => {
    const { page } = withPage();
    expect(pageGroundProblems({ ...page(), backdrop: { color: "#0a0a0a", tone: "light" } })).toHaveLength(1); // dark text on black
    expect(pageGroundProblems({ ...page(), backdrop: BLACK })).toEqual([]);
    expect(pageGroundProblems(page())).toEqual([]);
    const strong = groundReadability({ ...BLACK, pattern: { ...PATTERN, opacity: 0.9 } });
    expect(strong.map((i) => i.level)).toEqual(["warning"]);
    expect(toneFor("#0a0a0a")).toBe("dark");
    expect(toneFor("#ffd400")).toBe("light");
  });

  test("given a pattern's media entry, when drawn, then the smallest variant that covers one repeat on a 2x screen is used", () => {
    const info = { src: "/media/abc/orig.webp", width: 1600, height: 1600, variants: [{ w: 320, src: "/media/abc/320.webp" }, { w: 640, src: "/media/abc/640.webp" }, { w: 1280, src: "/media/abc/1280.webp" }] };
    expect(patternSrc(info, 160)).toBe("/media/abc/320.webp");
    expect(patternSrc(info, 200)).toBe("/media/abc/640.webp");
    expect(patternSrc(info, 600)).toBe("/media/abc/1280.webp");
    expect(patternSrc({ ...info, variants: info.variants.slice(0, 2) }, 600)).toBe("/media/abc/orig.webp"); // no variant is big enough
    expect(patternSrc({ src: "/banners/x.png", width: 400, height: 400 }, 160)).toBe("/banners/x.png");
  });
});
