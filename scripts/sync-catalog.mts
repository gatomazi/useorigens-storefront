// Syncs the INK catalog into data/generated/catalog-snapshot.json (read-only against INK).
// Usage: npm run catalog:sync   (add store keys to sync only some: use-sul use-norte)
// The actual sync logic lives in src/lib/catalog/sync-service.ts — this is a thin CLI wrapper around it,
// the same function POST /api/admin/catalog-sync calls, so there is exactly one implementation.
import type { CommerceStoreKey } from "../src/lib/geo/regions";
import { syncCatalog } from "../src/lib/catalog/sync-service";

// Optional hard cap on real GETs per store: `--cap use-sul=110 --cap use-norte=45`. A store that would exceed
// its cap fails and keeps its previous snapshot (a truncated catalog is never promoted).
const argv = process.argv.slice(2);
const requested: CommerceStoreKey[] = [];
const caps: Partial<Record<CommerceStoreKey, number>> = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--cap") {
    const [store, n] = (argv[++i] ?? "").split("=");
    if (!store || !Number.isInteger(Number(n)) || Number(n) <= 0) throw new Error(`--cap expects <store>=<positive integer>, got "${argv[i]}"`);
    caps[store as CommerceStoreKey] = Number(n);
  } else requested.push(argv[i] as CommerceStoreKey);
}

const result = await syncCatalog(
  requested,
  ({ storeKey, page, totalPages }) => {
    if (page % 10 === 0 || page === totalPages) console.log(`${storeKey}: page ${page}/${totalPages}`);
  },
  caps,
);

for (const outcome of result.outcomes) {
  if (!outcome.ok) {
    // Last-known-good: a failed store keeps its previous index untouched (see sync-service.ts).
    console.error(`${outcome.storeKey}: sync FAILED, keeping previous data (${outcome.error})`);
    continue;
  }
  console.log(
    `${outcome.storeKey}: ${outcome.productCount} products, ${outcome.bindingCount} bindings, ` +
      `${outcome.merchCount} merch, ${outcome.excludedCount} excluded, ${outcome.rejected} rejected by validation, ${outcome.requests} GETs`,
  );
}
console.log("snapshot written");
