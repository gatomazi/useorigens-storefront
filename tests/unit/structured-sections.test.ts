import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { parseSectionForm } from "@/lib/admin/section-form";
import { sectionReadability } from "@/lib/admin/validate-draft";
import { validateScopeDoc, validateSection, type ScopeDoc, type Section } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { STRUCTURED_TEMPLATES, structuredDefaults } from "@/lib/site-config/structured";

const ctx = { newId: () => "n1" };
const seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const heroFooter = (): Section[] => {
  const s = seed.docs.sul.home!.sections;
  return [structuredClone(s[0]), structuredClone(s[s.length - 1])];
};
/** A region home as "Criar home inicial" leaves it: hero + footer only. */
const bareHome = (scope: "norte" | "centro-oeste"): ScopeDoc => ({ ...structuredClone(seed.docs[scope]), home: { sections: heroFooter() } });
const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });

describe("structured section models", () => {
  test.each(["sul", "norte", "centro-oeste"] as const)("given %s, when each model is created, then it validates and carries no Sul copy outside Sul", (region) => {
    for (const template of STRUCTURED_TEMPLATES) {
      const s = structuredDefaults(template, region, "custom-x", new Set());
      expect(validateSection(s).ok, `${template} in ${region}`).toBe(true);
      if (region !== "sul") {
        expect(JSON.stringify(s)).not.toMatch(/8 jeitos|do Sul|cada cidade do Sul|Sul\b/);
      }
    }
  });

  test("given Norte or Centro-Oeste, when city styles is created, then the title does not promise eight styles", () => {
    expect(structuredDefaults("city-styles", "norte", "custom-x", new Set()).title).toBe("Sua cidade, do seu jeito.");
    expect(structuredDefaults("city-styles", "sul", "custom-x", new Set()).title).toBe("Sua cidade, de 8 jeitos.");
  });

  test("given a region home with hero and footer, when each model is added in the region, then it lands in the right place and the doc stays valid", () => {
    let doc = bareHome("norte");
    doc = (applyOp(doc, { type: "add-structured", template: "city-styles" }, ctx) as { ok: true; doc: ScopeDoc }).doc;
    doc = (applyOp(doc, { type: "add-structured", template: "states" }, { newId: () => "n2" }) as { ok: true; doc: ScopeDoc }).doc;
    doc = (applyOp(doc, { type: "add-structured", template: "campaign" }, { newId: () => "n3" }) as { ok: true; doc: ScopeDoc }).doc;
    expect(doc.home!.sections.map((s) => s.template)).toEqual(["hero", "city-styles", "states", "campaign", "footer"]);
    expect(doc.home!.sections.every((s) => s.id.startsWith("custom-") || s.template === "hero" || s.template === "footer")).toBe(true);
    expect(validateScopeDoc(doc).ok).toBe(true);
  });

  test("given a region that already has city styles or states, when they are added again, then it is refused and names the existing one; a second campaign is allowed with its own ids", () => {
    let doc = bareHome("centro-oeste");
    for (const [i, template] of (["city-styles", "states", "campaign"] as const).entries()) doc = (applyOp(doc, { type: "add-structured", template }, { newId: () => `a${i}` }) as { ok: true; doc: ScopeDoc }).doc;
    for (const template of ["city-styles", "states"] as const) {
      const again = applyOp(doc, { type: "add-structured", template }, { newId: () => "dup" });
      expect(again.ok).toBe(false);
      expect(!again.ok && again.errors[0]).toContain("already has this section");
    }
    const second = applyOp(doc, { type: "add-structured", template: "campaign" }, { newId: () => "a9" });
    expect(second.ok).toBe(true);
    const sections = (second as { ok: true; doc: ScopeDoc }).doc.home!.sections;
    expect(new Set(sections.map((s) => s.anchor)).size).toBe(sections.length);
    expect(new Set(sections.map((s) => s.headingId)).size).toBe(sections.length);
  });

  test("given the Sul home, when its existing structured sections are inspected, then adding city styles or states is refused (no duplicates) and the ten original sections are untouched", () => {
    const sul = structuredClone(seed.docs.sul);
    expect(sul.home!.sections).toHaveLength(10);
    expect(applyOp(sul, { type: "add-structured", template: "city-styles" }, ctx).ok).toBe(false);
    expect(applyOp(sul, { type: "add-structured", template: "states" }, ctx).ok).toBe(false);
    expect(JSON.stringify(sul)).toBe(JSON.stringify(seed.docs.sul));
  });

  test("given the global scope or a scope with no home, when a model is added, then it is refused", () => {
    expect(applyOp(structuredClone(seed.docs.global), { type: "add-structured", template: "campaign" }, ctx).ok).toBe(false);
    expect(applyOp(structuredClone(seed.docs.norte), { type: "add-structured", template: "campaign" }, ctx).ok).toBe(false);
  });
});

describe("editing the structured sections", () => {
  test("given a campaign with a Norte route button, when saved, then it is stored; a Sul route or an outside URL is rejected", () => {
    const doc = applyOp(bareHome("norte"), { type: "add-structured", template: "campaign" }, ctx) as { ok: true; doc: ScopeDoc };
    const campaign = doc.doc.home!.sections.find((s) => s.template === "campaign")!;
    const good = parseSectionForm(form({ title: "Norte inteiro", subtitle: "Busque a sua.", cta_kind: "route", cta_label: "Ver o Pará", cta_route: "/norte/pa", fallback: "fill", fill_kind: "solid", fill_color_choice: "token:near-black", overlay_preset: "none" }), campaign);
    const saved = applyOp(doc.doc, { type: "update", id: campaign.id, patch: good }, ctx);
    expect(saved.ok).toBe(true);
    expect((saved as { ok: true; doc: ScopeDoc }).doc.home!.sections.find((s) => s.id === campaign.id)!.cta).toEqual({ label: "Ver o Pará", dest: { kind: "route", path: "/norte/pa" } });
    const sulRoute = parseSectionForm(form({ cta_kind: "route", cta_label: "x", cta_route: "/sul/sc" }), campaign);
    expect(applyOp(doc.doc, { type: "update", id: campaign.id, patch: sulRoute }, ctx).ok).toBe(false);
    const outside = parseSectionForm(form({ cta_kind: "external", cta_label: "x", cta_url: "https://evil.example/" }), campaign);
    expect(applyOp(doc.doc, { type: "update", id: campaign.id, patch: outside }, ctx).ok).toBe(false);
    const cleared = parseSectionForm(form({ cta_kind: "none", cta_label: "" }), campaign);
    expect(cleared.cta).toBeUndefined();
  });

  test("given city styles, when the count is saved, then it is clamped to 1..8 and a count on another template is rejected by the schema", () => {
    const doc = applyOp(bareHome("norte"), { type: "add-structured", template: "city-styles" }, ctx) as { ok: true; doc: ScopeDoc };
    const styles = doc.doc.home!.sections.find((s) => s.template === "city-styles")!;
    expect(parseSectionForm(form({ count: "30" }), styles).count).toBe(8);
    expect(parseSectionForm(form({ count: "0" }), styles).count).toBe(1);
    expect(validateSection({ ...styles, count: 9 }).ok).toBe(false);
    expect(validateSection({ ...styles, template: "states", count: 3 }).ok).toBe(false);
  });

  test("given states or city styles with a background, when judged for readability, then they are checked as dark-text sections", () => {
    const states = structuredDefaults("states", "norte", "custom-s", new Set());
    states.appearance = { ...states.appearance, fill: { kind: "solid", color: "token:near-black" } };
    expect(sectionReadability(states).some((i) => i.level === "blocking")).toBe(true);
    expect(sectionReadability(structuredDefaults("states", "norte", "custom-s", new Set()))).toEqual([]);
  });

  test("given a section saved before this feature (no count, no cta on the campaign), when validated, then it is still valid (backward compatible)", () => {
    for (const s of seed.docs.sul.home!.sections) expect(validateSection(s).ok, s.id).toBe(true);
  });
});
