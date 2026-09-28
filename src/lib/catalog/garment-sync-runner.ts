import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { runDailyGarmentSync, type DailyGarmentSyncResult } from "./garment-daily-sync";
import { finishSyncJobFailure, finishSyncJobSuccess, type SyncJobState } from "./sync-job";

/** Summary of the last daily run of THIS process, for the status endpoint. In memory only: Railway's logs are the history. */
let lastRun: DailyGarmentSyncResult | { status: "failed"; finishedAt: string; error: string } | null = null;

export function lastGarmentSyncRun() {
  return lastRun;
}

/**
 * Body of the daily job behind `POST /api/admin/garments-sync`. The caller already took the shared in-memory job lock
 * (`beginSyncJob`, the same one `catalog-sync` uses, so the two can never overlap) and runs this inside `after()`.
 * Never throws: the outcome lands in the job state and `lastGarmentSyncRun`.
 */
export async function runGarmentSyncJob(
  running: Extract<SyncJobState, { status: "running" }>,
  opts: { storeKeys: CommerceStoreKey[]; onCatalogChanged: () => void; revalidatePaths: (paths: string[]) => void },
): Promise<void> {
  try {
    const result = await runDailyGarmentSync(opts);
    lastRun = result;
    if (result.status === "skipped-locked") {
      finishSyncJobSuccess(running.startedAt, { startedAt: result.startedAt, finishedAt: result.finishedAt, outcomes: [] });
    } else if (result.clean) {
      finishSyncJobSuccess(running.startedAt, { startedAt: result.startedAt, finishedAt: result.finishedAt, outcomes: [] });
    } else {
      const problems = result.garments.stores.flatMap((s) => (!s.ok ? [`${s.storeKey}: ${s.error}`] : s.status === "deferred" ? [`${s.storeKey}: deferred (${s.interruptedBy ?? "request cap"})`] : []));
      finishSyncJobFailure(running.startedAt, new Error(`garment sync needs attention: ${[...result.catalog.failedStores.map((k) => `${k}: catalog refresh failed`), ...problems, ...(result.garments.revalidationError ? [`revalidation: ${result.garments.revalidationError}`] : [])].join("; ")}`));
    }
  } catch (err) {
    lastRun = { status: "failed", finishedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) };
    finishSyncJobFailure(running.startedAt, err);
  }
}
