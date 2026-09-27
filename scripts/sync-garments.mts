// Incremental/resumable sync of the garment-type index (hidden-but-sellable siblings of each city+family's
// classic product). Read-only against INK, GET only, never parallel within a store, paced 1.5s apart with
// jittered backoff on 429. NEVER runs unbounded: --max-requests-per-store is required for a real run.
//
// Usage:
//   npm run garments:sync -- --plan                              # zero-cost estimate, no INK calls
//   npm run garments:sync -- --store use-sul --max-requests-per-store 40
//   npm run garments:sync -- --max-requests-per-store 40          # all 3 stores, in parallel
//   npm run garments:sync -- --max-requests-per-store 40 --force-full
//
// See docs/storefront/city-garment-catalog-rollout.md for the full-crawl request/time estimate and the
// authorization this script's real (non---plan) use requires before a full unbounded pass is ever run.
import { garmentCoverageByStore } from "../src/lib/catalog/garment-coverage";
import { runGarmentSync } from "../src/lib/catalog/garment-sync-service";
import { readGarmentCheckpoint } from "../src/lib/catalog/garment-checkpoint";
import { readSnapshot } from "../src/lib/catalog/snapshot-file";
import type { CommerceStoreKey } from "../src/lib/geo/regions";

// Measured live against INK on 2026-09-27 (docs/storefront/city-garment-catalog-rollout.md) — total product
// counts with no `visible_in_store` filter, at per_page=100. The catalog grows over time (Sul alone gained
// ~150 products in the week between the two rounds), so a real run always trusts INK's live `total_pages`,
// not these numbers — this is only the zero-cost estimate `--plan` prints before any request is made.
const KNOWN_TOTAL_PAGES_2026_09_27: Partial<Record<CommerceStoreKey, number>> = {
  "use-sul": 1066,
  "use-norte": 309,
  "use-centro": 385,
};
const PACE_S = 1.5;

function parseArgs(argv: string[]) {
  const args = { plan: false, store: undefined as CommerceStoreKey | undefined, maxRequestsPerStore: undefined as number | undefined, forceFull: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--plan") args.plan = true;
    else if (a === "--store") args.store = argv[++i] as CommerceStoreKey;
    else if (a === "--max-requests-per-store") args.maxRequestsPerStore = Number(argv[++i]);
    else if (a === "--force-full") args.forceFull = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.plan) {
  const checkpoint = await readGarmentCheckpoint();
  const snapshot = await readSnapshot();
  console.log("=== Garment sync plan (zero INK requests made) ===\n");
  for (const storeKey of Object.keys(KNOWN_TOTAL_PAGES_2026_09_27) as CommerceStoreKey[]) {
    const cp = checkpoint.stores[storeKey];
    const knownTotal = cp?.totalPages ?? KNOWN_TOTAL_PAGES_2026_09_27[storeKey]!;
    const remaining = cp?.status === "complete" ? "incremental only (watermarked at " + cp.maxCreatedAtSeen + ")" : `~${knownTotal - (cp?.lastPageCompleted ?? 0)} pages remaining for the current pass`;
    console.log(`${storeKey}: checkpoint=${cp ? cp.status : "none yet"}, ${remaining}, est. ${Math.round((knownTotal * PACE_S) / 60)} min for a full pass at ${PACE_S}s/page`);
  }
  console.log("\nA full unfiltered crawl across all 3 stores is ~1,760 requests total (~27 min wall clock, Sul-bound,");
  console.log("stores run in parallel). This script never runs that unbounded — pass --max-requests-per-store to cap");
  console.log("any real invocation; resumability means a small capped run today and another capped run tomorrow add up");
  console.log("to the same result as one big run, just spread out and checkpointed.\n");
  const coverage = garmentCoverageByStore(snapshot);
  if (coverage.length > 0) {
    console.log("Current coverage (from whatever garmentBindings already exist in the snapshot):");
    for (const c of coverage) {
      console.log(`  ${c.storeKey}: ${c.complete} complete, ${c.partial} partial, ${c.noVariants} no-variants, ${c.noCluster} no-cluster, of ${c.totalCanonicalBindings} canonical bindings`);
    }
  }
  process.exit(0);
}

if (args.maxRequestsPerStore === undefined || !Number.isFinite(args.maxRequestsPerStore) || args.maxRequestsPerStore <= 0) {
  console.error("refusing to run without --max-requests-per-store <N> (a positive integer) — use --plan for a zero-cost estimate first.");
  process.exit(1);
}

const result = await runGarmentSync({
  storeKeys: args.store ? [args.store] : [],
  maxRequestsPerStore: args.maxRequestsPerStore,
  forceFull: args.forceFull,
  onProgress: ({ storeKey, page, totalPages, requestsUsedThisCall }) => {
    if (page % 10 === 0 || page === totalPages) console.log(`${storeKey}: page ${page}/${totalPages} (${requestsUsedThisCall} requests this run so far)`);
  },
});

for (const outcome of result.outcomes) {
  if (!outcome.ok) {
    console.error(`${outcome.storeKey}: FAILED, previous snapshot/checkpoint untouched (${outcome.error})`);
    continue;
  }
  const status = outcome.completedFullPass ? "COMPLETE pass" : outcome.truncated ? "capped (resumable — run again to continue)" : "reached end of current data";
  console.log(
    `${outcome.storeKey}: ${status} — ${outcome.requestsUsedThisRun} requests, ${outcome.pagesThisRun} pages this run ` +
      `(${outcome.mode}), ${outcome.newGarmentBindings} new garment bindings linked, ${outcome.totalGarmentBindingsForStore} total for this store now.`,
  );
}
console.log("\nsnapshot + checkpoint written.");
