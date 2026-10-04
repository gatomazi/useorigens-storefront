// MANUAL sync of the Uma Penca feed (canecas, ecobags) into data/generated/umapenca-snapshot.json.
//
//   npm run umapenca:sync
//
// One read-only GET of UMAPENCA_FEED_URL. Prints what was kept and why anything was excluded. A running server picks the new file up
// on its next ISR revalidation (or immediately via POST /api/admin/umapenca-sync, which also revalidates the page).
import { syncUmaPenca } from "../src/lib/umapenca/sync";

const result = await syncUmaPenca();
if (!result.ok) {
  console.error(`umapenca: FAILED — ${result.error}`);
  process.exit(1);
}
console.log(`umapenca: ${result.changed ? "updated" : "unchanged"} — ${result.articleCount} article(s) kept of ${result.entryCount} feed entr${result.entryCount === 1 ? "y" : "ies"}`);
for (const e of result.excluded) console.log(`  excluded ${e.id || "(no id)"} "${e.title}": ${e.reason}`);
