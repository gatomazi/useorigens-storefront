import { describe, expect, test } from "vitest";
import { migrateGarmentBindings, type LegacySnapshot } from "@/lib/catalog/garment-index-migrate";
import { emptyGarmentIndex } from "@/lib/catalog/garment-index-file";
import type { GarmentBinding } from "@/lib/catalog/types";

const NOW = "2026-09-27T00:00:00.000Z";
const IMAGE_HOST = "https://gcp-images.majestic.ink.rsvcloud.com/";

const piece = (over: Partial<GarmentBinding> = {}): GarmentBinding => ({
  cityId: "4218004",
  designFamily: "traco",
  garmentTypeId: 72,
  commerceStoreKey: "use-sul",
  inkProductId: "10",
  slug: "peruano-10",
  storeProductUrl: "https://www.usesul.com.br/usesul/product/peruano-10",
  imageUrl: `${IMAGE_HOST}a.jpg`,
  price: 139.9,
  productClusterId: "100",
  syncedAt: NOW,
  ...over,
});

const legacy = (garmentBindings: GarmentBinding[]): LegacySnapshot => ({
  version: 1,
  stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: NOW, productCount: 0, bindings: [], merch: [], excluded: [], garmentBindings } },
});

describe("migrateGarmentBindings", () => {
  test("given valid embedded pieces, when migrated, then they land in the index by cluster and leave the snapshot", () => {
    const { index, snapshot, report } = migrateGarmentBindings(legacy([piece(), piece({ inkProductId: "11", garmentTypeId: 178, slug: "over-11", storeProductUrl: "https://www.usesul.com.br/usesul/product/over-11" })]));
    expect(index.stores["use-sul"]?.clusters["100"]).toHaveLength(2);
    expect(index.stores["use-sul"]?.clusters["100"][0]).toEqual([72, "10", "peruano-10", "a.jpg", 139.9]);
    expect(index.stores["use-sul"]?.syncedAt).toBe(NOW);
    expect(snapshot.stores["use-sul"]).not.toHaveProperty("garmentBindings");
    expect(report["use-sul"]).toMatchObject({ read: 2, written: 2, duplicates: 0 });
  });

  test("given pieces that break an admission rule, when migrated, then each is excluded under its own cause", () => {
    const { index, report } = migrateGarmentBindings(
      legacy([
        piece({ inkProductId: "1" }), // ok
        piece({ inkProductId: "2", productClusterId: "" }),
        piece({ inkProductId: "3", garmentTypeId: 9999 }),
        piece({ inkProductId: "4", garmentTypeId: 1 }),
        piece({ inkProductId: "5", price: null }),
        piece({ inkProductId: "6", storeProductUrl: "https://evil.example.com/peruano-10" }),
        piece({ inkProductId: "7", storeProductUrl: "https://www.usesul.com.br/usesul/product/another" }),
      ]),
    );
    expect(report["use-sul"]).toMatchObject({ read: 7, written: 1, excluded: { noCluster: 1, unknownType: 2, noPrice: 1, unsellableUrl: 1, urlShape: 1 } });
    expect(Object.values(index.stores["use-sul"]!.clusters).flat()).toHaveLength(1);
  });

  test("given the same piece twice, when migrated, then it is stored once and counted as a duplicate", () => {
    const { index, report } = migrateGarmentBindings(legacy([piece(), piece({ price: 149.9 })]));
    expect(index.stores["use-sul"]?.clusters["100"]).toHaveLength(1);
    expect(index.stores["use-sul"]?.clusters["100"][0][4]).toBe(149.9);
    expect(report["use-sul"]).toMatchObject({ read: 2, written: 1, duplicates: 1 });
  });

  test("given a snapshot with nothing embedded, when migrated, then the index is unchanged", () => {
    const existing = { version: 1 as const, stores: { "use-norte": { syncedAt: "x", clusters: { "9": [[72, "9", "s", "a.jpg", 1] as [number, string, string, string, number]] } } } };
    const { index, report } = migrateGarmentBindings({ version: 1, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: NOW, productCount: 0, bindings: [], merch: [], excluded: [] } } }, existing);
    expect(index).toEqual(existing);
    expect(report).toEqual({});
    expect(migrateGarmentBindings(legacy([]), emptyGarmentIndex()).index.stores["use-sul"]?.clusters).toEqual({});
  });

  test("given an existing index, when the same snapshot is migrated again, then the result is identical (idempotent)", () => {
    const first = migrateGarmentBindings(legacy([piece()]));
    const second = migrateGarmentBindings(legacy([piece()]), first.index);
    expect(second.index).toEqual(first.index);
  });
});
