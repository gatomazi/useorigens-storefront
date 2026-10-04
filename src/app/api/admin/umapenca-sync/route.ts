// Uma Penca feed sync ("outros artigos": canecas, ecobags). One read-only GET of UMAPENCA_FEED_URL, parsed and promoted to
// umapenca-snapshot.json on the Volume, then the page is revalidated. Unlike catalog/garments sync there is no background job:
// it is a single small request (20 s timeout), so the answer carries the result directly. Meant to be POSTed by a Railway Cron
// service, the same way garments-sync is.
//
// POST only, Bearer ADMIN_SYNC_TOKEN (unset => 503, never open). No body.
import { revalidatePath } from "next/cache";
import { adminSyncToken } from "@/lib/config/env";
import { isBearerAuthorized } from "@/lib/config/bearer";
import { syncUmaPenca } from "@/lib/umapenca/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = adminSyncToken();
  if (!expected) return Response.json({ error: "umapenca sync disabled: ADMIN_SYNC_TOKEN is not configured" }, { status: 503 });
  if (!isBearerAuthorized(request, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const result = await syncUmaPenca();
  if (!result.ok) return Response.json(result, { status: 502 });
  if (result.changed) revalidatePath("/[region]/outros-artigos", "page");
  return Response.json(result);
}
