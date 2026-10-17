/**
 * Prints the DRAFT "Tema da INK" of a region as the public payload (`v: 1`), for the preview on the real INK pages (worker-lojas:
 * `node scripts/preview-tema.mjs --config <file>`). Read-only: nothing is saved or published, and the INK is never called.
 *   npm run ink-theme:draft -- sul > tema-sul.json
 * Reads the drafts of the LOCAL panel (`npm run cms:dev`, data/admin-dev): edit there, export here, preview on the INK, then publish.
 */
import { loadWorkspace } from "../src/lib/admin/workspace";
import { isRegionSlug } from "../src/lib/geo/regions";
import { inkThemePayload } from "../src/lib/site-config/ink-theme";

const region = process.argv[2] ?? "sul";
if (!isRegionSlug(region)) {
  console.error(`região desconhecida: ${region} (use sul, norte ou centro-oeste)`);
  process.exit(2);
}
const ws = await loadWorkspace(region);
process.stdout.write(JSON.stringify(inkThemePayload(region, ws.doc.inkTheme), null, 2) + "\n");
