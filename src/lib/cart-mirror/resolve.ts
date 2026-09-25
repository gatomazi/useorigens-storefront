import "server-only";
import { CART_REF_PATTERN, MAX_SNAPSHOT_AGE_SECONDS, UPSTREAM_CART_REF_URL, UPSTREAM_MAX_BODY_BYTES, UPSTREAM_TIMEOUT_MS } from "./constants";
import { parseSnapshot } from "./schema";
import type { CartMirrorSnapshot } from "./types";

export type ResolveResult =
  | { status: "ok"; snapshot: CartMirrorSnapshot }
  /** Invalid, unknown, expired or not served (404 upstream): the visitor sees the neutral state. */
  | { status: "not_found" }
  /** Timeout, network error, 5xx, oversized or malformed answer. Deliberately carries no detail. */
  | { status: "unavailable" };

export function isValidRef(ref: unknown): ref is string {
  return typeof ref === "string" && CART_REF_PATTERN.test(ref);
}

async function readCapped(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > UPSTREAM_MAX_BODY_BYTES) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > UPSTREAM_MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Server-side lookup of a cart reference at the Worker. The request carries nothing from the visitor: no cookies, no
 * Authorization, no forwarded headers. The `ref` is never logged, and nothing about the failure reaches the caller.
 * `fetchImpl` exists for tests only.
 */
export async function resolveCartRef(ref: string, fetchImpl: typeof fetch = fetch): Promise<ResolveResult> {
  if (!isValidRef(ref)) return { status: "not_found" };
  try {
    const response = await fetchImpl(UPSTREAM_CART_REF_URL + ref, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
      headers: {},
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (response.status === 404) return { status: "not_found" };
    if (response.status !== 200) return { status: "unavailable" };
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return { status: "unavailable" };

    const body = await readCapped(response);
    if (body === null) return { status: "unavailable" };
    const snapshot = parseSnapshot(JSON.parse(body));
    if (!snapshot) return { status: "unavailable" };
    if (snapshot.ageSeconds > MAX_SNAPSHOT_AGE_SECONDS || snapshot.expiresInSeconds <= 0) return { status: "not_found" };
    return { status: "ok", snapshot };
  } catch {
    // Timeout, DNS/TLS failure or invalid JSON. Not logged with detail: error messages can embed the URL (and so the ref).
    return { status: "unavailable" };
  }
}
