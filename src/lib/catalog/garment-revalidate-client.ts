import type { CommerceStoreKey } from "../geo/regions";
import type { GarmentSyncRunResult } from "./garment-sync-service";

export type RevalidationResult = { ok: true; cities: number } | { ok: false; error: string };

const REVALIDATE_PATH = "/api/admin/garment-index/revalidate";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type RevalidateDeps = { fetchImpl?: typeof fetch; timeoutMs?: number };

/**
 * Asks the running storefront to mark the affected city pages for revalidation. Never throws: every failure is a
 * value, because it happens AFTER the index was promoted and must not turn a good sync into a crash (nor touch the
 * index). The bearer token is only ever sent over https, or over plain http to the local machine.
 */
export async function requestGarmentRevalidation(baseUrl: string, token: string, storeKeys: readonly CommerceStoreKey[], deps: RevalidateDeps = {}): Promise<RevalidationResult> {
  let url: URL;
  try {
    url = new URL(REVALIDATE_PATH, baseUrl);
  } catch {
    return { ok: false, error: "GARMENT_REVALIDATE_URL is not a valid URL" };
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    return { ok: false, error: "refusing to send the admin token over plain http to a non-local host (use https)" };
  }
  try {
    const res = await (deps.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ storeKeys }),
      cache: "no-store",
      signal: AbortSignal.timeout(deps.timeoutMs ?? 60_000),
    });
    if (!res.ok) return { ok: false, error: `revalidation endpoint answered ${res.status}` };
    const body = (await res.json()) as { cities?: unknown };
    return { ok: true, cities: typeof body.cities === "number" ? body.cities : 0 };
  } catch (err) {
    return { ok: false, error: `revalidation request failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

export type PostSyncRevalidation =
  | { requested: false; reason: string }
  | { requested: true; stores: CommerceStoreKey[]; result: RevalidationResult };

/**
 * Last step of "download, validate, promote, revalidate": runs only after `runGarmentSync` has already written the
 * index atomically. Stores whose pass changed the index are revalidated; nothing else is touched. Without a
 * configured URL/token it does not guess a target, it says so.
 */
export async function revalidateAfterPromotion(run: GarmentSyncRunResult, env: { baseUrl?: string; token?: string }, deps: RevalidateDeps = {}): Promise<PostSyncRevalidation> {
  const stores = run.outcomes.filter((o) => o.ok && (o.newGarmentBindings > 0 || o.completedFullPass)).map((o) => o.storeKey);
  if (stores.length === 0) return { requested: false, reason: "no store changed the index" };
  if (!env.baseUrl || !env.token) return { requested: false, reason: "GARMENT_REVALIDATE_URL and ADMIN_SYNC_TOKEN are not both set" };
  return { requested: true, stores, result: await requestGarmentRevalidation(env.baseUrl, env.token, stores, deps) };
}
