import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { StoreIndex } from "@/lib/catalog/types";

const mocks = vi.hoisted(() => ({ fetchStoreProducts: vi.fn(), buildStoreIndex: vi.fn() }));
vi.mock("@/lib/ink/client", () => ({ fetchStoreProducts: mocks.fetchStoreProducts }));
vi.mock("@/lib/catalog/indexer", () => ({ buildStoreIndex: mocks.buildStoreIndex }));

const index = (over: Partial<StoreIndex> = {}): StoreIndex => ({
  commerceStoreKey: "use-sul",
  syncedAt: "2026-09-28T00:00:00.000Z",
  productCount: 10,
  bindings: [],
  merch: [],
  excluded: [],
  ...over,
});

describe("syncCatalog with skipWriteWhenUnchanged", () => {
  let dir: string;
  const env = process.env;
  const file = () => path.join(dir, "catalog-snapshot.json");

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sync-skip-"));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir, INK_TOKEN_SUL: "t" };
    mocks.fetchStoreProducts.mockResolvedValue({ products: [], rejected: 0, requests: 5 });
    await writeFile(file(), JSON.stringify({ version: 1, stores: { "use-sul": index() } }));
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  test("given a fetch identical to the snapshot except for syncedAt stamps, then the file is left untouched and changed is false", async () => {
    const { syncCatalog } = await import("@/lib/catalog/sync-service");
    mocks.buildStoreIndex.mockReturnValue(index({ syncedAt: "2026-09-29T06:30:00.000Z" }));
    const before = { text: await readFile(file(), "utf8"), mtime: (await stat(file())).mtimeMs };

    const result = await syncCatalog(["use-sul"], undefined, {}, { skipWriteWhenUnchanged: true });

    expect(result.changed).toBe(false);
    expect(await readFile(file(), "utf8")).toBe(before.text);
    expect((await stat(file())).mtimeMs).toBe(before.mtime);
  });

  test("given a real content change, then the snapshot is written and changed is true", async () => {
    const { syncCatalog } = await import("@/lib/catalog/sync-service");
    mocks.buildStoreIndex.mockReturnValue(index({ productCount: 11 }));

    const result = await syncCatalog(["use-sul"], undefined, {}, { skipWriteWhenUnchanged: true });

    expect(result.changed).toBe(true);
    expect(JSON.parse(await readFile(file(), "utf8")).stores["use-sul"].productCount).toBe(11);
  });

  test("given no option, then an unchanged fetch is still written, exactly as before", async () => {
    const { syncCatalog } = await import("@/lib/catalog/sync-service");
    mocks.buildStoreIndex.mockReturnValue(index({ syncedAt: "2026-09-29T06:30:00.000Z" }));

    const result = await syncCatalog(["use-sul"]);

    expect(result.changed).toBeUndefined();
    expect(JSON.parse(await readFile(file(), "utf8")).stores["use-sul"].syncedAt).toBe("2026-09-29T06:30:00.000Z");
  });
});
