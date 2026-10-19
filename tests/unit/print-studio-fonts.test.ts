import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { availableStudioFonts } from "@/lib/print-studio/font-server";
import { createPreset, parseProject } from "@/lib/print-studio/model";

describe("fontes Mont fornecidas", () => {
  it("preserva os OTFs e os pesos ao salvar e reabrir uma composição", async () => {
    const fonts = await availableStudioFonts();
    expect(fonts.map(({ name, weight }) => ({ name, weight }))).toEqual([
      { name: "Mont ExtraLight", weight: 200 },
      { name: "Mont Heavy", weight: 900 },
    ]);
    const hashes = [
      "fa08f98300eb0541983986eb5eb2ea823a231791b854dcc0a26bd87d247c4e1e",
      "e64bfcaf7d5071a48d3114cccc6ec7338038aaf59d52b76cd513fcd03702b153",
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
});
