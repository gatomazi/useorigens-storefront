import { describe, expect, test } from "vitest";
import { matcherForStore, MAX_STORED_MEMBERS, parseCollectionsPage, searchCoverage, searchMembers, type CollectionRecord } from "@/lib/catalog/collections";
import { buildSearchDocs } from "@/lib/catalog/search-docs";
import type { Catalog } from "@/lib/catalog/repository";
import type { MerchProduct } from "@/lib/catalog/types";
import { searchDocs } from "@/lib/search/catalog-search";

/**
 * The text search must list EVERY product of a collection when its name is searched, not the 48-item showcase slice. Two real collections are
 * bigger than that ("Fala Daqui" 55, "Da Nossa Terra" 73); their members are neutral "Estampa NNN" products so a hit can only come from the
 * collection membership, never from the product title.
 */
const merch = (n: number): MerchProduct => ({
  inkProductId: String(n), commerceStoreKey: "use-sul", regionSlug: "sul", name: `Estampa ${String(n).padStart(3, "0")}`, slug: `estampa-${n}`,
  storeProductUrl: `https://www.usesul.com.br/usesul/product/estampa-${n}`, imageUrl: `https://img/${n}.jpg`, price: 109.9, totalSalesCount: 0, syncedAt: "2026-09-21T00:00:00Z",
});
const ALL = Array.from({ length: 140 }, (_, i) => merch(i + 1));
const catalog = { syncedAt: null, cityFamilies: () => [], cityLocalities: () => [], merch: () => ALL, coveredCityIds: () => new Set<string>() } as unknown as Catalog;
const match = matcherForStore({ bindings: [], merch: ALL });
const inkItem = (id: number, name: string, ids: number[], available = true) => ({ id, name, slug: name.toLowerCase().replace(/ /g, "-"), description: null, is_available: available, position: id, product_ids: ids, kit_ids: [] });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const parse = (items: unknown[]): CollectionRecord[] => {
  const r = parseCollectionsPage({ collections: items, page: 1, per_page: 100, total_pages: 1, total_count: items.length }, match);
  if (!r.ok) throw new Error(r.error);
  return r.value.collections;
};

// "Fala Daqui": 55 members (+ an id INK reports that is not in the catalog); "Da Nossa Terra": 73; "Interna": hidden on INK.
const records = parse([inkItem(1, "Fala Daqui", [...range(1, 55), 999_999]), inkItem(2, "Da Nossa Terra", range(56, 128)), inkItem(3, "Interna Sul", range(129, 140), false)]);
const docs = buildSearchDocs(catalog, "sul", records);
const all = (query: string) => {
  const first = searchDocs(docs, query);
  const items = [...first.items];
  for (let page = 2; page <= first.pageCount; page++) items.push(...searchDocs(docs, query, { page }).items);
  return { total: first.total, pageCount: first.pageCount, titles: items.map((d) => d.title), ids: items.map((d) => d.id) };
};

describe("collection search coverage", () => {
  test("given a collection with 55 members, when its name is searched, then all 55 are listed across pages, including those after the 48th", () => {
    expect(MAX_STORED_MEMBERS).toBe(48);
    const found = all("fala daqui");
    expect(found.total).toBe(55);
    expect(found.pageCount).toBe(3); // 24 + 24 + 7
    for (const n of range(49, 55)) expect(found.titles).toContain(`Estampa ${String(n).padStart(3, "0")}`); // the ones a 48-item slice dropped
    expect(new Set(found.ids).size).toBe(55); // no duplicates across pages
    expect(found.ids).not.toContain("56"); // and nothing from the other collection
  });

  test("given a collection with 73 members, when its name is searched, then all 73 are listed (the 73rd is the last id)", () => {
    const found = all("da nossa terra");
    expect(found.total).toBe(73);
    expect(found.pageCount).toBe(4);
    expect(found.ids).toContain("128");
    expect(new Set(found.ids).size).toBe(73);
  });

  test("given the accent-free and mixed-case name, when searched, then the same complete set comes back", () => {
    expect(all("DA nossa TERRA").total).toBe(73);
    expect(all("fala").total).toBe(55);
  });

  test("given an internal (hidden on INK) collection, when its name is searched, then nothing is listed: it has no public page", () => {
    expect(all("interna sul").total).toBe(0);
  });

  test("given a product in a collection, when the product itself is searched by title, then it still matches and is not duplicated", () => {
    const hit = searchDocs(docs, "estampa 010");
    expect(hit.items.filter((d) => d.id === "10")).toHaveLength(1);
  });
});

describe("truncated membership is never presented as complete", () => {
  const legacy: CollectionRecord = { id: 9, name: "Fala Antiga", slug: "fala-antiga", position: 1, isAvailable: true, reportedProductCount: 55, matchedCount: 55, merchCount: 55, cityDesignCount: 0, memberIds: range(1, 48).map(String) };

  test("given a record from before the full lists were stored, when searched by collection name, then it is skipped, not listed as a 48-item slice", () => {
    expect(searchMembers(legacy)).toBeNull();
    expect(all("x").total).toBe(0);
    const partialDocs = buildSearchDocs(catalog, "sul", [legacy]);
    expect(searchDocs(partialDocs, "fala antiga").total).toBe(0);
  });

  test("given a short legacy collection whose slice is everything, when searched, then it counts as complete", () => {
    const short: CollectionRecord = { ...legacy, id: 10, name: "Curta", matchedCount: 5, merchCount: 5, memberIds: ["1", "2", "3", "4", "5"] };
    expect(searchMembers(short)).toEqual(["1", "2", "3", "4", "5"]);
    expect(searchDocs(buildSearchDocs(catalog, "sul", [short]), "curta").total).toBe(5);
  });

  test("given a stored list that disagrees with the matched count or is malformed, when checked, then it is not trusted", () => {
    expect(searchMembers({ ...legacy, searchMemberIds: ["1", "2"] })).toBeNull();
    expect(searchMembers({ ...legacy, searchMemberIds: 5 as unknown as string[] })).toBeNull();
    expect(searchMembers({ ...legacy, matchedCount: 0 })).toBeNull();
    expect(searchMembers({ ...legacy, needsResync: true, searchMemberIds: range(1, 55).map(String) })).toBeNull();
  });

  test("given a mix of complete and legacy records, when the coverage is computed, then the admin is told exactly which ones need a resync", () => {
    const cov = searchCoverage([...records, legacy, { ...legacy, id: 11, name: "Vazia", matchedCount: 0, memberIds: [] }]);
    expect(cov).toEqual({ complete: 2, partial: ["Fala Antiga"] }); // internal and empty ones are not "public with products"
    expect(searchCoverage(records)).toEqual({ complete: 2, partial: [] });
  });
});
