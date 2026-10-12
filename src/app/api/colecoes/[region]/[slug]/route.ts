import { isRegionSlug } from "@/lib/geo/regions";
import { findCollectionLanding, pagedGridItems } from "@/lib/pages/public";
import { isRegionLaunched } from "@/lib/regions/launched";
import { filterCollection, MAX_COLLECTION_QUERY, MAX_COLLECTION_RESULTS } from "@/lib/search/collection-filter";

// One response per query: never prerendered. The work is a scan of the collection's own cards (the synced catalog), no INK, no database.
export const dynamic = "force-dynamic";

/**
 * `GET /api/colecoes/sul/da-nossa-terra?q=floripa` — the mini search of a collection page: the cards of THAT page's collection (the same products, in
 * the same order, as its paged grid) whose name, place or state match, at most `MAX_COLLECTION_RESULTS`. Public data only (what the cards already
 * show). A region that is not launched or an address with no collection page is a 404. CDN-cacheable for a few minutes, like the global search.
 */
export async function GET(request: Request, { params }: { params: Promise<{ region: string; slug: string }> }) {
  const { region, slug } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return Response.json({ error: "unknown region" }, { status: 404 });
  const found = findCollectionLanding(region, slug);
  if (!found) return Response.json({ error: "unknown collection" }, { status: 404 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, MAX_COLLECTION_QUERY);
  const matched = filterCollection(pagedGridItems(found.region, found.bundle, found.page), q);
  return Response.json(
    { q, total: matched.length, items: matched.slice(0, MAX_COLLECTION_RESULTS) },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
