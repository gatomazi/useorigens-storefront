// Marks the city pages affected by a promoted garment-index.json for revalidation on the RUNNING storefront,
// without syncing anything (zero INK requests). Use it when `garments:sync` promoted the index but its revalidation
// step failed, or after copying a new garment-index.json into the Volume by hand.
//
// Usage: GARMENT_REVALIDATE_URL=http://127.0.0.1:$PORT npm run garments:revalidate [-- --store use-sul [--store use-norte]]
// Needs ADMIN_SYNC_TOKEN (same token as /api/admin/catalog-sync). No --store = every store.
import { requestGarmentRevalidation } from "../src/lib/catalog/garment-revalidate-client";
import type { CommerceStoreKey } from "../src/lib/geo/regions";

const stores: CommerceStoreKey[] = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i] === "--store") stores.push(argv[++i] as CommerceStoreKey);

const baseUrl = process.env.GARMENT_REVALIDATE_URL;
const token = process.env.ADMIN_SYNC_TOKEN;
if (!baseUrl || !token) {
  console.error("set GARMENT_REVALIDATE_URL (e.g. http://127.0.0.1:$PORT) and ADMIN_SYNC_TOKEN");
  process.exit(1);
}

const result = await requestGarmentRevalidation(baseUrl, token, stores);
if (result.ok) console.log(`revalidation requested: ${result.cities} city pages marked for revalidation.`);
else {
  console.error(`revalidation FAILED: ${result.error}`);
  process.exit(3);
}
