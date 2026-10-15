import { allow, clientKey } from "@/lib/admin/auth/rate-limit";
import { jsonResponse, preflight, readBody } from "@/lib/mcp/auth/http";
import { registerClient } from "@/lib/mcp/auth/oauth";
import { mcpResource, oauthStore } from "@/lib/mcp/auth/resource";

export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024;

/**
 * Dynamic client registration (RFC 7591) for Claude: public clients only, redirect URIs restricted to Claude's callback and loopback
 * (src/lib/mcp/auth/oauth.ts). Registering grants nothing by itself: every authorization still needs the owner's consent.
 */
export async function POST(request: Request) {
  if (!mcpResource(request)) return new Response(null, { status: 404 });
  if (!allow(`mcp-register:${clientKey(request.headers)}`, 20, 10 * 60_000)) return jsonResponse({ error: "slow_down", error_description: "too many registrations" }, 429, { "Retry-After": "600" });
  const text = await readBody(request, MAX_BODY);
  if (text === null) return jsonResponse({ error: "invalid_client_metadata", error_description: "body too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonResponse({ error: "invalid_client_metadata", error_description: "the body must be JSON" }, 400);
  }
  try {
    const outcome = await registerClient(oauthStore(), body);
    return jsonResponse(outcome.body, outcome.status);
  } catch {
    return jsonResponse({ error: "temporarily_unavailable" }, 503, { "Retry-After": "10" });
  }
}

export const OPTIONS = preflight;
