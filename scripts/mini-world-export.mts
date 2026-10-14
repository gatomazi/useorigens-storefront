// Exports the catalog data the "Meu Pequeno Mundo" prototype (prototipos/meu-pequeno-mundo/) reads, from the LOCAL snapshots only
// (data/generated, same source and rules as the storefront: getCatalog(), localitiesOfRegion(), the city and design page routes). Never calls INK.
// Usage: npm run mundo:dados [-- --out <dir>] [--site https://www.useorigens.com.br] [--regions sul,norte,centro-oeste]
//
// Writes:
//   <out>/indice.json            every place with at least one design (search index: id, name, UF, region, slug, aliases, mesoregion)
//   <out>/lugares/<key>.json     one file per place: its storefront page, the primary product of each design family and, when known,
//                                the IBGE reference point (municipal seat) and 2017 regional division — loaded by the prototype ONLY
//                                for the places a visitor picks (never the whole catalog)
// Prices are left out on purpose: the snapshot can be days old and the prototype must not show a price INK no longer charges.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCatalog } from "../src/lib/catalog/repository";
import { localitiesOfRegion } from "../src/lib/geo/localities";
import { REGION_SLUGS, STATE_CAPITAL_SLUG, isRegionSlug, type RegionSlug } from "../src/lib/geo/regions";
import { readSnapshotSync } from "../src/lib/catalog/snapshot-file";

const argv = process.argv.slice(2);
const value = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const outDir = path.resolve(value("--out") ?? "prototipos/meu-pequeno-mundo/dados");
const site = new URL(value("--site") ?? "https://www.useorigens.com.br").origin;
const regions = (value("--regions")?.split(",") ?? REGION_SLUGS).filter(isRegionSlug) as RegionSlug[];

/** File name of a place's shard. Must match `placeFileKey` in the prototype (IBGE code, or `df-ra--<slug>` for an administrative region). */
const fileKey = (id: string) => id.replace(/[^a-z0-9-]/gi, "-");

/**
 * IBGE reference points (scripts/mini-world-sedes.mts): municipal seat by IBGE code; DF administrative regions by IBGE name.
 * Store slugs that differ from the IBGE name are mapped here; regions created after the 2022 survey simply have no point.
 */
type Sedes = { sedes: Record<string, [number, number, string, string]>; regioesDF: Record<string, [number, number]> };
const sedesPath = path.resolve("prototipos/meu-pequeno-mundo/contexto/sedes-municipais-ibge-2022.json");
const sedes: Sedes | null = existsSync(sedesPath) ? JSON.parse(readFileSync(sedesPath, "utf8")) : null;
const RA_NOME_IBGE: Record<string, string> = { "scia-estrutural": "SCIA" };
const slugify = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const raPorSlug = new Map(Object.entries(sedes?.regioesDF ?? {}).map(([nome, p]) => [slugify(nome), { nome, p }]));
function referenciaIbge(place: { id: string; slug: string; type: string }) {
  if (!sedes) return {};
  if (place.type === "administrative_region") {
    const ra = raPorSlug.get(place.slug) ?? raPorSlug.get(slugify(RA_NOME_IBGE[place.slug] ?? ""));
    return ra ? { sede: { lat: ra.p[0], lon: ra.p[1], tipo: "ra", nomeIbge: ra.nome } } : {};
  }
  const s = sedes.sedes[place.id];
  return s ? { sede: { lat: s[0], lon: s[1], tipo: "sede" }, rgi: s[2], rgint: s[3] } : {};
}
let comPonto = 0;

const { snapshot } = readSnapshotSync();
const catalog = getCatalog();

rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.join(outDir, "lugares"), { recursive: true });

type IndexEntry = { i: string; n: string; u: string; r: RegionSlug; s: string; a?: string[]; m?: string; t?: "ra"; c?: 1 };
const index: IndexEntry[] = [];
let shards = 0;
let products = 0;

for (const region of regions) {
  const covered = catalog.coveredLocalityIds(region);
  for (const place of localitiesOfRegion(region)) {
    if (!covered.has(place.id)) continue;
    const families = catalog.cityFamilies(place.id);
    if (families.length === 0) continue;

    const ufPath = place.uf.toLowerCase();
    const ibge = referenciaIbge(place);
    const placeUrl = `${site}/${region}/${ufPath}/${place.slug}`;
    const items = families.map((entry) => ({
      f: entry.family.id,
      nome: entry.family.name,
      img: entry.primary.imageUrl,
      url: `${placeUrl}/${entry.family.id}`,
    }));

    writeFileSync(
      path.join(outDir, "lugares", `${fileKey(place.id)}.json`),
      JSON.stringify({ v: 1, i: place.id, n: place.name, u: place.uf, r: region, url: placeUrl, produtos: items, ...ibge }),
    );
    if (ibge.sede) comPonto += 1;
    shards += 1;
    products += items.length;

    index.push({
      i: place.id,
      n: place.name,
      u: place.uf,
      r: region,
      s: place.slug,
      ...(place.aliases.length ? { a: [...place.aliases] } : {}),
      ...(place.meso ? { m: place.meso } : {}),
      ...(place.type === "administrative_region" ? { t: "ra" as const } : {}),
      ...(STATE_CAPITAL_SLUG[place.uf] === place.slug && place.type === "municipality" ? { c: 1 as const } : {}),
    });
  }
}

const syncedAt = Object.fromEntries(Object.entries(snapshot.stores).map(([store, s]) => [store, s?.syncedAt ?? null]));
writeFileSync(
  path.join(outDir, "indice.json"),
  JSON.stringify({ v: 1, geradoEm: new Date().toISOString(), site, catalogo: syncedAt, lugares: index }),
);

console.log(`${index.length} lugares, ${shards} arquivos de lugar, ${products} produtos, ${comPonto} com ponto do IBGE → ${path.relative(process.cwd(), outDir)}`);
for (const region of regions) console.log(`  ${region}: ${index.filter((p) => p.r === region).length}`);
