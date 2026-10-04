// Builds data/generated/recommendations-index.json (or <CATALOG_SNAPSHOT_DIR>/recommendations-index.json) from the LOCAL snapshots only:
// catalog snapshot, collections snapshot, garment-piece index (optional) and the published CMS bundle. Never calls INK.
// Usage: npm run recommendations:build [-- --dry-run] [--audit <dir>] [--stores use-sul,use-norte]
//   --dry-run   build + validate + report, but do not touch the live index
//   --audit     also write the human review sample (Markdown + CSV) into <dir>
// Deterministic: the same inputs produce a byte-identical file (sha256 printed). Validation runs BEFORE promotion; the live file is kept
// as <file>.prev and a failed validation leaves the live file untouched (exit 1).
import { performance } from "node:perf_hooks";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { readSnapshotSync } from "../src/lib/catalog/snapshot-file";
import { readCollectionsFile } from "../src/lib/catalog/collections-file";
import { readGarmentIndexSync } from "../src/lib/catalog/garment-index-file";
import { readPublished } from "../src/lib/site-config/published";
import type { CommerceStoreKey } from "../src/lib/geo/regions";
import { buildRecommendationsIndex, lookupRecommendations, serializeIndex, type StoreBuildInput } from "../src/lib/recommendations/build";
import { featuredCollectionIds } from "../src/lib/recommendations/cms";
import { recommendationsIndexPath, writeAndPromote } from "../src/lib/recommendations/index-file";
import { writeAudit } from "../src/lib/recommendations/audit";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const value = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dryRun = flag("--dry-run");
const auditDir = value("--audit");
const wanted = (value("--stores")?.split(",") ?? ["use-sul", "use-norte", "use-centro"]) as CommerceStoreKey[];

const t0 = performance.now();
const { snapshot } = readSnapshotSync();
const { snapshot: collections } = readCollectionsFile();
const { index: garments } = readGarmentIndexSync();
const published = readPublished();
const bundle = published.source === "published" ? published.bundle : null;
const tRead = performance.now();

const inputs: StoreBuildInput[] = [];
for (const store of wanted) {
  const index = snapshot.stores[store];
  if (!index) {
    console.warn(`${store}: no catalog snapshot, skipped`);
    continue;
  }
  const storeCollections = collections.stores[store];
  const garmentClusters: Record<string, string[]> = {};
  for (const [cluster, tuples] of Object.entries(garments.stores[store]?.clusters ?? {})) garmentClusters[cluster] = tuples.map((t) => t[1]);
  inputs.push({
    store,
    syncedAt: [index.syncedAt, storeCollections?.syncedAt ?? ""].sort().at(-1)!,
    bindings: index.bindings,
    merch: index.merch,
    collections: storeCollections?.collections ?? [],
    featuredCollectionIds: featuredCollectionIds(bundle, store),
    garmentClusters,
  });
}

const result = buildRecommendationsIndex(inputs, { debug: Boolean(auditDir) });
const text = serializeIndex(result.index);
const tBuild = performance.now();

// Lookup cost and memory of the FINAL artifact only (what the route keeps in memory).
(globalThis as { gc?: () => void }).gc?.();
const before = process.memoryUsage().heapUsed;
const parsed = JSON.parse(text);
const after = process.memoryUsage().heapUsed;
const regionOf: Record<string, "sul" | "norte" | "centro-oeste"> = { "use-sul": "sul", "use-norte": "norte", "use-centro": "centro-oeste" };
const sample: [string, string][] = [];
for (const [store, s] of Object.entries(parsed.stores) as [string, { recs: Record<string, unknown> }][]) for (const id of Object.keys(s.recs).slice(0, 4000)) sample.push([regionOf[store], id]);
const tl0 = performance.now();
let found = 0;
for (let round = 0; round < 5; round++) for (const [region, id] of sample) found += lookupRecommendations(parsed, region as "sul", id).length;
const lookupUs = ((performance.now() - tl0) * 1000) / Math.max(1, sample.length * 5);

console.log(JSON.stringify({
  inputs: { catalog: Object.fromEntries(inputs.map((i) => [i.store, { bindings: i.bindings.length, merch: i.merch.length, collections: i.collections.length, featuredCollections: i.featuredCollectionIds?.size ?? 0, garmentClusters: Object.keys(i.garmentClusters ?? {}).length }])), cms: published.source },
  stats: result.stats,
  bytes: Buffer.byteLength(text),
  generatedAt: result.index.generatedAt,
  timing_ms: { read: Math.round(tRead - t0), build: Math.round(tBuild - tRead) },
  lookup_us_avg: Number(lookupUs.toFixed(2)),
  lookups: sample.length * 5,
  items_returned: found,
  heap_index_mb: Number(((after - before) / 1024 / 1024).toFixed(1)),
}, null, 2));

if (auditDir) {
  mkdirSync(auditDir, { recursive: true });
  const files = writeAudit(result, path.resolve(auditDir));
  console.log(`audit written: ${files.join(", ")}`);
}

if (dryRun) {
  console.log("dry run: live index untouched");
} else {
  try {
    const promoted = await writeAndPromote(text, { expectStores: inputs.map((i) => i.store), minListsPerStore: 10 });
    console.log(`promoted ${promoted.target} (${promoted.validation.bytes} bytes, sha256 ${promoted.validation.sha256})${promoted.previous ? `, previous kept at ${path.basename(promoted.previous)}` : ""}`);
  } catch (err) {
    console.error(`NOT promoted, ${recommendationsIndexPath()} unchanged: ${(err as Error).message}`);
    for (const e of (err as { errors?: string[] }).errors ?? []) console.error(`  - ${e}`);
    process.exit(1);
  }
}
