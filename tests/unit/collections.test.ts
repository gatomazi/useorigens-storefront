import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { collectionState, matcherForStore, MAX_STORED_MEMBERS, normalizeCollectionsSnapshot, parseCollectionsPage, sameCollections, shouldPromoteCollections, sortCollections, type CollectionRecord, type StoreCollections } from "@/lib/catalog/collections";
import { categoryLookup, libraryEntries, publicCollectionSlug, selectableEntries } from "@/lib/catalog/collection-source";
import type { StoreProducts } from "@/lib/catalog/repository";
import { readCollectionsFile } from "@/lib/catalog/collections-file";
import { syncCollections } from "@/lib/catalog/collections-sync";
import type { MerchProduct, UnrankedBinding } from "@/lib/catalog/types";
import { fetchStoreCollections, InkCollectionsError, MAX_BODY_BYTES } from "@/lib/ink/collections-client";
import { collectionUrl, destinationHref, resolveSource } from "@/lib/site-config/sources";

const index = { bindings: [{ inkProductId: "9001" }, { inkProductId: "9002" }], merch: [{ inkProductId: "11" }, { inkProductId: "12" }, { inkProductId: "13" }, { inkProductId: "14" }] };
const match = matcherForStore(index);

const inkItem = (over: Record<string, unknown> = {}) => ({ id: 1, name: "Da Nossa Terra", slug: "da-nossa-terra", description: null, is_available: true, position: 1, product_ids: [11, 12, 13, 555555], kit_ids: [], created_at: "x", updated_at: "y", ...over });
const inkPage = (items: unknown[], meta: Partial<{ page: number; total_pages: number; total_count: number }> = {}) => ({ collections: items, page: 1, per_page: 100, total_pages: 1, total_count: items.length, ...meta });
const pageOf = (u: string | URL | Request): number => Number(new URL(String(u)).searchParams.get("page"));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("collections page parsing", () => {
  test("given a valid page, when parsed, then ids are reduced to this store's catalog and the raw list is dropped", () => {
    const r = parseCollectionsPage(inkPage([inkItem()]), match);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.value.collections[0];
    expect(c.reportedProductCount).toBe(4);
    expect(c.memberIds).toEqual(["11", "12", "13"]); // 555555 is not in the catalog: dropped, never invented
    expect(c).toMatchObject({ matchedCount: 3, merchCount: 3, cityDesignCount: 0 });
    expect(JSON.stringify(c)).not.toContain("555555");
  });

  test("given city designs and merch mixed, when parsed, then both kinds are members, in INK's order, and counted separately", () => {
    const r = parseCollectionsPage(inkPage([inkItem({ product_ids: [9001, 11, 9002, 12] })]), match);
    expect(r.ok && r.value.collections[0]).toMatchObject({ memberIds: ["9001", "11", "9002", "12"], matchedCount: 4, merchCount: 2, cityDesignCount: 2 });
  });

  test("given an INTERNAL (hidden) collection, when parsed, then its real members are kept — visibility is not eligibility", () => {
    const r = parseCollectionsPage(inkPage([inkItem({ is_available: false, product_ids: [9001, 9002, 11, 555] }), inkItem({ id: 2, slug: "x", is_available: null, product_ids: [12] })]), match);
    expect(r.ok && r.value.collections.map((c) => [c.isAvailable, c.memberIds])).toEqual([[false, ["9001", "9002", "11"]], [false, ["12"]]]);
  });

  test("given a huge collection, when parsed, then the total is counted but only the first members are stored (no raw id dump)", () => {
    const big = Array.from({ length: 200 }, (_, i) => 20_000 + i);
    const wide = matcherForStore({ bindings: big.map((id) => ({ inkProductId: String(id) })), merch: [] });
    const r = parseCollectionsPage(inkPage([inkItem({ product_ids: [...big, ...Array.from({ length: 100_000 }, (_, i) => 1_000_000 + i)] })]), wide);
    const c = r.ok ? r.value.collections[0] : null;
    expect(c).toMatchObject({ matchedCount: 200, reportedProductCount: 100_200 });
    expect(c!.memberIds).toHaveLength(MAX_STORED_MEMBERS);
    expect(c!.memberIds[0]).toBe("20000"); // INK's order
    expect(JSON.stringify(c).length).toBeLessThan(1000);
  });

  test("given repeated ids in one collection, when matched, then a product counts once", () => {
    const r = parseCollectionsPage(inkPage([inkItem({ product_ids: [11, 11, 11] })]), match);
    expect(r.ok && r.value.collections[0]).toMatchObject({ memberIds: ["11"], matchedCount: 1 });
  });

  test("given a store index, when matching, then an id only counts for the store the index belongs to", () => {
    const norte = matcherForStore({ bindings: [], merch: [{ inkProductId: "9999" }] });
    expect(norte(["11", "9999"])).toEqual({ members: ["9999"], matched: 1, merch: 1, cityDesigns: 0 });
  });

  test("given malformed pages, when parsed, then each is rejected as a whole", () => {
    const bad: unknown[] = [null, 5, {}, { collections: {} }, inkPage([inkItem({ id: "1" })]), inkPage([inkItem({ id: 0 })]), inkPage([inkItem({ slug: "Bad Slug" })]), inkPage([inkItem({ name: "" })]), inkPage([inkItem({ position: "1" })]), inkPage([inkItem({ is_available: "yes" })]), inkPage([inkItem({ product_ids: ["11"] })]), inkPage([inkItem({ product_ids: null })]), { ...inkPage([]), total_pages: -1 }];
    for (const b of bad) expect(parseCollectionsPage(b, match).ok, JSON.stringify(b)?.slice(0, 60)).toBe(false);
  });

  test("given collections out of order, when sorted, then INK's navbar position wins, then id (deterministic)", () => {
    const list = sortCollections([{ id: 3, position: 2 }, { id: 2, position: 2 }, { id: 9, position: 1 }] as never);
    expect(list.map((c) => c.id)).toEqual([9, 2, 3]);
  });
});

describe("promotion guard and idempotency", () => {
  const store = (n: number, total = n, catalogSyncedAt = "c1"): StoreCollections => ({ commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt, totalCount: total, collections: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: "n", slug: "s", position: i, isAvailable: true, reportedProductCount: 1, matchedCount: 1, merchCount: 1, cityDesignCount: 0, memberIds: ["11"] })) });

  test("given fewer collections than INK reports, when judged, then it is refused as partial", () => {
    expect(shouldPromoteCollections(undefined, store(3, 5))).toMatchObject({ promote: false });
  });

  test("given a blank result over a good snapshot, when judged, then it is refused", () => {
    expect(shouldPromoteCollections(store(20), store(0))).toMatchObject({ promote: false });
  });

  test("given a drop of more than half, when judged, then it is refused", () => {
    expect(shouldPromoteCollections(store(20), store(8))).toMatchObject({ promote: false });
  });

  test("given a first sync or a sane change, when judged, then it is promoted", () => {
    expect(shouldPromoteCollections(undefined, store(22))).toEqual({ promote: true });
    expect(shouldPromoteCollections(store(22), store(23))).toEqual({ promote: true });
  });

  test("given identical content with a newer timestamp, when compared, then it is 'same' (no rewrite)", () => {
    expect(sameCollections(store(3), { ...store(3), syncedAt: "later" })).toBe(true);
    expect(sameCollections(store(3), store(3, 3, "c2"))).toBe(false);
  });
});

describe("paginated read-only client", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, INK_TOKEN_SUL: "test-token-not-real" };
  });
  afterEach(() => {
    process.env = env;
  });
  const noSleep = async () => undefined;

  test("given two pages, when fetched, then both are read with GET, the token only in the header, and the result is complete", async () => {
    const calls: { url: string; method?: string; auth: string | null }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method, auth: new Headers(init?.headers).get("authorization") });
      return pageOf(u) === 1 ? json(inkPage([inkItem({ id: 1 })], { page: 1, total_pages: 2, total_count: 2 })) : json(inkPage([inkItem({ id: 2, slug: "b" })], { page: 2, total_pages: 2, total_count: 2 }));
    }) as unknown as typeof fetch;
    const r = await fetchStoreCollections("use-sul", match, { fetchImpl, sleep: noSleep });
    expect(r.collections.map((c) => c.id)).toEqual([1, 2]);
    expect(r.requests).toBe(2);
    expect(calls.map((c) => c.method ?? "GET")).toEqual(["GET", "GET"]);
    expect(calls.every((c) => c.auth === "Bearer test-token-not-real" && !c.url.includes("test-token"))).toBe(true);
    expect(calls[0].url).toContain("/v1/stores/collections?per_page=100&page=1");
  });

  test("given a 429, when fetched, then it backs off and retries the same page", async () => {
    const sleeps: number[] = [];
    let n = 0;
    const fetchImpl = (async () => (++n === 1 ? json({}, 429) : json(inkPage([inkItem()])))) as unknown as typeof fetch;
    const r = await fetchStoreCollections("use-sul", match, { fetchImpl, sleep: async (ms) => void sleeps.push(ms), backoffMs: [7] });
    expect(sleeps).toEqual([7]);
    expect(r.requests).toBe(2);
  });

  test("given persistent 429, when fetched, then it gives up with a clear error instead of looping", async () => {
    const fetchImpl = (async () => json({}, 429)) as unknown as typeof fetch;
    await expect(fetchStoreCollections("use-sul", match, { fetchImpl, sleep: noSleep, backoffMs: [1, 1] })).rejects.toMatchObject({ status: 429 });
  });

  test("given a 403 (missing scope), when fetched, then it fails with the status and does not retry", async () => {
    const fetchImpl = vi.fn(async () => json({ error: "forbidden" }, 403)) as unknown as typeof fetch;
    await expect(fetchStoreCollections("use-sul", match, { fetchImpl, sleep: noSleep })).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("given a store without a token, when fetched, then it fails before any request", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(fetchStoreCollections("use-norte", match, { fetchImpl })).rejects.toBeInstanceOf(InkCollectionsError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("given a page answered for another page number, when fetched, then it fails", async () => {
    const fetchImpl = (async () => json(inkPage([inkItem()], { page: 3, total_pages: 5, total_count: 1 }))) as unknown as typeof fetch;
    await expect(fetchStoreCollections("use-sul", match, { fetchImpl, sleep: noSleep })).rejects.toThrow(/asked for page 1/);
  });

  test("given the same collection on two pages, when fetched, then it is an error (never double-counted)", async () => {
    const fetchImpl = (async (u: string | URL | Request) => json(inkPage([inkItem()], { page: pageOf(u), total_pages: 2, total_count: 2 }))) as unknown as typeof fetch;
    await expect(fetchStoreCollections("use-sul", match, { fetchImpl, sleep: noSleep })).rejects.toThrow(/duplicate/);
  });

  test("given a body that declares more than the cap, when fetched, then it is refused before reading", async () => {
    const big = new Response("{}", { status: 200, headers: { "content-length": String(MAX_BODY_BYTES + 1) } });
    const fetchImpl = (async () => big) as unknown as typeof fetch;
    await expect(fetchStoreCollections("use-sul", match, { fetchImpl, sleep: noSleep })).rejects.toThrow(/declares/);
  });

  test("given an endless page count, when fetched, then it stops at the page ceiling", async () => {
    const fetchImpl = (async (u: string | URL | Request) => json(inkPage([inkItem({ id: pageOf(u) })], { page: pageOf(u), total_pages: 999, total_count: 999 }))) as unknown as typeof fetch;
    await expect(fetchStoreCollections("use-sul", match, { fetchImpl, sleep: noSleep })).rejects.toThrow(/more than/);
  });
});

describe("sync service (isolated files, no INK)", () => {
  let dir: string;
  const env = process.env;
  const catalog = { version: 1, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "2026-09-20T00:00:00.000Z", productCount: 6, bindings: [{ inkProductId: "9001" }], merch: [{ inkProductId: "11" }, { inkProductId: "12" }, { inkProductId: "13" }], excluded: [] } } };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "collections-"));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir, INK_TOKEN_SUL: "t", INK_TOKEN_NORTE: "t" };
    await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(catalog));
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });
  const deps = (fetchImpl: typeof fetch) => ({ fetchImpl, sleep: async () => undefined });
  const okFetch = () => vi.fn(async () => json(inkPage([inkItem()]))) as unknown as typeof fetch;
  const file = () => path.join(dir, "collections-snapshot.json");

  test("given a store with a catalog, when synced, then a separate collections file is written and the catalog file is untouched", async () => {
    const before = await readFile(path.join(dir, "catalog-snapshot.json"), "utf8");
    const out = await syncCollections({ storeKeys: ["use-sul"], deps: deps(okFetch()) });
    expect(out).toEqual([{ storeKey: "use-sul", ok: true, changed: true, collections: 1, available: 1, requests: 1 }]);
    expect(await readFile(path.join(dir, "catalog-snapshot.json"), "utf8")).toBe(before);
    expect(readCollectionsFile(file()).snapshot.stores["use-sul"]?.collections[0].memberIds).toEqual(["11", "12", "13"]);
  });

  test("given a second identical sync, when run, then it reports unchanged and does not rewrite the file", async () => {
    await syncCollections({ storeKeys: ["use-sul"], deps: deps(okFetch()) });
    const first = (await stat(file())).mtimeMs;
    await new Promise((r) => setTimeout(r, 30));
    const out = await syncCollections({ storeKeys: ["use-sul"], deps: deps(okFetch()), now: () => new Date("2030-01-01") });
    expect(out[0]).toMatchObject({ ok: true, changed: false });
    expect((await stat(file())).mtimeMs).toBe(first);
  });

  test("given a store without a catalog index, when synced, then it is skipped and INK is not called", async () => {
    const fetchImpl = okFetch();
    const out = await syncCollections({ storeKeys: ["use-norte"], deps: deps(fetchImpl) });
    expect(out[0]).toMatchObject({ ok: false, error: expect.stringContaining("no catalog index") });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("given INK fails on a later sync, when run, then the last-known-good file is kept", async () => {
    await syncCollections({ storeKeys: ["use-sul"], deps: deps(okFetch()) });
    const good = await readFile(file(), "utf8");
    const out = await syncCollections({ storeKeys: ["use-sul"], deps: deps((async () => json({}, 500)) as unknown as typeof fetch) });
    expect(out[0]).toMatchObject({ ok: false });
    expect(await readFile(file(), "utf8")).toBe(good);
  });

  test("given a partial result (fewer than INK reports), when synced, then nothing is written", async () => {
    const fetchImpl = (async () => json(inkPage([inkItem()], { total_count: 9 }))) as unknown as typeof fetch;
    const out = await syncCollections({ storeKeys: ["use-sul"], deps: deps(fetchImpl) });
    expect(out[0]).toMatchObject({ ok: false, error: expect.stringContaining("partial") });
    await expect(stat(file())).rejects.toThrow();
  });
});

describe("compatibility (no file, corrupt file, the older v1 file)", () => {
  let dir: string;
  const env = process.env;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "collections-legacy-"));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });
  const empty = { version: 2, stores: {} };

  test("given no collections file, when read, then it is empty and nothing throws", () => {
    expect(readCollectionsFile(path.join(dir, "collections-snapshot.json")).snapshot).toEqual(empty);
    expect(libraryEntries("use-sul", new Set(), path.join(dir, "collections-snapshot.json"))).toEqual([]);
  });

  test("given a corrupt, unknown-version or unknown-store file, when read, then it is treated as empty", async () => {
    for (const body of ["{not json", '{"version":3,"stores":{}}', '{"version":2,"stores":{"use-mars":{"collections":[]}}}', "null"]) {
      await writeFile(path.join(dir, "c.json"), body);
      expect(readCollectionsFile(path.join(dir, "c.json")).snapshot, body).toEqual(empty);
    }
  });

  const v1 = {
    version: 1,
    stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 3, collections: [
      { id: 10, name: "Pública antiga", slug: "publica", position: 1, isAvailable: true, reportedProductCount: 50, merchProductIds: ["1", "2", "3"], bindingProductCount: 0 },
      { id: 11, name: "Interna antiga", slug: "interna", position: 2, isAvailable: false, reportedProductCount: 5000, merchProductIds: [], bindingProductCount: 900 },
      { id: 12, name: "Pública com cidades", slug: "cidades", position: 3, isAvailable: true, reportedProductCount: 5000, merchProductIds: [], bindingProductCount: 900 },
    ] } },
  };

  test("given the older v1 file, when read, then it is migrated in memory and every record is flagged for resync", () => {
    const snap = normalizeCollectionsSnapshot(v1)!;
    expect(snap.version).toBe(2);
    const records = snap.stores["use-sul"]!.collections;
    expect(records.every((r) => r.needsResync)).toBe(true);
    expect(records[1]).toMatchObject({ matchedCount: 900, cityDesignCount: 900, memberIds: [] }); // the v1 sync kept none of them
  });

  test("given v1 records, when their state is judged, then a hidden collection is never presented as ready, and only the OLD rule is honoured for public merch", () => {
    const [pub, internal, cities] = normalizeCollectionsSnapshot(v1)!.stores["use-sul"]!.collections;
    expect(collectionState(pub, new Set())).toMatchObject({ selectable: true });
    expect(collectionState(internal, new Set([11]))).toMatchObject({ selectable: false, reason: "needs-resync" }); // enabling cannot make up for missing members
    expect(collectionState(cities, new Set())).toMatchObject({ selectable: false, reason: "needs-resync" });
  });

  test("given a v1 file on disk, when the library and the lookup use it, then the internal one asks for a resync and is not resolvable", async () => {
    const file = path.join(dir, "v1.json");
    await writeFile(file, JSON.stringify(v1));
    expect(libraryEntries("use-sul", new Set([11]), file).find((e) => e.id === 11)).toMatchObject({ selectable: false, reason: "needs-resync", needsResync: true });
    const lookup = categoryLookup(() => ({ merch: new Map(), cityDesigns: new Map() }), () => new Set([11]), file);
    expect(lookup("use-sul", 11, 6)).toEqual({ status: "unavailable", reason: "collection-needs-resync" });
  });

  test("given no collections file, when an ink-category section resolves, then it is unavailable and the section hides (today's behaviour)", () => {
    const lookup = categoryLookup(() => ({ merch: new Map(), cityDesigns: new Map() }), () => new Set(), path.join(dir, "collections-snapshot.json"));
    expect(resolveSource({ kind: "ink-category", store: "use-sul", collectionId: 152188, order: "category", limit: 6 }, {} as never, lookup)).toEqual({ status: "unavailable", reason: "ink-collections-not-synced" });
    expect(resolveSource({ kind: "ink-category", store: "use-sul", collectionId: 152188, order: "category", limit: 6 }, {} as never)).toEqual({ status: "unavailable", reason: "ink-collections-not-synced" });
  });
});

describe("internal collections, CMS enablement and product resolution", () => {
  let dir: string;
  let filePath: string;
  const env = process.env;
  const merchProduct = (id: string, over: Partial<MerchProduct> = {}): MerchProduct => ({ inkProductId: id, commerceStoreKey: "use-sul", regionSlug: "sul", name: `Produto ${id}`, slug: `p-${id}`, storeProductUrl: `https://www.usesul.com.br/usesul/product/${id}`, imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/x.jpg", price: 99.9, totalSalesCount: 0, syncedAt: "t", ...over });
  const cityDesign = (id: string, over: Partial<UnrankedBinding> = {}): UnrankedBinding => ({ cityId: "4218004", designFamily: "ponto-de-origem", designVariant: "base", commerceStoreKey: "use-sul", inkProductId: id, slug: `d-${id}`, storeProductUrl: `https://www.usesul.com.br/usesul/product/d-${id}`, imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/y.jpg", price: 109.9, syncedAt: "t", ...over });
  const rec = (over: Partial<CollectionRecord>): CollectionRecord => ({ id: 1, name: "x", slug: "x", position: 1, isAvailable: true, reportedProductCount: 10, matchedCount: 0, merchCount: 0, cityDesignCount: 0, memberIds: [], ...over });
  const snapshot = {
    version: 2,
    stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 6, collections: [
      rec({ id: 10, name: "Da Nossa Terra", slug: "da-nossa-terra", position: 1, matchedCount: 4, merchCount: 4, memberIds: ["3", "1", "2", "4"] }),
      rec({ id: 11, name: "Poucos", slug: "poucos", position: 2, matchedCount: 2, merchCount: 2, memberIds: ["1", "2"] }),
      rec({ id: 12, name: "SUL - TERRIT. - RS", slug: "sul-territ-rs", position: 3, isAvailable: false, matchedCount: 500, merchCount: 0, cityDesignCount: 500, memberIds: ["d1", "d2", "d3", "d4"] }),
      rec({ id: 13, name: "Fé de Origem", slug: "fe-de-origem", position: 4, isAvailable: false, matchedCount: 3, merchCount: 3, memberIds: ["2", "1", "4"] }),
      rec({ id: 14, name: "Interna quase vazia", slug: "quase", position: 5, isAvailable: false, matchedCount: 1, merchCount: 1, memberIds: ["1"] }),
      rec({ id: 15, name: "Vazia", slug: "vazia", position: 6, matchedCount: 0 }),
    ] } },
  };
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "collections-src-"));
    filePath = path.join(dir, `c-${Math.random().toString(36).slice(2)}.json`);
    await writeFile(filePath, JSON.stringify(snapshot));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });
  const products = (over: Partial<StoreProducts> = {}): (() => StoreProducts) => () => ({
    merch: new Map(["1", "2", "3", "4"].map((id) => [id, merchProduct(id)])),
    cityDesigns: new Map(["d1", "d2", "d3", "d4"].map((id) => [id, cityDesign(id)])),
    ...over,
  });
  const lookup = (enabled: number[] = [], productsOf = products()) => categoryLookup(productsOf, () => new Set(enabled), filePath);

  test("given the synced file, when the state of each collection is judged, then visibility and eligibility are independent", () => {
    const by = Object.fromEntries(libraryEntries("use-sul", new Set(), filePath).map((e) => [e.id, e]));
    expect(by[10]).toMatchObject({ visibility: "public", enabled: true, eligible: true, selectable: true, reason: null });
    expect(by[11]).toMatchObject({ visibility: "public", eligible: false, selectable: false, reason: "too-few-products" });
    expect(by[12]).toMatchObject({ visibility: "internal", enabled: false, eligible: true, selectable: false, reason: "not-enabled" });
    expect(by[14]).toMatchObject({ visibility: "internal", eligible: false, reason: "too-few-products" });
    expect(by[15]).toMatchObject({ selectable: false, reason: "too-few-products" });
  });

  test("given an internal collection, when the CMS enables it explicitly, then it becomes selectable; enabling one does not enable another", () => {
    const by = Object.fromEntries(libraryEntries("use-sul", new Set([12]), filePath).map((e) => [e.id, e]));
    expect(by[12]).toMatchObject({ enabled: true, selectable: true, reason: null });
    expect(by[13]).toMatchObject({ enabled: false, selectable: false, reason: "not-enabled" });
    expect(selectableEntries("use-sul", new Set([12]), filePath).map((e) => e.id)).toEqual([10, 12]);
  });

  test("given an internal collection that is NOT enabled, when resolved, then it yields no products even though they exist", () => {
    expect(lookup([])("use-sul", 12, 6)).toEqual({ status: "unavailable", reason: "collection-not-enabled" });
  });

  test("given an enabled internal collection of city designs, when resolved, then real products appear, labelled by family and city, in INK's order", () => {
    const r = lookup([12])("use-sul", 12, 3);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.items.map((i) => i.id)).toEqual(["d1", "d2", "d3"]);
    expect(r.items[0]).toMatchObject({ name: "Ponto de Origem", context: "Tijucas · SC", state: "SC", href: "https://www.usesul.com.br/usesul/product/d-d1" });
  });

  test("given an enabled internal collection of merch, when resolved, then the merch products appear", () => {
    const r = lookup([13])("use-sul", 13, 6);
    expect(r).toMatchObject({ status: "ok" });
    expect(r.status === "ok" && r.items.map((i) => i.id)).toEqual(["2", "1", "4"]);
  });

  test("given hidden, missing or other-store ids among the members, when resolved, then they never appear", () => {
    const partial = products({ merch: new Map([["2", merchProduct("2")], ["4", merchProduct("4", { commerceStoreKey: "use-norte", storeProductUrl: "https://www.usenorte.com.br/usenorte/product/4" })]]) });
    const r = lookup([13], partial)("use-sul", 13, 6);
    expect(r.status === "ok" && r.items.map((i) => i.id)).toEqual(["2", "4"]); // "1" is not in the store's snapshot: skipped, not invented
    expect(r.status === "ok" && r.items.find((i) => i.id === "4")!.href).toContain("usenorte"); // (a product the snapshot of THIS store holds under that id keeps its own url)
  });

  test("given a product whose url is not an allowed commerce host, when resolved, then it is not shown", () => {
    const bad = products({ merch: new Map([["1", merchProduct("1", { storeProductUrl: "https://evil.example/p/1" })]]) });
    expect(lookup([13], bad)("use-sul", 13, 6)).toEqual({ status: "unavailable", reason: "collection-has-no-products" });
  });

  test("given a collection with fewer than 3 real products, when resolved, then it can still resolve (the editor refuses to build on it, the library explains why)", () => {
    expect(lookup([14])("use-sul", 14, 6)).toMatchObject({ status: "ok" });
    expect(libraryEntries("use-sul", new Set([14]), filePath).find((e) => e.id === 14)).toMatchObject({ selectable: false, reason: "too-few-products" });
  });

  test("given unknown, other-store and empty collections, when resolved, then each is unavailable with its own reason", () => {
    expect(lookup()("use-sul", 999, 6)).toEqual({ status: "unavailable", reason: "collection-not-found" });
    expect(lookup()("use-norte", 10, 6)).toEqual({ status: "unavailable", reason: "ink-collections-not-synced" });
    expect(lookup()("use-sul", 15, 6)).toEqual({ status: "unavailable", reason: "collection-has-no-products" });
  });

  test("given the stored link is store + id, when a collection is renamed on INK, then the same id still resolves", async () => {
    const renamed = JSON.parse(JSON.stringify(snapshot));
    renamed.stores["use-sul"].collections[0].name = "Outro nome";
    const file2 = path.join(dir, "renamed.json");
    await writeFile(file2, JSON.stringify(renamed));
    expect(categoryLookup(products(), () => new Set(), file2)("use-sul", 10, 6)).toMatchObject({ status: "ok" });
  });

  test("given public and internal collections, when the 'Ver todos' slug is asked, then only the public one has a page (no invented URL for an internal one)", () => {
    expect(publicCollectionSlug("use-sul", 10, filePath)).toBe("da-nossa-terra");
    expect(publicCollectionSlug("use-sul", 12, filePath)).toBeNull();
    expect(publicCollectionSlug("use-sul", 999, filePath)).toBeNull();
  });
});

describe("collection URLs (verified pattern)", () => {
  test("given the three regional stores, when a slug is turned into a URL, then it follows the verified store pattern", () => {
    expect(collectionUrl("use-sul", "da-nossa-terra")).toBe("https://www.usesul.com.br/usesul/collections/da-nossa-terra");
    expect(collectionUrl("use-norte", "fala-de-onde")).toBe("https://www.usenorte.com.br/usenorte/collections/fala-de-onde");
    expect(collectionUrl("use-centro", "lenda-do-centro")).toBe("https://www.usecentro.com.br/usecentro/collections/lenda-do-centro");
  });

  test("given the future consolidated store or a hostile slug, when a URL is built, then it is null", () => {
    expect(collectionUrl("use-origens", "x")).toBeNull();
    expect(collectionUrl("use-sul", "../admin")).toBeNull();
    expect(collectionUrl("use-sul", "a b")).toBeNull();
  });

  test("given an ink-collection destination, when resolved, then it needs the slug from the snapshot (otherwise null)", () => {
    const dest = { kind: "ink-collection", store: "use-sul", collectionId: 152188 } as const;
    expect(destinationHref(dest)).toBeNull();
    expect(destinationHref(dest, () => "da-nossa-terra")).toBe("https://www.usesul.com.br/usesul/collections/da-nossa-terra");
    expect(destinationHref(dest, () => null)).toBeNull();
  });
});
