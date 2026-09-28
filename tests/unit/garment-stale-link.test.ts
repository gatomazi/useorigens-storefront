import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { indexOf, IMAGE_HOST, tuple, writeIndexFile } from "./garment-index-fixture";

const NOW = "2026-09-27T00:00:00.000Z";

// A real municipality id (Tijucas/SC) so `cityById`/region resolution succeed without extra fixtures.
const CITY_ID = "4218004";

function snapshotWith(canonicalClusterId: string | undefined): CatalogSnapshot {
  return {
    version: 1,
    stores: {
      "use-sul": {
        commerceStoreKey: "use-sul",
        syncedAt: NOW,
        productCount: 1,
        bindings: [
          {
            cityId: CITY_ID,
            designFamily: "traco",
            designVariant: "base",
            commerceStoreKey: "use-sul",
            inkProductId: "1",
            slug: "tijucas-traco-sc",
            storeProductUrl: "https://www.usesul.com.br/usesul/product/tijucas-traco-sc",
            imageUrl: "https://img/classic.jpg",
            price: 109.9,
            syncedAt: NOW,
            ...(canonicalClusterId ? { productClusterId: canonicalClusterId } : {}),
          },
        ],
        merch: [],
        excluded: [],
      },
    },
  };
}

const peruano = tuple(72, "2", "tijucas-traco-sc-peruano", 139.9);

describe("garmentTabsForCity — stale cluster link and optional index (never show an obsolete piece; never break the page)", () => {
  let dir: string;
  const env = process.env;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "garment-stale-"));
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  async function catalogFor(canonicalClusterId: string | undefined, indexClusters: Record<string, ReturnType<typeof tuple>[]> | "missing" | "corrupt") {
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
    await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(snapshotWith(canonicalClusterId)));
    if (indexClusters === "corrupt") await writeFile(path.join(dir, "garment-index.json"), "{ not json");
    else if (indexClusters !== "missing") await writeIndexFile(dir, indexOf({ "use-sul": indexClusters }));
    const { getCatalog } = await import("@/lib/catalog/repository");
    return getCatalog();
  }

  test("given the index cluster matches the canonical's, when read, then the piece is included", async () => {
    const catalog = await catalogFor("441506", { "441506": [peruano] });
    expect(catalog.garmentTabsForCity(CITY_ID).tabs.map((t) => t.slug)).toContain("peruano");
  });

  test("given the canonical binding has since rotated to a different cluster, when read, then the stale piece is not shown", async () => {
    const catalog = await catalogFor("999999", { "441506": [peruano] });
    expect(catalog.garmentTabsForCity(CITY_ID).tabs.map((t) => t.slug)).not.toContain("peruano");
  });

  test("given the canonical binding has since lost its cluster id, when read, then no piece is shown (fail closed)", async () => {
    const catalog = await catalogFor(undefined, { "441506": [peruano] });
    expect(catalog.garmentTabsForCity(CITY_ID).tabs).toEqual([]);
  });

  test("given no garment index file, when read, then the tabs are hidden and the rest of the catalog still works", async () => {
    const catalog = await catalogFor("441506", "missing");
    expect(catalog.garmentTabsForCity(CITY_ID)).toEqual({ tabs: [], entriesByGarment: {} });
    expect(catalog.cityFamilies(CITY_ID)).toHaveLength(1);
  });

  test("given a corrupt garment index file, when read, then the tabs are hidden and the rest of the catalog still works", async () => {
    const catalog = await catalogFor("441506", "corrupt");
    expect(catalog.garmentTabsForCity(CITY_ID)).toEqual({ tabs: [], entriesByGarment: {} });
    expect(catalog.cityFamilies(CITY_ID)).toHaveLength(1);
  });

  test("given a stored piece, when read, then the URL is rebuilt from the slug and the image prefix is restored", async () => {
    const catalog = await catalogFor("441506", { "441506": [tuple(72, "2", "tijucas-traco-sc-peruano", 139.9, "product_v2/main_image/x.jpg")] });
    const { entriesByGarment, tabs } = catalog.garmentTabsForCity(CITY_ID);
    const [entry] = entriesByGarment[tabs.find((t) => t.slug === "peruano")!.id];
    expect(entry.primary).toMatchObject({
      storeProductUrl: "https://www.usesul.com.br/usesul/product/tijucas-traco-sc-peruano",
      imageUrl: `${IMAGE_HOST}product_v2/main_image/x.jpg`,
      price: 139.9,
    });
  });
});
