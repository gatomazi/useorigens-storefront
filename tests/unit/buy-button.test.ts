import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { parseSectionForm } from "@/lib/admin/section-form";
import { DEFAULT_BUY_LABEL, validateSection, type Section } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.sul);
const terra = (): Section => seed().home!.sections.find((s) => s.id === "seed-terra")!;
const form = (o: Record<string, string>) => ({ get: (n: string) => (n in o ? o[n] : null) });
const layoutForm = (extra: Record<string, string>) => ({ title: "Terra", source_kind: "editorial-module", source_module: "terra", layout_variant: "standard", layout_tone: "light", layout_surface: "plain", ...extra });
const withLabel = (buyLabel: string): Section => ({ ...terra(), layout: { ...terra().layout!, buyLabel } });

describe("buy button on product cards (layout.buyLabel)", () => {
  test("given a product section with a short label, when validated, then it passes; a section without one is unchanged", () => {
    expect(validateSection(withLabel("Comprar")).ok).toBe(true);
    expect(validateSection(withLabel("Eu quero!")).ok).toBe(true);
    expect(terra().layout!.buyLabel).toBeUndefined();
  });

  test("given an empty, too long or padded label, or a label outside a product section, when validated, then it is rejected", () => {
    expect(validateSection(withLabel("")).ok).toBe(false);
    expect(validateSection(withLabel("x".repeat(21))).ok).toBe(false);
    expect(validateSection(withLabel(" Comprar")).ok).toBe(false);
    const hero = seed().home!.sections.find((s) => s.template === "hero")!;
    expect(validateSection({ ...hero, layout: { variant: "standard", tone: "dark", surface: "region-primary", buyLabel: "Comprar" } }).ok).toBe(false);
  });

  test("given the editor's checkbox, when parsed and applied, then the label is stored (an empty text becomes 'Comprar')", () => {
    const on = parseSectionForm(form(layoutForm({ layout_buy_present: "1", layout_buy: "on", layout_buy_label: "  Quero essa  " })), terra());
    expect(on.layout!.buyLabel).toBe("Quero essa");
    const r = applyOp(seed(), { type: "update", id: "seed-terra", patch: on }, { newId: () => "x" });
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.doc.home!.sections.find((s) => s.id === "seed-terra")!.layout!.buyLabel).toBe("Quero essa");
    expect(parseSectionForm(form(layoutForm({ layout_buy_present: "1", layout_buy: "on", layout_buy_label: "" })), terra()).layout!.buyLabel).toBe(DEFAULT_BUY_LABEL);
    expect(parseSectionForm(form(layoutForm({ layout_buy_present: "1", layout_buy: "on", layout_buy_label: "x".repeat(30) })), terra()).layout!.buyLabel).toHaveLength(20);
  });

  test("given the checkbox unticked, then the button goes away; given a form without the block, then the saved label is kept", () => {
    expect(parseSectionForm(form(layoutForm({ layout_buy_present: "1", layout_buy_label: "Comprar" })), withLabel("Comprar")).layout).not.toHaveProperty("buyLabel");
    expect(parseSectionForm(form(layoutForm({})), withLabel("Comprar agora")).layout!.buyLabel).toBe("Comprar agora");
  });

  test("given a grid with a buy button, when parsed, then both choices are kept together", () => {
    const patch = parseSectionForm(form(layoutForm({ layout_display: "grid", layout_buy_present: "1", layout_buy: "on", layout_buy_label: "Comprar" })), terra());
    expect(patch.layout).toEqual({ variant: "standard", tone: "light", surface: "plain", display: "grid", buyLabel: "Comprar" });
  });

  test("given the cart style, when parsed, then it is stored with the label; the bar is never stored; no label, no style", () => {
    const fab = parseSectionForm(form(layoutForm({ layout_buy_present: "1", layout_buy: "on", layout_buy_label: "Comprar", layout_buy_style: "fab" })), terra());
    expect(fab.layout).toMatchObject({ buyLabel: "Comprar", buyStyle: "fab" });
    expect(validateSection({ ...terra(), layout: fab.layout }).ok).toBe(true);
    expect(parseSectionForm(form(layoutForm({ layout_buy_present: "1", layout_buy: "on", layout_buy_label: "Comprar", layout_buy_style: "button" })), terra()).layout).not.toHaveProperty("buyStyle");
    expect(parseSectionForm(form(layoutForm({ layout_buy_present: "1", layout_buy_style: "fab" })), terra()).layout).not.toHaveProperty("buyStyle");
    const saved: Section = { ...terra(), layout: { ...terra().layout!, buyLabel: "Comprar", buyStyle: "fab" } };
    expect(parseSectionForm(form(layoutForm({})), saved).layout).toMatchObject({ buyLabel: "Comprar", buyStyle: "fab" });
  });

  test("given a style without a label or an unknown style, when validated, then it is refused", () => {
    expect(validateSection({ ...terra(), layout: { ...terra().layout!, buyStyle: "fab" } }).ok).toBe(false);
    expect(validateSection({ ...terra(), layout: { ...terra().layout!, buyLabel: "Comprar", buyStyle: "x" as never } }).ok).toBe(false);
  });
});
