/**
 * HTTP details shared by the MCP OAuth endpoints. None of them reads a cookie, so a wildcard CORS origin is safe and lets browser-based
 * clients (the MCP Inspector) run the flow; the authorize page under /admin is a normal same-origin page and gets none of this.
 */
export const MCP_CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "600",
};

export const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

export const preflight = (): Response => new Response(null, { status: 204, headers: MCP_CORS_HEADERS });

export const jsonResponse = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  Response.json(body, { status, headers: { ...MCP_CORS_HEADERS, ...NO_STORE, ...extra } });

/** Reads a request body up to `max` bytes; null when it is larger (declared or actual). */
export async function readBody(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) return null;
  const text = await request.text();
  return Buffer.byteLength(text) > max ? null : text;
}
