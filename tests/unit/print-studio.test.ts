import { describe, expect, it } from "vitest";
import { createPreset, parseProject, parseProjectFile, projectFileName } from "@/lib/print-studio/model";

describe("modelos de estampas", () => {
  it("mantém o tamanho dos originais e o estilo independente por linha", () => {
    for (const kind of ["celebrar", "peleia"] as const) {
      const p = createPreset(kind);
      expect(parseProjectFile(JSON.stringify(p))).toEqual(p);
      expect([p.width, p.height, p.background]).toEqual([4270, 4900, null]);
    }
    const [normal, emphasis] = createPreset("peleia").layers;
    expect(normal.kind === "text" && normal.weight).toBeLessThan(emphasis.kind === "text" ? emphasis.weight : 0);
    expect(normal.kind === "text" && normal.fontSize).toBeLessThan(emphasis.kind === "text" ? emphasis.fontSize : 0);
  });

  it("recusa JSON inválido, versões desconhecidas e valores que inviabilizariam o render", () => {
    expect(() => parseProjectFile("{oops")).toThrow("Não foi possível ler");
    const p = createPreset("peleia");
    expect(() => parseProject({ ...p, version: 2 })).toThrow("Versão");
    expect(() => parseProject({ ...p, layers: [{ ...p.layers[0], fontSize: Infinity }] })).toThrow("medida");
    expect(() => parseProject({ ...p, layers: [{ ...p.layers[0], fontId: "missing" }] })).toThrow("desconhecida");
    expect(() => parseProject({ ...p, layers: [p.layers[0], p.layers[0]] })).toThrow("duplicadas");
    expect(() => parseProject({ ...p, width: 20000 })).toThrow("medida");
  });

  it("aceita recursos embutidos e recusa referências remotas ou conteúdo ativo", () => {
    const p = createPreset("peleia");
    const font = { id: "font-local-1", name: "Minha fonte", dataUrl: "data:application/octet-stream;base64,AA==" };
    expect(parseProject({ ...p, fonts: [font] }).fonts).toEqual([font]);
    for (const url of ["https://example.test/logo.png", "data:image/svg+xml;base64,AA==", "javascript:alert(1)"]) {
      expect(() => parseProject({ ...p, reference: { name: "logo", width: 10, height: 10, dataUrl: url } })).toThrow("imagem");
    }
    expect(() => parseProject({ ...p, fonts: [{ ...font, id: 'font-a");url(remote)' }] })).toThrow("Identificador");
  });

  it("gera nomes de download sem comandos ou caminhos", () => {
    expect(projectFileName("Não tá morto / quem peleia! 😎")).toBe("nao-ta-morto-quem-peleia");
    expect(projectFileName("../../")).toBe("minha-estampa");
  });
});
