import { NextResponse } from "next/server";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { publicPromotions } from "@/lib/site-config/promotions-public";

/**
 * Public, read-only, cacheable: the live coupons and promotions of a region (`v: 1`, see site-config/promotions.ts), for the storefront button and for the
 * Worker that draws the same button on the INK pages (it calls this server-side and re-serves it same-origin, so no CORS is configured here). No cookies,
 * no identity, nothing administrative. Short cache: a scheduled item starts or ends within about a minute.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return new NextResponse(null, { status: 404 });
  return NextResponse.json(publicPromotions(region), { headers: { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=30" } });
}
