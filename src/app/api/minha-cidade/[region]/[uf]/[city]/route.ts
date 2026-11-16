import { NextResponse } from "next/server";
import { finderCity } from "@/lib/catalog/city-finder";
import { catalogReadiness } from "@/lib/catalog/readiness";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";

// One response per place, never prerendered nor ISR: like `/api/cidades/<region>/<uf>/<city>`, a sync never revalidates paths under it.
export const dynamic = "force-dynamic";

const UF = /^[a-z]{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CACHE = { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" };

/**
 * `GET /api/minha-cidade/<region>/<uf>/<city>` — the designs of one place as its own page's cards, for "Quero minha cidade"
 * (src/components/city-finder/CityFinder.tsx). Public data only. A region that is not launched or an unknown place is a 404; while the catalog
 * is missing or partial (`/api` is outside the proxy's bootstrap gate), a 503 nobody caches.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string; uf: string; city: string }> }) {
  const { region, uf, city } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return new NextResponse(null, { status: 404 });
  if (!catalogReadiness([region]).ready) {
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
  const found = UF.test(uf) && SLUG.test(city) && city.length <= 80 ? finderCity(region, uf, city) : null;
  return found
    ? NextResponse.json(found, { headers: CACHE })
    : NextResponse.json({ v: 1, region, error: "unknown place" }, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
}
