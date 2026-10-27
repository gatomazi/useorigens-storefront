import { describe, expect, test } from "vitest";
import { fieldKeyOf, parseCustomizerForm } from "@/lib/admin/customizer-form";
import { validateCustomizer, type Customizer } from "@/lib/site-config/schema";

const current: Customizer = { id: "cz-1", slug: "pai", name: "Pai", source: { store: "use-sul", collectionId: 148122 }, fields: [], previewMode: "mockupWithTextSummary", active: false, version: 1 };
const form = (entries: Record<string, string>) => ({ get: (name: string) => (name in entries ? entries[name] : null) });
const parse = (entries: Record<string, string>, store: "use-sul" | "use-norte" = "use-sul") => parseCustomizerForm(form({ name: "Pai", ...entries }), current, { store }, { slugLocked: false });

describe("model editor form", () => {
  test("links studio arts with versions and light-shirt bases, removes them explicitly and rejects incomplete rows", () => {
    const [a, b, c, d] = ["1792427199785-94f180a0-474a-4a75-9fae-1fbdd72f2aa8", "1792427199786-94f180a0-474a-4a75-9fae-1fbdd72f2aa9", "1792427199787-94f180a0-474a-4a75-9fae-1fbdd72f2aaa", "1792427199788-94f180a0-474a-4a75-9fae-1fbdd72f2aab"];
    const arts = (rows: unknown) => parse({ studio_arts_json: JSON.stringify(rows) });
    expect(arts([
      { label: " Universitário ", versions: [{ label: "ignorado", templateId: a, lightTemplateId: b }] },
      { label: "Eu vim pela ceia", versions: [{ label: "Adulto", templateId: c, lightTemplateId: "" }, { label: "Infantil", templateId: d, lightTemplateId: "" }] },
      { label: "", versions: [{ label: "", templateId: "", lightTemplateId: "" }] },
    ])).toEqual({ errors: [], patch: expect.objectContaining({ studioArts: [
      { label: "Universitário", versions: [{ templateId: a, lightTemplateId: b }] },
      { label: "Eu vim pela ceia", versions: [{ label: "Adulto", templateId: c }, { label: "Infantil", templateId: d }] },
    ] }) });
    expect(arts([]).patch).toHaveProperty("studioArts", undefined);
    expect(parse({}).patch).not.toHaveProperty("studioArts");
    expect(arts([{ label: "Ceia", versions: [{ templateId: "", lightTemplateId: b }] }]).errors).toEqual([expect.stringContaining("camiseta escura")]);
    expect(arts([{ label: "Ceia", versions: [{ label: "Adulto", templateId: a }, { label: "", templateId: b }] }]).errors).toEqual([expect.stringContaining("Adulto e Infantil")]);
    expect(arts([{ label: "Ceia", versions: [{ templateId: a }] }, { label: "Pavê", versions: [{ templateId: c, lightTemplateId: a }] }]).errors).toEqual([expect.stringContaining("uma vez")]);
    expect(arts([{ label: "Ceia", versions: [{ templateId: "../../private" }] }]).errors).not.toHaveLength(0);
    expect(parse({ studio_arts_json: "{" }).errors).not.toHaveLength(0);
  });
  test("the contract accepts arts with named versions and each base once", () => {
    const [a, b, c] = ["1792427199785-94f180a0-474a-4a75-9fae-1fbdd72f2aa8", "1792427199786-94f180a0-474a-4a75-9fae-1fbdd72f2aa9", "1792427199787-94f180a0-474a-4a75-9fae-1fbdd72f2aaa"];
    const ok = (studioArts: unknown) => validateCustomizer({ ...current, studioArts } as Customizer, "sul").ok;
    expect(ok([{ label: "Ceia", versions: [{ label: "Adulto", templateId: a, lightTemplateId: b }, { label: "Infantil", templateId: c }] }])).toBe(true);
    expect(ok([{ label: "Ceia", versions: [{ templateId: a }, { templateId: c }] }])).toBe(false); // several versions need names
    expect(ok([{ label: "Ceia", versions: [{ templateId: a }] }, { label: "Pavê", versions: [{ templateId: a }] }])).toBe(false);
    expect(ok([])).toBe(false);
    expect(ok([{ label: "x".repeat(41), versions: [{ templateId: a }] }])).toBe(false);
  });
  test("given a line group of 4 up to 6 with defaults, when parsed, then the patch carries the ranges and the trimmed defaults", () => {
    const { patch, errors } = parse({ lg_show: "on", lg_min: "1", lg_initial: "4", lg_max: "6", lg_maxlength: "16", lg_defaults: " PAI \n\nPARANAENSE\nCHURRASQUEIRO\nLENDA" });
    expect(errors).toEqual([]);
    expect(patch.lineGroup).toMatchObject({ min: 1, initial: 4, max: 6, maxLength: 16, defaults: ["PAI", "PARANAENSE", "CHURRASQUEIRO", "LENDA"] });
  });

  test("given the group checkbox is off, when parsed, then the group is removed", () => {
    expect(parse({}).patch.lineGroup).toBeUndefined();
  });

  test("given city / locality / caption rows, when parsed, then keys come from labels, are unique and positions follow the row order", () => {
    const rows = [{ label: "Cidade", required: true, maxLength: 30 }, { label: "Localidade", required: false, maxLength: 30 }, { label: "Cidade", required: false, maxLength: 40, helperText: "  opcional " }];
    const { patch, errors } = parse({ fields_json: JSON.stringify(rows) });
    expect(errors).toEqual([]);
    expect(patch.fields!.map((f) => [f.key, f.position, f.required])).toEqual([["cidade", 1, true], ["localidade", 2, false], ["cidade_2", 3, false]]);
    expect(patch.fields![2].helperText).toBe("opcional");
  });

  test("given an existing key, when the label is renamed, then the key stays (old requests keep their meaning)", () => {
    const { patch } = parse({ fields_json: JSON.stringify([{ key: "cidade", label: "Cidade do coração", required: true, maxLength: 30 }]) });
    expect(patch.fields![0]).toMatchObject({ key: "cidade", label: "Cidade do coração" });
  });

  test("given more than 10 rows, broken JSON or a collection of another store, when parsed, then each is an error and nothing is trusted", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ label: `Campo ${i}`, required: false, maxLength: 10 }));
    expect(parse({ fields_json: JSON.stringify(many) }).errors[0]).toMatch(/No máximo 10/);
    expect(parse({ fields_json: "{oops" }).errors[0]).toMatch(/inválida/);
    expect(parse({ fields_json: JSON.stringify({}) }).errors[0]).toMatch(/inválida/);
    expect(parse({ source_collection: "use-norte:1" }).errors[0]).toMatch(/outra loja/);
    expect(parse({ source_collection: "use-sul:abc" }).patch.source).toBeUndefined();
  });

  test("given a locked slug, when parsed, then the slug is not part of the patch; an image without alt still gets a useful one", () => {
    const locked = parseCustomizerForm(form({ name: "Pai", slug: "novo" }), current, { store: "use-sul" }, { slugLocked: true });
    expect(locked.patch.slug).toBeUndefined();
    const { patch } = parse({ mockup_image: "upload:abc", active: "on" });
    expect(patch.pageMockup).toEqual({ assetId: "upload:abc", alt: "Camiseta Pai", decorative: false });
    expect(patch.active).toBe(true);
  });

  test("given labels with accents or symbols, when turned into keys, then they are ascii, start with a letter and fit", () => {
    expect(fieldKeyOf("Nome da cidade")).toBe("nome_da_cidade");
    expect(fieldKeyOf("Rótulo Único!")).toBe("rotulo_unico");
    expect(fieldKeyOf("123")).toBe("campo_123");
    expect(fieldKeyOf("x".repeat(80)).length).toBeLessThanOrEqual(30);
  });
});
