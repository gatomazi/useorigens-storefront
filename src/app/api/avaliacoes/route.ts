import { NextResponse } from "next/server";
import { homeReviewsEnabled, readReviewsPage } from "@/lib/reviews/source";

/** INK shows five reviews a page: 60 pages is 300 reviews, well past the store's own count, and keeps the route from asking INK for numbers that mean nothing. */
const MAX_LIST_PAGE = 60;

/**
 * One page of the store's reviews, newest first and UNFILTERED (every rating, stars-only ones included), for the full list in the home's modal
 * ("Ver todas as avaliações"). INK's own page cannot be shown inside the storefront (it answers `X-Frame-Options: SAMEORIGIN`), so the storefront
 * reads it on the server (src/lib/reviews) and draws the list itself. Public, read-only, no cookies. Each page of INK is read through Next's data
 * cache (30 min), so this route asks INK for a given page at most that often, however many visitors scroll the list. REVIEWS_HOME=off turns it off.
 */
export async function GET(request: Request) {
  if (!homeReviewsEnabled()) return new NextResponse(null, { status: 404 });
  const raw = new URL(request.url).searchParams.get("page") ?? "1";
  const page = /^\d{1,3}$/.test(raw) ? Number(raw) : 0;
  if (page < 1 || page > MAX_LIST_PAGE) return NextResponse.json({ error: "page" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const data = await readReviewsPage(page);
    // `nextPage` is INK's own "Ver mais" page: only ever the one right after this, and never past the cap.
    const nextPage = data.nextPage === page + 1 && data.nextPage <= MAX_LIST_PAGE ? data.nextPage : null;
    return NextResponse.json(
      { page, score: data.score, count: data.count, nextPage, reviews: data.reviews },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300" } },
    );
  } catch (error) {
    console.warn(JSON.stringify({ event: "reviews.list-error", page, reason: String(error instanceof Error ? error.message : error).slice(0, 80) }));
    return NextResponse.json({ error: "unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
