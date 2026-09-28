// One-off, zero INK requests: moves the ~100k `garmentBindings` embedded in catalog-snapshot.json into the
// compact garment-index.json, then rewrites the snapshot without them. The current snapshot is copied to
// <snapshot dir>/backups/pre-compact-<timestamp>/ first. Safe to re-run (nothing left to migrate = no-op).
// Usage: npm run garments:migrate-index
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { catalogSnapshotDir } from "../src/lib/config/env";
import { garmentIndexPath, readGarmentIndex, writeGarmentIndex } from "../src/lib/catalog/garment-index-file";
import { migrateGarmentBindings, type LegacySnapshot } from "../src/lib/catalog/garment-index-migrate";
import { snapshotPath, writeSnapshot } from "../src/lib/catalog/snapshot-file";

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
const size = async (file: string) => (await stat(file).catch(() => null))?.size ?? 0;

const snapshotFile = snapshotPath();
const legacy = JSON.parse(await readFile(snapshotFile, "utf8")) as LegacySnapshot;
const embedded = Object.values(legacy.stores).reduce((n, s) => n + (s?.garmentBindings?.length ?? 0), 0);
if (embedded === 0) {
  console.log("no embedded garmentBindings in the snapshot: nothing to migrate.");
  process.exit(0);
}

const backupDir = path.join(catalogSnapshotDir(), "backups", `pre-compact-${new Date().toISOString().replace(/[:.]/g, "-")}`);
await mkdir(backupDir, { recursive: true });
await copyFile(snapshotFile, path.join(backupDir, "catalog-snapshot.json"));
console.log(`backup: ${backupDir}`);

const snapshotBefore = await size(snapshotFile);
const indexBefore = await size(garmentIndexPath());
const result = migrateGarmentBindings(legacy, await readGarmentIndex());

await writeGarmentIndex(result.index);
await writeSnapshot(result.snapshot);

for (const [store, r] of Object.entries(result.report)) {
  console.log(`${store}: read ${r.read}, written ${r.written}, duplicates ${r.duplicates}, excluded ${JSON.stringify(r.excluded)}`);
}
console.log(`snapshot: ${mb(snapshotBefore)} -> ${mb(await size(snapshotFile))}`);
console.log(`garment index: ${mb(indexBefore)} -> ${mb(await size(garmentIndexPath()))}`);
