import { NextResponse } from "next/server";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { publicNavbar } from "@/lib/site-config/navbar";

/**
 * Public, read-only, cacheable: the navbar collections of a region, for the Worker that draws the header on the INK product pages (it calls this
 * server-side and re-serves it same-origin, so no CORS is configured here). No cookies, no identity, no custom headers.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return new NextResponse(null, { status: 404 });
  return NextResponse.json(publicNavbar(region), { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } });
}
