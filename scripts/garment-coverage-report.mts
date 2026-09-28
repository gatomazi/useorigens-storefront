// Read-only, zero INK requests: what the local snapshot's garment index really covers, measured with the same
// resolution the city page uses (`Catalog#garmentTabsForCity`). Prints Markdown.
// Usage: npm run garments:coverage
import { garmentCoverageByStore } from "../src/lib/catalog/garment-coverage";
import { readGarmentCheckpoint } from "../src/lib/catalog/garment-checkpoint";
import { GARMENT_TYPES } from "../src/lib/catalog/garments";
import { getCatalog } from "../src/lib/catalog/repository";
import { readSnapshot } from "../src/lib/catalog/snapshot-file";
import { allCities } from "../src/lib/geo/cities";
import { REGIONS, REGION_SLUGS } from "../src/lib/geo/regions";

const snapshot = await readSnapshot();
const checkpoint = await readGarmentCheckpoint();
const catalog = getCatalog();
const typeLabel = new Map(GARMENT_TYPES.map((t) => [t.id, t.label]));

console.log("## Por loja\n");
console.log("| Loja | Canônicas | Com cluster | Sem cluster | Completos | Parciais | Sem variantes | Peças indexadas | Passada | Páginas | GETs (crawl) |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|");
for (const c of garmentCoverageByStore(snapshot)) {
  const cp = checkpoint.stores[c.storeKey];
  const pieces = snapshot.stores[c.storeKey]?.garmentBindings?.length ?? 0;
  console.log(
    `| ${c.storeKey} | ${c.totalCanonicalBindings} | ${c.totalCanonicalBindings - c.noCluster} | ${c.noCluster} | ${c.complete} | ${c.partial} | ${c.noVariants} | ${pieces} | ${cp?.status ?? "—"} | ${cp ? `${cp.lastPageCompleted}/${cp.totalPages}` : "—"} | ${cp?.requestsUsedAllTime ?? "—"} |`,
  );
}

console.log("\n## Peças indexadas por tipo\n");
const stores = Object.keys(snapshot.stores) as (keyof typeof snapshot.stores)[];
console.log(`| Tipo | ${stores.join(" | ")} |`);
console.log(`|---|${stores.map(() => "---:").join("|")}|`);
for (const type of GARMENT_TYPES.filter((t) => t.id !== 1)) {
  const cells = stores.map((s) => snapshot.stores[s]?.garmentBindings?.filter((g) => g.garmentTypeId === type.id).length ?? 0);
  console.log(`| ${typeLabel.get(type.id)} | ${cells.join(" | ")} |`);
}

console.log("\n## Cidades (o que a página da cidade realmente mostra)\n");
console.log("| Região | Cidades com catálogo | Com ao menos 1 aba de peça | % | Abas por cidade (mín/média/máx) |");
console.log("|---|---:|---:|---:|---|");
for (const region of REGION_SLUGS) {
  const covered = catalog.coveredCityIds(region);
  const cities = allCities().filter((c) => c.regionSlug === region && covered.has(c.id));
  const tabCounts = cities.map((c) => Math.max(0, catalog.garmentTabsForCity(c.id).tabs.length - 1));
  const withPieces = tabCounts.filter((n) => n > 0).length;
  const avg = tabCounts.length ? (tabCounts.reduce((a, b) => a + b, 0) / tabCounts.length).toFixed(1) : "0";
  console.log(`| ${REGIONS[region].name} | ${cities.length} | ${withPieces} | ${cities.length ? ((100 * withPieces) / cities.length).toFixed(1) : "0"}% | ${Math.min(...tabCounts, 0)}/${avg}/${Math.max(...tabCounts, 0)} |`);
}

console.log("\n## Distribuição de tipos distintos por cluster canônico (com cluster)\n");
console.log("| Loja | " + Array.from({ length: 10 }, (_, i) => i).join(" | ") + " |");
console.log("|---|" + Array.from({ length: 10 }, () => "---:").join("|") + "|");
for (const [key, index] of Object.entries(snapshot.stores)) {
  const typesByCluster = new Map<string, Set<number>>();
  for (const g of index?.garmentBindings ?? []) {
    const set = typesByCluster.get(g.productClusterId) ?? new Set<number>();
    set.add(g.garmentTypeId);
    typesByCluster.set(g.productClusterId, set);
  }
  const hist = Array.from({ length: 10 }, () => 0);
  for (const b of index?.bindings ?? []) {
    if (!b.productClusterId) continue;
    hist[Math.min(9, typesByCluster.get(b.productClusterId)?.size ?? 0)]++;
  }
  console.log(`| ${key} | ${hist.join(" | ")} |`);
}

console.log("\n## Exclusões registradas no checkpoint (apenas passadas que já registram)\n");
for (const [key, cp] of Object.entries(checkpoint.stores)) {
  console.log(`- ${key}: ${cp?.exclusions ? JSON.stringify(cp.exclusions) : "não registrado nesta passada"}`);
}
