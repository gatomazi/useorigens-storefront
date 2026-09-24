import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import type { CollectionsOutcome } from "./collections-sync";
import type { SyncResult } from "./sync-service";

/** What the optional collections step of a catalog sync did. It can never change the catalog result: a failure here is reported, not raised. */
export type CollectionsStep = { outcomes: CollectionsOutcome[] } | { error: string };

/**
 * In-memory job state for the single background sync in flight, if any. Deliberately not persisted anywhere
 * (not the snapshot file, no database): it only needs to answer "is one running right now, and how did the
 * last one go" for THIS process, and this architecture is single-instance by construction — Railway does not
 * allow replicas on a service with a Volume attached (see docs/deploy/railway.md), so there is never a second
 * process whose job state could disagree with this one. A restart naturally resets this to `idle`, which is
 * correct: a job killed by a redeploy never reached `writeSnapshot`'s atomic rename, so the snapshot file
 * itself is untouched either way (see `sync-service.ts`).
 */
export type SyncJobState =
  | { status: "idle" }
  | { status: "running"; startedAt: string; storeKeys: CommerceStoreKey[] }
  | { status: "succeeded"; startedAt: string; finishedAt: string; result: SyncResult; collections?: CollectionsStep }
  | { status: "failed"; startedAt: string; finishedAt: string; error: string };

let job: SyncJobState = { status: "idle" };

export function currentSyncJob(): SyncJobState {
  return job;
}

export class SyncAlreadyRunningError extends Error {
  constructor(readonly running: Extract<SyncJobState, { status: "running" }>) {
    super("a sync is already running");
    this.name = "SyncAlreadyRunningError";
  }
}

/**
 * The concurrency lock (§4 of the bootstrap review: "não depender apenas do rename atômico para exclusão
 * mútua"). Synchronous check-and-set: Node runs JS single-threaded, so there is no window between the check
 * and the write of `job` for a second call to race into — safe without any external lock primitive.
 */
export function beginSyncJob(storeKeys: readonly CommerceStoreKey[]): Extract<SyncJobState, { status: "running" }> {
  if (job.status === "running") throw new SyncAlreadyRunningError(job);
  const next: SyncJobState = { status: "running", startedAt: new Date().toISOString(), storeKeys: [...storeKeys] };
  job = next;
  return next;
}

export function finishSyncJobSuccess(startedAt: string, result: SyncResult, collections?: CollectionsStep): void {
  job = { status: "succeeded", startedAt, finishedAt: new Date().toISOString(), result, ...(collections ? { collections } : {}) };
}

export function finishSyncJobFailure(startedAt: string, error: unknown): void {
  job = { status: "failed", startedAt, finishedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
}

/** Test-only: resets the module-level job state between test cases. */
export function resetSyncJobForTests(): void {
  job = { status: "idle" };
}
