import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { parseSectionForm } from "@/lib/admin/section-form";
import { hasStatesSection, headerLinks, suggestedNavLabel } from "@/lib/site-config/nav";
import { validateSection, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { structuredDefaults } from "@/lib/site-config/structured";

const seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "n1" };
const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });
const regionHome = (): ScopeDoc => {
  const s = seed.docs.sul.home!.sections;
  return { ...structuredClone(seed.docs.norte), home: { sections: [structuredClone(s[0]), structuredDefaults("states", "norte", "custom-e", new Set()), structuredClone(s[s.length - 1])] } };
};

describe("header links to home sections", () => {
  test("given the Sul home as published, when the header is built, then it keeps Estilos, Fala daqui and Estados exactly as before", () => {
    expect(headerLinks(seed.docs.sul)).toEqual([{ label: "Estilos", anchor: "estilos" }, { label: "Fala daqui", anchor: "fala" }, { label: "Estados", anchor: "estados" }]);
    expect(headerLinks(undefined).map((l) => l.label)).toEqual(["Estilos", "Fala daqui", "Estados"]); // config-driven home off: the original home
  });

  test("given a region home without 'Fala daqui' (or without any of them), when built, then only the sections it really has are linked (no dead link)", () => {
    expect(headerLinks(regionHome()).map((l) => l.label)).toEqual(["Estados"]);
    expect(headerLinks(seed.docs.norte)).toEqual([]); // no home yet
    const hidden = regionHome();
    hidden.home!.sections[1].active = false;
    expect(headerLinks(hidden)).toEqual([]);
    expect(hasStatesSection(hidden)).toBe(false);
    expect(hasStatesSection(regionHome())).toBe(true);
  });

  test("given sections marked for the menu with an apelido, when built, then exactly those appear, in home order, with their apelidos", () => {
    const doc = regionHome();
    const campaign = structuredDefaults("campaign", "norte", "custom-c", new Set(["estados"]));
    doc.home!.sections.splice(2, 0, campaign);
    const one = applyOp(doc, { type: "update", id: "custom-c", patch: { nav: { label: "Sobre" } } }, ctx) as { ok: true; doc: ScopeDoc };
    const two = applyOp(one.doc, { type: "update", id: "custom-e", patch: { nav: { label: "Meus estados" } } }, ctx) as { ok: true; doc: ScopeDoc };
    expect(headerLinks(two.doc)).toEqual([{ label: "Meus estados", anchor: "estados" }, { label: "Sobre", anchor: "campanha" }]);
    const hiddenOne = structuredClone(two.doc);
    hiddenOne.home!.sections.find((s) => s.id === "custom-c")!.active = false;
    expect(headerLinks(hiddenOne)).toEqual([{ label: "Meus estados", anchor: "estados" }]); // a hidden section leaves the menu
  });

  test("given the section form, when 'mostrar no menu' is on with an apelido, then it is stored; off clears it; an empty or long apelido, or the hero, is refused", () => {
    const doc = regionHome();
    const states = doc.home!.sections[1];
    expect(parseSectionForm(form({ nav_present: "1", nav_show: "on", nav_label: "Estados" }), states).nav).toEqual({ label: "Estados" });
    expect(parseSectionForm(form({ nav_present: "1", nav_label: "Estados" }), states).nav).toBeUndefined();
    expect(parseSectionForm(form({ title: "x" }), states)).not.toHaveProperty("nav"); // absent field: left alone
    for (const bad of ["", "x".repeat(25)]) expect(applyOp(doc, { type: "update", id: states.id, patch: { nav: { label: bad } } }, ctx).ok).toBe(false);
    expect(validateSection({ ...doc.home!.sections[0], nav: { label: "Topo" } }).ok).toBe(false); // hero
    expect(parseSectionForm(form({ nav_present: "1", nav_show: "on", nav_label: "x" }), doc.home!.sections[0])).not.toHaveProperty("nav");
  });

  test("given a section, when first offered for the menu, then the suggested apelido is the historical name or the section's title", () => {
    expect(suggestedNavLabel({ anchor: "fala", title: "Fala daqui", template: "product-carousel" })).toBe("Fala daqui");
    expect(suggestedNavLabel({ anchor: "estados-2", title: "x", template: "states" })).toBe("Estados");
    expect(suggestedNavLabel({ anchor: "colecao-novidades", title: "Novidades da estação", template: "product-carousel" })).toBe("Novidades da estação");
  });
});
