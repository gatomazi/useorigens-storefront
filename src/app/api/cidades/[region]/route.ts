import { getCatalog } from "@/lib/catalog/repository";
import { citiesOfRegion } from "@/lib/geo/cities";
import { isRegionSlug } from "@/lib/geo/regions";
import type { SearchCity } from "@/lib/search/rank";
import { ENABLED_REGIONS } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = 3600;

export function generateStaticParams() {
  return ENABLED_REGIONS.map((region) => ({ region }));
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

  const covered = getCatalog().coveredCityIds(region);
  const index: SearchCity[] = citiesOfRegion(region)
    .filter((city) => covered.has(city.id))
    .map((city) => ({
      n: city.name,
      u: city.uf,
      s: city.slug,
      ...(city.aliases.length ? { a: [...city.aliases] } : {}),
      ...(city.area ? { m: city.area } : {}),
    }));

  return Response.json(index, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
