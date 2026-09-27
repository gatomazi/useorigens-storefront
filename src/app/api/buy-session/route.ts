import { resolveProductDisplay } from "@/lib/catalog/lookup";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { mintListSession } from "@/lib/favorites/session";
import { allow, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } as const;
const json = (body: unknown, status: number) => Response.json(body, { status, headers: HEADERS });

const VALID_STORE_KEYS: readonly CommerceStoreKey[] = ["use-sul", "use-norte", "use-centro", "use-origens"];
const MAX_ITEMS = 24; // matches LIST_SESSION_MAX_ITEMS

type Body = { storeKey?: unknown; inkProductIds?: unknown };

/**
 * POST /api/buy-session — "Comprar minha lista". Called from `/[region]/meus-lugares`, same origin, browser fetch.
 * Body: `{ storeKey, inkProductIds }` (both required, whitelisted, unknown fields ignored). The client only ever
 * supplies WHICH ids to buy; every id is re-validated against the live catalog here (never trusts price, title,
 * URL or availability from the page's own cached favorites) and anything no longer eligible is silently dropped —
 * "Comprar minha lista" always starts from a real, currently-buyable sequence, not a snapshot of stale claims.
 */
export async function POST(request: Request) {
  if (!allow("buy-session-create:" + clientKey(request.headers), 20, 60_000)) return json({ error: "rate_limited" }, 429);
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return json({ error: "bad_request" }, 400);

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const storeKey = body.storeKey;
  if (typeof storeKey !== "string" || !VALID_STORE_KEYS.includes(storeKey as CommerceStoreKey)) return json({ error: "bad_request" }, 400);
  if (!Array.isArray(body.inkProductIds) || body.inkProductIds.length === 0) return json({ error: "bad_request" }, 400);
  const requestedIds = body.inkProductIds.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(id)).slice(0, MAX_ITEMS);

  const eligible: string[] = [];
  let firstProductUrl: string | null = null;
  for (const id of requestedIds) {
    const display = resolveProductDisplay(storeKey as CommerceStoreKey, id);
    if (!display?.url) continue;
    eligible.push(id);
    if (!firstProductUrl) firstProductUrl = display.url;
  }
  if (eligible.length === 0 || !firstProductUrl) return json({ error: "no_eligible_items" }, 422);

  const sessionId = mintListSession(storeKey as CommerceStoreKey, eligible);
  if (!sessionId) return json({ error: "not_configured" }, 501);

  return json({ sessionId, firstProductUrl, total: eligible.length }, 201);
}

export function GET() {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: "POST" } });
}
