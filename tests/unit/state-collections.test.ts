import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { stateCollectionRows } from "@/lib/catalog/collection-source";
import type { CollectionRecord } from "@/lib/catalog/collections";
import type { StoreProducts } from "@/lib/catalog/repository";
import type { MerchProduct } from "@/lib/catalog/types";
import type { ScopeDoc } from "@/lib/site-config/schema";

// Synthetic fixtures: the shape INK gave on 15/10/2026 — a state collection ("Santa Catarina", internal) whose products are spread over public
// collections ("Da Nossa Terra", "Fala Daqui"), with no parent/child link between them on INK's side.
const merch = (id: string): MerchProduct => ({ inkProductId: id, commerceStoreKey: "use-sul", regionSlug: "sul", name: `Produto ${id}`, slug: `p-${id}`, storeProductUrl: `https://www.usesul.com.br/usesul/product/${id}`, imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/x.jpg", price: 99.9, totalSalesCount: 0, syncedAt: "t" });
const products = (): StoreProducts => ({ merch: new Map(["1", "2", "3", "4", "5", "9"].map((id) => [id, merch(id)])), cityDesigns: new Map() });
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
      rec(30, "Santa Catarina", 30, ["1", "2", "3", "4", "8"], { isAvailable: false }),
      rec(31, "Paraná", 31, ["5"], { isAvailable: false }),
      rec(10, "Fala Daqui", 5, ["9", "3", "4"]),
      rec(11, "Da Nossa Terra", 2, ["1", "2", "5"]),
      rec(12, "Novidades", 40, ["9"]),
      rec(13, "Carnaval", 3, ["1"], { isAvailable: false }),
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
      ["Da Nossa Terra", ["1", "2"]], // "5" is Paraná's; "Carnaval" is internal; "Novidades" shares nothing; "8" is not in the catalog
      ["Fala Daqui", ["3", "4"]],
    ]);
  });

  test("given the region's arrangement of a collection, then the row follows it and leaves its hidden products out", () => {
    const doc = { collections: { arrangements: [{ store: "use-sul", collectionId: 11, productIds: ["2"], hiddenIds: ["1"] }] } } as unknown as ScopeDoc;
    expect(stateCollectionRows("sul", "SC", doc, () => products(), filePath)[0].items.map((i) => i.id)).toEqual(["2"]);
  });

  test("given no collection named after the state, then the page shows no rows", () => {
    expect(stateCollectionRows("sul", "RS", undefined, () => products(), filePath)).toEqual([]);
  });
});
