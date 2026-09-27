import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runGarmentSync } from "@/lib/catalog/garment-sync-service";
import { readGarmentCheckpoint } from "@/lib/catalog/garment-checkpoint";
import type { CatalogSnapshot } from "@/lib/catalog/types";

const pageOf = (u: string | URL | Request): number => Number(new URL(String(u)).searchParams.get("page"));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const product = (over: Record<string, unknown> = {}) => ({
  id: 4381465,
  name: "Tijucas | Traço SC",
  slug: "tijucas-traco-sc",
  store_product_url: "https://www.usesul.com.br/usesul/product/tijucas-traco-sc",
  main_image_url: "https://img/classic.jpg",
  price: "109.9",
  product_cluster_id: 441506,
  product_type: { id: 1, name: "Camiseta" },
  created_at: "2026-05-06T21:29:36-03:00",
  status: "published",
  visible_in_store: true,
  ...over,
});
const sibling = (over: Record<string, unknown> = {}) =>
  product({
    id: 4381470,
    main_image_url: "https://img/peruano.jpg",
    price: "139.9",
    product_type: { id: 72, name: "Camiseta Algodão Peruano" },
    status: "not_published",
    visible_in_store: false,
    ...over,
  });
const page = (items: unknown[], meta: Partial<{ page: number; total_pages: number }> = {}) => ({ products: items, page: 1, per_page: 100, total_pages: 1, ...meta });
const noSleep = async () => undefined;

const baseSnapshot: CatalogSnapshot = {
  version: 1,
  stores: {
    "use-sul": {
      commerceStoreKey: "use-sul",
      syncedAt: "2026-09-20T00:00:00.000Z",
      productCount: 1,
      bindings: [
        {
          cityId: "4218004",
          designFamily: "traco",
          designVariant: "base",
          commerceStoreKey: "use-sul",
          inkProductId: "4381465",
          slug: "tijucas-traco-sc",
          storeProductUrl: "https://www.usesul.com.br/usesul/product/tijucas-traco-sc",
          imageUrl: "https://img/classic.jpg",
          price: 109.9,
          syncedAt: "2026-09-20T00:00:00.000Z",
          productClusterId: "441506",
        },
      ],
      merch: [],
      excluded: [],
    },
  },
};

describe("runGarmentSync (fake paginated INK, no network)", () => {
  let dir: string;
  const env = process.env;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "garment-sync-"));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir, INK_TOKEN_SUL: "t" };
    await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(baseSnapshot));
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  const snapshotFile = () => path.join(dir, "catalog-snapshot.json");
  const readSnap = async (): Promise<CatalogSnapshot> => JSON.parse(await readFile(snapshotFile(), "utf8"));

  test("given a single-page store with a real sibling, when synced, then the garment binding is linked and the pass is marked complete", async () => {
    const fetchImpl = (async () => json(page([product(), sibling()]))) as unknown as typeof fetch;
    const result = await runGarmentSync({ storeKeys: ["use-sul"], maxRequestsPerStore: 10, deps: { fetchImpl, sleep: noSleep } });

    expect(result.outcomes).toEqual([
      expect.objectContaining({ storeKey: "use-sul", ok: true, completedFullPass: true, newGarmentBindings: 1, totalGarmentBindingsForStore: 1 }),
    ]);
    const snap = await readSnap();
    expect(snap.stores["use-sul"]?.garmentBindings).toHaveLength(1);
    expect(snap.stores["use-sul"]?.garmentBindings?.[0]).toMatchObject({ garmentTypeId: 72, price: 139.9 });

    const checkpoint = await readGarmentCheckpoint(path.join(dir, "garment-sync-checkpoint.json"));
    expect(checkpoint.stores["use-sul"]).toMatchObject({ status: "complete", lastPageCompleted: 1, totalPages: 1 });
  });

  test("given a run capped below the total page count, when it stops, then the checkpoint is in_progress and a second run resumes from the next page and completes", async () => {
    const seenPages: number[] = [];
    const fetchImpl = (async (u: string | URL | Request) => {
      const p = pageOf(u);
      seenPages.push(p);
      // Page 1 has the classic + a sibling; page 2 has a second sibling type for the same cluster.
      const items = p === 1 ? [product(), sibling()] : [sibling({ id: 4381471, price: "134.9", product_type: { id: 178, name: "Camiseta Oversized" } })];
      return json(page(items, { page: p, total_pages: 2 }));
    }) as unknown as typeof fetch;

    const first = await runGarmentSync({ storeKeys: ["use-sul"], maxRequestsPerStore: 1, deps: { fetchImpl, sleep: noSleep } });
    expect(first.outcomes[0]).toMatchObject({ ok: true, completedFullPass: false, truncated: true, newGarmentBindings: 1 });
    let checkpoint = await readGarmentCheckpoint(path.join(dir, "garment-sync-checkpoint.json"));
    expect(checkpoint.stores["use-sul"]).toMatchObject({ status: "in_progress", lastPageCompleted: 1 });

    const second = await runGarmentSync({ storeKeys: ["use-sul"], maxRequestsPerStore: 10, deps: { fetchImpl, sleep: noSleep } });
    expect(second.outcomes[0]).toMatchObject({ ok: true, completedFullPass: true, newGarmentBindings: 1 });
    expect(seenPages).toEqual([1, 2]); // page 1 was never re-fetched on resume

    const snap = await readSnap();
    expect(snap.stores["use-sul"]?.garmentBindings?.map((g) => g.garmentTypeId).sort((a, b) => a - b)).toEqual([72, 178]);
    checkpoint = await readGarmentCheckpoint(path.join(dir, "garment-sync-checkpoint.json"));
    expect(checkpoint.stores["use-sul"]).toMatchObject({ status: "complete" });
  });

  test("given a 429 mid-run, when synced, then it backs off, retries, and still completes within the request budget accounting for the retry", async () => {
    let attempt = 0;
    const fetchImpl = (async () => (++attempt === 1 ? json({}, 429) : json(page([product(), sibling()])))) as unknown as typeof fetch;
    const result = await runGarmentSync({ storeKeys: ["use-sul"], maxRequestsPerStore: 10, deps: { fetchImpl, sleep: noSleep, backoffMs: [1], jitter: () => 0 } });
    expect(result.outcomes[0]).toMatchObject({ ok: true, completedFullPass: true, requestsUsedThisRun: 2 });
  });

  test("given INK fails outright, when synced, then the previous snapshot and checkpoint are left completely untouched (last-known-good)", async () => {
    const before = await readFile(snapshotFile(), "utf8");
    const fetchImpl = (async () => json({}, 500)) as unknown as typeof fetch;
    const result = await runGarmentSync({ storeKeys: ["use-sul"], maxRequestsPerStore: 10, deps: { fetchImpl, sleep: noSleep, backoffMs: [], jitter: () => 0 } });
    expect(result.outcomes[0]).toMatchObject({ ok: false });
    expect(await readFile(snapshotFile(), "utf8")).toBe(before);
    const checkpoint = await readGarmentCheckpoint(path.join(dir, "garment-sync-checkpoint.json"));
    expect(checkpoint.stores["use-sul"]).toBeUndefined();
  });

  test("given a store with no base catalog synced yet, when requested, then it fails clearly instead of crawling blind", async () => {
    process.env.INK_TOKEN_NORTE = "t";
    const result = await runGarmentSync({ storeKeys: ["use-norte"], maxRequestsPerStore: 10, deps: { fetchImpl: (async () => { throw new Error("should not be called"); }) as unknown as typeof fetch, sleep: noSleep } });
    expect(result.outcomes[0]).toMatchObject({ storeKey: "use-norte", ok: false });
    expect((result.outcomes[0] as { error: string }).error).toMatch(/no base catalog synced/);
  });

  test("given a previously completed full pass, when synced again, then it runs incrementally with begin_date at the stored watermark, not a full re-crawl", async () => {
    const fetchImpl1 = (async () => json(page([product(), sibling()], { page: 1, total_pages: 1 }))) as unknown as typeof fetch;
    await runGarmentSync({ storeKeys: ["use-sul"], maxRequestsPerStore: 10, deps: { fetchImpl: fetchImpl1, sleep: noSleep } });

    let seenUrl = "";
    const fetchImpl2 = (async (u: string | URL | Request) => {
      seenUrl = String(u);
      return json(page([]));
    }) as unknown as typeof fetch;
    const second = await runGarmentSync({ storeKeys: ["use-sul"], maxRequestsPerStore: 10, deps: { fetchImpl: fetchImpl2, sleep: noSleep } });
    expect(seenUrl).toContain("begin_date=2026-05-06");
    expect(second.outcomes[0]).toMatchObject({ mode: "incremental" });
  });

  test("given forceFull, when synced after a completed pass, then it ignores the watermark and re-crawls from page 1", async () => {
    const fetchImpl1 = (async () => json(page([product(), sibling()], { page: 1, total_pages: 1 }))) as unknown as typeof fetch;
    await runGarmentSync({ storeKeys: ["use-sul"], maxRequestsPerStore: 10, deps: { fetchImpl: fetchImpl1, sleep: noSleep } });

    let seenUrl = "";
    const fetchImpl2 = (async (u: string | URL | Request) => {
      seenUrl = String(u);
      return json(page([product(), sibling()]));
    }) as unknown as typeof fetch;
    const second = await runGarmentSync({ storeKeys: ["use-sul"], maxRequestsPerStore: 10, forceFull: true, deps: { fetchImpl: fetchImpl2, sleep: noSleep } });
    expect(seenUrl).not.toContain("begin_date");
    expect(second.outcomes[0]).toMatchObject({ mode: "full" });
  });
});
