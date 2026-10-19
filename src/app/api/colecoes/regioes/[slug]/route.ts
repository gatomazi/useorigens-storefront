import { allRegionsCatalog } from "@/lib/catalog/all-regions";
import { MAX_COLLECTION_RESULTS, parseCollectionQuery, runCollectionQuery } from "@/lib/search/collection-filter";

export const dynamic = "force-dynamic";

/** Whole-collection search in the neutral namespace. An explicit UF is optional, never inferred from a region. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const collection = allRegionsCatalog().find((await params).slug);
  if (!collection) return Response.json({ error: "unknown collection" }, { status: 404 });
  const query = parseCollectionQuery(new URL(request.url).searchParams);
  const { items, facets } = runCollectionQuery(collection.items, query);
  return Response.json(
    { q: query.q, filters: query.filters, sort: query.sort, total: items.length, items: items.slice(0, MAX_COLLECTION_RESULTS), facets },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
