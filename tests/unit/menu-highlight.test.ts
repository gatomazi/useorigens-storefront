import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { themeBlockers } from "@/lib/admin/publishing";
import { highlightContrast, highlightProblems, themeDefaults } from "@/lib/site-config/navigation";
import { validateScopeDoc, type CollectionHighlight, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { highlightProps } from "@/components/layout/menu-highlight";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const sul = (): ScopeDoc => structuredClone(seed().docs.sul);
const natal = { store: "use-sul" as const, collectionId: 160001 };
const withHighlights = (highlights: unknown): ScopeDoc => ({ ...sul(), collections: { enabled: [], highlights } as never });
// The Sul header today: its primary colour with white text, the phone menu the same.
const header = themeDefaults("sul");

describe("menu highlight: the document", () => {
  test("given colours from the form, when saved through the draft op, then they validate (lower case) and an empty list removes them", () => {
    const r = applyOp(sul(), { type: "set-collection-highlights", highlights: [{ ...natal, background: "#B3261E", text: "#ffffff" }] }, { newId: () => "x" });
    expect(r.ok && r.doc.collections?.highlights).toEqual([{ ...natal, background: "#b3261e", text: "#ffffff" }]);
    const cleared = r.ok ? applyOp(r.doc, { type: "set-collection-highlights", highlights: [] }, { newId: () => "x" }) : null;
    expect(cleared?.ok && cleared.doc.collections?.highlights).toBeUndefined();
    expect(applyOp(structuredClone(seed().docs.global), { type: "set-collection-highlights", highlights: [] }, { newId: () => "x" }).ok).toBe(false);
  });

  test("given no colour, a colour that is not #rrggbb, an unknown field or one collection twice, when validated, then it is rejected", () => {
    expect(validateScopeDoc(withHighlights([{ ...natal, underline: "#ffd400" }])).ok).toBe(true);
    for (const bad of [[{ ...natal }], [{ ...natal, text: "red" }], [{ ...natal, text: "#fff" }], [{ ...natal, glow: "#ffffff" }], [{ ...natal, text: "#ffffff" }, { ...natal, background: "#000000" }]]) {
      expect(validateScopeDoc(withHighlights(bad)).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  test("given a highlight added, changed and removed, when the publish screen lists the changes, then each is named with its colours", () => {
    const was = withHighlights([{ ...natal, background: "#b3261e" }]);
    const now = withHighlights([{ ...natal, background: "#b3261e", underline: "#ffd400" }]);
    const text = (a: ScopeDoc, b: ScopeDoc) => diffDocs(a, b, () => "Natal").map((c) => c.text);
    expect(text(sul(), was)).toContain('"Natal": destaque no menu (botão #b3261e)');
    expect(text(was, now)).toContain('"Natal": destaque no menu (botão #b3261e, linha #ffd400)');
    expect(text(now, sul())).toContain('"Natal": sem destaque no menu');
    expect(text(now, now).filter((t) => t.includes("destaque"))).toEqual([]);
  });
});

describe("menu highlight: readability", () => {
  test("given a readable button, a text the header colour hides, and a pale line, when checked, then only the unreadable text blocks a publish", () => {
    expect(highlightContrast({ background: "#b3261e", text: "#ffffff" }, header)).toEqual([]);
    expect(highlightContrast({ text: header.headerBackground }, header).map((i) => i.level)).toEqual(["blocking"]);
    expect(highlightContrast({ background: "#ffffff" }, header).map((i) => i.level)).toEqual(["blocking"]); // white header text on a white button
    expect(highlightContrast({ underline: header.headerBackground }, header).map((i) => i.level)).toEqual(["warning"]);
    expect(highlightContrast({ underline: "#ffd400" }, header)).toEqual([]);
  });

  test("given a phone menu of another colour, when only the text colour is set, then it is checked there too", () => {
    const theme = { ...header, mobileMenuBackground: "#ffffff", mobileMenuText: "#000000" };
    expect(highlightContrast({ text: "#ffffff" }, theme).map((i) => i.level)).toEqual(["blocking"]);
  });

  test("given an unreadable highlight in the region's document, when published, then it is a blocker named after the collection", () => {
    const doc = withHighlights([{ ...natal, background: "#ffffff" }]);
    expect(highlightProblems("sul", doc, undefined, () => "Natal").blocking).toEqual([expect.stringContaining('Destaque de "Natal" no menu: texto sobre o botão')]);
    const bundle = seed();
    bundle.docs.sul = doc;
    expect(themeBlockers(bundle, "sul")).toEqual([expect.stringContaining("Destaque de")]);
    bundle.docs.sul = withHighlights([{ ...natal, background: "#b3261e", text: "#ffffff" } satisfies CollectionHighlight]);
    expect(themeBlockers(bundle, "sul")).toEqual([]);
  });
});

describe("menu highlight: what the link carries", () => {
  test("given colours, then CSS variables and the attributes of the ones set; nothing for a plain link", () => {
    expect(highlightProps({ background: "#b3261e", underline: "#ffd400" })).toEqual({ style: { "--hl-bg": "#b3261e", "--hl-line": "#ffd400" }, "data-hl-bg": "", "data-hl-line": "" });
    expect(highlightProps({ text: "#ffffff" })).toEqual({ style: { "--hl-text": "#ffffff" } });
    expect(highlightProps(undefined)).toEqual({});
  });
});
