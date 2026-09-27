import { describe, expect, test } from "vitest";
import { buildGarmentBindings } from "@/lib/catalog/garments-link";
import { GARMENT_TYPES, garmentTypeById, garmentTypeBySlug } from "@/lib/catalog/garments";
import { getCatalog } from "@/lib/catalog/repository";
import type { GarmentSourceProduct } from "@/lib/ink/normalize";
import type { CityDesignBinding } from "@/lib/catalog/types";

const NOW = "2026-09-27T00:00:00.000Z";

function canonical(overrides: Partial<CityDesignBinding> = {}): CityDesignBinding {
  return {
    cityId: "4218004",
    designFamily: "traco",
    designVariant: "base",
    isPrimary: true,
    priority: 0,
    commerceStoreKey: "use-sul",
    inkProductId: "4381465",
    slug: "tijucas-traco-sc",
    storeProductUrl: "https://www.usesul.com.br/usesul/product/tijucas-traco-sc",
    imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/x.jpg",
    price: 109.9,
    syncedAt: NOW,
    productClusterId: "441506",
    ...overrides,
  };
}

function sibling(overrides: Partial<GarmentSourceProduct> = {}): GarmentSourceProduct {
  return {
    id: "4381470",
    storeKey: "use-sul",
    name: "Tijucas | Traço SC",
    slug: "tijucas-traco-sc-peruano",
    storeProductUrl: "https://www.usesul.com.br/usesul/product/tijucas-traco-sc-peruano",
    imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/y.jpg",
    price: 139.9,
    clusterId: "441506",
    garmentTypeId: 72,
    createdAt: NOW,
    ...overrides,
  };
}

describe("GARMENT_TYPES", () => {
  test("given the central map, when looked up by id, then it returns the confirmed real garment types only", () => {
    expect(garmentTypeById(72)?.label).toBe("Algodão Peruano");
    expect(garmentTypeById(1)?.label).toBe("Camiseta clássica");
    // Never invented — the MD's own examples that were not observed live must stay absent.
    expect(GARMENT_TYPES.some((g) => g.label.toLowerCase().includes("baby look"))).toBe(false);
  });

  test("given a slug, when looked up, then it resolves back to the same type as its id", () => {
    const type = garmentTypeBySlug("oversized");
    expect(type?.id).toBe(178);
  });

  test("given an unknown id, when looked up, then it returns undefined rather than guessing a label", () => {
    expect(garmentTypeById(999999)).toBeUndefined();
  });
});

describe("buildGarmentBindings", () => {
  test("given a sibling sharing the canonical's cluster id, when linked, then it produces a garment binding with the canonical's city and family", () => {
    const [binding] = buildGarmentBindings([sibling()], [canonical()], NOW);
    expect(binding).toMatchObject({ cityId: "4218004", designFamily: "traco", garmentTypeId: 72, price: 139.9 });
  });

  test("given a canonical binding with no product_cluster_id, when linked, then it produces zero bindings (fail closed, never guessed)", () => {
    const result = buildGarmentBindings([sibling()], [canonical({ productClusterId: undefined })], NOW);
    expect(result).toHaveLength(0);
  });

  test("given a raw candidate with no cluster id at all, when linked, then it is excluded", () => {
    const result = buildGarmentBindings([sibling({ clusterId: null })], [canonical()], NOW);
    expect(result).toHaveLength(0);
  });

  test("given a raw candidate whose product_type is unrecognized, when linked, then it is excluded rather than labeled", () => {
    const result = buildGarmentBindings([sibling({ garmentTypeId: 4242 })], [canonical()], NOW);
    expect(result).toHaveLength(0);
  });

  test("given the classic product_type itself among the candidates, when linked, then it is never turned into a redundant garment binding", () => {
    const result = buildGarmentBindings([sibling({ garmentTypeId: 1 })], [canonical()], NOW);
    expect(result).toHaveLength(0);
  });

  test("given a candidate with no confirmed price, when linked, then it is excluded (never a fake price)", () => {
    const result = buildGarmentBindings([sibling({ price: null })], [canonical()], NOW);
    expect(result).toHaveLength(0);
  });

  test("given a candidate whose purchase URL host is not an allowed commerce host, when linked, then it is excluded (never a broken/foreign link)", () => {
    const result = buildGarmentBindings([sibling({ storeProductUrl: "https://evil.example.com/product/x" })], [canonical()], NOW);
    expect(result).toHaveLength(0);
  });

  test("given two stores that coincidentally reuse the same numeric cluster id, when linked, then a candidate never crosses into the other store's city (homonym-UF isolation)", () => {
    const sulCanonical = canonical({ commerceStoreKey: "use-sul", cityId: "4218004", productClusterId: "999" });
    const norteCanonical = canonical({ commerceStoreKey: "use-norte", cityId: "1722107", productClusterId: "999", inkProductId: "9999999" });
    const norteCandidate = sibling({ storeKey: "use-norte", clusterId: "999", storeProductUrl: "https://www.usenorte.com.br/usenorte/product/x" });

    const result = buildGarmentBindings([norteCandidate], [sulCanonical, norteCanonical], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].cityId).toBe("1722107"); // never resolves to the Sul city despite the shared cluster number
  });

  test("given a family that genuinely has no piece of a given type (Caso C), when linked, then it simply produces no binding for that pair — never a fabricated one", () => {
    const otherFamilyCanonical = canonical({ designFamily: "legado", productClusterId: "555" });
    const result = buildGarmentBindings([sibling({ clusterId: "441506" })], [otherFamilyCanonical], NOW);
    expect(result).toHaveLength(0);
  });
});

// Against the real local snapshot (data/generated/catalog-snapshot.json) — this round's fixture data,
// fetched live from INK for Tijucas/SC, Xambioá/TO and Água Boa/MT (docs/storefront/city-garment-tabs-round.md).
// Same pattern already used by tests/unit/infra.test.ts's "no network calls" test.
describe("Catalog#garmentTabsForCity", () => {
  test("given Tijucas/SC (MD Caso A's own acceptance city), when read, then it returns the classic tab first plus every real confirmed piece, and none it doesn't have", () => {
    const { tabs, entriesByGarment } = getCatalog().garmentTabsForCity("4218004");
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs[0]).toMatchObject({ id: 1, slug: "classica" });
    const slugs = tabs.map((t) => t.slug);
    expect(slugs).toContain("peruano");
    expect(slugs).toContain("body-infantil");
    // Real data gap (confirmed live): Tijucas's Traço batch has no Oversized sibling — it belongs to a
    // different city's cluster. Never fabricated just because the type exists elsewhere.
    expect(slugs).not.toContain("oversized");

    const peruano = tabs.find((t) => t.slug === "peruano")!;
    expect(peruano.count).toBe(1); // only the Traço family has this piece for Tijucas
    const [entry] = entriesByGarment[peruano.id];
    expect(entry.family.id).toBe("traco");
    expect(entry.primary.price).toBe(139.9);
    expect(entry.primary.storeProductUrl).toContain("tijucas-traco-sc-20a63a8d");
    expect(entry.variants).toHaveLength(0); // never inherits the "mais N versões" badge from design variants
  });

  test("given a real city with no garment-type fixture data (the common case this round), when read, then the selector is hidden entirely, not shown empty", () => {
    const { tabs, entriesByGarment } = getCatalog().garmentTabsForCity("4321501"); // Torres/RS
    expect(tabs).toEqual([]);
    expect(entriesByGarment).toEqual({});
  });

  test("given a real Norte city (Xambioá/TO), when read, then its own garment pieces resolve independently of Sul's", () => {
    const { tabs, entriesByGarment } = getCatalog().garmentTabsForCity("1722107");
    expect(tabs.map((t) => t.slug)).toContain("oversized"); // Xambioá's batch does have the Oversized sibling
    const oversized = tabs.find((t) => t.slug === "oversized")!;
    expect(entriesByGarment[oversized.id][0].primary.commerceStoreKey).toBe("use-norte");
  });

  test("given a real Centro-Oeste city (Água Boa/MT), when read, then it has the full 9-piece batch and every link points to its own Centro store", () => {
    const { tabs, entriesByGarment } = getCatalog().garmentTabsForCity("5100201");
    expect(tabs).toHaveLength(10); // classic + all 9 confirmed real garment types (docs/storefront/city-garment-catalog-rollout.md)
    const oversized = tabs.find((t) => t.slug === "oversized")!;
    const [entry] = entriesByGarment[oversized.id];
    expect(entry.primary).toMatchObject({
      commerceStoreKey: "use-centro",
      price: 129,
      storeProductUrl: "https://www.usecentro.com.br/usecentro/product/agua-boa-traco-mt-71ee9f45-8a1b-4278-9c1a-50cf2e1db43d",
    });
  });
});
