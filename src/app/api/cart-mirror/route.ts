import { isRegionSlug } from "@/lib/geo/regions";
import { isValidRef, resolveCartRef } from "@/lib/cart-mirror/resolve";

// Per-visitor, per-token data: never prerendered, never cached by us or by anything in front of us.
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

const json = (body: unknown, status: number) => Response.json(body, { status, headers: HEADERS });

/**
 * GET /api/cart-mirror?ref=<22-char token>[&region=sul|norte|centro-oeste] — the storefront's only door to the INK cart snapshot
 * (docs/storefront-cart-mirror-contract.md). The browser never calls the Worker itself. `region` (default "sul") selects the region's own
 * Worker, the only one that can hold the token; any other value is a plain 404 (never a lookup somewhere else).
 *  200 snapshot · 404 invalid/unknown/expired token (indistinguishable on purpose) · 502 upstream trouble, no detail.
 * The token is not logged anywhere in this path.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ref = params.get("ref");
  const region = params.get("region") ?? "sul";
  if (!isValidRef(ref) || !isRegionSlug(region)) return json({ error: "not_found" }, 404);

  const result = await resolveCartRef(ref, fetch, region);
  if (result.status === "ok") return json(result.snapshot, 200);
  if (result.status === "not_found") return json({ error: "not_found" }, 404);
  return json({ error: "unavailable" }, 502);
}

export function POST() {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: "GET" } });
}
