import { NextResponse } from "next/server";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { publicTopBar } from "@/lib/site-config/top-bar-public";

/**
 * Public, read-only, cacheable: the live "Faixa do topo" messages of a region (`v: 1`, see site-config/top-bar.ts), for the Worker that draws them on the
 * INK pages (it calls this server-side and re-serves it same-origin, so no CORS is configured here). The storefront's own strip does not call it: the page
 * carries the schedule. No cookies, no identity, nothing administrative. Short cache: a scheduled message starts or ends within about a minute.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return new NextResponse(null, { status: 404 });
  return NextResponse.json(publicTopBar(region), { headers: { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=30" } });
}
