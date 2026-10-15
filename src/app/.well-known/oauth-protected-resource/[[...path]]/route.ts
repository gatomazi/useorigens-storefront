import { MCP_SCOPE } from "@/lib/mcp/auth/oauth";
import { jsonResponse, preflight } from "@/lib/mcp/auth/http";
import { mcpResource } from "@/lib/mcp/auth/resource";

export const dynamic = "force-dynamic";

/**
 * Protected resource metadata of the MCP endpoint (RFC 9728), at the path-inserted location the 401 points to
 * (`/.well-known/oauth-protected-resource/api/mcp`) and at the bare one clients probe as a fallback. `resource` is exactly the URL the
 * owner types into Claude. Anywhere the MCP does not exist (another host, admin off) this is a 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const where = mcpResource(request);
  if (!where || !(path.length === 0 || (path.length === 2 && path[0] === "api" && path[1] === "mcp"))) return new Response(null, { status: 404 });
  return jsonResponse(
    {
      resource: where.resource,
      authorization_servers: [where.issuer],
      scopes_supported: [MCP_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Use Origens",
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}

export const OPTIONS = preflight;
