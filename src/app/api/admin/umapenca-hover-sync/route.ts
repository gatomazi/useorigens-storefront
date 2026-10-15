// MANUAL fetch of the Uma Penca hover photos (the second photo a caneca/ecobag card shows under the pointer). Never scheduled: the
// photos are read once from each product page and kept in umapenca-hover.json (src/lib/umapenca/hover.ts). Only articles without a
// photo are fetched; `?refresh=1` fetches every article again. One GET per product page, in sequence.
//
// POST only, Bearer ADMIN_SYNC_TOKEN (unset => 503, never open). No body.
import { revalidatePath } from "next/cache";
import { adminSyncToken } from "@/lib/config/env";
import { isBearerAuthorized } from "@/lib/config/bearer";
import { syncUmaPencaHover } from "@/lib/umapenca/hover";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = adminSyncToken();
  if (!expected) return Response.json({ error: "umapenca hover sync disabled: ADMIN_SYNC_TOKEN is not configured" }, { status: 503 });
  if (!isBearerAuthorized(request, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const result = await syncUmaPencaHover({ refresh });
  if (!result.ok) return Response.json(result, { status: 502 });
  // Hover photos show on home carousels and on "outros artigos", so every region page.
  if (result.fetched.length > 0) revalidatePath("/[region]", "layout");
  return Response.json(result);
}
