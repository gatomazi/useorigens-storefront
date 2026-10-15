import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { MCP_CORS_HEADERS, preflight } from "@/lib/mcp/auth/http";
import { authenticateMcpRequest } from "@/lib/mcp/auth/resource";
import { createUseOrigensMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

/**
 * The MCP endpoint (Streamable HTTP, stateless): https://www.useorigens.com.br/api/mcp, the URL the owner adds in Claude. Authentication
 * runs BEFORE the SDK sees the request: no valid access token → 401 with the protected resource metadata pointer (how Claude starts the
 * OAuth flow, src/lib/mcp/auth/resource.ts); another host → 404. Each request gets its own server bound to its grant, answers in JSON (no
 * SSE stream: every tool is a single bounded read) and is closed right after. `/api/**` is outside the proxy, so the host rule lives in
 * `authenticateMcpRequest` itself.
 */
async function handle(request: Request): Promise<Response> {
  const auth = await authenticateMcpRequest(request);
  if (!auth.ok) return auth.response;
  const { grant } = auth;
  const server = createUseOrigensMcpServer(grant);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, {
      // The token itself is never handed to the tools.
      authInfo: { token: "[redacted]", clientId: grant.clientId, scopes: grant.scopes, expiresAt: grant.expiresAt, resource: new URL(grant.resource), extra: { subject: grant.subject } },
    });
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(MCP_CORS_HEADERS)) headers.set(k, v);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
