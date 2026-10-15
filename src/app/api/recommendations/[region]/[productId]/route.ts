import { NextResponse } from "next/server";
import { isRegionSlug } from "@/lib/geo/regions";
import { lookupRecommendations } from "@/lib/recommendations/build";
import { readRecommendationsIndex, recommendationsIndexPath } from "@/lib/recommendations/index-file";
import { servedDataDir, storeForRegion } from "@/lib/catalog/commerce-mode";

const PRODUCT_ID = /^[1-9][0-9]{0,15}$/;

/**
 * Public, read-only, cacheable: the precomputed "Você também pode gostar" list of ONE INK product page, for the Worker that draws it on the
 * INK product page (it calls this server-side and re-serves it same-origin after validating every item, so no CORS is configured here).
 * Reads only the local `recommendations-index.json` (never INK, never the database). No cookies, no identity, no personal data.
 * A missing index or an unknown product is an empty list (200), so the product page simply stays as INK draws it.
 * Deliberately NOT gated on the storefront's region launch (unlike /api/navbar): every item is an INK product page of that region's own INK
 * store, never a storefront page, and the Worker's `auto-recommendations` flag is what turns the block on per store.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string; productId: string }> }) {
  const { region, productId } = await params;
  if (!isRegionSlug(region) || !PRODUCT_ID.test(productId)) return new NextResponse(null, { status: 404 });
  const index = readRecommendationsIndex(recommendationsIndexPath(servedDataDir()));
  const items = lookupRecommendations(index, region, productId, storeForRegion(region));
  return NextResponse.json(
    { v: 1, region, productId, status: index ? "ok" : "no-index", items },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
