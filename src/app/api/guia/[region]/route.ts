import { NextResponse } from "next/server";
import { isRegionSlug } from "@/lib/geo/regions";
import { guideCity, guideCollection, guideCollections, guideProductContext } from "@/lib/guide/pdp-guide";
import { isRegionLaunched } from "@/lib/regions/launched";
import { PAGE_SLUG } from "@/lib/site-config/schema";

// One response per query: never prerendered. Reads only local files (catalog, collections, published config); no INK, no database.
export const dynamic = "force-dynamic";

const PRODUCT_ID = /^[1-9][0-9]{0,15}$/;
const CITY = /^([a-z]{2})\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const CACHE = { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" };

/**
 * `GET /api/guia/<region>` — the guided help of the INK product page, for the Worker that draws it there (called server-side and re-served
 * same-origin after validating every item; no CORS here). Public data only: what the storefront's own cards already show.
 *   ?produto=<inkProductId>           the place that product is about (for "Mais estampas de <cidade>")
 *   ?cidade=<uf>/<slug>[&produto=id]  up to three designs of that place (never the product already open) + its page
 *   ?colecao=<slug>                   a few products of that collection + its page
 *   (nothing)                         the collections the guide offers (the region's published menu)
 * A region that is not launched is a 404 (every link points at storefront pages of that region); an unknown place or collection is a 404 JSON.
 */
export async function GET(request: Request, { params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return new NextResponse(null, { status: 404 });
  const q = new URL(request.url).searchParams;
  const produto = q.get("produto");
  const productId = produto && PRODUCT_ID.test(produto) ? produto : null;
  const cidade = q.get("cidade");
  const colecao = q.get("colecao");
  if (cidade !== null) {
    const m = CITY.exec(cidade);
    const found = m ? guideCity(region, m[1], m[2], productId) : null;
    return found ? NextResponse.json(found, { headers: CACHE }) : NextResponse.json({ v: 1, region, error: "unknown city" }, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  }
  if (colecao !== null) {
    const found = PAGE_SLUG.test(colecao) && colecao.length <= 60 ? guideCollection(region, colecao) : null;
    return found ? NextResponse.json(found, { headers: CACHE }) : NextResponse.json({ v: 1, region, error: "unknown collection" }, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  }
  if (produto !== null) {
    if (!productId) return NextResponse.json({ v: 1, region, error: "invalid product" }, { status: 400 });
    return NextResponse.json(guideProductContext(region, productId), { headers: CACHE });
  }
  return NextResponse.json(guideCollections(region), { headers: CACHE });
}
