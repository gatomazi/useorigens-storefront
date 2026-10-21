import { isRegionSlug } from "@/lib/geo/regions";
import { findCollectionLanding, pagedGridDefaultSort, pagedGridItems } from "@/lib/pages/public";
import { isRegionLaunched } from "@/lib/regions/launched";
import { productSalesUnits } from "@/lib/podio/server";
import { MAX_COLLECTION_RESULTS, parseCollectionQuery, runCollectionQuery } from "@/lib/search/collection-filter";

// One response per query: never prerendered. The work is a scan of the collection's own cards (the synced catalog), no INK, no database.
export const dynamic = "force-dynamic";

/**
 * `GET /api/colecoes/sul/da-nossa-terra?q=floripa&peca=178&uf=SC&cidade=Tijucas&estilo=origem&ordem=price-asc` — the mini search and the
 * filters of a collection page: the cards of THAT page's collection (the same products, in the same order, as its paged grid) that match the
 * text, pass the filters and come in the order asked, at most `MAX_COLLECTION_RESULTS`, with the facets each filter can still choose (rules
 * in search/collection-filter.ts). Public data only (what the cards already show). A region that is not launched or an address with no
 * collection page is a 404. CDN-cacheable for a few minutes, like the global search.
 */
export async function GET(request: Request, { params }: { params: Promise<{ region: string; slug: string }> }) {
  const { region, slug } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return Response.json({ error: "unknown region" }, { status: 404 });
  const found = findCollectionLanding(region, slug);
  if (!found) return Response.json({ error: "unknown collection" }, { status: 404 });
  const query = parseCollectionQuery(new URL(request.url).searchParams, pagedGridDefaultSort(found.region, found.bundle, found.page));
  const { items, facets } = runCollectionQuery(pagedGridItems(found.region, found.bundle, found.page, "collection"), query, productSalesUnits(found.region));
  return Response.json(
    { q: query.q, filters: query.filters, sort: query.sort, total: items.length, items: items.slice(0, MAX_COLLECTION_RESULTS), facets },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
