import { describe, expect, test } from "vitest";
import { buildGarmentBindings, linkGarmentBindings } from "@/lib/catalog/garments-link";
import { GARMENT_TYPES, garmentTypeById, garmentTypeBySlug } from "@/lib/catalog/garments";
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
    const norteCandidate = sibling({ storeKey: "use-norte", clusterId: "999", slug: "x", storeProductUrl: "https://www.usenorte.com.br/usenorte/product/x" });

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

describe("linkGarmentBindings stats", () => {
  test("given a mix of candidates, when linked, then every drop is counted under its own cause", () => {
    const { bindings, stats } = linkGarmentBindings(
      [
        sibling({ id: "1" }), // linked
        sibling({ id: "2", clusterId: null }), // no cluster id
        sibling({ id: "3", garmentTypeId: 1 }), // the classic piece itself
        sibling({ id: "4", garmentTypeId: 9999 }), // unknown product_type
        sibling({ id: "5", clusterId: "no-such-cluster" }), // no canonical for the cluster
        sibling({ id: "6", price: null }), // no price
        sibling({ id: "7", storeProductUrl: "https://evil.example.com/x" }), // host not allowed
        sibling({ id: "8", storeProductUrl: "https://www.usesul.com.br/usesul/product/not-the-slug" }), // allowed host, wrong shape
      ],
      [canonical()],
      NOW,
    );
    expect(bindings.map((b) => b.inkProductId)).toEqual(["1"]);
    expect(stats).toEqual({ candidates: 8, linked: 1, classicType: 1, noClusterId: 1, unknownType: 1, noCanonicalForCluster: 1, noPrice: 1, unsellableUrl: 1, urlShape: 1 });
  });
});
