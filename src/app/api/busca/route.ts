import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { MAX_GLOBAL_QUERY, searchGlobal } from "@/lib/search/global";
import { globalSearchIndex } from "@/lib/search/global-index";
import { homeBundle, siteConfigHomeEnabled } from "@/lib/site-config/flag";
import { searchShowsDesigns } from "@/lib/site-config/search-schema";

// One response per query: never prerendered. The work is an in-process scan of the prepared index (see global-index.ts) — no INK, no database.
export const dynamic = "force-dynamic";

/**
 * `GET /api/busca?region=sul&q=tij` — the global search of the storefront (places, designs, editorial pages), asked from one region: that region's
 * results grouped by kind, then the other launched regions' clearly relevant ones. Public data only (titles, links, images, piece counts and the
 * lowest real price); never sales counts. The prepared index is cached in process, but each response reads the current published settings.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const region = url.searchParams.get("region") ?? "";
  const q = (url.searchParams.get("q") ?? "").slice(0, MAX_GLOBAL_QUERY);
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return Response.json({ error: "unknown region" }, { status: 404 });

  const started = performance.now();
  const index = globalSearchIndex();
  // "Estampas de cidade na busca" (Aparência, global): switched off, the cities' collection designs are left out of the answer, not just hidden on screen.
  const hideCityDesigns = siteConfigHomeEnabled() && !searchShowsDesigns(homeBundle());
  const result = searchGlobal(index.byRegion, region, q, hideCityDesigns);
  const ms = (performance.now() - started).toFixed(1);
  return Response.json(result, {
    headers: {
      "Cache-Control": "no-store",
      "Server-Timing": `search;dur=${ms}`,
    },
  });
}
