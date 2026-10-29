// Prévia exata de uma base com campos (a da placa, por padrão), pelo mesmo desenho do servidor que cria a arte na INK: cada exemplo vira um PNG
// sobre camiseta branca e preta. Serve para conferir posição, tamanho e o encolhimento das cidades longas antes de importar a base no estúdio.
//
//   npx tsx scripts/placa-previa.mts output/placa-base/placa-uf-cidade.origens.json output/placa-base
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { composeArtwork, fieldEdits, validateArtworkFields } from "../src/lib/customization/artwork";
import { parseProjectFile } from "../src/lib/print-studio/model";
import { renderProjectPng } from "../src/lib/print-studio/render-server";

const [file = "output/placa-base/placa-uf-cidade.origens.json", out = "output/placa-base"] = process.argv.slice(2);
const base = parseProjectFile(readFileSync(file, "utf8"));
const SAMPLES: Record<string, Record<string, string>> = {
  exemplo: { cidade: "Santa Terezinha de Itaipu/PR", placa: "TOM-1996" },
  longa: { cidade: "Vila Bela da Santíssima Trindade/MT", placa: "VBT-1752" },
  curta: { cidade: "Belém/PA", placa: "BEL-1616" },
  larga: { cidade: "Águas de São Pedro/SP", placa: "WMW-8888" },
};
for (const [name, values] of Object.entries(SAMPLES)) {
  const checked = validateArtworkFields(base, "previa", values);
  if (!checked.ok) throw new Error(`${name}: ${checked.errors.map((e) => e.message).join("; ")}`);
  const png = await renderProjectPng(composeArtwork(base, fieldEdits(base, values)), 1400);
  for (const [shirt, background] of [["branca", "#ffffff"], ["preta", "#151515"]] as const) {
    const target = path.join(out, `previa-${name}-${shirt}.png`);
    writeFileSync(target, await sharp(png).flatten({ background }).extract({ left: 0, top: 0, width: 1400, height: 480 }).png().toBuffer());
  }
  console.log(name, checked.artwork.layers.map((l) => l.text).join(" | "));
}
