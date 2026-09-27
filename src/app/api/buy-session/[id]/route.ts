import { resolveProductDisplay } from "@/lib/catalog/lookup";
import { verifyListSession } from "@/lib/favorites/session";
import { allow, clientKey } from "@/lib/rate-limit";

// Per-visitor session state: never prerendered, never cached by us or by anything in front of us.
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } as const;
const json = (body: unknown, status: number) => Response.json(body, { status, headers: HEADERS });

/**
 * GET /api/buy-session/<id>?done=<comma-separated INK product ids>
 *
 * Read by the use-origens-workers Worker, server-to-server, from its own `/__origens/list-session` route — the
 * browser on the INK side never calls this directly (see docs/buy-session-consumer.md, mirroring
 * `GET /api/navbar/[region]`, which the same Worker already calls the same way). No cookies, no custom headers, no
 * CORS needed on either side because neither call is ever made from a browser context.
 *
 * `done`: ids the Worker's own client-side already saw confirmed-added in THIS tab (its trusted DOM signal, see
 * drawer-watch.js) — advisory only, used solely to pick which real, already-verified product comes next; it can
 * never make an ineligible product buyable, since every id in the session was already validated at mint time and
 * is re-validated again below. Repeating the same id, or a page refresh with the same `done` set, computes the
 * exact same answer — idempotent by construction, no server-side counter to get out of sync.
 *
 * 404 for anything invalid/unsigned/tampered/expired (indistinguishable, like /api/cart-mirror). 200 with
 * `next: null` when every item in the session has been marked done — never a stale or fabricated suggestion.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!allow("buy-session-read:" + clientKey(request.headers), 300, 60_000)) return json({ error: "rate_limited" }, 429);

  const { id } = await params;
  const session = verifyListSession(id);
  if (!session) return json({ error: "not_found" }, 404);

  const done = new Set(
    (new URL(request.url).searchParams.get("done") ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter((v) => /^[A-Za-z0-9_-]{1,40}$/.test(v)),
  );

  const total = session.inkProductIds.length;
  const position = session.inkProductIds.filter((productId) => done.has(productId)).length;
  const candidates = session.inkProductIds.filter((productId) => !done.has(productId));

  for (const productId of candidates) {
    const display = resolveProductDisplay(session.storeKey, productId);
    if (display?.url) {
      return json({ next: { inkProductId: display.inkProductId, title: display.title, imageUrl: display.imageUrl, url: display.url }, position, total }, 200);
    }
    // Delisted or broken since the session was minted: skip silently and try the next real candidate.
  }
  return json({ next: null, position: total, total }, 200);
}

export function POST() {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: "GET" } });
}
