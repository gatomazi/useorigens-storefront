import { createHash } from "node:crypto";
import { McpToolError } from "./errors";

/**
 * Opaque continuation for list tools: the offset plus a fingerprint of the query it belongs to, so a cursor can never be replayed against
 * other filters (it is then refused as INVALID_INPUT instead of silently paging another result).
 */
const fingerprint = (query: unknown) => createHash("sha256").update(JSON.stringify(query)).digest("base64url").slice(0, 12);

export function encodeCursor(offset: number, query: unknown): string {
  return Buffer.from(JSON.stringify({ o: offset, q: fingerprint(query) })).toString("base64url");
}

export function decodeCursor(cursor: string | undefined, query: unknown): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown; q?: unknown };
    if (typeof parsed.o === "number" && Number.isInteger(parsed.o) && parsed.o >= 0 && parsed.q === fingerprint(query)) return parsed.o;
  } catch {
    // falls through
  }
  throw new McpToolError("INVALID_INPUT", "Cursor inválido ou de outra consulta: repita a consulta sem cursor.");
}

export function page<T>(items: readonly T[], offset: number, limit: number, query: unknown): { items: T[]; next_cursor: string | null } {
  const slice = items.slice(offset, offset + limit);
  return { items: slice, next_cursor: offset + limit < items.length ? encodeCursor(offset + limit, query) : null };
}
