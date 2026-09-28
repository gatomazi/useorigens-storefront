// Read-only audit of how the Federal District's products are represented in the local catalog snapshot (no INK call, no write).
//
//   npx tsx scripts/audit-df-localities.mts [snapshot.json]
//
// Prints, for every DF product: the RA it binds to (exact match against the official index) or "UNMAPPED". Used to write
// docs/storefront/df-administrative-regions-round.md and as a regression check when a new snapshot arrives.
import { readFileSync } from "node:fs";
import path from "node:path";
import { allAdministrativeRegions, DF_MUNICIPALITY_ID } from "../src/lib/geo/administrative-regions.ts";
import { withLocality } from "../src/lib/catalog/locality-binding.ts";
import type { CatalogSnapshot } from "../src/lib/catalog/types.ts";

const file = process.argv[2] ?? path.join(process.cwd(), "data", "generated", "catalog-snapshot.json");
const snapshot = JSON.parse(readFileSync(file, "utf8")) as CatalogSnapshot;
const store = snapshot.stores["use-centro"];
if (!store) throw new Error("no use-centro store in the snapshot");

const inDf = store.bindings.filter((b) => b.cityId === DF_MUNICIPALITY_ID);
const bound = inDf.map(withLocality);
const byRegion = new Map<string, { label: Set<string>; families: Map<string, number> }>();
const unmapped: { label: string | undefined; slug: string }[] = [];
let brasiliaOwn = 0;

for (const b of bound) {
  if (b.localityId) {
    const entry = byRegion.get(b.localityId) ?? { label: new Set(), families: new Map() };
    entry.label.add(b.localityLabel ?? "");
    entry.families.set(b.designFamily, (entry.families.get(b.designFamily) ?? 0) + 1);
    byRegion.set(b.localityId, entry);
  } else if (b.localityLabel) unmapped.push({ label: b.localityLabel, slug: b.slug });
  else brasiliaOwn++;
}

const regions = new Map(allAdministrativeRegions().map((r) => [r.id, r]));
console.log(`snapshot: ${file}`);
console.log(`use-centro products: ${store.productCount}; bindings bound to Brasília (5300108): ${inDf.length}`);
console.log(`  Brasília's own (no locality label): ${brasiliaOwn}`);
console.log(`  bound to an administrative region: ${bound.length - brasiliaOwn - unmapped.length} product(s) in ${byRegion.size} region(s)`);
console.log(`  DF locality titles NOT in the official RA index: ${unmapped.length}${unmapped.length ? ` -> ${JSON.stringify(unmapped)}` : ""}`);
console.log(`  DF collection ("df", id 139672) is by state, not by RA: no per-RA collection exists in the snapshot`);
console.log("");
for (const [id, entry] of [...byRegion.entries()].sort((a, b) => regions.get(a[0])!.name.localeCompare(regions.get(b[0])!.name, "pt-BR"))) {
  const r = regions.get(id)!;
  const total = [...entry.families.values()].reduce((a, b) => a + b, 0);
  console.log(`${r.officialCode?.padEnd(6)} ${r.name.padEnd(26)} ${String(total).padStart(2)} product(s)  families: ${[...entry.families].map(([f, n]) => `${f}×${n}`).join(", ")}   titles: ${[...entry.label].join(" | ")}`);
}
const without = allAdministrativeRegions().filter((r) => !byRegion.has(r.id));
console.log(`\nofficial RAs WITHOUT products (never a page): ${without.map((r) => r.name).join(", ") || "none"}`);
