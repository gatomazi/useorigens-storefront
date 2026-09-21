// Syncs the INK catalog into data/generated/catalog-snapshot.json (read-only against INK).
// Usage: npm run catalog:sync   (add store keys to sync only some: use-sul use-norte)
import { buildStoreIndex } from "../src/lib/catalog/indexer";
import { readSnapshot, writeSnapshot } from "../src/lib/catalog/snapshot-file";
import type { CommerceStoreKey } from "../src/lib/geo/regions";
import { fetchStoreProducts } from "../src/lib/ink/client";
import { INK_STORES, tokenFor } from "../src/lib/ink/config";

const requested = process.argv.slice(2) as CommerceStoreKey[];
const keys = (Object.keys(INK_STORES) as CommerceStoreKey[]).filter(
  (key) => (requested.length === 0 || requested.includes(key)) && tokenFor(key),
);

const snapshot = await readSnapshot();

const results = await Promise.allSettled(
  keys.map(async (storeKey) => {
    const { products, rejected } = await fetchStoreProducts(storeKey, ({ page, totalPages }) => {
      if (page % 10 === 0 || page === totalPages) console.log(`${storeKey}: page ${page}/${totalPages}`);
    });
    const index = buildStoreIndex(storeKey, products, new Date().toISOString());
    return { storeKey, index, rejected };
  }),
);

results.forEach((result, i) => {
  const storeKey = keys[i];
  if (result.status === "rejected") {
    // Last-known-good: a failed store keeps its previous index untouched.
    console.error(`${storeKey}: sync FAILED, keeping previous data (${String(result.reason)})`);
    return;
  }
  const { index, rejected } = result.value;
  snapshot.stores[storeKey] = index;
  const reasons: Record<string, number> = {};
  for (const e of index.excluded) reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
  console.log(
    `${storeKey}: ${index.productCount} products, ${index.bindings.length} bindings, ` +
      `${index.merch.length} merch, ${index.excluded.length} excluded ${JSON.stringify(reasons)}, ` +
      `${rejected} rejected by validation`,
  );
});

await writeSnapshot(snapshot);
console.log("snapshot written");
