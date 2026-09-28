// Daily incremental garment-piece sync, triggered by a Railway Cron service (03:30 America/Sao_Paulo = 06:30 UTC).
// The cron service only POSTs here; THIS process owns the Volume, talks to INK (read-only), promotes the index
// atomically and revalidates the affected pages. Same job pattern as /api/admin/catalog-sync: POST answers 202 at
// once and runs the job via `after()`, GET reports the current/last job — never a request held open for minutes.
//
// Concurrency: the in-memory job lock is shared with catalog-sync (a second POST gets 409), and the run itself
// also takes an exclusive lock file on the Volume, so a CLI run cannot overlap it either.
//
// POST only, Bearer ADMIN_SYNC_TOKEN (the same secret as catalog-sync; unset => 503, never open). The body is
// optional and only accepts `storeKeys`, checked against a fixed list — nothing else can steer the job.
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { adminSyncToken } from "@/lib/config/env";
import { isBearerAuthorized } from "@/lib/config/bearer";
import { GARMENT_REVALIDATE_STORES } from "@/lib/catalog/garment-revalidate";
import { lastGarmentSyncRun, runGarmentSyncJob } from "@/lib/catalog/garment-sync-runner";
import { beginSyncJob, currentSyncJob, SyncAlreadyRunningError } from "@/lib/catalog/sync-job";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { REGION_SLUGS } from "@/lib/geo/regions";

export const dynamic = "force-dynamic";

function guard(request: Request): Response | null {
  const expected = adminSyncToken();
  if (!expected) return Response.json({ error: "garments sync disabled: ADMIN_SYNC_TOKEN is not configured" }, { status: 503 });
  if (!isBearerAuthorized(request, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

/** The base catalog changed: same invalidation `catalog-sync` performs after its own promotion. */
function revalidateCatalogPages(): void {
  revalidatePath("/[region]", "layout");
  for (const region of REGION_SLUGS) revalidatePath(`/api/cidades/${region}`);
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;

  let storeKeys: CommerceStoreKey[] = [];
  const bodyText = await request.text();
  if (bodyText) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return Response.json({ error: "body must be JSON" }, { status: 400 });
    }
    const body = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== "storeKeys")) return Response.json({ error: "only storeKeys is accepted" }, { status: 400 });
    if (body.storeKeys !== undefined) {
      if (!Array.isArray(body.storeKeys) || body.storeKeys.some((k) => typeof k !== "string" || !GARMENT_REVALIDATE_STORES.includes(k as CommerceStoreKey))) {
        return Response.json({ error: `storeKeys must be an array of: ${GARMENT_REVALIDATE_STORES.join(", ")}` }, { status: 400 });
      }
      storeKeys = body.storeKeys as CommerceStoreKey[];
    }
  }

  let running: ReturnType<typeof beginSyncJob>;
  try {
    running = beginSyncJob(storeKeys);
  } catch (err) {
    if (err instanceof SyncAlreadyRunningError) return Response.json({ status: "already-running", startedAt: err.running.startedAt }, { status: 409 });
    throw err;
  }

  after(() =>
    runGarmentSyncJob(running, {
      storeKeys,
      onCatalogChanged: revalidateCatalogPages,
      revalidatePaths: (paths) => {
        for (const path of paths) revalidatePath(path);
      },
    }),
  );

  return Response.json({ status: "accepted", startedAt: running.startedAt, checkStatusWith: "GET this same URL, authenticated" }, { status: 202 });
}

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return Response.json({ job: currentSyncJob(), lastRun: lastGarmentSyncRun() });
}
