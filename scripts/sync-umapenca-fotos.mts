// MANUAL fetch of the Uma Penca hover photos into data/generated/umapenca-hover.json. Never run by a cron: once a photo is fetched it
// is kept, and only articles without one are fetched.
//
//   npm run umapenca:fotos              # only articles with no hover photo yet
//   npm run umapenca:fotos -- --refazer # every article again
//
// One read-only GET per product page. In production, POST /api/admin/umapenca-hover-sync (?refresh=1) does the same on the Volume.
import { syncUmaPencaHover } from "../src/lib/umapenca/hover";

const result = await syncUmaPencaHover({ refresh: process.argv.includes("--refazer") });
if (!result.ok) {
  console.error(`umapenca fotos: FAILED — ${result.error}`);
  process.exit(1);
}
console.log(`umapenca fotos: ${result.fetched.length} fetched, ${result.kept} already had one, ${result.missing.length} without`);
for (const f of result.fetched) console.log(`  ${f.id}: ${f.url}`);
for (const m of result.missing) console.log(`  missing ${m.id}: ${m.reason}`);
