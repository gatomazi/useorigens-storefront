// MANUAL run of the daily "Pódio" calculation into data/generated/podio/<region>/ (or CATALOG_SNAPSHOT_DIR).
//
//   npm run podio:sync                 # every region
//   npm run podio:sync -- sul norte    # only these regions
//
// Read-only against INK (GET /v1/stores/orders, paid only, 1.5 s pacing). Needs INK_TOKEN_* and a catalog snapshot (npm run catalog:sync).
// Prints totals per region and the unmapped products (catalog data only — never a buyer, address or order id). A running server picks the
// new files up on its next ISR revalidation; POST /api/admin/podio-sync also revalidates the pages.
import { REGION_SLUGS, isRegionSlug, type RegionSlug } from "../src/lib/geo/regions";
import { readLatestSnapshot } from "../src/lib/podio/snapshot";
import { syncPodio } from "../src/lib/podio/sync";

const args = process.argv.slice(2);
const regions: RegionSlug[] = args.length ? args.filter(isRegionSlug) : REGION_SLUGS;
if (args.length && regions.length !== args.length) {
  console.error(`unknown region in: ${args.join(", ")} (valid: ${REGION_SLUGS.join(", ")})`);
  process.exit(2);
}

const results = await syncPodio(regions);
let failed = false;
for (const r of results) {
  if (!r.ok) {
    failed = true;
    console.error(`podio ${r.region}: FAILED (${r.referenceDate}) — ${r.error}`);
    continue;
  }
  console.log(
    `podio ${r.region}: ok ${r.referenceDate} — ${r.ordersFetched} paid orders read, ${r.unitsMapped}/${r.unitsEligible} eligible units mapped, ${r.requests} GETs, states with data: ${r.states.join(", ") || "none"}${r.comparedWith ? `, compared with ${r.comparedWith}` : ", no previous day (no movement)"}`,
  );
  const snapshot = readLatestSnapshot(r.region);
  if (snapshot) {
    const e = snapshot.sync.excluded;
    console.log(`  excluded orders: not paid ${e.notPaid}, exchange ${e.exchange}, zero value ${e.zeroValue}, outside window ${e.outsideWindow}, duplicate ${e.duplicate}`);
    for (const u of snapshot.unmapped.slice(0, 15)) console.log(`  unmapped ${u.units}× ${u.productId} "${u.name}": ${u.reason}`);
  }
}
process.exit(failed ? 1 : 0);
