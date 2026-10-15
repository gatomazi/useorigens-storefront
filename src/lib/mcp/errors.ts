/**
 * Stable error codes of the Use Origens MCP tools. A tool failure is returned as a tool result with `isError: true` and this code in its
 * body (the MCP way: the model reads it and can react), never as an HTTP error; transport and authentication errors keep their HTTP status
 * in the route (src/app/api/mcp/route.ts).
 */
export type McpErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "MISSING_SCOPE"
  | "MISSING_CREDENTIAL"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "INCOMPLETE_COVERAGE"
  | "CATALOG_UNAVAILABLE";

export class McpToolError extends Error {
  constructor(
    readonly code: McpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "McpToolError";
  }
}
