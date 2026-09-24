// MANUAL, read-only sync of INK collections into data/generated/collections-snapshot.json (docs/admin/cms-v1-round3.md §3).
//
//   node --env-file=.env.local --conditions=react-server --import tsx scripts/sync-collections.mts [use-sul use-norte use-centro]
//
// GET only. About 4 requests in total (Sul 2 pages, Norte 1, Centro 1), paced at 1.5 s. Needs the catalog snapshot to exist (it matches
// against it). NOT wired to any route, page, deploy step or schedule, and NOT run by the automated tests (they use a fake `fetch`).
// Nothing here changes what the public site renders: no section reads a collection unless a CMS document asks for it.
import { syncCollections } from "../src/lib/catalog/collections-sync";
import type { CommerceStoreKey } from "../src/lib/geo/regions";

const keys = process.argv.slice(2) as CommerceStoreKey[];
const outcomes = await syncCollections(keys.length > 0 ? { storeKeys: keys } : {});
for (const o of outcomes) {
  console.log(o.ok ? `${o.storeKey}: ${o.changed ? "updated" : "unchanged"} — ${o.collections} collections (${o.available} available), ${o.requests} request(s)` : `${o.storeKey}: FAILED — ${o.error}`);
}
process.exit(outcomes.every((o) => o.ok) ? 0 : 1);
