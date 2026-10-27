import { describe, expect, test, vi } from "vitest";
import { artworkFields, composeArtwork, editableTexts, fieldEdits, initialFieldValues, validateArtworkInput } from "@/lib/customization/artwork";
import { summaryOf } from "@/lib/customization/validate";
import { newTextLayer, parseProject, resizeProject, type ImageLayer, type PrintProject, type TextLayer } from "@/lib/print-studio/model";
import { paintProject } from "@/lib/print-studio/renderer";

const templateId = "1792427199785-94f180a0-474a-4a75-9fae-1fbdd72f2aa8";
const slot = (template: string, textCase: "upper" | "title") => ({ field: "sobrenome", label: "Sobrenome da família", template, textCase, maxLength: 20, example: "Silva" });
const base = (): PrintProject => ({
  version: 1, name: "Natal em família", width: 4270, height: 4900, dpi: 300, background: null, reference: null,
  fonts: [{ id: "font-montserrat-semibold", name: "Montserrat SemiBold", weight: 600, dataUrl: "data:application/octet-stream;base64,AA==" }],
  layers: [
    { ...newTextLayer("titulo"), text: "EU VIM PELA CEIA", color: "#14331e" },
    { ...newTextLayer("sobrenome"), text: "NATAL DOS TOMAZI", fontId: "font-montserrat-semibold", weight: 600, color: "#14311d", align: "center", boxWidth: 3600, slot: { ...slot("NATAL DOS {sobrenome}", "upper"), dropParticle: true } },
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

  test("o \"dos\" do modelo serve para qualquer sobrenome e não repete a partícula digitada", () => {
    const texts = (sobrenome: string) => fieldEdits(base(), { sobrenome }).map((e) => e.text);
    expect(texts("dos Santos")).toEqual(["NATAL DOS SANTOS", "Dos Santos"]);
    expect(texts("da Silva")).toEqual(["NATAL DOS SILVA", "Da Silva"]);
    expect(texts("Di Napoli")).toEqual(["NATAL DOS DI NAPOLI", "Di Napoli"]);
    expect(texts("Dorneles")).toEqual(["NATAL DOS DORNELES", "Dorneles"]);
    expect(validateArtworkInput(base(), templateId, { fields: { sobrenome: "dos" } }).ok).toBe(true); // "Dos" sozinho pode ser sobrenome
  });

  test("quebra sobrenome composto em linhas equilibradas só onde a base permite", () => {
    const project = base();
    const arch = project.layers[2] as TextLayer;
    project.layers[2] = { ...arch, slot: { ...arch.slot!, maxLines: 2 } };
    const texts = (sobrenome: string) => fieldEdits(project, { sobrenome }).map((e) => e.text);
    expect(texts("Albuquerque Lins")).toEqual(["NATAL DOS ALBUQUERQUE LINS", "Albuquerque\nLins"]);
    expect(texts("dos Santos")).toEqual(["NATAL DOS SANTOS", "Dos Santos"]);
    expect(texts("Costa e Silva")).toEqual(["NATAL DOS COSTA E SILVA", "Costa\ne Silva"]);
    expect(texts("Silva Pereira dos Santos")).toEqual(["NATAL DOS SILVA PEREIRA DOS SANTOS", "Silva Pereira\ndos Santos"]);
    const checked = validateArtworkInput(project, templateId, { fields: { sobrenome: "Albuquerque Lins" } });
    expect(checked.ok && parseProject(composeArtwork(project, checked.artwork.layers)).layers[2]).toMatchObject({ text: "Albuquerque\nLins" });
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
    expect(summaryOf(snapshot, { fields: {}, lines: [], artwork: checked.artwork })).toEqual([{ label: "Base da arte", value: "Natal em família" }, { label: "Sobrenome da família", value: "Gonçalves" }, { label: "Texto na arte", value: "NATAL DOS GONÇALVES" }, { label: "Texto na arte", value: "Gonçalves" }]);
  });

  test("o resumo de um pedido de família lista cada arte e o sobrenome uma vez", () => {
    const project = base();
    const one = validateArtworkInput(project, templateId, { fields: { sobrenome: "dos Santos" } });
    const two = validateArtworkInput(project, "1792427199786-94f180a0-474a-4a75-9fae-1fbdd72f2aa9", { fields: { sobrenome: "dos Santos" } });
    if (!one.ok || !two.ok) throw new Error("bases de teste inválidas");
    const snapshot = { id: "cz", slug: "natal", name: "Natal", version: 1, fields: [] };
    const values = { fields: {}, lines: [], artwork: { ...one.artwork, choice: "Eu vim pela ceia · Adulto" }, moreArtwork: [{ ...two.artwork, choice: "Eu vim pela ceia · Infantil" }] };
    expect(summaryOf(snapshot, values)).toEqual([
      { label: "Arte escolhida 1", value: "Eu vim pela ceia · Adulto" }, { label: "Base da arte 1", value: "Natal em família" },
      { label: "Arte escolhida 2", value: "Eu vim pela ceia · Infantil" }, { label: "Base da arte 2", value: "Natal em família" },
      { label: "Sobrenome da família", value: "dos Santos" },
      { label: "Texto na arte 1", value: "NATAL DOS SANTOS" }, { label: "Texto na arte 1", value: "Dos Santos" },
      { label: "Texto na arte 2", value: "NATAL DOS SANTOS" }, { label: "Texto na arte 2", value: "Dos Santos" },
    ]);
  });

  test("recusa vazio, longo, markup, números e letras fora do latim", () => {
    for (const sobrenome of [undefined, "", "   ", "x".repeat(21), "<b>Silva</b>", "Silva 2", "Ли", "Silva\nSouza", "--"]) {
      const checked = validateArtworkInput(base(), templateId, { fields: { sobrenome } });
      expect(checked.ok, String(sobrenome)).toBe(false);
      if (!checked.ok) expect(checked.errors[0].key).toBe("artwork.sobrenome");
    }
    expect(validateArtworkInput(base(), templateId, { fields: ["Silva"] }).ok).toBe(false);
  });

  test("a arte abaixo do sobrenome desce quando ele quebra em linhas", () => {
    const art: ImageLayer = { id: "arte", kind: "image", name: "Arte fixa", x: 0, y: 0, visible: true, width: 4270, pushedBy: "assinatura", asset: { dataUrl: "data:image/png;base64,AA==", name: "arte.png", width: 4270, height: 4900 } };
    const project = { ...base(), layers: [art, (base().layers[2] as TextLayer)] };
    expect(parseProject(JSON.parse(JSON.stringify(project))).layers[0]).toMatchObject({ pushedBy: "assinatura" });
    expect(parseProject(JSON.parse(JSON.stringify({ ...project, layers: [{ ...art, pushedBy: "outro" }] }))).layers[0]).not.toHaveProperty("pushedBy");
    const imageY = (text: string) => {
      const drawImage = vi.fn();
      const context = { scale: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage, letterSpacing: "0px", measureText: () => ({ width: 1000, actualBoundingBoxAscent: 400, actualBoundingBoxDescent: 80 }) };
      const painted = { ...project, layers: [art, { ...(project.layers[1] as TextLayer), text, fontSize: 900, lineHeight: 1.1 }] };
      paintProject({ getContext: () => context } as unknown as HTMLCanvasElement, painted, { families: new Map([["hanken", "x"]]), images: new Map([["arte", {} as HTMLImageElement]]) }, 4270);
      return drawImage.mock.calls[0][2];
    };
    expect(imageY("Tomazi")).toBe(0);
    expect(imageY("Albuquerque\nLins")).toBeCloseTo(990);
  });

  test("o projeto guarda caixa, arco, contorno e campo, e a mudança de tamanho os acompanha", () => {
    const parsed = parseProject(JSON.parse(JSON.stringify(base())));
    expect(parsed.layers[2]).toMatchObject({ arc: 3836, stroke: 26, boxWidth: 3500, slot: { template: "{sobrenome}", textCase: "title" } });
    expect(parsed.layers[1]).toMatchObject({ slot: { dropParticle: true } });
    const half = resizeProject(parsed, 2135, 2450).layers[2] as TextLayer;
    expect(half).toMatchObject({ arc: 1918, stroke: 13, boxWidth: 1750 });
    for (const bad of [{ template: "NATAL DOS TOMAZI" }, { field: "Sobre Nome", template: "{Sobre Nome}" }, { textCase: "lower" }]) {
      const project = base();
      project.layers[1] = { ...(project.layers[1] as TextLayer), slot: { ...slot("NATAL DOS {sobrenome}", "upper"), ...bad } as TextLayer["slot"] };
      expect(() => parseProject(JSON.parse(JSON.stringify(project)))).toThrow();
    }
  });
});
