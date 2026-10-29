import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { applyOp, defaultAppearance, type DraftOp } from "@/lib/admin/draft-ops";
import { seedForEnv } from "@/lib/admin/publishing";
import { parseSectionForm } from "@/lib/admin/section-form";
import { fieldAnswer } from "@/lib/customization/artwork";
import { HUB_PAGE_SLUG } from "@/lib/customization/hub";
import { liveExamples, savePrefill, takePrefill } from "@/lib/customization/live-banner";
import { followedDoc } from "@/lib/site-config/follow";
import { pageHref } from "@/lib/site-config/pages";
import { parseProjectFile } from "@/lib/print-studio/model";
import { validatePage, validateScopeDoc, type Customizer, type ScopeDoc, type Section } from "@/lib/site-config/schema";
import { destinationHref } from "@/lib/site-config/sources";

let n = 0;
const ctx = () => ({ newId: () => `t${++n}` });
const seed = seedForEnv();
const start = (scope: "sul" | "norte" = "sul"): ScopeDoc => structuredClone(seed.docs[scope]);
const run = (doc: ScopeDoc, op: DraftOp) => {
  const r = applyOp(doc, op, ctx());
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};
const T = "1793300715844-02b539b5-caf7-4e18-b9cf-0a245d34827c";
const model = (patch: Partial<Customizer> = {}): Customizer => ({
  id: "cz-placa", slug: "placa", name: "Placa da sua cidade", source: { store: "use-sul", collectionId: 10 }, fields: [], previewMode: "mockupWithTextSummary", active: true, version: 1,
  studioArts: [{ label: "Placa", versions: [{ templateId: T }] }], pageMockup: { assetId: "legacy:sul/campaign-desktop", alt: "Camiseta", decorative: false }, ...patch,
});
const hub = (doc: ScopeDoc) => doc.pages!.find((p) => p.slug === HUB_PAGE_SLUG)!;

const FONT = `data:font/ttf;base64,${readFileSync(path.join(process.cwd(), "assets", "print-studio", "fonts", "OrigensPlaca-Regular.ttf")).toString("base64")}`;
const layer = (id: string, slot: object) => ({ kind: "text", id, name: id, visible: true, x: 100, y: 100, text: "X", fontId: "font-origens-placa", fontSize: 120, weight: 400, color: "#b6bab5", letterSpacing: 4, lineHeight: 1.1, align: "center", boxWidth: 1800, slot });
const BASE = parseProjectFile(JSON.stringify({ version: 1, name: "Placa", width: 2000, height: 600, dpi: 300, background: null, reference: null,
  fonts: [{ id: "font-origens-placa", name: "Origens Placa", weight: 400, dataUrl: FONT }],
  layers: [
    layer("cidade", { field: "cidade", label: "Cidade", template: "{cidade}", textCase: "upper", maxLength: 60, example: "Santa Terezinha de Itaipu/PR", input: "city" }),
    layer("placa", { field: "placa", label: "Placa", template: "{placa}", textCase: "upper", maxLength: 8, example: "TOM-1996", input: "plate" }),
  ] }));

describe("the personalization page in the CMS", () => {
  test("is built once, with the page hero, a live banner of the first model with the art editor and the models' cards", () => {
    const doc = start();
    doc.customizers = [model({ id: "cz-caneca", slug: "caneca", studioArts: undefined }), model()];
    const built = run(doc, { type: "create-hub-page" });
    expect(hub(built).sections.map((s) => s.template)).toEqual(["page-hero", "personalization-live", "personalization-models"]);
    expect(hub(built).sections[1].live).toMatchObject({ customizerId: "cz-placa", examples: [] });
    expect(validatePage(hub(built), "sul").ok).toBe(true);
    expect(applyOp(built, { type: "create-hub-page" }, ctx()).ok).toBe(false);
  });
  test("without a model with the art editor it still has the cards, and a live banner cannot be added", () => {
    const built = run(start(), { type: "create-hub-page" });
    expect(hub(built).sections.map((s) => s.template)).toEqual(["page-hero", "personalization-models"]);
    expect(applyOp(built, { type: "in-page", page: hub(built).id, op: { type: "add-structured", template: "personalization-live" } }, ctx()).ok).toBe(false);
  });
  test("the blocks belong to pages: the home refuses them", () => {
    const doc = start();
    doc.customizers = [model()];
    expect(applyOp(doc, { type: "add-structured", template: "personalization-models" }, ctx()).ok).toBe(false);
    const home = structuredClone(doc);
    home.home!.sections.splice(1, 0, { id: "custom-x", anchor: "x", headingId: "x-title", template: "personalization-models", active: true, appearance: defaultAppearance() } as Section);
    expect(validateScopeDoc(home).ok).toBe(false);
  });
  test("is linked at /<region>/personalizar, wherever a page is linked", () => {
    expect(pageHref("sul", { kind: "hotpage", slug: HUB_PAGE_SLUG })).toBe("/sul/personalizar");
    expect(pageHref("sul", { kind: "hotpage", slug: "black" })).toBe("/sul/h/black");
    expect(destinationHref({ kind: "page", pageKind: "hotpage", slug: HUB_PAGE_SLUG }, undefined, "norte")).toBe("/norte/personalizar");
  });
  test("a region that follows Sul's pages shows its own model of the same address, and no banner without one", () => {
    const sul = run(Object.assign(start(), { customizers: [model({ id: "cz-sul" })] }), { type: "create-hub-page" });
    const norte = start("norte");
    norte.follow = ["pages"];
    let live = followedDoc(norte, sul, true).pages!.find((p) => p.slug === HUB_PAGE_SLUG)!.sections[1];
    expect(live.active).toBe(false);
    norte.customizers = [model({ id: "cz-norte" })];
    live = followedDoc(norte, sul, true).pages!.find((p) => p.slug === HUB_PAGE_SLUG)!.sections[1];
    expect(live).toMatchObject({ active: true, live: { customizerId: "cz-norte" } });
  });
  test("the editor's fields become the banner's model, button and examples", () => {
    const section = { id: "s", anchor: "a", headingId: "a-title", template: "personalization-live", active: true, live: { customizerId: "cz-placa", button: "Ir", examples: [] }, appearance: defaultAppearance() } as Section;
    const form = (e: Record<string, string>) => ({ get: (k: string) => (k in e ? e[k] : null) });
    expect(parseSectionForm(form({ live_customizer: "cz-placa", live_button: "", live_examples: "Belém/PA | BEL-1616\n\n  Florianópolis/SC | FLO-1726  " }), section).live)
      .toEqual({ customizerId: "cz-placa", button: "Personalizar a minha", examples: ["Belém/PA | BEL-1616", "Florianópolis/SC | FLO-1726"] });
  });
});

describe("the live banner's examples and what it carries", () => {
  test("an example fits the fields in order, each answer made to fit its field; a line that does not fit is skipped", () => {
    expect(liveExamples(BASE, ["Belém/PA | bel 1616", "Florianópolis/SC|FLO1726", "Belém/PA", "Belém | BEL-1616", "Belém/PA | 1616-BEL"]))
      .toEqual([{ cidade: "Belém/PA", placa: "BEL-1616" }, { cidade: "Florianópolis/SC", placa: "FLO-1726" }]);
    expect([fieldAnswer({ maxLength: 20 }, "  dos Santos "), fieldAnswer({ maxLength: 5 }, "Vasconcelos"), fieldAnswer({ maxLength: 20 }, "<b>")]).toEqual(["dos Santos", null, null]);
  });

  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  });
  afterEach(() => { delete (globalThis as { sessionStorage?: unknown }).sessionStorage; });

  test("what the visitor wrote reaches the model's page once, only what fits, and not after half an hour", () => {
    savePrefill("placa", { cidade: "Belém/PA", placa: "bel16", outro: "x" }, 1000);
    expect(takePrefill("placa", BASE, 2000)).toEqual({ cidade: "Belém/PA" }); // an unfinished plate does not come along
    expect(takePrefill("placa", BASE, 2000)).toEqual({}); // read once
    savePrefill("placa", { cidade: "Belém/PA", placa: "BEL-1616" }, 0);
    expect(takePrefill("placa", BASE, 31 * 60_000)).toEqual({});
  });
});
