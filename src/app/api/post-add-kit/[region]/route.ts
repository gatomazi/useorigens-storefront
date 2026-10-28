import { NextResponse } from "next/server";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { publicPostAddKit } from "@/lib/site-config/post-add-kit-public";

/**
 * Public, read-only, cacheable: the "Monte seu kit" of a region (`v: 1`, see site-config/post-add-kit.ts), for the Worker that draws it in INK's
 * "Produto adicionado ao carrinho" modal (it calls this server-side and re-serves it same-origin, so no CORS is configured here). No cookies, no identity,
 * nothing administrative. `kit: null` = nothing to show (off, or no live promotion behind the choice). One minute of cache on top of the INK read's own.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return new NextResponse(null, { status: 404 });
  return NextResponse.json(await publicPostAddKit(region), { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=60" } });
}
