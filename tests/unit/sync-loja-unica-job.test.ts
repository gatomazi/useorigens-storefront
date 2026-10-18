import { beforeEach, describe, expect, test, vi } from "vitest";
import { beginLojaUnicaJob, currentLojaUnicaJob, LojaUnicaJobRunningError, lojaUnicaJobPercent, resetLojaUnicaJobForTests, runLojaUnicaJob } from "@/lib/catalog/unificado/sync-loja-unica-job";

const OK = { ok: true as const, changed: true, productCount: 10, bindingCount: 8, merchCount: 2, excludedCount: 0, regiaoPendente: 0, collections: 5 };
const lock = () => ({ release: vi.fn(async () => undefined) });

beforeEach(() => resetLojaUnicaJobForTests());

describe("single-store catalog sync job (the panel's button)", () => {
  test("given a run, then the progress follows the pages read, stays below 100% until it ends, and the job succeeds and invalidates caches", async () => {
    const held = lock();
    const running = beginLojaUnicaJob();
    expect(lojaUnicaJobPercent(currentLojaUnicaJob())).toBeNull();
    const seen: (number | null)[] = [];
    const onChanged = vi.fn();
    await runLojaUnicaJob(running, {
      onChanged,
      deps: {
        acquireLock: async () => held,
        sync: async (opts) => {
          for (const page of [1, 2, 4]) {
            opts?.onProgress?.({ storeKey: "use-sul", page, totalPages: 4 });
            seen.push(lojaUnicaJobPercent(currentLojaUnicaJob()));
          }
          return OK;
        },
      },
    });
    expect(seen).toEqual([25, 50, 99]);
    expect(currentLojaUnicaJob()).toMatchObject({ status: "succeeded", result: { productCount: 10 } });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(held.release).toHaveBeenCalled();
  });

  test("given one is running, then a second click is refused", () => {
    beginLojaUnicaJob();
    expect(() => beginLojaUnicaJob()).toThrow(LojaUnicaJobRunningError);
  });

  test("given the daily cron holds the lock, then nothing is synced and the job fails with a clear reason, freeing the button", async () => {
    const sync = vi.fn();
    await runLojaUnicaJob(beginLojaUnicaJob(), { onChanged: vi.fn(), deps: { acquireLock: async () => null, sync } });
    expect(sync).not.toHaveBeenCalled();
    expect(currentLojaUnicaJob()).toMatchObject({ status: "failed", error: expect.stringContaining("sync diário") });
    expect(() => beginLojaUnicaJob()).not.toThrow();
  });

  test("given the sync refuses (last-known-good), then the job fails, the caches are left alone and the lock is released", async () => {
    const held = lock();
    const onChanged = vi.fn();
    await runLojaUnicaJob(beginLojaUnicaJob(), { onChanged, deps: { acquireLock: async () => held, sync: async () => ({ ok: false, error: "queda suspeita" }) } });
    expect(currentLojaUnicaJob()).toMatchObject({ status: "failed", error: "queda suspeita" });
    expect(onChanged).not.toHaveBeenCalled();
    expect(held.release).toHaveBeenCalled();
  });
});
