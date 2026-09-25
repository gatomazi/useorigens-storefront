import { beforeEach, describe, expect, test, vi } from "vitest";
import { beginSyncJob, currentSyncJob, resetSyncJobForTests } from "@/lib/catalog/sync-job";

const mocks = vi.hoisted(() => ({ syncCatalog: vi.fn(), syncCollections: vi.fn() }));
vi.mock("@/lib/catalog/sync-service", () => ({ syncCatalog: mocks.syncCatalog }));
vi.mock("@/lib/catalog/collections-sync", () => ({ syncCollections: mocks.syncCollections }));

const OK = { startedAt: "s", finishedAt: "f", outcomes: [{ storeKey: "use-norte", ok: true, productCount: 3, bindingCount: 3, merchCount: 0, excludedCount: 0, rejected: 0 }] };

beforeEach(() => {
  resetSyncJobForTests();
  mocks.syncCatalog.mockReset();
  mocks.syncCollections.mockReset();
});

describe("catalog sync job (shared by the route and the admin button)", () => {
  test("given a successful catalog sync with collections, then the cache is invalidated after each step, only the requested store is synced and the job succeeds", async () => {
    const { runCatalogSyncJob } = await import("@/lib/catalog/sync-runner");
    mocks.syncCatalog.mockResolvedValue(OK);
    mocks.syncCollections.mockResolvedValue([{ storeKey: "use-norte", ok: true, changed: true, collections: 20, available: 19, requests: 4 }]);
    const onPromoted = vi.fn();
    const running = beginSyncJob(["use-norte"]);
    await runCatalogSyncJob(running, { storeKeys: ["use-norte"], withCollections: true, onPromoted });
    expect(mocks.syncCatalog).toHaveBeenCalledWith(["use-norte"]);
    expect(mocks.syncCollections).toHaveBeenCalledWith({ storeKeys: ["use-norte"] });
    expect(onPromoted).toHaveBeenCalledTimes(2);
    expect(currentSyncJob()).toMatchObject({ status: "succeeded", collections: { outcomes: [{ storeKey: "use-norte", collections: 20 }] } });
  });

  test("given the collections step fails, then the catalog result stands and the failure is reported in the job", async () => {
    const { runCatalogSyncJob } = await import("@/lib/catalog/sync-runner");
    mocks.syncCatalog.mockResolvedValue(OK);
    mocks.syncCollections.mockRejectedValue(new Error("ink down"));
    const running = beginSyncJob(["use-norte"]);
    await runCatalogSyncJob(running, { storeKeys: ["use-norte"], withCollections: true, onPromoted: () => undefined });
    expect(currentSyncJob()).toMatchObject({ status: "succeeded", collections: { error: "ink down" } });
  });

  test("given the catalog sync throws, then the job fails, the cache is not invalidated and the lock is released for a new run", async () => {
    const { runCatalogSyncJob } = await import("@/lib/catalog/sync-runner");
    mocks.syncCatalog.mockRejectedValue(new Error("boom"));
    const onPromoted = vi.fn();
    const running = beginSyncJob(["use-centro"]);
    await runCatalogSyncJob(running, { storeKeys: ["use-centro"], withCollections: true, onPromoted });
    expect(onPromoted).not.toHaveBeenCalled();
    expect(mocks.syncCollections).not.toHaveBeenCalled();
    expect(currentSyncJob()).toMatchObject({ status: "failed", error: "boom" });
    expect(() => beginSyncJob(["use-centro"])).not.toThrow();
  });
});
