import { platform } from "@/lib/admin/platform";
import { allow, clientKey } from "@/lib/admin/auth/rate-limit";
import { jsonResponse, MCP_CORS_HEADERS, NO_STORE, preflight, readBody } from "@/lib/mcp/auth/http";
import { revokeToken } from "@/lib/mcp/auth/oauth";
import { mcpResource, oauthStore } from "@/lib/mcp/auth/resource";

export const dynamic = "force-dynamic";

/** Token revocation (RFC 7009): revokes the whole authorization the token belongs to. 200 whether or not the token was known. */
export async function POST(request: Request) {
  if (!mcpResource(request)) return new Response(null, { status: 404 });
  if (!allow(`mcp-revoke:${clientKey(request.headers)}`, 60, 60_000)) return jsonResponse({ error: "slow_down" }, 429, { "Retry-After": "60" });
  const text = await readBody(request, 8 * 1024);
  if (text === null) return jsonResponse({ error: "invalid_request", error_description: "body too large" }, 413);
  try {
    const { status, revoked } = await revokeToken(oauthStore(), new URLSearchParams(text), Date.now());
    if (revoked > 0) await platform().audit.record({ actor: "system", action: "mcp.revoke", meta: { tokens: revoked, via: "revocation_endpoint" } }).catch(() => undefined);
    return new Response(null, { status, headers: { ...MCP_CORS_HEADERS, ...NO_STORE } });
  } catch {
    return jsonResponse({ error: "temporarily_unavailable" }, 503, { "Retry-After": "10" });
  }
}

export const OPTIONS = preflight;
