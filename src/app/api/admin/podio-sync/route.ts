// Daily "Pódio" calculation, meant to be POSTed by a Railway Cron service once per night (America/Sao_Paulo), after the catalog/garments
// sync — see docs/storefront/podio.md. Reads paid orders from each region's INK store (GET only), maps them through the catalog snapshot,
// publishes podio/<region>/latest.json atomically, then revalidates the region home and its state pages (the only pages that show it).
//
// A normal run is a handful of GETs (~5 pages for the three stores at 1.5 s), so the answer carries the result directly, like
// umapenca-sync. A second POST while one runs gets 409.
//
// POST only, Bearer ADMIN_SYNC_TOKEN (unset => 503, never open). No body.
import { revalidatePath } from "next/cache";
import { adminSyncToken } from "@/lib/config/env";
import { isBearerAuthorized } from "@/lib/config/bearer";
import { REGIONS } from "@/lib/geo/regions";
import { PodioSyncRunningError, syncPodio } from "@/lib/podio/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = adminSyncToken();
  if (!expected) return Response.json({ error: "podio sync disabled: ADMIN_SYNC_TOKEN is not configured" }, { status: 503 });
  if (!isBearerAuthorized(request, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let results;
  try {
    results = await syncPodio();
  } catch (err) {
    if (err instanceof PodioSyncRunningError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
  for (const r of results) {
    if (!r.ok) continue;
    revalidatePath(`/${r.region}`);
    for (const uf of REGIONS[r.region].ufs) revalidatePath(`/${r.region}/${uf.toLowerCase()}`);
  }
  const allOk = results.every((r) => r.ok);
  return Response.json({ ok: allOk, results }, { status: allOk ? 200 : 502 });
}
