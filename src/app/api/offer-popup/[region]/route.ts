import { NextResponse } from "next/server";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { publicOfferPopup } from "@/lib/site-config/offer-popup-public";

/**
 * Public, read-only, cacheable: the "Popup da oferta" of a region (`v: 1`, see site-config/offer-popup.ts), read by the storefront after the page is ready.
 * No cookies, no identity, nothing administrative. `offer: null` = nothing to show (off, or no live promotion behind the choice). One minute of cache on top
 * of the INK read's own.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return new NextResponse(null, { status: 404 });
  return NextResponse.json(await publicOfferPopup(region), { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=60" } });
}
