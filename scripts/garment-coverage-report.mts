// Read-only, zero INK requests: what the local snapshot's garment index really covers, measured with the same
// resolution the city page uses (`Catalog#garmentTabsForCity`). Prints Markdown.
// Usage: npm run garments:coverage
import { garmentCoverageByStore } from "../src/lib/catalog/garment-coverage";
import { readGarmentIndexSync } from "../src/lib/catalog/garment-index-file";
import { readGarmentCheckpoint } from "../src/lib/catalog/garment-checkpoint";
import { GARMENT_TYPES } from "../src/lib/catalog/garments";
import { getCatalog } from "../src/lib/catalog/repository";
import { readSnapshot } from "../src/lib/catalog/snapshot-file";
import { allCities } from "../src/lib/geo/cities";
import { REGIONS, REGION_SLUGS } from "../src/lib/geo/regions";

const snapshot = await readSnapshot();
const checkpoint = await readGarmentCheckpoint();
const { index: garmentIndex } = readGarmentIndexSync();
const piecesOf = (store: string) => Object.values(garmentIndex.stores[store as keyof typeof garmentIndex.stores]?.clusters ?? {}).flat();
const catalog = getCatalog();
const typeLabel = new Map(GARMENT_TYPES.map((t) => [t.id, t.label]));

console.log("## Por loja\n");
console.log("| Loja | Canônicas | Com cluster | Sem cluster | Completos | Parciais | Sem variantes | Peças indexadas | Passada | Páginas | GETs (crawl) |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|");
for (const c of garmentCoverageByStore(snapshot, garmentIndex)) {
  const cp = checkpoint.stores[c.storeKey];
  const pieces = piecesOf(c.storeKey).length;
  console.log(
    `| ${c.storeKey} | ${c.totalCanonicalBindings} | ${c.totalCanonicalBindings - c.noCluster} | ${c.noCluster} | ${c.complete} | ${c.partial} | ${c.noVariants} | ${pieces} | ${cp?.status ?? "—"} | ${cp ? `${cp.lastPageCompleted}/${cp.totalPages}` : "—"} | ${cp?.requestsUsedAllTime ?? "—"} |`,
  );
}

console.log("\n## Peças indexadas por tipo\n");
const stores = Object.keys(snapshot.stores) as (keyof typeof snapshot.stores)[];
console.log(`| Tipo | ${stores.join(" | ")} |`);
console.log(`|---|${stores.map(() => "---:").join("|")}|`);
for (const type of GARMENT_TYPES.filter((t) => t.id !== 1)) {
  const cells = stores.map((s) => piecesOf(s).filter((t) => t[0] === type.id).length);
  console.log(`| ${typeLabel.get(type.id)} | ${cells.join(" | ")} |`);
}

console.log("\n## Cidades (o que a página da cidade realmente mostra)\n");
console.log("| Região | Cidades com catálogo | Com ao menos 1 aba de peça | % | Com peças em TODAS as famílias | Famílias com peças (média por cidade) |");
console.log("|---|---:|---:|---:|---:|---:|");
for (const region of REGION_SLUGS) {
  const covered = catalog.coveredCityIds(region);
  const cities = allCities().filter((c) => c.regionSlug === region && covered.has(c.id));
  let withTabs = 0;
  let allFamilies = 0;
  let familyShareSum = 0;
  for (const city of cities) {
    const families = catalog.cityFamilies(city.id).length;
    const { tabs, entriesByGarment } = catalog.garmentTabsForCity(city.id);
    if (tabs.length <= 1) continue;
    withTabs++;
    const withPieces = new Set<string>();
    for (const tab of tabs.filter((t) => t.id !== 1)) for (const e of entriesByGarment[tab.id] ?? []) withPieces.add(e.family.id);
    familyShareSum += withPieces.size / families;
    if (withPieces.size === families) allFamilies++;
  }
  const pct = (n: number) => (cities.length ? ((100 * n) / cities.length).toFixed(1) : "0");
  console.log(`| ${REGIONS[region].name} | ${cities.length} | ${withTabs} | ${pct(withTabs)}% | ${allFamilies} (${pct(allFamilies)}%) | ${cities.length ? ((100 * familyShareSum) / cities.length).toFixed(1) : "0"}% |`);
}

console.log("\n## Distribuição de tipos distintos por cluster canônico (com cluster)\n");
console.log("| Loja | " + Array.from({ length: 10 }, (_, i) => i).join(" | ") + " |");
console.log("|---|" + Array.from({ length: 10 }, () => "---:").join("|") + "|");
for (const [key, index] of Object.entries(snapshot.stores)) {
  const clusters = garmentIndex.stores[key as keyof typeof garmentIndex.stores]?.clusters ?? {};
  const hist = Array.from({ length: 10 }, () => 0);
  for (const b of index?.bindings ?? []) {
    if (!b.productClusterId) continue;
    hist[Math.min(9, new Set((clusters[b.productClusterId] ?? []).map((t) => t[0])).size)]++;
  }
  console.log(`| ${key} | ${hist.join(" | ")} |`);
}

console.log("\n## Exclusões registradas no checkpoint (apenas passadas que já registram)\n");
for (const [key, cp] of Object.entries(checkpoint.stores)) {
  console.log(`- ${key}: ${cp?.exclusions ? JSON.stringify(cp.exclusions) : "não registrado nesta passada"}`);
}
