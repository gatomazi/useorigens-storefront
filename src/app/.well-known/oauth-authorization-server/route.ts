import { SUPPORTED_SCOPES } from "@/lib/mcp/auth/oauth";
import { jsonResponse, preflight } from "@/lib/mcp/auth/http";
import { mcpResource } from "@/lib/mcp/auth/resource";

export const dynamic = "force-dynamic";

/**
 * Authorization server metadata (RFC 8414) of the MCP connector. Registration is DCR only: `client_id_metadata_document_supported` is
 * deliberately absent, so Claude registers through `registration_endpoint`. `offline_access` is listed so Claude asks for it (it then
 * expects a refresh token). Same host rule as the resource: a 404 anywhere the MCP does not exist.
 */
export async function GET(request: Request) {
  const where = mcpResource(request);
  if (!where) return new Response(null, { status: 404 });
  const o = where.origin;
  return jsonResponse(
    {
      issuer: where.issuer,
      authorization_endpoint: `${o}/admin/oauth/authorize`,
      token_endpoint: `${o}/api/mcp/oauth/token`,
      registration_endpoint: `${o}/api/mcp/oauth/register`,
      revocation_endpoint: `${o}/api/mcp/oauth/revoke`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: SUPPORTED_SCOPES,
      authorization_response_iss_parameter_supported: true,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}

export const OPTIONS = preflight;
