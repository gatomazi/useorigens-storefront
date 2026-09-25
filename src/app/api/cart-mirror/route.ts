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
 * GET /api/cart-mirror?ref=<22-char token> — the storefront's only door to the INK cart snapshot
 * (docs/storefront-cart-mirror-contract.md). The browser never calls the Worker itself.
 *  200 snapshot · 404 invalid/unknown/expired token (indistinguishable on purpose) · 502 upstream trouble, no detail.
 * The token is not logged anywhere in this path.
 */
export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref");
  if (!isValidRef(ref)) return json({ error: "not_found" }, 404);

  const result = await resolveCartRef(ref);
  if (result.status === "ok") return json(result.snapshot, 200);
  if (result.status === "not_found") return json({ error: "not_found" }, 404);
  return json({ error: "unavailable" }, 502);
}

export function POST() {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: "GET" } });
}
