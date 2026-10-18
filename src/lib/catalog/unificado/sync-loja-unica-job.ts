import "server-only";
import { acquireGarmentSyncLock } from "../garment-sync-state";
import { syncLojaUnica, type LojaUnicaSyncResult } from "./sync-loja-unica";

/**
 * The single store's on-demand catalog sync ("Sincronizar catálogo da loja única" in the panel), in memory like `sync-job.ts` and for the same
 * reason: one process per service (Railway Volume), and a restart can only interrupt a run before `syncLojaUnica`'s atomic writes. It holds the
 * daily cron's Volume lock for the whole run, so the button and the 03:30 job never write the single store's files at the same time.
 * `page`/`totalPages` are the products read (the slow part); the panel turns them into a percentage.
 */
export type LojaUnicaJobState =
  | { status: "idle" }
  | { status: "running"; startedAt: string; page: number; totalPages: number | null }
  | { status: "succeeded"; startedAt: string; finishedAt: string; result: Extract<LojaUnicaSyncResult, { ok: true }> }
  | { status: "failed"; startedAt: string; finishedAt: string; error: string };

let job: LojaUnicaJobState = { status: "idle" };

export const currentLojaUnicaJob = (): LojaUnicaJobState => job;

export class LojaUnicaJobRunningError extends Error {
  constructor() {
    super("a single-store sync is already running");
    this.name = "LojaUnicaJobRunningError";
  }
}

/** Synchronous check-and-set (single-threaded JS): a second click while one runs is refused. */
export function beginLojaUnicaJob(): Extract<LojaUnicaJobState, { status: "running" }> {
  if (job.status === "running") throw new LojaUnicaJobRunningError();
  const next = { status: "running" as const, startedAt: new Date().toISOString(), page: 0, totalPages: null };
  job = next;
  return next;
}

/**
 * 0–100 for a running job: products read so far. It stays at 99 after the last page, while the classification and the writes finish, so the bar
 * never shows 100% for a sync that has not ended. Null before INK reports the page count.
 */
export function lojaUnicaJobPercent(state: LojaUnicaJobState): number | null {
  if (state.status !== "running" || !state.totalPages) return null;
  return Math.min(99, Math.floor((state.page / state.totalPages) * 100));
}

export type LojaUnicaJobDeps = { sync?: typeof syncLojaUnica; acquireLock?: typeof acquireGarmentSyncLock };

/** The job body, run inside `after()` by the action that began it. Never throws: the outcome goes to the job state. `onChanged` invalidates caches. */
export async function runLojaUnicaJob(running: Extract<LojaUnicaJobState, { status: "running" }>, opts: { onChanged: () => void; deps?: LojaUnicaJobDeps }): Promise<void> {
  const finished = (rest: { result: Extract<LojaUnicaSyncResult, { ok: true }> } | { error: string }): void => {
    job = { startedAt: running.startedAt, finishedAt: new Date().toISOString(), ...("result" in rest ? { status: "succeeded", result: rest.result } : { status: "failed", error: rest.error }) };
  };
  let lock: Awaited<ReturnType<typeof acquireGarmentSyncLock>> = null;
  try {
    lock = await (opts.deps?.acquireLock ?? acquireGarmentSyncLock)();
    if (!lock) return finished({ error: "o sync diário (peças e catálogo) está rodando agora; tente de novo quando ele terminar" });
    const result = await (opts.deps?.sync ?? syncLojaUnica)({
      onProgress: ({ page, totalPages }) => {
        if (job.status === "running" && job.startedAt === running.startedAt) job = { ...job, page, totalPages };
      },
    });
    if (!result.ok) return finished({ error: result.error });
    if (result.changed || result.collections !== null) opts.onChanged();
    finished({ result });
  } catch (err) {
    finished({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    await lock?.release();
  }
}

/** Test-only. */
export function resetLojaUnicaJobForTests(): void {
  job = { status: "idle" };
}
