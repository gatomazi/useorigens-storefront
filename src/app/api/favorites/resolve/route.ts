import { resolveProductDisplay } from "@/lib/catalog/lookup";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { allow, clientKey } from "@/lib/rate-limit";

// Refreshes the Meus Lugares page's cached favorites against the live catalog: never prerendered/cached.
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } as const;
const json = (body: unknown, status: number) => Response.json(body, { status, headers: HEADERS });

const VALID_STORE_KEYS: readonly CommerceStoreKey[] = ["use-sul", "use-norte", "use-centro", "use-origens"];
const MAX_IDS = 60; // matches FAVORITES_MAX_ITEMS

/**
 * GET /api/favorites/resolve?store=<key>&ids=<comma-separated INK product ids>
 * Read-only, per-visitor list — never trusts anything from the client beyond WHICH ids to look up: title, image,
 * price and the purchase URL always come from the live catalog (`resolveProductDisplay`), never from the caller.
 * Unresolvable ids (removed/delisted/never existed) come back as `{ inkProductId, available: false }`, never an error.
 */
export async function GET(request: Request) {
  if (!allow("favorites-resolve:" + clientKey(request.headers), 60, 60_000)) return json({ error: "rate_limited" }, 429);

  const url = new URL(request.url);
  const store = url.searchParams.get("store");
  if (!store || !VALID_STORE_KEYS.includes(store as CommerceStoreKey)) return json({ error: "bad_request" }, 400);

  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[A-Za-z0-9_-]{1,40}$/.test(id))
    .slice(0, MAX_IDS);

  const items = ids.map((inkProductId) => {
    const display = resolveProductDisplay(store as CommerceStoreKey, inkProductId);
    // No usable purchase URL (removed, delisted, or INK returned something we can't trust) is unavailable too.
    // `inkProductId` stays the id the browser saved (its key); `purchaseId`/`purchaseStoreKey` are what is actually sold (single-store mode
    // translates an old regional id through the old → new map — the saved favorite itself is never rewritten).
    if (!display?.url) return { inkProductId, available: false as const };
    const { inkProductId: purchaseId, commerceStoreKey: purchaseStoreKey, ...shown } = display;
    return { ...shown, inkProductId, url: display.url, available: true, purchaseId, purchaseStoreKey };
  });
  return json({ items }, 200);
}

export function POST() {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: "GET" } });
}
