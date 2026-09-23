import { getCatalog } from "@/lib/catalog/repository";
import { catalogReadiness } from "@/lib/catalog/readiness";
import { citiesOfRegion } from "@/lib/geo/cities";
import { isRegionSlug } from "@/lib/geo/regions";
import type { SearchCity } from "@/lib/search/rank";
import { ENABLED_REGIONS } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = 3600;

// Not prebuilt: the index is derived from the catalog snapshot, which lives on the runtime Volume and does not
// exist at `next build` time on Railway — prebuilding baked an empty `[]` (search found no city at all) until
// the next revalidation. Generated on the first request instead, then ISR-cached like the pages that read it.
export function generateStaticParams() {
  return [];
}

/**
 * Compact search index for one region: only cities that have at least one purchasable design,
 * so a search result never leads to an empty page. Static and CDN-cacheable (no per-request work).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !ENABLED_REGIONS.includes(region)) {
    return new Response(null, { status: 404 });
  }

  // This route is outside the proxy's bootstrap gate (its matcher excludes /api), so guard here: while the
  // catalog is missing or only partially synced, never render (and thereby ISR-cache) an empty index — the
  // client retries on its next focus.
  if (!catalogReadiness(ENABLED_REGIONS).ready) {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }

  const covered = getCatalog().coveredCityIds(region);
  const index: SearchCity[] = citiesOfRegion(region)
    .filter((city) => covered.has(city.id))
    .map((city) => ({
      n: city.name,
      u: city.uf,
      s: city.slug,
      ...(city.aliases.length ? { a: [...city.aliases] } : {}),
      ...(city.meso ? { m: city.meso } : {}),
    }));

  return Response.json(index, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
