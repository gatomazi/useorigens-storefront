import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { availableStudioFonts } from "@/lib/print-studio/font-server";
import { createPreset, parseProject } from "@/lib/print-studio/model";
import { pdfFontCharacterError } from "@/lib/print-studio/pdf-fonts";
import { loadResources, paintProject } from "@/lib/print-studio/renderer";

describe("fontes Mont fornecidas", () => {
  it("preserva os OTFs e os pesos ao salvar e reabrir uma composição", async () => {
    const fonts = await availableStudioFonts();
    expect(fonts.map(({ name, weight }) => ({ name, weight }))).toEqual([
      { name: "Mont ExtraLight", weight: 200 },
      { name: "Mont Heavy", weight: 900 },
      { name: "Mont Regular (PDF)", weight: 400 },
      { name: "Mont Regular Italic (PDF)", weight: 400 },
      { name: "Mont Bold (reconstruída)", weight: 700 },
    ]);
    const hashes = [
      "fa08f98300eb0541983986eb5eb2ea823a231791b854dcc0a26bd87d247c4e1e",
      "e64bfcaf7d5071a48d3114cccc6ec7338038aaf59d52b76cd513fcd03702b153",
      "48713a053d48418fefb5140ccc829eebe5f28d4d5ff2f882ff8498d429404ddb",
      "edf292ce3aa5b23c20d2f3c510537bdda796643c314ef4b45c87e51b24ef5bdb",
      "8173dcfe3ea108e2644088300839dcfc7e79662ee887e7f6aab6f4d518383988",
    ];
    const preset = createPreset("peleia");
    const project = { ...preset, fonts, layers: preset.layers.map((layer, index) => ({ ...layer, fontId: fonts[index].id, weight: fonts[index].weight! })) };
    const reopened = parseProject(JSON.parse(JSON.stringify(project)));
    expect(reopened).toEqual(project);
    reopened.fonts.forEach((font, index) => {
      const bytes = Buffer.from(font.dataUrl.split(",")[1], "base64");
      expect(bytes.subarray(0, 4).toString()).toBe("OTTO");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hashes[index]);
    });
    expect(() => parseProject({ ...project, fonts: [{ ...fonts[0], weight: 901 }] })).toThrow();
  });
  it("recusa desenhar/exportar letras ausentes da Bold parcial sem substituir silenciosamente a fonte", () => {
    expect(pdfFontCharacterError("font-mont-pdf-bold", "amigo secreto.\ncuca&")).toBeNull();
    expect(pdfFontCharacterError("font-mont-pdf-bold", "quem peleia")).toContain("q");
    expect(pdfFontCharacterError("font-mont-heavy", "Não tá morto: quem peleia")).toBeNull();
    const project = createPreset("peleia");
    project.layers = project.layers.map((layer) => ({ ...layer, fontId: "font-mont-pdf-bold" }));
    expect(() => paintProject({} as HTMLCanvasElement, project, { families: new Map(), images: new Map() }, 1400)).toThrow("Mont Bold");
  });
  it("carrega a Bold reconstruída no peso 700 e desenha a frase completa com símbolos", async () => {
    const font = (await availableStudioFonts()).find((entry) => entry.id === "font-mont-bold-rebuilt")!;
    const bytes = Buffer.from(font.dataUrl.split(",")[1], "base64");
    const hasGlyph = unicodeGlyphChecker(bytes);
    const text = "Não tá morto / quem peleia! áéíóúàâêôãõç ÁÉÍÓÚÀÂÊÔÃÕÇ 0123456789 &@#%!?()[]{}+−=$€£¥/\\\"'`ªº©®™°";
    for (const character of text) expect(hasGlyph(character.codePointAt(0)!)).toBe(true);
    const constructor = vi.fn();
    class TestFontFace {
      constructor(...args: unknown[]) { constructor(...args); }
      async load() { return this; }
    }
    const fillText = vi.fn();
    const context = { font: "", scale: vi.fn(), fillRect: vi.fn(), fillText, measureText: () => ({ width: 1000, actualBoundingBoxAscent: 400, actualBoundingBoxDescent: 80 }) };
    vi.stubGlobal("FontFace", TestFontFace);
    vi.stubGlobal("document", { documentElement: {}, fonts: { ready: Promise.resolve(), add: vi.fn(), delete: vi.fn(), load: async () => [] } });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    try {
      const preset = createPreset("peleia");
      const project = parseProject({ ...preset, fonts: [font], layers: [{ ...preset.layers[1], fontId: font.id, weight: 700, text }] });
      const resources = await loadResources(project);
      expect(constructor).toHaveBeenCalledWith(font.id, `url(${font.dataUrl})`, { weight: "700" });
      paintProject({ getContext: () => context } as unknown as HTMLCanvasElement, project, resources, 1400);
      expect(context.font).toBe(`700 510px "${font.id}"`);
      expect(fillText).toHaveBeenCalledWith(text, expect.any(Number), expect.any(Number));
    } finally { vi.unstubAllGlobals(); }
  });
});

/** Read the actual OpenType Unicode map, rather than trusting a manifest of intended characters. */
function unicodeGlyphChecker(bytes: Buffer) {
  let cmap = -1;
  for (let index = 0; index < bytes.readUInt16BE(4); index++) {
    const record = 12 + index * 16;
    if (bytes.toString("ascii", record, record + 4) === "cmap") cmap = bytes.readUInt32BE(record + 8);
  }
  if (cmap < 0) throw new Error("Missing cmap");
  let table = -1;
  for (let index = 0; index < bytes.readUInt16BE(cmap + 2); index++) {
    const offset = cmap + bytes.readUInt32BE(cmap + 4 + index * 8 + 4);
    if (bytes.readUInt16BE(offset) === 4) { table = offset; break; }
  }
  if (table < 0) throw new Error("Missing BMP Unicode map");
  const segments = bytes.readUInt16BE(table + 6) / 2;
  return (codePoint: number) => {
    for (let index = 0; index < segments; index++) {
      const end = bytes.readUInt16BE(table + 14 + index * 2);
      const start = bytes.readUInt16BE(table + 16 + segments * 2 + index * 2);
      if (codePoint < start || codePoint > end) continue;
      const delta = bytes.readInt16BE(table + 16 + segments * 4 + index * 2);
      const rangeField = table + 16 + segments * 6 + index * 2;
      const range = bytes.readUInt16BE(rangeField);
      const glyph = range === 0 ? codePoint : bytes.readUInt16BE(rangeField + range + (codePoint - start) * 2);
      return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
    }
    return false;
  };
}
