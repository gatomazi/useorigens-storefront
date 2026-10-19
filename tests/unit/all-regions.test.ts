import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ALL_REGIONS_PAGE_SIZE, allRegionsCollectionHref, buildAllRegionsCatalog } from "@/lib/catalog/all-regions";
import { collectionPageLookup } from "@/lib/catalog/collection-source";
import { matcherForStore, type CollectionRecord, type CollectionsSnapshot } from "@/lib/catalog/collections";
import type { StoreProducts } from "@/lib/catalog/repository";
import type { MerchProduct, UnscopedProduct } from "@/lib/catalog/types";
import type { CommerceStoreKey, RegionSlug } from "@/lib/geo/regions";
import { parseCollectionQuery, runCollectionQuery } from "@/lib/search/collection-filter";

const product = (id: string, regionSlug: RegionSlug, commerceStoreKey: CommerceStoreKey = "use-sul"): MerchProduct => ({
  inkProductId: id, regionSlug, commerceStoreKey, name: `Kids ${id}`, slug: `p-${id}`, imageUrl: `https://images.example.com/${id}.jpg`,
  storeProductUrl: `https://www.usesul.com.br/usesul/product/p-${id}`, price: 99.9, syncedAt: "t", totalSalesCount: 0,
});
const record = (ids: string[], over: Partial<CollectionRecord> = {}): CollectionRecord => ({
  id: 1, name: "Kids", slug: "kids", position: 1, isAvailable: true, reportedProductCount: ids.length,
  matchedCount: ids.length, merchCount: ids.length, cityDesignCount: 0, memberIds: ids.slice(0, 48), allMemberIds: ids, ...over,
});
const snapshot = (stores: Partial<Record<CommerceStoreKey, CollectionRecord[]>>): CollectionsSnapshot => ({
  version: 2,
  stores: Object.fromEntries(Object.entries(stores).map(([commerceStoreKey, collections]) => [commerceStoreKey, { commerceStoreKey, syncedAt: "t", catalogSyncedAt: "t", totalCount: collections.length, collections }])),
});
const products = (items: MerchProduct[], unscoped: UnscopedProduct[] = []): StoreProducts => ({ merch: new Map(items.map((p) => [p.inkProductId, p])), cityDesigns: new Map(), unscoped: new Map(unscoped.map((p) => [p.inkProductId, p])) });

describe("all-regions catalog", () => {
  let dir: string;
  let filePath: string;
  beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "all-regions-")); filePath = path.join(dir, "collections.json"); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
  const build = async (collections: CollectionsSnapshot, byStore: Partial<Record<CommerceStoreKey, StoreProducts>>, stores: CommerceStoreKey[] = ["use-sul"]) => {
    await writeFile(filePath, JSON.stringify(collections));
    return buildAllRegionsCatalog({ stores, collections, filePath, productsOf: (store) => byStore[store] ?? products([]) });
  };

  test("one collection contains all regions and unclassified published products, including members beyond the showcase", async () => {
    const sul = Array.from({ length: 50 }, (_, i) => product(String(i + 1), "sul"));
    const norte = product("60", "norte");
    const centro = product("61", "centro-oeste");
    const unscoped = { inkProductId: "62", commerceStoreKey: "use-sul", name: "Kids sem região", slug: "p-62", imageUrl: "https://images.example.com/62.jpg", storeProductUrl: "https://www.usesul.com.br/usesul/product/p-62", price: 99.9, syncedAt: "t", totalSalesCount: 0 } satisfies UnscopedProduct;
    const inventory = products([...sul, norte, centro], [unscoped]);
    const ids = [...inventory.merch.keys(), "62", "9999"];
    const result = await build(snapshot({ "use-sul": [record(ids)] }), { "use-sul": inventory });
    const kids = result.find("kids")!;
    expect(kids.total).toBe(53);
    expect(kids.items.slice(-3).map((p) => p.id)).toEqual(["60", "61", "62"]);
    expect(kids.items.some((p) => p.id === "9999")).toBe(false);
    expect(kids.href).toBe("/regioes/colecoes/kids");
    expect(allRegionsCollectionHref("kids", 2)).toBe("/regioes/colecoes/kids/2");
    expect(kids.items.slice(ALL_REGIONS_PAGE_SIZE * 2).map((p) => p.id)).toContain("62");
    // Existing regional collections retain the geographic filter and exclude globally-only products.
    const regional = collectionPageLookup(() => inventory, () => new Set(), filePath, undefined, "sul")({ kind: "ink-category", store: "use-sul", collectionId: 1, limit: 100, order: "category" }, 1);
    expect(regional.status === "ok" && regional.total).toBe(50);
  });

  test("search and price sorting use the complete collection, with no implicit state or region", async () => {
    const inventory = products([product("1", "sul"), { ...product("2", "norte"), name: "Capivarinha Norte", price: 80 }, { ...product("3", "centro-oeste"), name: "Capivarinha Centro", price: 90 }]);
    const kids = (await build(snapshot({ "use-sul": [record(["1", "2", "3"])] }), { "use-sul": inventory })).find("kids")!;
    const answer = runCollectionQuery(kids.items, parseCollectionQuery(new URLSearchParams("q=capivarinha&ordem=price-asc")));
    expect(answer.items.map((p) => p.id)).toEqual(["2", "3"]);
    expect(runCollectionQuery(kids.items, parseCollectionQuery(new URLSearchParams())).items).toHaveLength(3);
  });

  test("hidden, incomplete and empty collections never become public global pages", async () => {
    const collections = snapshot({ "use-sul": [record(["1"], { isAvailable: false }), record(["1"], { id: 2, slug: "antiga", allMemberIds: undefined, matchedCount: 99 }), record([], { id: 3, slug: "vazia" }), record(["1"], { id: 4, slug: "pendente", needsResync: true })] });
    const result = await build(collections, { "use-sul": products([product("1", "sul")]) });
    expect(result.collections).toEqual([]);
    expect(result.find("kids")).toBeNull();
  });

  test("legacy stores merge the same collection slug without losing equal product ids or duplicating a store", async () => {
    const collections = snapshot({ "use-sul": [record(["1"])], "use-norte": [record(["1"], { id: 2 })] });
    const result = await build(collections, { "use-sul": products([product("1", "sul")]), "use-norte": products([product("1", "norte", "use-norte")]) }, ["use-sul", "use-sul", "use-norte"]);
    expect(result.collections).toHaveLength(1);
    expect(result.find("kids")!.items.map((p) => [p.id, p.key])).toEqual([["1", "use-sul:1"], ["1", "use-norte:1"]]);
  });

  test("category matching retains unclassified published products for the general catalog", () => {
    const match = matcherForStore({ bindings: [], merch: [{ inkProductId: "1" }], unscopedProducts: [{ inkProductId: "2" }] });
    expect(match(["1", "2", "3"])).toMatchObject({ all: ["1", "2"], matched: 2 });
  });
});
