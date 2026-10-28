import { NextResponse } from "next/server";
import { cityJourney } from "@/lib/catalog/city-journey";
import { catalogReadiness } from "@/lib/catalog/readiness";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";

// One response per place: never prerendered. Reads only local files (catalog snapshot, garment index); no INK, no database. Not ISR either:
// a sync revalidates `/api/cidades/<region>` only, never the paths under it, so a cached place would outlive the data it was built from.
export const dynamic = "force-dynamic";

const UF = /^[a-z]{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CACHE = { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" };

/**
 * `GET /api/cidades/<region>/<uf>/<city>` — one place for the header's "Sua cidade" journey (src/lib/catalog/city-journey.ts): its designs and,
 * for each, the real pieces with photo, price and INK link. Public data only: what the place's own page already shows. A region that is not
 * launched is a 404; an unknown place is a 404 JSON. While the catalog is missing or partial (`/api` is outside the proxy's bootstrap gate),
 * a 503 that nobody caches, never an empty answer that a CDN would keep.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string; uf: string; city: string }> }) {
  const { region, uf, city } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return new NextResponse(null, { status: 404 });
  if (!catalogReadiness([region]).ready) {
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
  const found = UF.test(uf) && SLUG.test(city) && city.length <= 80 ? cityJourney(region, uf, city) : null;
  return found
    ? NextResponse.json(found, { headers: CACHE })
    : NextResponse.json({ v: 1, region, error: "unknown place" }, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
}
