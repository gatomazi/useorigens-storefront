// Called by the garment sync CLI right AFTER it promoted a new garment-index.json. The CLI is a separate process
// (railway ssh / local shell), so it cannot call `revalidatePath` itself: the ISR cache lives in this server. This
// route only marks the affected city pages for revalidation; it never reads, writes or deletes the index, so a
// failure here leaves the promoted index exactly as it was (pages then refresh when their normal `revalidate`
// window expires, or on a retry of this call).
//
// POST only, Bearer-token gated with the same ADMIN_SYNC_TOKEN as /api/admin/catalog-sync. No token configured =>
// disabled (503), never silently open.
import { revalidatePath } from "next/cache";
import { adminSyncToken } from "@/lib/config/env";
import { isBearerAuthorized } from "@/lib/config/bearer";
import { GARMENT_REVALIDATE_STORES, revalidateGarmentCityPages } from "@/lib/catalog/garment-revalidate";
import type { CommerceStoreKey } from "@/lib/geo/regions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = adminSyncToken();
  if (!expected) return Response.json({ error: "revalidation endpoint disabled: ADMIN_SYNC_TOKEN is not configured" }, { status: 503 });
  if (!isBearerAuthorized(request, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let storeKeys: CommerceStoreKey[] = [];
  const bodyText = await request.text();
  if (bodyText) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return Response.json({ error: "body must be JSON" }, { status: 400 });
    }
    const requested = (parsed as { storeKeys?: unknown }).storeKeys;
    if (requested !== undefined) {
      if (!Array.isArray(requested) || requested.some((k) => typeof k !== "string" || !GARMENT_REVALIDATE_STORES.includes(k as CommerceStoreKey))) {
        return Response.json({ error: `storeKeys must be an array of: ${GARMENT_REVALIDATE_STORES.join(", ")}` }, { status: 400 });
      }
      storeKeys = requested as CommerceStoreKey[];
    }
  }

  try {
    const cities = revalidateGarmentCityPages(storeKeys, (path) => revalidatePath(path));
    return Response.json({ revalidated: true, storeKeys: storeKeys.length > 0 ? storeKeys : GARMENT_REVALIDATE_STORES, cities });
  } catch (err) {
    // Message only: never the raw error object.
    return Response.json({ error: `revalidation failed: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 500 });
  }
}
