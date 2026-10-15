import "server-only";
import { adminConfig, isAdminHost } from "../../admin/config";
import { DEV_ACTOR } from "../../admin/auth/guard";
import { checkDevAdminRequest } from "../../admin/dev-guard";
import { platform } from "../../admin/platform";
import { MCP_SCOPE, verifyAccessToken } from "./oauth";
import { pgOAuthStore } from "./pg-store";
import { memoryOAuthStore, type OAuthStore } from "./store";
import { MCP_CORS_HEADERS } from "./http";

export { MCP_SCOPE } from "./oauth";

/**
 * Where the MCP connector exists, which store backs its OAuth, and the check every MCP request goes through (docs/mcp/README.md).
 * The connector lives exactly where the admin lives: the production ADMIN_HOST (https://www.useorigens.com.br) or a loopback development
 * server with ADMIN_DEV_MODE. On any other host, or with the admin off, every MCP and OAuth endpoint is a plain 404. The resource URL is
 * always built from configuration (prod) or the verified loopback Host (dev), never from what a request claims to be.
 */

/** Validated grant of an access token. */
export type McpGrant = { subject: string; email: string; clientId: string; scopes: string[]; expiresAt: number /* epoch s */; resource: string };

type HeaderSource = { get(name: string): string | null };

export function mcpResourceFromHeaders(headers: HeaderSource): { resource: string; origin: string; issuer: string } | null {
  const config = adminConfig();
  let origin: string;
  if (config.mode === "dev") {
    if (!checkDevAdminRequest(headers).ok) return null;
    origin = `http://${(headers.get("host") ?? "").trim().toLowerCase()}`;
  } else if (config.mode === "prod") {
    if (!isAdminHost(headers.get("host"), config.adminHost)) return null;
    origin = config.adminOrigin;
  } else {
    return null;
  }
  return { resource: `${origin}/api/mcp`, origin, issuer: origin };
}

/** Canonical MCP resource URL for this request, or null when the MCP does not exist in this process/host. */
export function mcpResource(request: Request): { resource: string; origin: string; issuer: string } | null {
  return mcpResourceFromHeaders(request.headers);
}

const g = globalThis as unknown as { __uoMcpOAuthStore?: OAuthStore };

/** Postgres in production (the admin's database); in memory on the development server (kept across hot reloads, lost on restart). */
export function oauthStore(): OAuthStore {
  const p = platform();
  if (p.mode === "prod" && p.db) return pgOAuthStore(p.db);
  g.__uoMcpOAuthStore ??= memoryOAuthStore();
  return g.__uoMcpOAuthStore;
}

/** The account behind a grant, only while it is still an ACTIVE OWNER: deactivating or demoting the owner cuts every connection at once. */
export async function ownerAccount(subject: string): Promise<{ email: string } | null> {
  const p = platform();
  if (p.mode === "dev") return subject === DEV_ACTOR.id ? { email: DEV_ACTOR.email } : null;
  const user = await p.users?.findById(subject);
  return user && user.active && user.role === "owner" ? { email: user.email } : null;
}

export const subjectAllowed = async (subject: string): Promise<boolean> => (await ownerAccount(subject)) !== null;

/** Where the protected resource metadata of the MCP endpoint lives (RFC 9728, path-inserted form). */
export const resourceMetadataUrl = (origin: string): string => `${origin}/.well-known/oauth-protected-resource/api/mcp`;

function challenge(origin: string, status: 401 | 403, error: "invalid_token" | "insufficient_scope" | null, description: string): Response {
  const parts = [`resource_metadata="${resourceMetadataUrl(origin)}"`, `scope="${MCP_SCOPE}"`];
  if (error) parts.unshift(`error="${error}"`);
  return Response.json(
    { error: error ?? "unauthorized", error_description: description },
    { status, headers: { ...MCP_CORS_HEADERS, "WWW-Authenticate": `Bearer ${parts.join(", ")}`, "Cache-Control": "no-store" } },
  );
}

/** Reads `Authorization: Bearer`, validates it (hash, expiry, revocation, resource, scope, subject still an active owner). */
export async function authenticateMcpRequest(request: Request): Promise<{ ok: true; grant: McpGrant } | { ok: false; response: Response }> {
  const where = mcpResource(request);
  if (!where) return { ok: false, response: new Response(null, { status: 404 }) };
  const header = request.headers.get("authorization");
  if (!header) return { ok: false, response: challenge(where.origin, 401, null, "authentication required") };
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(header.trim());
  if (!match) return { ok: false, response: challenge(where.origin, 401, "invalid_token", "malformed Authorization header") };
  try {
    const verified = await verifyAccessToken(oauthStore(), match[1], { resource: where.resource, now: Date.now() });
    if (!verified.ok) {
      return { ok: false, response: verified.error === "insufficient_scope" ? challenge(where.origin, 403, "insufficient_scope", `the ${MCP_SCOPE} scope is required`) : challenge(where.origin, 401, "invalid_token", "the access token is invalid or expired") };
    }
    const account = await ownerAccount(verified.record.subject);
    if (!account) return { ok: false, response: challenge(where.origin, 401, "invalid_token", "the authorizing account no longer has access") };
    const r = verified.record;
    return { ok: true, grant: { subject: r.subject, email: account.email, clientId: r.clientId, scopes: r.scope, expiresAt: Math.floor(r.expiresAt / 1000), resource: r.resource } };
  } catch {
    // The store (database) is unreachable: never let a request through, never 401 (that would make Claude discard a valid token).
    return { ok: false, response: Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: { ...MCP_CORS_HEADERS, "Cache-Control": "no-store", "Retry-After": "10" } }) };
  }
}
