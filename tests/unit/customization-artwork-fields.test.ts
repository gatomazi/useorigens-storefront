import { describe, expect, test } from "vitest";
import { artworkFields, composeArtwork, editableTexts, fieldEdits, initialFieldValues, validateArtworkInput } from "@/lib/customization/artwork";
import { summaryOf } from "@/lib/customization/validate";
import { newTextLayer, parseProject, resizeProject, type PrintProject, type TextLayer } from "@/lib/print-studio/model";

const templateId = "1792427199785-94f180a0-474a-4a75-9fae-1fbdd72f2aa8";
const slot = (template: string, textCase: "upper" | "title") => ({ field: "sobrenome", label: "Sobrenome da família", template, textCase, maxLength: 20, example: "Silva" });
const base = (): PrintProject => ({
  version: 1, name: "Natal em família", width: 4270, height: 4900, dpi: 300, background: null, reference: null,
  fonts: [{ id: "font-montserrat-semibold", name: "Montserrat SemiBold", weight: 600, dataUrl: "data:application/octet-stream;base64,AA==" }],
  layers: [
    { ...newTextLayer("titulo"), text: "EU VIM PELA CEIA", color: "#14331e" },
    { ...newTextLayer("sobrenome"), text: "NATAL DOS TOMAZI", fontId: "font-montserrat-semibold", weight: 600, color: "#14311d", align: "center", boxWidth: 3600, slot: slot("NATAL DOS {sobrenome}", "upper") },
    { ...newTextLayer("assinatura"), text: "Tomazi", color: "#960a0c", arc: 3836, stroke: 26, boxWidth: 3500, slot: slot("{sobrenome}", "title") },
  ],
});

describe("base com campo de sobrenome", () => {
  test("pergunta uma vez por campo e trava os outros textos, fontes e cores", () => {
    const project = base();
    expect(artworkFields(project)).toEqual([{ id: "sobrenome", label: "Sobrenome da família", maxLength: 20, example: "Silva" }]);
    expect(editableTexts(project)).toEqual([]);
    expect(initialFieldValues(project)).toEqual({ sobrenome: "Silva" });
  });

  test("preenche o modelo com a caixa de cada camada", () => {
    const edits = fieldEdits(base(), { sobrenome: "  conceição  dos   santos " });
    expect(edits.map((e) => e.text)).toEqual(["NATAL DOS CONCEIÇÃO DOS SANTOS", "Conceição dos Santos"]);
    expect(edits[0]).toMatchObject({ fontId: "font-montserrat-semibold", color: "#14311d" });
    expect(fieldEdits(base(), { sobrenome: "D'ÁVILA-NUNES" })[1].text).toBe("D'Ávila-Nunes");
  });

  test("monta a solicitação no servidor só com o valor do campo", () => {
    const project = base();
    const checked = validateArtworkInput(project, templateId, { fields: { sobrenome: "Gonçalves", fontId: "font-de-fora" }, layers: [{ id: "titulo", text: "outra frase", fontId: "hanken", color: "#000000" }] });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.artwork.fields).toEqual([{ id: "sobrenome", label: "Sobrenome da família", value: "Gonçalves" }]);
    const composed = composeArtwork(project, checked.artwork.layers);
    expect(composed.layers.map((l) => l.kind === "text" && l.text)).toEqual(["EU VIM PELA CEIA", "NATAL DOS GONÇALVES", "Gonçalves"]);
    expect(composed.layers[1]).not.toHaveProperty("maxWidth");
    expect(parseProject(composed)).toEqual(composed);
    const snapshot = { id: "cz", slug: "natal", name: "Natal", version: 1, fields: [] };
    expect(summaryOf(snapshot, { fields: {}, lines: [], artwork: checked.artwork })).toEqual([{ label: "Base da arte", value: "Natal em família" }, { label: "Sobrenome da família", value: "Gonçalves" }]);
  });

  test("recusa vazio, longo, markup, números e letras fora do latim", () => {
    for (const sobrenome of [undefined, "", "   ", "x".repeat(21), "<b>Silva</b>", "Silva 2", "Ли", "Silva\nSouza", "--"]) {
      const checked = validateArtworkInput(base(), templateId, { fields: { sobrenome } });
      expect(checked.ok, String(sobrenome)).toBe(false);
      if (!checked.ok) expect(checked.errors[0].key).toBe("artwork.sobrenome");
    }
    expect(validateArtworkInput(base(), templateId, { fields: ["Silva"] }).ok).toBe(false);
  });

  test("o projeto guarda caixa, arco, contorno e campo, e a mudança de tamanho os acompanha", () => {
    const parsed = parseProject(JSON.parse(JSON.stringify(base())));
    expect(parsed.layers[2]).toMatchObject({ arc: 3836, stroke: 26, boxWidth: 3500, slot: { template: "{sobrenome}", textCase: "title" } });
    const half = resizeProject(parsed, 2135, 2450).layers[2] as TextLayer;
    expect(half).toMatchObject({ arc: 1918, stroke: 13, boxWidth: 1750 });
    for (const bad of [{ template: "NATAL DOS TOMAZI" }, { field: "Sobre Nome", template: "{Sobre Nome}" }, { textCase: "lower" }]) {
      const project = base();
      project.layers[1] = { ...(project.layers[1] as TextLayer), slot: { ...slot("NATAL DOS {sobrenome}", "upper"), ...bad } as TextLayer["slot"] };
      expect(() => parseProject(JSON.parse(JSON.stringify(project)))).toThrow();
    }
  });
});
