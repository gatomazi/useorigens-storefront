import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import sharp from "sharp";
import { inkPrice, parseCustomizerForm } from "@/lib/admin/customizer-form";
import { validateCustomizer, type Customizer } from "@/lib/site-config/schema";
import { renderProjectPng } from "@/lib/print-studio/render-server";
import type { PrintProject } from "@/lib/print-studio/model";

const [A, B, C, D] = ["1792427199785-94f180a0-474a-4a75-9fae-1fbdd72f2aa8", "1792427199786-94f180a0-474a-4a75-9fae-1fbdd72f2aa9", "1792427199787-94f180a0-474a-4a75-9fae-1fbdd72f2aaa", "1792427199788-94f180a0-474a-4a75-9fae-1fbdd72f2aab"];
const current: Customizer = { id: "cz-1", slug: "natal", name: "Natal em família", source: { store: "use-sul", collectionId: 154424 }, fields: [], previewMode: "mockupWithTextSummary", active: false, version: 1 };
const form = (entries: Record<string, string>) => ({ get: (name: string) => (name in entries ? entries[name] : null) });
const parse = (entries: Record<string, string>) => parseCustomizerForm(form({ name: "Natal em família", ...entries }), current, { store: "use-sul" }, { slugLocked: false });
const ARTS = JSON.stringify([
  { label: "Universitário", versions: [{ label: "", templateId: A, lightTemplateId: B, garment: "camiseta" }] },
  { label: "Eu vim pela ceia", versions: [{ label: "Adulto", templateId: C, lightTemplateId: "", garment: "camiseta" }, { label: "Infantil", templateId: D, lightTemplateId: "", garment: "infantil" }] },
]);

describe("direct purchase in the model editor", () => {
  test("prices are typed the Brazilian way and kept as INK takes them", () => {
    expect(["109,90", "R$ 109,90", "109.90", "96", " 96,00 "].map(inkPrice)).toEqual(["109.90", "109.90", "109.90", "96.00", "96.00"]);
    expect(["", "abc", "109,9", "-10,00", "12345,00"].map(inkPrice)).toEqual([null, null, null, null, null]);
  });
  test("a version on the Camiseta Infantil keeps its garment; the adult one stays implicit", () => {
    const { patch, errors } = parse({ studio_arts_json: ARTS });
    expect(errors).toEqual([]);
    expect(patch.studioArts?.[1].versions).toEqual([{ label: "Adulto", templateId: C }, { label: "Infantil", templateId: D, garment: "infantil" }]);
  });
  test("turning it on needs the shirt price, and the kids price when a version is infantil", () => {
    expect(parse({ studio_arts_json: ARTS, direct_form: "1", direct_enabled: "on", direct_price: "109,90", direct_kids_price: "96,00" })).toMatchObject({ errors: [], patch: { directPurchase: { enabled: true, price: "109.90", kidsPrice: "96.00" } } });
    expect(parse({ studio_arts_json: ARTS, direct_form: "1", direct_enabled: "on", direct_price: "109,90" }).errors).toEqual([expect.stringContaining("Camiseta Infantil")]);
    expect(parse({ direct_form: "1", direct_enabled: "on", direct_price: "109,90" }).errors).toEqual([expect.stringContaining("artes do estúdio")]);
    expect(parse({ studio_arts_json: ARTS, direct_form: "1", direct_price: "abc" }).errors).toEqual([expect.stringContaining("109,90")]);
    // Off, the prices are kept for when it is turned on again; a form without the block never touches it.
    expect(parse({ studio_arts_json: ARTS, direct_form: "1", direct_price: "109,90" }).patch.directPurchase).toEqual({ enabled: false, price: "109.90" });
    expect(parse({ studio_arts_json: ARTS }).patch).not.toHaveProperty("directPurchase");
  });
  test("the INK category is kept by its id; none is a valid choice", () => {
    const on = { studio_arts_json: ARTS, direct_form: "1", direct_enabled: "on", direct_price: "109,90", direct_kids_price: "96,00" };
    expect(parse({ ...on, direct_collection: "155154" }).patch.directPurchase).toEqual({ enabled: true, price: "109.90", kidsPrice: "96.00", inkCollectionId: 155154 });
    expect(parse({ ...on, direct_collection: "" }).patch.directPurchase).not.toHaveProperty("inkCollectionId");
    expect(parse({ ...on, direct_collection: "abc" }).errors).toEqual(["Categoria da INK inválida."]);
  });
  test("the published contract checks the same rules", () => {
    const arts = JSON.parse(ARTS).map((a: { label: string; versions: { label: string; templateId: string; lightTemplateId: string; garment: string }[] }) => ({ label: a.label, versions: a.versions.map(({ label, templateId, lightTemplateId, garment }) => ({ ...(a.versions.length > 1 ? { label } : {}), templateId, ...(lightTemplateId ? { lightTemplateId } : {}), ...(garment === "infantil" ? { garment } : {}) })) }));
    const model = { ...current, studioArts: arts };
    expect(validateCustomizer({ ...model, directPurchase: { enabled: true, price: "109.90", kidsPrice: "96.00" } } as Customizer, "sul").ok).toBe(true);
    expect(validateCustomizer({ ...model, directPurchase: { enabled: true, price: "109.90" } } as Customizer, "sul").ok).toBe(false);
    expect(validateCustomizer({ ...model, directPurchase: { enabled: true, price: "109,90", kidsPrice: "96.00" } } as Customizer, "sul").ok).toBe(false);
    expect(validateCustomizer({ ...model, directPurchase: { enabled: true, price: "109.90", kidsPrice: "96.00", inkCollectionId: 155154 } } as Customizer, "sul").ok).toBe(true);
    expect(validateCustomizer({ ...model, directPurchase: { enabled: true, price: "109.90", kidsPrice: "96.00", inkCollectionId: "155154" } } as unknown as Customizer, "sul").ok).toBe(false);
    expect(validateCustomizer({ ...model, studioArts: [{ label: "X", versions: [{ templateId: A, garment: "moletom" }] }] } as unknown as Customizer, "sul").ok).toBe(false);
  });
});

describe("server render", () => {
  test("draws an embedded font with letter spacing on an arch, at the asked width", async () => {
    const font = readFileSync(path.join(process.cwd(), "assets", "print-studio", "fonts", "Graduate-Regular.ttf"));
    const project = {
      version: 1, width: 1200, height: 600, background: null, reference: null,
      fonts: [{ id: "font-graduate", name: "Graduate", weight: 400, dataUrl: `data:font/ttf;base64,${font.toString("base64")}` }],
      layers: [{ kind: "text", id: "t1", name: "Sobrenome", visible: true, x: 100, y: 150, text: "SILVA", fontId: "font-graduate", fontSize: 200, weight: 400, color: "#123456", letterSpacing: 20, lineHeight: 1.1, align: "center", boxWidth: 1000, arc: 2000 }],
    } as unknown as PrintProject;
    const png = await renderProjectPng(project, 600);
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([600, 300]);
    let ink = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 128) ink++;
    expect(ink).toBeGreaterThan(5_000);
  });
  test("refuses a visible text in a site font, which the server cannot draw", async () => {
    const project = { version: 1, width: 400, height: 200, background: null, reference: null, fonts: [], layers: [{ kind: "text", id: "t1", name: "Texto", visible: true, x: 0, y: 0, text: "Oi", fontId: "hanken", fontSize: 40, weight: 400, color: "#000000", letterSpacing: 0, lineHeight: 1, align: "left" }] } as unknown as PrintProject;
    await expect(renderProjectPng(project)).rejects.toThrow(/fonte do site/);
  });
});
