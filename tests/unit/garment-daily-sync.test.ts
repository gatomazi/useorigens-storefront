import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runDailyGarmentSync } from "@/lib/catalog/garment-daily-sync";
import { advanceCursor, applyPieces, runIncrementalGarmentSync, type IncrementalOptions } from "@/lib/catalog/garment-incremental-sync";
import { readGarmentIndex } from "@/lib/catalog/garment-index-file";
import { readGarmentSyncState, readIncrementalCheckpoint } from "@/lib/catalog/garment-sync-state";
import { fetchGarmentSourceProducts } from "@/lib/ink/garment-client";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { indexOf, tuple, writeIndexFile } from "./garment-index-fixture";

const BASES: Record<string, string> = { "use-sul": "https://www.usesul.com.br/usesul/product", "use-norte": "https://www.usenorte.com.br/usenorte/product", "use-centro": "https://www.usecentro.com.br/usecentro/product" };
const TOKENS: Record<string, CommerceStoreKey> = { "sul-token": "use-sul", "norte-token": "use-norte", "centro-token": "use-centro" };

type RawOpts = { id: number; cluster: number; type?: number; price?: string; image?: string; slug?: string; created?: string };
const raw = (store: CommerceStoreKey, o: RawOpts) => {
  const slug = o.slug ?? `p-${o.id}`;
  return {
    id: o.id,
    name: `Produto ${o.id}`,
    slug,
    store_product_url: `${BASES[store]}/${slug}`,
    main_image_url: o.image ?? `https://img/${slug}.jpg`,
    price: o.price ?? "139.9",
    product_cluster_id: o.cluster,
    product_type: { id: o.type ?? 72, name: "Tipo" },
    created_at: o.created ?? "2026-09-28T10:00:00-03:00",
    status: "not_published",
    visible_in_store: false,
  };
};

const binding = (store: CommerceStoreKey, cluster: string, cityId: string) => ({
  cityId,
  designFamily: "traco",
  designVariant: "base",
  commerceStoreKey: store,
  inkProductId: `classic-${store}-${cluster}`,
  slug: `classic-${cluster}`,
  storeProductUrl: `${BASES[store]}/classic-${cluster}`,
  imageUrl: "https://img/classic.jpg",
  price: 109.9,
  syncedAt: "2026-09-20T00:00:00.000Z",
  productClusterId: cluster,
});
const storeOf = (store: CommerceStoreKey, clusters: string[]) => ({ commerceStoreKey: store, syncedAt: "2026-09-20T00:00:00.000Z", productCount: clusters.length, bindings: clusters.map((c, i) => binding(store, c, String(4200000 + i))), merch: [], excluded: [] });
const baseSnapshot = (): CatalogSnapshot =>
  ({ version: 1, stores: { "use-sul": storeOf("use-sul", ["441506", "500"]), "use-norte": storeOf("use-norte", ["441506"]) } }) as unknown as CatalogSnapshot;

const noSleep = async () => undefined;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("daily incremental garment sync (fake INK, temp Volume)", () => {
  let dir: string;
  const env = process.env;
  let calls: { store: CommerceStoreKey; page: number; beginDate: string | null }[];
  let revalidated: string[][];
  let pages: Partial<Record<CommerceStoreKey, unknown[][]>>;

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    const store = TOKENS[auth.replace("Bearer ", "")];
    const page = Number(url.searchParams.get("page"));
    calls.push({ store, page, beginDate: url.searchParams.get("begin_date") });
    const storePages = pages[store] ?? [[]];
    return json({ products: storePages[page - 1] ?? [], page, per_page: 100, total_pages: storePages.length });
  }) as unknown as typeof fetch;

  const opts = (over: Partial<IncrementalOptions> = {}): IncrementalOptions => ({
    storeKeys: ["use-sul", "use-norte"],
    revalidatePaths: (paths) => revalidated.push(paths),
    pathsForClusters: (affected) => Object.entries(affected).flatMap(([store, set]) => [...(set ?? [])].map((c) => `/${store}/${c}`)),
    fetchStore: (store, o) => fetchGarmentSourceProducts(store, { ...o, deps: { fetchImpl, sleep: noSleep, paceMs: 0 } }),
    minPieces: 1,
    ...over,
  });

  const indexFile = () => path.join(dir, "garment-index.json");
  const files = async () => (await readdir(dir)).sort();
  const seedIndex = () =>
    writeIndexFile(
      dir,
      indexOf({
        "use-sul": { "441506": [tuple(72, "4381470", "tijucas-peruano", 139.9)] },
        "use-norte": { "441506": [tuple(72, "900", "norte-peruano", 129.9)] },
      }),
    );

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "garment-daily-"));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir, INK_TOKEN_SUL: "sul-token", INK_TOKEN_NORTE: "norte-token", INK_TOKEN_CENTRO: "centro-token" };
    calls = [];
    revalidated = [];
    pages = {};
    await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(baseSnapshot()));
    await seedIndex();
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  test("given a new sibling of a known cluster, when the first incremental pass runs, then it lands in that cluster, the index is promoted and only that cluster is revalidated", async () => {
    pages["use-sul"] = [[raw("use-sul", { id: 5000001, cluster: 441506, type: 178, price: "159.9" })]];
    const result = await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"] }));

    expect(result.indexPromoted).toBe(true);
    expect(result.stores[0]).toMatchObject({ ok: true, status: "promoted", cursorBefore: "2026-09-25", metrics: { productsChanged: 1, clustersChanged: 1, requests: 1 } });
    const index = await readGarmentIndex(indexFile());
    expect(index.stores["use-sul"]?.clusters["441506"]?.map((t) => t[1])).toEqual(["4381470", "5000001"]);
    expect(index.stores["use-norte"]?.clusters["441506"]).toHaveLength(1);
    expect(revalidated).toEqual([["/use-sul/441506"]]);
    expect(calls).toEqual([{ store: "use-sul", page: 1, beginDate: "2026-09-25" }]);
  });

  test("given a product of a brand-new cluster, when the pass runs, then the cluster is created for that store only", async () => {
    pages["use-sul"] = [[raw("use-sul", { id: 5000002, cluster: 500, type: 8 })]];
    await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"] }));

    const index = await readGarmentIndex(indexFile());
    expect(index.stores["use-sul"]?.clusters["500"]?.map((t) => t[1])).toEqual(["5000002"]);
    expect(index.stores["use-norte"]?.clusters["500"]).toBeUndefined();
  });

  test("given the same cluster id in two stores, when both stores return a piece, then each piece stays in its own store", async () => {
    pages["use-sul"] = [[raw("use-sul", { id: 6000001, cluster: 441506, type: 8 })]];
    pages["use-norte"] = [[raw("use-norte", { id: 7000001, cluster: 441506, type: 23 })]];
    await runIncrementalGarmentSync(opts());

    const index = await readGarmentIndex(indexFile());
    expect(index.stores["use-sul"]?.clusters["441506"]?.map((t) => t[1])).toEqual(["4381470", "6000001"]);
    expect(index.stores["use-norte"]?.clusters["441506"]?.map((t) => t[1])).toEqual(["900", "7000001"]);
  });

  test("given a second pass over the identical window, then the index, its .prev and its mtime are untouched and nothing is revalidated", async () => {
    pages["use-sul"] = [[raw("use-sul", { id: 5000001, cluster: 441506, type: 178 })]];
    await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"] }));
    const before = { bytes: await readFile(indexFile()), mtime: (await stat(indexFile())).mtimeMs, prev: await readFile(`${indexFile()}.prev`) };
    revalidated = [];

    const second = await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"] }));

    expect(second.indexPromoted).toBe(false);
    expect(second.stores[0]).toMatchObject({ ok: true, status: "unchanged", metrics: { piecesLinked: 1, productsChanged: 0, clustersChanged: 0 } });
    expect(await readFile(indexFile())).toEqual(before.bytes);
    expect((await stat(indexFile())).mtimeMs).toBe(before.mtime);
    expect(await readFile(`${indexFile()}.prev`)).toEqual(before.prev);
    expect(revalidated).toEqual([]);
  });

  test("given a known product whose price and image changed inside the window, when the pass runs, then the piece is replaced (no duplicate) and its cluster revalidated", async () => {
    pages["use-sul"] = [[raw("use-sul", { id: 4381470, cluster: 441506, type: 72, price: "149.9", image: "https://img/new.jpg", slug: "tijucas-peruano" })]];
    await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"] }));

    const pieces = (await readGarmentIndex(indexFile())).stores["use-sul"]?.clusters["441506"];
    expect(pieces).toEqual([[72, "4381470", "tijucas-peruano", "https://img/new.jpg", 149.9]]);
    expect(revalidated).toEqual([["/use-sul/441506"]]);
  });

  test("given no changes at all, then the state file records the run, no index file is written and no backup or temp file appears", async () => {
    await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"] }));

    expect(await files()).toEqual(["catalog-snapshot.json", "garment-index.json", "garment-sync-state.json"]);
    const state = await readGarmentSyncState();
    expect(state.stores["use-sul"]).toMatchObject({ cursor: "2026-09-25", lastRun: { requests: 1, productsChanged: 0 } });
  });

  test("given INK fails in the middle, then the cursor does not move, the index is untouched and the next run redoes the same window", async () => {
    const before = await readFile(indexFile());
    const failing = opts({ storeKeys: ["use-sul"], fetchStore: async () => { throw new Error("INK responded 500"); } });
    const result = await runIncrementalGarmentSync(failing);

    expect(result.stores[0]).toEqual({ storeKey: "use-sul", ok: false, error: "INK responded 500" });
    expect(await readFile(indexFile())).toEqual(before);
    expect((await readGarmentSyncState()).stores["use-sul"]).toBeUndefined();
    expect(await files()).toEqual(["catalog-snapshot.json", "garment-index.json"]);
  });

  test("given a pass cut short, then progress is parked in the checkpoint, and the next run resumes at the next page and removes the checkpoint", async () => {
    pages["use-sul"] = [[raw("use-sul", { id: 5000001, cluster: 441506, type: 178 })], [raw("use-sul", { id: 5000002, cluster: 500, type: 8 })]];
    const cut = await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"], maxRequestsPerStore: 1 }));

    expect(cut.stores[0]).toMatchObject({ ok: true, status: "deferred", cursorAfter: "2026-09-25" });
    expect(cut.indexPromoted).toBe(false);
    const parked = await readIncrementalCheckpoint();
    expect(parked.stores["use-sul"]).toMatchObject({ lastPageCompleted: 1, sinceCreatedAt: "2026-09-25" });
    expect(await files()).toContain("garment-sync-checkpoint.json");
    expect((await readGarmentSyncState()).stores["use-sul"]).toBeUndefined();

    calls = [];
    const resumed = await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"] }));

    expect(calls.map((c) => c.page)).toEqual([2]);
    expect(resumed.stores[0]).toMatchObject({ ok: true, status: "promoted", metrics: { productsChanged: 2, requests: 2 } });
    const index = await readGarmentIndex(indexFile());
    expect(index.stores["use-sul"]?.clusters["441506"]?.map((t) => t[1])).toContain("5000001");
    expect(index.stores["use-sul"]?.clusters["500"]?.map((t) => t[1])).toEqual(["5000002"]);
    expect(await files()).toEqual(["catalog-snapshot.json", "garment-index.json", "garment-index.json.prev", "garment-sync-state.json"]);
  });

  test("given a parked checkpoint older than the limit, then it is ignored and the window is read from page 1", async () => {
    pages["use-sul"] = [[raw("use-sul", { id: 5000001, cluster: 441506, type: 178 })], []];
    await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"], maxRequestsPerStore: 1 }));
    calls = [];
    const later = () => new Date(Date.now() + 13 * 60 * 60 * 1000);
    await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"], now: later }));

    expect(calls[0].page).toBe(1);
  });

  test("given a candidate that fails validation, then the live index and .prev are untouched, no temp file remains and no cursor moves", async () => {
    pages["use-sul"] = [[raw("use-sul", { id: 5000001, cluster: 441506, type: 178 })]];
    const before = await readFile(indexFile());
    const result = await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"], minPieces: 1_000_000 }));

    expect(result.indexPromoted).toBe(false);
    expect(result.stores[0]).toMatchObject({ ok: false });
    expect(await readFile(indexFile())).toEqual(before);
    expect(await files()).toEqual(["catalog-snapshot.json", "garment-index.json"]);
    expect((await readGarmentSyncState()).stores["use-sul"]).toBeUndefined();
  });

  test("given many successful promotions, then exactly one .prev exists and it is the version right before the live one", async () => {
    for (const id of [5000001, 5000002, 5000003]) {
      pages["use-sul"] = [[raw("use-sul", { id, cluster: 441506, type: 178, slug: `p-${id}` })]];
      await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"] }));
    }

    expect(await files()).toEqual(["catalog-snapshot.json", "garment-index.json", "garment-index.json.prev", "garment-sync-state.json"]);
    const prev = JSON.parse(await readFile(`${indexFile()}.prev`, "utf8")) as { stores: Record<string, { clusters: Record<string, unknown[][]> }> };
    expect(prev.stores["use-sul"].clusters["441506"].map((t) => t[1])).toEqual(["4381470", "5000001", "5000002"]);
  });

  test("given a store with no garment index, then the pass fails for it instead of turning into a full crawl", async () => {
    await writeFile(indexFile(), "not json");
    const result = await runIncrementalGarmentSync(opts({ storeKeys: ["use-sul"] }));

    expect(result.stores[0]).toMatchObject({ ok: false, error: expect.stringContaining("full crawl") });
    expect(calls).toEqual([]);
    expect(await readFile(indexFile(), "utf8")).toBe("not json");
  });

  test("given two runs started at the same time, then one runs, the other exits without touching anything, and the lock is released", async () => {
    pages["use-sul"] = [[raw("use-sul", { id: 5000001, cluster: 441506, type: 178 })]];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slowCatalog = vi.fn(async () => {
      await gate;
      return { startedAt: "s", finishedAt: "f", outcomes: [], changed: false };
    });
    const start = () =>
      runDailyGarmentSync({
        storeKeys: ["use-sul"],
        onCatalogChanged: () => undefined,
        revalidatePaths: (p) => revalidated.push(p),
        syncCatalogImpl: slowCatalog as never,
        fetchStore: opts().fetchStore,
        minPieces: 1,
        log: () => undefined,
      });

    const first = start();
    await vi.waitFor(async () => expect(await files()).toContain("garment-sync.lock"));
    const second = await start();
    release();
    const done = await first;

    expect(second.status).toBe("skipped-locked");
    expect(done.status).toBe("done");
    expect(slowCatalog).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(indexFile(), "utf8"))).toMatchObject({ version: 1 });
    expect(await files()).toEqual(["catalog-snapshot.json", "garment-index.json", "garment-index.json.prev", "garment-sync-state.json"]);
  });

  test("given the base catalog refresh failed for a store, then that store's garment pass is skipped and its cursor stays", async () => {
    const catalog = { startedAt: "s", finishedAt: "f", changed: true, outcomes: [{ storeKey: "use-sul", ok: false, error: "boom" }, { storeKey: "use-norte", ok: true, productCount: 1, bindingCount: 1, merchCount: 0, excludedCount: 0, rejected: 0, requests: 7 }] };
    const onCatalogChanged = vi.fn();
    const result = await runDailyGarmentSync({ storeKeys: ["use-sul", "use-norte"], onCatalogChanged, revalidatePaths: () => undefined, syncCatalogImpl: (async () => catalog) as never, fetchStore: opts().fetchStore, minPieces: 1, log: () => undefined });

    expect(calls.map((c) => c.store)).toEqual(["use-norte"]);
    expect(result.status === "done" && result.clean).toBe(false);
    expect(result.status === "done" && result.inkRequests).toBe(8);
    expect(onCatalogChanged).toHaveBeenCalledTimes(1);
    expect((await readGarmentSyncState()).stores["use-sul"]).toBeUndefined();
  });

  test("given the base catalog did not change, then the page caches are not cleared", async () => {
    const catalog = { startedAt: "s", finishedAt: "f", changed: false, outcomes: [{ storeKey: "use-sul", ok: true, productCount: 1, bindingCount: 1, merchCount: 0, excludedCount: 0, rejected: 0, requests: 3 }] };
    const onCatalogChanged = vi.fn();
    const result = await runDailyGarmentSync({ storeKeys: ["use-sul"], onCatalogChanged, revalidatePaths: () => undefined, syncCatalogImpl: (async () => catalog) as never, fetchStore: opts().fetchStore, minPieces: 1, log: () => undefined });

    expect(onCatalogChanged).not.toHaveBeenCalled();
    expect(result.status === "done" && result.clean).toBe(true);
  });
});

describe("cursor and upsert helpers", () => {
  test("given a newest product date, then the cursor is that day minus the overlap and never moves backwards", () => {
    expect(advanceCursor("2026-09-20", "2026-09-28T01:00:00-03:00")).toBe("2026-09-26");
    expect(advanceCursor("2026-09-27", "2026-09-28T01:00:00-03:00")).toBe("2026-09-27");
    expect(advanceCursor("2026-09-20", null)).toBe("2026-09-20");
  });

  test("given the same pieces applied twice, then the second application changes nothing", () => {
    const clusters: Record<string, ReturnType<typeof tuple>[]> = {};
    const pieces = [{ cluster: "1", tuple: tuple(72, "10", "a", 10) }];
    expect(applyPieces(clusters, pieces).productsChanged).toBe(1);
    expect(applyPieces(clusters, pieces).productsChanged).toBe(0);
    expect(clusters["1"]).toHaveLength(1);
  });
});
