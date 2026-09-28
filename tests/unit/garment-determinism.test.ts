import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { GarmentTuple } from "@/lib/catalog/garment-index-file";
import type { CatalogSnapshot, UnrankedBinding } from "@/lib/catalog/types";
import { indexOf, tuple, writeIndexFile } from "./garment-index-fixture";

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

const snapshotOf = (bindings: UnrankedBinding[]): CatalogSnapshot => ({
  version: 1,
  stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: NOW, productCount: bindings.length, bindings, merch: [], excluded: [] } },
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

  async function pieceInPeruanoTab(bindings: UnrankedBinding[], clusters: Record<string, GarmentTuple[]>) {
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
    await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(snapshotOf(bindings)));
    await writeIndexFile(dir, indexOf({ "use-sul": clusters }));
    const { getCatalog } = await import("@/lib/catalog/repository");
    const { entriesByGarment } = getCatalog().garmentTabsForCity(CITY_ID);
    return entriesByGarment[72]?.map((e) => e.primary.inkProductId);
  }

  const withRegional = [canonical({}), canonical({ designVariant: "regional", inkProductId: "20", productClusterId: "200" })];

  test("given a family with a regional variant, when read, then only the primary's cluster piece is shown", async () => {
    const clusters = { "200": [tuple(72, "21", "regional-peruano", 139.9)], "100": [tuple(72, "11", "peruano", 139.9)] };
    expect(await pieceInPeruanoTab(withRegional, clusters)).toEqual(["11"]);
  });

  test("given the same clusters listed in the opposite order, when read, then the result is identical", async () => {
    const clusters = { "100": [tuple(72, "11", "peruano", 139.9)], "200": [tuple(72, "21", "regional-peruano", 139.9)] };
    expect(await pieceInPeruanoTab(withRegional, clusters)).toEqual(["11"]);
  });

  test("given two products of one cluster and one type, when read, then the lowest INK id wins regardless of order", async () => {
    const a = tuple(72, "15", "peruano-a", 139.9);
    const b = tuple(72, "12", "peruano-b", 139.9);
    expect(await pieceInPeruanoTab([canonical({})], { "100": [a, b] })).toEqual(["12"]);
    expect(await pieceInPeruanoTab([canonical({})], { "100": [b, a] })).toEqual(["12"]);
  });
});
