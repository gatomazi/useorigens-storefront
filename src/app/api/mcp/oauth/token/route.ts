import { allow, clientKey } from "@/lib/admin/auth/rate-limit";
import { jsonResponse, preflight, readBody } from "@/lib/mcp/auth/http";
import { exchangeToken } from "@/lib/mcp/auth/oauth";
import { mcpResource, oauthStore, subjectAllowed } from "@/lib/mcp/auth/resource";

export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024;
const PURGE_EVERY_MS = 60 * 60_000;
const g = globalThis as unknown as { __uoMcpLastPurge?: number };

/**
 * Token endpoint (RFC 6749 §3.2, form-encoded): authorization_code with PKCE, and refresh_token with rotation. Expired rows are purged
 * at most once an hour, after answering, so the exchange itself stays a few queries.
 */
export async function POST(request: Request) {
  const where = mcpResource(request);
  if (!where) return new Response(null, { status: 404 });
  if (!allow(`mcp-token:${clientKey(request.headers)}`, 120, 60_000)) return jsonResponse({ error: "slow_down", error_description: "too many token requests" }, 429, { "Retry-After": "60" });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return jsonResponse({ error: "invalid_request", error_description: "the body must be application/x-www-form-urlencoded" }, 400);
  }
  const text = await readBody(request, MAX_BODY);
  if (text === null) return jsonResponse({ error: "invalid_request", error_description: "body too large" }, 413);
  const store = oauthStore();
  const now = Date.now();
  try {
    const outcome = await exchangeToken(store, new URLSearchParams(text), { resource: where.resource, now, subjectAllowed });
    if ((g.__uoMcpLastPurge ?? 0) < now - PURGE_EVERY_MS) {
      g.__uoMcpLastPurge = now;
      void store.purgeExpired(now).catch(() => undefined);
    }
    return jsonResponse(outcome.body, outcome.status, outcome.status === 401 ? { "WWW-Authenticate": 'Basic realm="mcp"' } : {});
  } catch {
    // Never answer invalid_grant for an infrastructure failure: Claude would drop a still-valid refresh token.
    return jsonResponse({ error: "temporarily_unavailable" }, 503, { "Retry-After": "10" });
  }
}

export const OPTIONS = preflight;
