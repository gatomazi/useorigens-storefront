import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { CatalogSnapshot } from "@/lib/catalog/types";

const NOW = "2026-09-27T00:00:00.000Z";

// A real municipality id (Tijucas/SC) so `cityById`/region resolution succeed without extra fixtures.
const CITY_ID = "4218004";

function snapshotWith(canonicalClusterId: string | undefined, garmentClusterId: string): CatalogSnapshot {
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
        garmentBindings: [
          {
            cityId: CITY_ID,
            designFamily: "traco",
            garmentTypeId: 72,
            commerceStoreKey: "use-sul",
            inkProductId: "2",
            slug: "tijucas-traco-sc-peruano",
            storeProductUrl: "https://www.usesul.com.br/usesul/product/tijucas-traco-sc-peruano",
            imageUrl: "https://img/peruano.jpg",
            price: 139.9,
            productClusterId: garmentClusterId,
            syncedAt: NOW,
          },
        ],
      },
    },
  };
}

describe("garmentTabsForCity — stale cluster-link guard (spec's next-round §6: never show an obsolete piece after the canonical rotates clusters)", () => {
  let dir: string;
  const env = process.env;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "garment-stale-"));
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  async function catalogFor(snapshot: CatalogSnapshot) {
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
    await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(snapshot));
    const { getCatalog } = await import("@/lib/catalog/repository");
    return getCatalog();
  }

  test("given the garment binding's cluster still matches the canonical's, when read, then the piece is included", async () => {
    const catalog = await catalogFor(snapshotWith("441506", "441506"));
    const { tabs } = catalog.garmentTabsForCity(CITY_ID);
    expect(tabs.map((t) => t.slug)).toContain("peruano");
  });

  test("given the canonical binding has since rotated to a different cluster, when read, then the stale garment binding is excluded, never shown as if still valid", async () => {
    const catalog = await catalogFor(snapshotWith("999999", "441506"));
    const { tabs } = catalog.garmentTabsForCity(CITY_ID);
    expect(tabs.map((t) => t.slug)).not.toContain("peruano");
  });

  test("given the canonical binding has since lost its cluster id entirely, when read, then the stale garment binding is excluded (fail closed)", async () => {
    const catalog = await catalogFor(snapshotWith(undefined, "441506"));
    const { tabs } = catalog.garmentTabsForCity(CITY_ID);
    expect(tabs).toEqual([]); // classic-only: no tab bar at all, per the single-option rule
  });
});
