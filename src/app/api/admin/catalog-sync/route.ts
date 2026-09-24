// Manual, authenticated catalog refresh — the "prever refresh manual autenticado" option from the infra
// command, built because the audit found a real gap: the INK snapshot (data/generated/) is gitignored, so a
// fresh Railway deploy has none, and nothing else in this app ever calls INK again after that.
//
// Async job, not a synchronous long request (bootstrap review §4): Railway's public proxy closes an HTTP
// request after 5 minutes with no data transferred, and a full multi-store sync can run close to or past
// that (paced at 1.5s/page against INK's rate limit — see src/lib/ink/client.ts). POST starts the sync via
// `after()` (runs after this response is sent, still inside Next's request machinery — see
// https://nextjs.org/docs/app/api-reference/functions/after) and replies 202 immediately; GET reports the
// current/last job's status. A caller must poll GET and check the result, not treat 202 as "done" (documented
// in docs/deploy/railway.md).
//
// Concurrency lock (sync-job.ts): a second POST while one is running gets 409, not a second sync stepping on
// the first — this app runs as a single instance by construction (Railway does not allow replicas on a
// service with a Volume attached), so an in-memory lock is sufficient, no external lock needed.
//
// After a successful promotion, revalidatePath clears the ISR cache for every page that reads the catalog —
// writing the new file alone does NOT do this; `revalidate = 3600` on those pages is a separate cache layer
// (see docs/deploy/infra-audit-review.md §3 for why the earlier "mtime invalidates everything" claim was
// wrong). One call per region for the whole page tree (`/[region]`, layout) plus one per region's search
// index route — never one call per city/PDP, which would be thousands.
//
// POST only, Bearer-token gated. No ADMIN_SYNC_TOKEN configured => the route stays disabled (503), never
// silently open. Read-only against INK (syncCatalog only ever GETs); this never writes to INK.
import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { adminSyncToken, allowFixtureSync } from "@/lib/config/env";
import { promoteSnapshot, syncCatalog, type SyncResult } from "@/lib/catalog/sync-service";
import { syncCollections } from "@/lib/catalog/collections-sync";
import { beginSyncJob, currentSyncJob, finishSyncJobFailure, finishSyncJobSuccess, SyncAlreadyRunningError, type CollectionsStep } from "@/lib/catalog/sync-job";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { ENABLED_REGIONS } from "@/lib/site";

export const dynamic = "force-dynamic";

const VALID_STORE_KEYS: readonly CommerceStoreKey[] = ["use-sul", "use-norte", "use-centro", "use-origens"];

function isAuthorized(request: Request, expected: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  // Constant-time compare: a length mismatch alone must not short-circuit into a timing signal.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Clears the ISR cache for everything that reads the catalog — home, state, city, PDP (one page tree per
 * region) and each region's search index route. Never touches unrelated pages, never enumerates cities. */
function revalidateCatalogPages(): void {
  revalidatePath("/[region]", "layout");
  for (const region of ENABLED_REGIONS) revalidatePath(`/api/cidades/${region}`);
}

export async function POST(request: Request) {
  const expected = adminSyncToken();
  if (!expected) {
    return Response.json({ error: "sync endpoint disabled: ADMIN_SYNC_TOKEN is not configured" }, { status: 503 });
  }
  if (!isAuthorized(request, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const bodyText = await request.text();
  let storeKeys: CommerceStoreKey[] = [];
  let fixtureSnapshot: CatalogSnapshot | undefined;
  let fixtureSyncDelayMs = 0;
  let withCollections = false;
  if (bodyText) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return Response.json({ error: "body must be JSON" }, { status: 400 });
    }
    const body = parsed as { storeKeys?: unknown; fixtureSnapshot?: unknown; fixtureSyncDelayMs?: unknown; withCollections?: unknown };
    if (body.withCollections !== undefined) {
      if (typeof body.withCollections !== "boolean") return Response.json({ error: "withCollections must be a boolean" }, { status: 400 });
      withCollections = body.withCollections;
    }
    if (body.storeKeys !== undefined) {
      if (!Array.isArray(body.storeKeys) || body.storeKeys.some((k) => typeof k !== "string" || !VALID_STORE_KEYS.includes(k as CommerceStoreKey))) {
        return Response.json({ error: `storeKeys must be an array of: ${VALID_STORE_KEYS.join(", ")}` }, { status: 400 });
      }
      storeKeys = body.storeKeys as CommerceStoreKey[];
    }
    if (body.fixtureSnapshot !== undefined) {
      if (!allowFixtureSync()) {
        return Response.json({ error: "fixtureSnapshot is disabled (ALLOW_FIXTURE_SYNC is not \"true\") — testing only, never enable in production" }, { status: 400 });
      }
      if (storeKeys.length > 0) {
        return Response.json({ error: "storeKeys and fixtureSnapshot are mutually exclusive" }, { status: 400 });
      }
      fixtureSnapshot = body.fixtureSnapshot as CatalogSnapshot;
    }
    // Test-only (bootstrap review §2, staging gate §2): an artificial delay before promotion, so
    // scripts/verify-bootstrap.mts can deterministically kill the process mid-job and prove the snapshot
    // survives untouched. Same gate as fixtureSnapshot — never available unless ALLOW_FIXTURE_SYNC="true".
    if (body.fixtureSyncDelayMs !== undefined) {
      if (!allowFixtureSync() || typeof body.fixtureSyncDelayMs !== "number" || body.fixtureSyncDelayMs < 0 || body.fixtureSyncDelayMs > 60_000) {
        return Response.json({ error: "fixtureSyncDelayMs is disabled or invalid (0-60000, testing only)" }, { status: 400 });
      }
      fixtureSyncDelayMs = body.fixtureSyncDelayMs;
    }
  }

  let running: ReturnType<typeof beginSyncJob>;
  try {
    running = beginSyncJob(storeKeys);
  } catch (err) {
    if (err instanceof SyncAlreadyRunningError) {
      return Response.json({ error: "a sync is already running", startedAt: err.running.startedAt }, { status: 409 });
    }
    throw err;
  }

  after(async () => {
    try {
      if (fixtureSyncDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, fixtureSyncDelayMs));
      const result: SyncResult = fixtureSnapshot
        ? await promoteSnapshot(fixtureSnapshot).then(() => ({
            startedAt: running.startedAt,
            finishedAt: new Date().toISOString(),
            outcomes: Object.keys(fixtureSnapshot.stores).map((storeKey) => ({
              storeKey: storeKey as CommerceStoreKey,
              ok: true as const,
              productCount: fixtureSnapshot.stores[storeKey as CommerceStoreKey]?.productCount ?? 0,
              bindingCount: fixtureSnapshot.stores[storeKey as CommerceStoreKey]?.bindings.length ?? 0,
              merchCount: fixtureSnapshot.stores[storeKey as CommerceStoreKey]?.merch.length ?? 0,
              excludedCount: fixtureSnapshot.stores[storeKey as CommerceStoreKey]?.excluded.length ?? 0,
              rejected: 0,
            })),
          }))
        : await syncCatalog(storeKeys);
      revalidateCatalogPages();
      // Optional, non-destructive second step (only after the catalog itself succeeded): refresh the INK collections against the NEW
      // catalog. Read-only (≈4 GETs), last-good per store, and any failure is reported in the job without touching the catalog result or
      // the collections file the storefront already uses.
      let collections: CollectionsStep | undefined;
      if (withCollections && !fixtureSnapshot) {
        try {
          collections = { outcomes: await syncCollections() };
          revalidatePath("/[region]", "layout");
        } catch (err) {
          collections = { error: err instanceof Error ? err.message : String(err) };
        }
      }
      finishSyncJobSuccess(running.startedAt, result, collections);
    } catch (err) {
      // Never leak the raw error object (could theoretically carry request internals) — just its message.
      finishSyncJobFailure(running.startedAt, err);
    }
  });

  return Response.json({ status: "accepted", startedAt: running.startedAt, checkStatusWith: "GET this same URL, authenticated" }, { status: 202 });
}

export async function GET(request: Request) {
  const expected = adminSyncToken();
  if (!expected) {
    return Response.json({ error: "sync endpoint disabled: ADMIN_SYNC_TOKEN is not configured" }, { status: 503 });
  }
  if (!isAuthorized(request, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(currentSyncJob());
}
