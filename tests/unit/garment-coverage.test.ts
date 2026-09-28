import { describe, expect, test } from "vitest";
import { garmentCoverageByStore } from "@/lib/catalog/garment-coverage";
import type { GarmentIndex, GarmentTuple } from "@/lib/catalog/garment-index-file";
import type { CatalogSnapshot, GarmentBinding, UnrankedBinding } from "@/lib/catalog/types";

const NOW = "2026-09-27T00:00:00.000Z";

function binding(over: Partial<UnrankedBinding> = {}): UnrankedBinding {
  return {
    cityId: "1",
    designFamily: "traco",
    designVariant: "base",
    commerceStoreKey: "use-sul",
    inkProductId: "100",
    slug: "x",
    storeProductUrl: "https://www.usesul.com.br/usesul/product/x",
    imageUrl: "https://img/x.jpg",
    price: 109.9,
    syncedAt: NOW,
    ...over,
  };
}

function garment(over: Partial<GarmentBinding> = {}): GarmentBinding {
  return {
    cityId: "1",
    designFamily: "traco",
    garmentTypeId: 72,
    commerceStoreKey: "use-sul",
    inkProductId: "101",
    slug: "y",
    storeProductUrl: "https://www.usesul.com.br/usesul/product/y",
    imageUrl: "https://img/y.jpg",
    price: 139.9,
    productClusterId: "441506",
    syncedAt: NOW,
    ...over,
  };
}

function snapshot(bindings: UnrankedBinding[]): CatalogSnapshot {
  return {
    version: 1,
    stores: {
      "use-sul": { commerceStoreKey: "use-sul", syncedAt: NOW, productCount: bindings.length, bindings, merch: [], excluded: [] },
    },
  };
}

/** The Sul index a set of linked pieces would produce (grouped by cluster, as the sync stores them). */
function indexFrom(garments: GarmentBinding[]): GarmentIndex {
  const clusters: Record<string, GarmentTuple[]> = {};
  for (const g of garments) (clusters[g.productClusterId] ??= []).push([g.garmentTypeId, g.inkProductId, g.slug, "x.jpg", g.price ?? 1]);
  return { version: 1, stores: { "use-sul": { syncedAt: NOW, clusters } } };
}

const run = (bindings: UnrankedBinding[], garments: GarmentBinding[]) => garmentCoverageByStore(snapshot(bindings), indexFrom(garments));

describe("garmentCoverageByStore", () => {
  test("given a binding with all 9 non-classic types linked, when categorized, then it counts as complete", () => {
    const ids = [72, 178, 8, 23, 28, 119, 120, 2, 165]; // every GARMENT_TYPES id except the classic (1)
    const canonical = binding({ cityId: "1", productClusterId: "441506" });
    const garments = ids.map((id) => garment({ cityId: "1", garmentTypeId: id }));
    const [coverage] = run([canonical], garments);
    expect(coverage).toMatchObject({ complete: 1, partial: 0, noVariants: 0, noCluster: 0, totalCanonicalBindings: 1 });
  });

  test("given a binding with some but not all types linked, when categorized, then it counts as partial", () => {
    const canonical = binding({ cityId: "1", productClusterId: "441506" });
    const garments = [garment({ cityId: "1", garmentTypeId: 72 }), garment({ cityId: "1", garmentTypeId: 178, inkProductId: "102" })];
    const [coverage] = run([canonical], garments);
    expect(coverage).toMatchObject({ complete: 0, partial: 1, noVariants: 0, noCluster: 0 });
  });

  test("given a binding with a known cluster but zero linked garments, when categorized, then it counts as no_variants (never an error)", () => {
    const canonical = binding({ cityId: "1", productClusterId: "441506" });
    const [coverage] = run([canonical], []);
    expect(coverage).toMatchObject({ complete: 0, partial: 0, noVariants: 1, noCluster: 0 });
  });

  test("given a binding with no product_cluster_id at all, when categorized, then it counts as no_cluster, distinct from no_variants", () => {
    const canonical = binding({ cityId: "1", productClusterId: undefined });
    const [coverage] = run([canonical], []);
    expect(coverage).toMatchObject({ complete: 0, partial: 0, noVariants: 0, noCluster: 1 });
  });

  test("given a garment binding for a city NOT among the canonical bindings, when categorized, then it is simply not counted anywhere (never inflates a total)", () => {
    const canonical = binding({ cityId: "1", productClusterId: "441506" });
    const orphanGarment = garment({ cityId: "999", productClusterId: "999999" });
    const [coverage] = run([canonical], [orphanGarment]);
    expect(coverage.totalCanonicalBindings).toBe(1);
    expect(coverage.noVariants).toBe(1); // city "1" itself still has zero MATCHING garments
  });

  test("given a mix of statuses, when the ratio is computed, then no_cluster is excluded from 'has any cluster data'", () => {
    const bindings = [binding({ cityId: "1", productClusterId: "441506" }), binding({ cityId: "2", productClusterId: undefined, inkProductId: "200" })];
    const [coverage] = run(bindings, []);
    expect(coverage.totalCanonicalBindings).toBe(2);
    expect(coverage.noVariants).toBe(1);
    expect(coverage.noCluster).toBe(1);
    expect(coverage.ratioWithAnyClusterData).toBe(0.5); // 1 of 2 has a cluster (even with zero linked pieces so far)
  });

  test("given an empty snapshot (no stores synced), when categorized, then it returns an empty array, never a divide-by-zero NaN", () => {
    expect(garmentCoverageByStore({ version: 1, stores: {} }, indexFrom([]))).toEqual([]);
  });

  test("given multiple stores, when categorized, then each is reported independently", () => {
    const snap: CatalogSnapshot = {
      version: 1,
      stores: {
        "use-sul": { commerceStoreKey: "use-sul", syncedAt: NOW, productCount: 1, bindings: [binding({ cityId: "1", productClusterId: "1" })], merch: [], excluded: [] },
        "use-norte": { commerceStoreKey: "use-norte", syncedAt: NOW, productCount: 1, bindings: [binding({ cityId: "2", commerceStoreKey: "use-norte", productClusterId: undefined })], merch: [], excluded: [] },
      },
    };
    const coverage = garmentCoverageByStore(snap, indexFrom([]));
    expect(coverage.map((c) => c.storeKey).sort()).toEqual(["use-norte", "use-sul"]);
    expect(coverage.find((c) => c.storeKey === "use-norte")).toMatchObject({ noCluster: 1 });
  });
});

describe("garmentCoverageByStore — one family, two canonical clusters", () => {
  test("given a family whose second cluster is partial, when categorized, then pieces of another cluster are never added to it", () => {
    const types = [72, 178, 8, 23, 28, 119, 120, 2, 165];
    const fullCluster = types.map((garmentTypeId, i) => garment({ garmentTypeId, inkProductId: String(200 + i), productClusterId: "A" }));
    const partialCluster = [garment({ garmentTypeId: 72, inkProductId: "300", productClusterId: "B" })];
    const [result] = run(
      [binding({ inkProductId: "1", productClusterId: "A" }), binding({ inkProductId: "2", designVariant: "regional", productClusterId: "B" })],
      [...fullCluster, ...partialCluster],
    );
    expect(result).toMatchObject({ complete: 1, partial: 1, noVariants: 0, noCluster: 0 });
  });
});
