// Validates and atomically promotes a candidate garment-index.json that already sits on the SAME Volume, then (optionally)
// asks the running storefront to revalidate the affected city pages. Zero requests to INK.
//
// Usage (inside the Railway container, cwd /app):
//   node --conditions=react-server --import tsx scripts/promote-garment-index.mts --from /app/data/generated/garment-index.incoming.json --expect-stores use-sul [--check-only] [--revalidate]
//
//   --check-only   validate and print the verdict, change nothing
//   --revalidate   after the rename, POST /api/admin/garment-index/revalidate (needs GARMENT_REVALIDATE_URL and ADMIN_SYNC_TOKEN)
//
// Exit codes: 0 ok · 1 validation/promotion failed (the live index is untouched) · 3 promoted but revalidation failed
// (the index is valid and stays; retry with scripts/revalidate-garments.mts).
import { readFile } from "node:fs/promises";
import { GarmentIndexPromotionError, promoteGarmentIndex, validateGarmentIndexText } from "../src/lib/catalog/garment-index-promote";
import { garmentIndexPath } from "../src/lib/catalog/garment-index-file";
import { requestGarmentRevalidation } from "../src/lib/catalog/garment-revalidate-client";
import type { CommerceStoreKey } from "../src/lib/geo/regions";

const argv = process.argv.slice(2);
const stores: CommerceStoreKey[] = [];
let from: string | undefined;
let checkOnly = false;
let revalidate = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--from") from = argv[++i];
  else if (argv[i] === "--expect-stores") stores.push(...(argv[++i] ?? "").split(",").filter(Boolean).map((s) => s as CommerceStoreKey));
  else if (argv[i] === "--check-only") checkOnly = true;
  else if (argv[i] === "--revalidate") revalidate = true;
}
if (!from || stores.length === 0) {
  console.error("usage: promote-garment-index.mts --from <candidate on the Volume> --expect-stores use-sul[,use-norte] [--check-only] [--revalidate]");
  process.exit(1);
}

if (checkOnly) {
  const verdict = validateGarmentIndexText(await readFile(from, "utf8"), { expectStores: stores });
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.ok ? 0 : 1);
}

try {
  const result = await promoteGarmentIndex(from, { expectStores: stores });
  console.log(`promoted ${result.target}: ${result.validation.bytes} bytes, sha256 ${result.validation.sha256}`);
  for (const [store, counts] of Object.entries(result.validation.stores)) console.log(`  ${store}: ${counts.clusters} clusters, ${counts.pieces} pieces`);
  console.log(result.previous ? `previous index kept at ${result.previous}` : "no previous index existed");
} catch (err) {
  console.error(`NOT promoted (${garmentIndexPath()} untouched): ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof GarmentIndexPromotionError) for (const e of err.errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (revalidate) {
  const baseUrl = process.env.GARMENT_REVALIDATE_URL;
  const token = process.env.ADMIN_SYNC_TOKEN;
  if (!baseUrl || !token) {
    console.error("revalidation NOT requested: GARMENT_REVALIDATE_URL and ADMIN_SYNC_TOKEN must both be set. The promoted index is intact.");
    process.exit(3);
  }
  const result = await requestGarmentRevalidation(baseUrl, token, stores);
  if (result.ok) console.log(`revalidation requested: ${result.cities} city pages marked for revalidation.`);
  else {
    console.error(`revalidation FAILED (${result.error}). The promoted index is intact; retry: node --conditions=react-server --import tsx scripts/revalidate-garments.mts --store ${stores.join(" --store ")}`);
    process.exit(3);
  }
}
