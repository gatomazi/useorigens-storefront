import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { BRAND_LOGOS, findBrandLogo } from "@/lib/print-studio/logos";
import { logoResponse } from "@/lib/print-studio/logo-server";
import { createPreset, parseProject, type ImageLayer } from "@/lib/print-studio/model";

const originalHashes: Record<string, string> = {
  "sul-clara": "fa5d19019884922dc562de8b9c351f4ee687bed18bcff580a780f90cbf0f2655",
  "sul-escura": "da06f220be24401d68def838f22d6ddcb65a0d60833aeb1e41c08af935831329",
  "norte-clara": "dd5c783aee13d818631ee37c1ad2119a1b97669f179a2175eb781cfd85989166",
  "norte-escura": "8cca59281d6b46d82072d1078f365ab2841e9f8681fd472263fdbeda8c985260",
  "centro-clara": "bbeaf31cd426ea7881de13a0923dfdd5b227f08ce9ac076459f1a28c7cbb121a",
  "centro-escura": "016df82c8007fba7bbe9f7433dc8971ffc2e7e30ffb6bf78893e401752a5c81d",
};

describe("logos originais da Origens", () => {
  it("preserva os seis PNGs fornecidos, suas cores, dimensões e transparência ao incorporar na composição", async () => {
    expect(BRAND_LOGOS).toHaveLength(6);
    for (const logo of BRAND_LOGOS) {
      const response = await logoResponse(logo.id);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(originalHashes[logo.id]);
      expect(await sharp(bytes).metadata()).toMatchObject({ width: logo.width, height: logo.height, hasAlpha: true });
      const layer: ImageLayer = { id: "chosen-logo", kind: "image", name: logo.name, asset: { name: logo.id + ".png", dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, width: logo.width, height: logo.height }, x: 600, y: 1600, width: 320, visible: true, groupId: "group-phrase" };
      const parsed = parseProject({ ...createPreset("peleia"), layers: [layer] });
      expect(parsed.layers[0]).toEqual(layer);
    }
  });
  it("recusa caminhos, nomes de propriedades e logos fora do catálogo", async () => {
    for (const id of ["../../.env.local", "__proto__", "constructor", "sul", "sul-azul"]) {
      expect(findBrandLogo(id)).toBeNull();
      expect((await logoResponse(id)).status).toBe(404);
    }
  });
});
