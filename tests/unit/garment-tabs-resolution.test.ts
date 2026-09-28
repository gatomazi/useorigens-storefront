import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { GARMENT_TYPES } from "@/lib/catalog/garments";
import type { CatalogSnapshot, GarmentBinding, StoreIndex, UnrankedBinding } from "@/lib/catalog/types";
import type { CommerceStoreKey } from "@/lib/geo/regions";

const NOW = "2026-09-27T00:00:00.000Z";
const TIJUCAS_SC = "4218004";
const TORRES_RS = "4321501";
const XAMBIOA_TO = "1722107";
const AGUA_BOA_MT = "5100201";
const HOST: Partial<Record<CommerceStoreKey, string>> = {
  "use-sul": "https://www.usesul.com.br/usesul/product",
  "use-norte": "https://www.usenorte.com.br/usenorte/product",
  "use-centro": "https://www.usecentro.com.br/usecentro/product",
};

const classic = (store: CommerceStoreKey, cityId: string, inkProductId: string, cluster: string | undefined): UnrankedBinding => ({
  cityId,
  designFamily: "traco",
  designVariant: "base",
  commerceStoreKey: store,
  inkProductId,
  slug: `classic-${inkProductId}`,
  storeProductUrl: `${HOST[store]}/classic-${inkProductId}`,
  imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/classic.jpg",
  price: 109.9,
  syncedAt: NOW,
  ...(cluster ? { productClusterId: cluster } : {}),
});

const piece = (store: CommerceStoreKey, cityId: string, cluster: string, garmentTypeId: number, price: number): GarmentBinding => ({
  cityId,
  designFamily: "traco",
  garmentTypeId,
  commerceStoreKey: store,
  inkProductId: `${cluster}${garmentTypeId}`,
  slug: `piece-${cluster}-${garmentTypeId}`,
  storeProductUrl: `${HOST[store]}/piece-${cluster}-${garmentTypeId}`,
  imageUrl: `https://gcp-images.majestic.ink.rsvcloud.com/piece-${garmentTypeId}.jpg`,
  price,
  productClusterId: cluster,
  syncedAt: NOW,
});

const store = (key: CommerceStoreKey, bindings: UnrankedBinding[], garmentBindings: GarmentBinding[]): StoreIndex => ({
  commerceStoreKey: key,
  syncedAt: NOW,
  productCount: bindings.length,
  bindings,
  merch: [],
  excluded: [],
  garmentBindings,
});

const NON_CLASSIC_TYPE_IDS = GARMENT_TYPES.filter((t) => t.id !== 1).map((t) => t.id);

const snapshot: CatalogSnapshot = {
  version: 1,
  stores: {
    // Tijucas: real shape from the pilot — Peruano and Body Infantil exist, Oversized does not. Torres has a
    // classic product whose cluster has no pieces at all.
    "use-sul": store(
      "use-sul",
      [classic("use-sul", TIJUCAS_SC, "1", "100"), classic("use-sul", TORRES_RS, "2", "200")],
      [piece("use-sul", TIJUCAS_SC, "100", 72, 139.9), piece("use-sul", TIJUCAS_SC, "100", 165, 96)],
    ),
    "use-norte": store("use-norte", [classic("use-norte", XAMBIOA_TO, "3", "300")], [piece("use-norte", XAMBIOA_TO, "300", 178, 129)]),
    "use-centro": store(
      "use-centro",
      [classic("use-centro", AGUA_BOA_MT, "4", "400")],
      NON_CLASSIC_TYPE_IDS.map((id) => piece("use-centro", AGUA_BOA_MT, "400", id, 100 + id)),
    ),
  },
};

describe("Catalog#garmentTabsForCity (fixture snapshot, one city per region)", () => {
  let dir: string;
  const env = process.env;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "garment-tabs-"));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
    await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(snapshot));
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  async function catalog() {
    const { getCatalog } = await import("@/lib/catalog/repository");
    return getCatalog();
  }

  test("given Tijucas/SC, when read, then the classic tab comes first plus only the pieces it really has", async () => {
    const { tabs, entriesByGarment } = (await catalog()).garmentTabsForCity(TIJUCAS_SC);
    expect(tabs[0]).toMatchObject({ id: 1, slug: "classica" });
    const slugs = tabs.map((t) => t.slug);
    expect(slugs).toEqual(["classica", "peruano", "body-infantil"]);
    expect(slugs).not.toContain("oversized");
    const peruano = tabs.find((t) => t.slug === "peruano")!;
    const [entry] = entriesByGarment[peruano.id];
    expect(entry.primary).toMatchObject({ price: 139.9, storeProductUrl: "https://www.usesul.com.br/usesul/product/piece-100-72" });
    expect(entry.variants).toHaveLength(0);
  });

  test("given a city whose cluster has no pieces, when read, then the selector is hidden entirely", async () => {
    const { tabs, entriesByGarment } = (await catalog()).garmentTabsForCity(TORRES_RS);
    expect(tabs).toEqual([]);
    expect(entriesByGarment).toEqual({});
  });

  test("given a Norte city, when read, then its pieces resolve to the Norte store only", async () => {
    const { tabs, entriesByGarment } = (await catalog()).garmentTabsForCity(XAMBIOA_TO);
    const oversized = tabs.find((t) => t.slug === "oversized")!;
    expect(entriesByGarment[oversized.id][0].primary).toMatchObject({ commerceStoreKey: "use-norte", storeProductUrl: expect.stringContaining("usenorte.com.br") });
  });

  test("given a Centro-Oeste city with the full batch, when read, then every tab points to the Centro store", async () => {
    const { tabs, entriesByGarment } = (await catalog()).garmentTabsForCity(AGUA_BOA_MT);
    expect(tabs).toHaveLength(GARMENT_TYPES.length);
    for (const tab of tabs.filter((t) => t.id !== 1)) {
      expect(entriesByGarment[tab.id][0].primary.storeProductUrl).toContain("usecentro.com.br");
    }
  });
});
