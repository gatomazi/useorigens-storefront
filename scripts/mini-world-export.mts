// Exports the catalog data the standalone "Meu Pequeno Mundo" prototype (prototipos/meu-pequeno-mundo/) reads, from the LOCAL snapshots only
// (data/generated). Uses the same builder as the storefront's /api/mundo routes (src/lib/mundo/catalogo.ts): one list of places, one rule
// for file names, never INK. The curated profiles stay in data/mundo/ (versioned) and are only COPIED next to the prototype here, so
// regenerating the catalog never touches the curation.
// Usage: npm run mundo:dados [-- --out <dir>] [--site https://www.useorigens.com.br] [--regions sul,norte,centro-oeste]
//
// Writes:
//   <out>/indice.json            every place with at least one design (search index)
//   <out>/lugares/<key>.json     one file per place (store page, one product per design family, IBGE point and regions)
//   prototipos/meu-pequeno-mundo/contexto/perfis-cidades.json   copy of data/mundo/perfis-cidades.json (gitignored there)
//   prototipos/meu-pequeno-mundo/contexto/perfis/<key>.json     one profile per file, as /api/mundo/perfis/<key>.json serves it
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileKey, indiceDoMundo, lugarDoMundo } from "../src/lib/mundo/catalogo";
import { idsComPerfil, perfilDoMundo } from "../src/lib/mundo/perfis";
import { REGION_SLUGS, isRegionSlug, type RegionSlug } from "../src/lib/geo/regions";
import { readSnapshotSync } from "../src/lib/catalog/snapshot-file";

const argv = process.argv.slice(2);
const value = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const outDir = path.resolve(value("--out") ?? "prototipos/meu-pequeno-mundo/dados");
const site = new URL(value("--site") ?? "https://www.useorigens.com.br").origin;
const regions = (value("--regions")?.split(",") ?? REGION_SLUGS).filter(isRegionSlug) as RegionSlug[];

const { snapshot } = readSnapshotSync();
rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.join(outDir, "lugares"), { recursive: true });

const index = indiceDoMundo(regions);
let products = 0;
let comPonto = 0;
for (const entry of index) {
  const lugar = lugarDoMundo(entry.i, regions, site);
  if (!lugar) continue;
  writeFileSync(path.join(outDir, "lugares", `${fileKey(entry.i)}.json`), JSON.stringify(lugar));
  products += lugar.produtos.length;
  if (lugar.sede) comPonto += 1;
}

const syncedAt = Object.fromEntries(Object.entries(snapshot.stores).map(([store, s]) => [store, s?.syncedAt ?? null]));
writeFileSync(path.join(outDir, "indice.json"), JSON.stringify({ v: 1, geradoEm: new Date().toISOString(), site, catalogo: syncedAt, lugares: index }));

const contexto = path.resolve("prototipos/meu-pequeno-mundo/contexto");
mkdirSync(contexto, { recursive: true });
copyFileSync(path.resolve("data/mundo/perfis-cidades.json"), path.join(contexto, "perfis-cidades.json"));
rmSync(path.join(contexto, "perfis"), { recursive: true, force: true });
mkdirSync(path.join(contexto, "perfis"));
for (const id of idsComPerfil()) writeFileSync(path.join(contexto, "perfis", `${fileKey(id)}.json`), JSON.stringify(perfilDoMundo(fileKey(id))));

console.log(`${index.length} lugares, ${products} produtos, ${comPonto} com ponto do IBGE → ${path.relative(process.cwd(), outDir)}`);
for (const region of regions) console.log(`  ${region}: ${index.filter((p) => p.r === region).length}`);
