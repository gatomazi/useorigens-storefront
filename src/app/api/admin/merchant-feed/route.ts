// Google Merchant feed, by hand: POST judges the covers not judged yet and regenerates the feed (src/lib/merchant/generate.ts), the same
// step the daily job runs after the single store's catalog. The first run judges every cover (~17 mil images from INK's CDN, minutes), so
// POST starts it in the background and answers 202; GET reports the last generation and whether one is running. Right after the first
// deploy the daily sync has not written the source yet: the POST then reads it from INK itself (~180 GETs, under the daily job's lock).
//
// Bearer ADMIN_SYNC_TOKEN (unset => 503, never open).
import { adminSyncToken } from "@/lib/config/env";
import { isBearerAuthorized } from "@/lib/config/bearer";
import { singleStoreDataDir } from "@/lib/catalog/commerce-mode";
import { readFeedReport } from "@/lib/merchant/files";
import { merchantFeedRunning, refreshMerchantFeed } from "@/lib/merchant/generate";

export const dynamic = "force-dynamic";

function guard(request: Request): Response | null {
  const expected = adminSyncToken();
  if (!expected) return Response.json({ error: "merchant feed disabled: ADMIN_SYNC_TOKEN is not configured" }, { status: 503 });
  if (!isBearerAuthorized(request, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const already = merchantFeedRunning();
  void refreshMerchantFeed({ readSourceIfMissing: true }).then((r) => console.log(JSON.stringify({ scope: "merchant-feed", event: "manual-refresh", ...r })));
  return Response.json({ started: !already, running: true }, { status: 202 });
}

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return Response.json({ running: merchantFeedRunning(), report: await readFeedReport(singleStoreDataDir()) });
}
