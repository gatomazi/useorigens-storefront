import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { shouldPromoteStore, promoteSnapshot } from "@/lib/catalog/sync-service";
import { isCoverageReady } from "@/lib/catalog/readiness";
import { beginSyncJob, currentSyncJob, finishSyncJobFailure, finishSyncJobSuccess, resetSyncJobForTests, SyncAlreadyRunningError } from "@/lib/catalog/sync-job";
import type { StoreIndex } from "@/lib/catalog/types";

function store(productCount: number): StoreIndex {
  return { commerceStoreKey: "use-sul", syncedAt: "2026-09-22T00:00:00.000Z", productCount, bindings: [], merch: [], excluded: [] };
}

describe("shouldPromoteStore (regression guard)", () => {
  test("given no previous store, when the new fetch has products, then it promotes", () => {
    expect(shouldPromoteStore(undefined, store(50))).toEqual({ promote: true });
  });

  test("given a previous store with products, when the new fetch comes back with zero, then it refuses (never blank a store)", () => {
    const result = shouldPromoteStore(store(9834), store(0));
    expect(result.promote).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/0 products/);
  });

  test("given a previous store, when the new fetch drops more than 50%, then it refuses as a likely partial response", () => {
    const result = shouldPromoteStore(store(1000), store(400));
    expect(result.promote).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/partial response/);
  });

  test("given a previous store, when the new fetch drops less than 50%, then it promotes normally", () => {
    expect(shouldPromoteStore(store(1000), store(600))).toEqual({ promote: true });
  });

  test("given a previous store, when the new fetch grows, then it promotes (growth is never suspicious)", () => {
    expect(shouldPromoteStore(store(1000), store(5000))).toEqual({ promote: true });
  });

  test("given a tiny previous store (below the floor), when the new fetch shrinks a lot in percentage terms, then it still promotes (avoids false positives on small stores)", () => {
    expect(shouldPromoteStore(store(3), store(1))).toEqual({ promote: true });
  });

  test("given a tiny previous store, when the new fetch is exactly zero, then it still refuses (going to zero is always suspect)", () => {
    const result = shouldPromoteStore(store(3), store(0));
    expect(result.promote).toBe(false);
  });
});

describe("promoteSnapshot (schema gate before writing)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "promote-snapshot-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("given a snapshot with the wrong version, when promoted, then it throws and nothing is written", async () => {
    const file = path.join(dir, "catalog-snapshot.json");
    // @ts-expect-error deliberately wrong shape
    await expect(promoteSnapshot({ version: 2, stores: {} }, file)).rejects.toThrow(/schema/);
  });

  test("given a snapshot with stores not an object, when promoted, then it throws", async () => {
    const file = path.join(dir, "catalog-snapshot.json");
    // @ts-expect-error deliberately wrong shape
    await expect(promoteSnapshot({ version: 1, stores: null }, file)).rejects.toThrow(/schema/);
  });

  test("given a valid snapshot, when promoted, then it is written atomically and readable back", async () => {
    const file = path.join(dir, "catalog-snapshot.json");
    await promoteSnapshot({ version: 1, stores: { "use-sul": store(10) } }, file);
    const written = JSON.parse(readFileSync(file, "utf8"));
    expect(written.stores["use-sul"].productCount).toBe(10);
  });

  test("given a path whose parent is a file, not a directory, when promoted, then it throws a clear write error naming the path", async () => {
    // A file where a directory is expected forces a deterministic ENOTDIR on write — simulates the "volume
    // not mounted / not writable" failure mode the bootstrap review asked to surface clearly.
    const blocker = path.join(dir, "blocker");
    writeFileSync(blocker, "x");
    const badFile = path.join(blocker, "catalog-snapshot.json");
    await expect(promoteSnapshot({ version: 1, stores: {} }, badFile)).rejects.toThrow(/could not write snapshot/);
  });
});

describe("readiness threshold (isCoverageReady)", () => {
  test("given full coverage, when checked, then it is ready", () => {
    expect(isCoverageReady(1191, 1191)).toBe(true);
  });
  test("given exactly the threshold, when checked, then it is ready", () => {
    expect(isCoverageReady(50, 100)).toBe(true);
  });
  test("given coverage just under the threshold, when checked, then it is not ready", () => {
    expect(isCoverageReady(49, 100)).toBe(false);
  });
  test("given a catastrophic partial sync (1 city out of many), when checked, then it is not ready", () => {
    expect(isCoverageReady(1, 1191)).toBe(false);
  });
  test("given zero total cities, when checked, then it is not ready (never divide-by-zero into true)", () => {
    expect(isCoverageReady(0, 0)).toBe(false);
  });
});

describe("sync job concurrency lock", () => {
  beforeEach(() => resetSyncJobForTests());

  test("given no job running, when a sync begins, then it returns a running state", () => {
    const job = beginSyncJob(["use-sul"]);
    expect(job.status).toBe("running");
    expect(currentSyncJob().status).toBe("running");
  });

  test("given a job already running, when another begins, then it throws SyncAlreadyRunningError instead of starting a second one", () => {
    beginSyncJob(["use-sul"]);
    expect(() => beginSyncJob(["use-norte"])).toThrow(SyncAlreadyRunningError);
    // Still the first job, untouched — no second job silently replaced it.
    expect(currentSyncJob().status).toBe("running");
  });

  test("given a running job, when it finishes successfully, then the job state becomes succeeded and a new sync can start", () => {
    const job = beginSyncJob(["use-sul"]);
    finishSyncJobSuccess(job.startedAt, { startedAt: job.startedAt, finishedAt: new Date().toISOString(), outcomes: [] });
    expect(currentSyncJob().status).toBe("succeeded");
    expect(() => beginSyncJob(["use-sul"])).not.toThrow();
  });

  test("given a running job, when it fails, then the job state becomes failed with the error message, never the raw error object", () => {
    const job = beginSyncJob(["use-sul"]);
    finishSyncJobFailure(job.startedAt, new Error("INK responded 500"));
    const state = currentSyncJob();
    expect(state.status).toBe("failed");
    expect((state as { error: string }).error).toBe("INK responded 500");
  });
});
