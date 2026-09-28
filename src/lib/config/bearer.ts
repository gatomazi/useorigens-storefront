import { timingSafeEqual } from "node:crypto";

/** `Authorization: Bearer <token>` check with a constant-time compare (a length mismatch alone must not short-circuit into a timing signal). */
export function isBearerAuthorized(request: Request, expected: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
