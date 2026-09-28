import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { CatalogSnapshot, GarmentBinding, UnrankedBinding } from "@/lib/catalog/types";

const NOW = "2026-09-27T00:00:00.000Z";
const CITY_ID = "4218004"; // Tijucas/SC

const canonical = (over: Partial<UnrankedBinding>): UnrankedBinding => ({
  cityId: CITY_ID,
  designFamily: "traco",
  designVariant: "base",
  commerceStoreKey: "use-sul",
  inkProductId: "10",
  slug: "tijucas-traco-sc",
  storeProductUrl: "https://www.usesul.com.br/usesul/product/tijucas-traco-sc",
  imageUrl: "https://img/classic.jpg",
  price: 109.9,
  syncedAt: NOW,
  productClusterId: "100",
  ...over,
});

const piece = (over: Partial<GarmentBinding>): GarmentBinding => ({
  cityId: CITY_ID,
  designFamily: "traco",
  garmentTypeId: 72,
  commerceStoreKey: "use-sul",
  inkProductId: "11",
  slug: "peruano",
  storeProductUrl: "https://www.usesul.com.br/usesul/product/peruano",
  imageUrl: "https://img/peruano.jpg",
  price: 139.9,
  productClusterId: "100",
  syncedAt: NOW,
  ...over,
});

const snapshot = (bindings: UnrankedBinding[], garmentBindings: GarmentBinding[]): CatalogSnapshot => ({
  version: 1,
  stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: NOW, productCount: bindings.length, bindings, merch: [], excluded: [], garmentBindings } },
});

describe("garmentTabsForCity — deterministic choice of the piece", () => {
  let dir: string;
  const env = process.env;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "garment-determinism-"));
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  async function pieceInPeruanoTab(snap: CatalogSnapshot) {
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
    await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(snap));
    const { getCatalog } = await import("@/lib/catalog/repository");
    const { entriesByGarment } = getCatalog().garmentTabsForCity(CITY_ID);
    return entriesByGarment[72]?.map((e) => e.primary.inkProductId);
  }

  test("given a family with a regional variant whose pieces arrive first, when read, then only the primary's cluster piece is shown", async () => {
    const bindings = [canonical({}), canonical({ designVariant: "regional", inkProductId: "20", productClusterId: "200" })];
    const pieces = [piece({ inkProductId: "21", productClusterId: "200" }), piece({ inkProductId: "11", productClusterId: "100" })];
    expect(await pieceInPeruanoTab(snapshot(bindings, pieces))).toEqual(["11"]);
  });

  test("given the same pieces in the opposite arrival order, when read, then the result is identical", async () => {
    const bindings = [canonical({}), canonical({ designVariant: "regional", inkProductId: "20", productClusterId: "200" })];
    const pieces = [piece({ inkProductId: "11", productClusterId: "100" }), piece({ inkProductId: "21", productClusterId: "200" })];
    expect(await pieceInPeruanoTab(snapshot(bindings, pieces))).toEqual(["11"]);
  });

  test("given two products of one cluster and one type, when read, then the lowest INK id wins regardless of order", async () => {
    const a = piece({ inkProductId: "15" });
    const b = piece({ inkProductId: "12" });
    expect(await pieceInPeruanoTab(snapshot([canonical({})], [a, b]))).toEqual(["12"]);
    expect(await pieceInPeruanoTab(snapshot([canonical({})], [b, a]))).toEqual(["12"]);
  });
});
