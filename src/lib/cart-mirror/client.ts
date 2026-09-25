import { MAX_SNAPSHOT_AGE_SECONDS } from "./constants";
import type { CartMirrorSnapshot } from "./types";

export type MirrorResult =
  | { kind: "ok"; snapshot: CartMirrorSnapshot }
  /** 404, or a snapshot older than its TTL: the token is dead. */
  | { kind: "expired" }
  /** Outage, timeout or a malformed answer: the token may still be good. */
  | { kind: "error" };

const CLIENT_TIMEOUT_MS = 8_000;

/** Browser → OUR route only. The snapshot is returned to the caller's memory; nothing is written to any storage. */
export async function fetchMirror(ref: string, signal: AbortSignal): Promise<MirrorResult> {
  try {
    const response = await fetch(`/api/cart-mirror?ref=${encodeURIComponent(ref)}`, {
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.any([signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
    });
    if (response.status === 404) return { kind: "expired" };
    if (!response.ok) return { kind: "error" };
    const snapshot = (await response.json()) as CartMirrorSnapshot;
    if (typeof snapshot?.ageSeconds !== "number" || !Array.isArray(snapshot.items)) return { kind: "error" };
    return snapshot.ageSeconds > MAX_SNAPSHOT_AGE_SECONDS ? { kind: "expired" } : { kind: "ok", snapshot };
  } catch {
    return { kind: "error" };
  }
}
