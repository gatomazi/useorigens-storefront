// One-off, narrow, read-only script for THIS round only (see docs/storefront/city-garment-tabs-round.md).
//
// Fetches, by exact product id, the known garment-type siblings of three real fixture cities (one per
// region: Tijucas/SC, Xambioá/TO, Água Boa/MT, family "Traço") and writes them into
// data/generated/catalog-snapshot.json's new `garmentBindings` field. This is deliberately NOT a full
// catalog resync: a full crawl of INK's hidden-product pool is ~1000+ paginated requests per store (see the
// report) and needs the user's explicit go-ahead before it runs. The ids below were found by a bounded,
// targeted probe during this round's audit (never a blind full-catalog crawl) — each is a single GET by id,
// well under INK's 100 req/min/store limit, paced the same as the main sync client.
import { readSnapshot, writeSnapshot } from "../src/lib/catalog/snapshot-file";
import { normalizeGarmentSourceProduct } from "../src/lib/ink/normalize";
import { buildGarmentBindings } from "../src/lib/catalog/garments-link";
import { INK_API_BASE_URL, tokenFor } from "../src/lib/ink/config";
import type { CommerceStoreKey } from "../src/lib/geo/regions";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Fixture = { storeKey: CommerceStoreKey; canonicalInkProductId: string; siblingIds: string[] };

const FIXTURES: Fixture[] = [
  { storeKey: "use-sul", canonicalInkProductId: "4381465", siblingIds: ["4381466", "4381467", "4381468", "4381469", "4381470", "4381471", "4381472", "4381473"] },
  { storeKey: "use-norte", canonicalInkProductId: "4571902", siblingIds: ["4571903", "4571904", "4571905", "4571906", "4571907", "4571908", "4571909", "4571910", "4571911"] },
  { storeKey: "use-centro", canonicalInkProductId: "4581351", siblingIds: ["4581358", "4581360", "4581361", "4581363", "4581365", "4581366", "4581367", "4581368", "4581369"] },
];

async function fetchProduct(storeKey: CommerceStoreKey, id: string) {
  const token = tokenFor(storeKey);
  if (!token) throw new Error(`missing credential for ${storeKey}`);
  const res = await fetch(`${INK_API_BASE_URL}/v1/stores/products/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`INK responded ${res.status} for ${storeKey}/${id}`);
  const body = (await res.json()) as { product?: unknown };
  return body.product;
}

const snapshot = await readSnapshot();
const syncedAt = new Date().toISOString();
let fetched = 0;

for (const fixture of FIXTURES) {
  const store = snapshot.stores[fixture.storeKey];
  if (!store) {
    console.error(`${fixture.storeKey}: no store index in the current snapshot, skipping`);
    continue;
  }
  const canonical = store.bindings.find((b) => b.inkProductId === fixture.canonicalInkProductId);
  if (!canonical) {
    console.error(`${fixture.storeKey}: canonical binding ${fixture.canonicalInkProductId} not found, skipping`);
    continue;
  }

  // Fetch the canonical live too, only to confirm/refresh its real product_cluster_id — never to change
  // its city/family classification, which stays owned entirely by the existing indexer/parser.
  const canonicalRaw = await fetchProduct(fixture.storeKey, fixture.canonicalInkProductId);
  fetched++;
  await sleep(1500);
  const canonicalNormalized = normalizeGarmentSourceProduct(canonicalRaw, fixture.storeKey);
  if (canonicalNormalized?.clusterId) canonical.productClusterId = canonicalNormalized.clusterId;
  console.log(`${fixture.storeKey}: canonical ${fixture.canonicalInkProductId} (${canonicalNormalized?.name}) cluster=${canonicalNormalized?.clusterId}`);

  const rawSiblings = [];
  for (const id of fixture.siblingIds) {
    const raw = await fetchProduct(fixture.storeKey, id);
    fetched++;
    const normalized = normalizeGarmentSourceProduct(raw, fixture.storeKey);
    if (normalized) rawSiblings.push(normalized);
    await sleep(1500);
  }

  const newGarmentBindings = buildGarmentBindings(rawSiblings, store.bindings, syncedAt);
  const existing = (store.garmentBindings ?? []).filter((g) => g.cityId !== canonical.cityId || g.designFamily !== canonical.designFamily);
  store.garmentBindings = [...existing, ...newGarmentBindings];
  console.log(`${fixture.storeKey}: linked ${newGarmentBindings.length} garment-type siblings for cityId=${canonical.cityId} family=${canonical.designFamily}`);
}

await writeSnapshot(snapshot);
console.log(`done. ${fetched} live INK requests made (well under the 100/min/store limit, paced 1.5s apart).`);
