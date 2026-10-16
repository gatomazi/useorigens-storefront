import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { stateCollectionRows, stateRowMatrix, stateRowsReach } from "@/lib/catalog/collection-source";
import { applyOp } from "@/lib/admin/draft-ops";
import { buildSeedBundle } from "@/lib/site-config/seed";
import type { CollectionRecord } from "@/lib/catalog/collections";
import type { StoreProducts } from "@/lib/catalog/repository";
import type { MerchProduct } from "@/lib/catalog/types";
import type { ScopeDoc } from "@/lib/site-config/schema";

// Synthetic fixtures: the shape INK gave on 15/10/2026 — a state collection ("Santa Catarina", internal) whose products are spread over public
// collections ("Da Nossa Terra", "Fala Daqui"), with no parent/child link between them on INK's side.
const merch = (id: string): MerchProduct => ({ inkProductId: id, commerceStoreKey: "use-sul", regionSlug: "sul", name: `Produto ${id}`, slug: `p-${id}`, storeProductUrl: `https://www.usesul.com.br/usesul/product/${id}`, imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/x.jpg", price: 99.9, totalSalesCount: 0, syncedAt: "t" });
const products = (): StoreProducts => ({ merch: new Map(["1", "2", "3", "4", "5", "6", "7", "9"].map((id) => [id, merch(id)])), cityDesigns: new Map() });
const rec = (id: number, name: string, position: number, ids: string[], over: Partial<CollectionRecord> = {}): CollectionRecord => ({
  id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), position, isAvailable: true, reportedProductCount: ids.length, matchedCount: ids.length, merchCount: ids.length, cityDesignCount: 0, memberIds: ids, allMemberIds: ids, ...over,
});

describe("a state's collections on its page", () => {
  let dir: string;
  let filePath: string;
  const env = process.env;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "state-collections-"));
    filePath = path.join(dir, "collections-snapshot.json");
    await writeFile(filePath, JSON.stringify({ version: 2, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 5, collections: [
      rec(30, "Santa Catarina", 30, ["1", "2", "3", "4", "6", "7", "8"], { isAvailable: false }),
      rec(31, "Paraná", 31, ["5"], { isAvailable: false }),
      rec(10, "Fala Daqui", 5, ["9", "3", "4", "6"]),
      rec(11, "Da Nossa Terra", 2, ["1", "2", "5", "7"]),
      rec(12, "Novidades", 40, ["9", "1"]),
      rec(13, "Carnaval", 3, ["1", "2", "3"], { isAvailable: false }),
    ] } } }));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  test("given the state's collection, then one row per public collection sharing products with it, in INK's order, with only the state's products", () => {
    const rows = stateCollectionRows("sul", "SC", undefined, () => products(), filePath);
    expect(rows.map((r) => [r.collection.name, r.items.map((i) => i.id)])).toEqual([
      ["Da Nossa Terra", ["1", "2", "7"]], // "5" is Paraná's; "Carnaval" is internal; "8" is not in the catalog
      ["Fala Daqui", ["3", "4", "6"]],
    ]); // "Novidades" shares one product with the state: below the minimum of 3, no row
  });

  test("given the panel's matrix, then every state says whether it has a parent collection and each candidate row how many products it would show there", () => {
    const { states, counts } = stateRowMatrix("sul", undefined, () => products(), filePath);
    expect(states).toEqual([
      { uf: "PR", name: "Paraná", parent: { id: 31, name: "Paraná", products: 1 } },
      { uf: "SC", name: "Santa Catarina", parent: { id: 30, name: "Santa Catarina", products: 6 } }, // "8" is not in the catalog
      { uf: "RS", name: "Rio Grande do Sul", parent: null },
    ]);
    expect(Object.fromEntries(counts)).toEqual({
      11: { PR: 1, SC: 3, RS: 0 }, // Da Nossa Terra: shows in SC only (3 is the minimum)
      10: { PR: 0, SC: 3, RS: 0 },
      12: { PR: 0, SC: 1, RS: 0 }, // Novidades: counted, below the minimum
    });
  });

  test("given the region's own list, then exactly those collections in that order, internal ones too; a row below 3 products still does not show", () => {
    const doc = { collections: { enabled: [], stateRows: [{ store: "use-sul", collectionId: 10 }, { store: "use-sul", collectionId: 13 }, { store: "use-sul", collectionId: 12 }] } } as unknown as ScopeDoc;
    expect(stateCollectionRows("sul", "SC", doc, () => products(), filePath).map((r) => r.collection.name)).toEqual(["Fala Daqui", "Carnaval"]);
    expect([...stateRowsReach("sul", doc, () => products(), filePath)]).toEqual([[10, 1], [13, 1]]);
  });

  test("given the region's arrangement of a collection, then the row follows it and leaves its hidden products out", () => {
    const doc = { collections: { arrangements: [{ store: "use-sul", collectionId: 11, productIds: ["7"], hiddenIds: ["9"] }, { store: "use-sul", collectionId: 10, hiddenIds: ["4"] }] } } as unknown as ScopeDoc;
    const rows = stateCollectionRows("sul", "SC", doc, () => products(), filePath);
    expect(rows[0].items.map((i) => i.id)).toEqual(["7", "1", "2"]);
    expect(rows.map((r) => r.collection.name)).toEqual(["Da Nossa Terra"]); // Fala Daqui without "4" has only 2 products of the state
  });

  test("given no collection named after the state, then the page shows no rows", () => {
    expect(stateCollectionRows("sul", "RS", undefined, () => products(), filePath)).toEqual([]);
  });
});

describe("the state page's rows in the panel", () => {
  let n = 0;
  const ctx = { newId: () => `t${++n}` };
  const sul = () => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.sul);
  const base = [{ store: "use-sul" as const, collectionId: 11 }, { store: "use-sul" as const, collectionId: 10 }];
  const ok = (r: ReturnType<typeof applyOp>) => {
    if (!r.ok) throw new Error(r.errors.join("; "));
    return r.doc;
  };

  test("given the automatic list, when a collection is taken out, then the region's list starts from what the page showed, without it", () => {
    const doc = ok(applyOp(sul(), { type: "set-state-row", store: "use-sul", collectionId: 11, on: false, base }, ctx));
    expect(doc.collections?.stateRows).toEqual([{ store: "use-sul", collectionId: 10 }]);
  });

  test("given the region's list, when a collection is added, moved and the list reset, then it ends, moves one step and the page goes back to automatic", () => {
    let doc = ok(applyOp(sul(), { type: "set-state-row", store: "use-sul", collectionId: 13, on: true, base }, ctx));
    expect(doc.collections?.stateRows?.map((r) => r.collectionId)).toEqual([11, 10, 13]);
    doc = ok(applyOp(doc, { type: "move-state-row", store: "use-sul", collectionId: 13, direction: "up", base }, ctx));
    expect(doc.collections?.stateRows?.map((r) => r.collectionId)).toEqual([11, 13, 10]);
    expect(applyOp(doc, { type: "move-state-row", store: "use-sul", collectionId: 11, direction: "up", base }, ctx).ok).toBe(false);
    doc = ok(applyOp(doc, { type: "reset-state-rows" }, ctx));
    expect(doc.collections?.stateRows).toBeUndefined();
  });

  test("given another region's store, when added, then the document refuses it", () => {
    expect(applyOp(sul(), { type: "set-state-row", store: "use-norte", collectionId: 13, on: true, base }, ctx).ok).toBe(false);
  });
});
