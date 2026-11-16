import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { parseSectionForm } from "@/lib/admin/section-form";
import { sectionReadability } from "@/lib/admin/validate-draft";
import { validateSection } from "@/lib/site-config/schema";
import type { Section } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

/** The home's state chooser: what a tap on a state does ("Quero minha cidade" window or the state's page) and the band's ground, both from the panel. */
const seed = () => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.sul);
const states = () => seed().home!.sections.find((s) => s.template === "states")!;
const form = (o: Record<string, string>) => ({ get: (n: string) => (n in o ? o[n] : null) });
const save = (o: Record<string, string>, base: Section = states()) => {
  // The draft the section is saved into holds the section as it is now (`base`), as the panel's draft does.
  const doc = seed();
  doc.home!.sections = doc.home!.sections.map((s) => (s.id === base.id ? base : s));
  const r = applyOp(doc, { type: "update", id: base.id, patch: parseSectionForm(form(o), base) }, { newId: () => "z" });
  if (!r.ok) throw new Error(r.errors.join());
  return r.doc.home!.sections.find((s) => s.id === base.id)!;
};

describe("state chooser: tap action and ground", () => {
  test("given 'Escolher a cidade aqui' and the page's ground, when saved, then the section keeps both and validates", () => {
    const s = save({ state_choice_present: "1", state_action: "finder", state_surface: "plain", layout_tone: "light" });
    expect(s.stateAction).toBe("finder");
    expect(s.layout).toEqual({ variant: "standard", tone: "light", surface: "plain" });
    expect(validateSection(s).ok).toBe(true);
  });

  test("given 'Abrir a página do estado', when saved over a section that opened the window, then the field goes (the page is the default)", () => {
    const opened = save({ state_choice_present: "1", state_action: "finder", state_surface: "paper" });
    const s = save({ state_choice_present: "1", state_action: "page", state_surface: "paper" }, opened);
    expect(s.stateAction).toBeUndefined();
  });

  test("given a form without the block (an older editor), when saved, then the saved choice is kept", () => {
    const opened = save({ state_choice_present: "1", state_action: "finder", state_surface: "plain" });
    const s = save({ title: "Comece pelo seu estado" }, opened);
    expect(s.stateAction).toBe("finder");
    expect(s.layout?.surface).toBe("plain");
  });

  test("given the field on another section or with another value, when validated, then it is refused", () => {
    const carousel = seed().home!.sections.find((s) => s.template === "product-carousel")!;
    expect(validateSection({ ...carousel, stateAction: "finder" }).ok).toBe(false);
    expect(validateSection({ ...states(), stateAction: "page" }).ok).toBe(false);
  });

  test("given no colour nor picture, when judged, then nothing is reported whatever the stored tone (the text follows paper or the page)", () => {
    expect(sectionReadability({ ...states(), layout: { variant: "standard", tone: "light", surface: "plain" } }, "#0a0a0a")).toEqual([]);
  });

  test("given a dark colour of Aparência, when judged, then its light text reads (no problem), a stored tone notwithstanding", () => {
    const s: Section = { ...states(), layout: { variant: "standard", tone: "light", surface: "paper" }, appearance: { ...states().appearance, fill: { kind: "solid", color: "#111111" } } };
    expect(sectionReadability(s).filter((i) => i.level === "blocking")).toEqual([]);
  });
});
