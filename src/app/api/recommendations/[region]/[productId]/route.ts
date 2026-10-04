import { NextResponse } from "next/server";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { lookupRecommendations } from "@/lib/recommendations/build";
import { readRecommendationsIndex } from "@/lib/recommendations/index-file";

const PRODUCT_ID = /^[1-9][0-9]{0,15}$/;

/**
 * Public, read-only, cacheable: the precomputed "Você também pode gostar" list of ONE INK product page, for the Worker that draws it on the
 * INK product page (it calls this server-side and re-serves it same-origin after validating every item, so no CORS is configured here).
 * Reads only the local `recommendations-index.json` (never INK, never the database). No cookies, no identity, no personal data.
 * A missing index or an unknown product is an empty list (200), so the product page simply stays as INK draws it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string; productId: string }> }) {
  const { region, productId } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region) || !PRODUCT_ID.test(productId)) return new NextResponse(null, { status: 404 });
  const index = readRecommendationsIndex();
  const items = lookupRecommendations(index, region, productId);
  return NextResponse.json(
    { v: 1, region, productId, status: index ? "ok" : "no-index", items },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
