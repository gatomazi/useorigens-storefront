import { describe, expect, test } from "vitest";
import { buildStoreIndex } from "@/lib/catalog/indexer";
import { compareIds, rankBindings } from "@/lib/catalog/ranking";
import { cityBySlug } from "@/lib/geo/cities";
import { product } from "./fixtures";

const NOW = "2026-09-20T00:00:00.000Z";
const torres = cityBySlug("RS", "torres")!;
const patoBranco = cityBySlug("PR", "pato-branco")!;

function rank(products: ReturnType<typeof product>[]) {
  const { bindings } = buildStoreIndex("use-sul", products, NOW);
  return rankBindings(bindings, ["use-sul", "use-norte", "use-centro"]);
}

describe("buildStoreIndex", () => {
  test("given a mixed catalog, when indexed, then city designs, merchandise and exclusions are separated without loss", () => {
    const index = buildStoreIndex(
      "use-sul",
      [
        product("Torres | Legado RS"),
        product("Gaúcho de Pedra"),
        product("Feito em Turvo"),
        product("Curitibaninha Paranaense | Essencia PR"),
      ],
      NOW,
    );
    expect(index.bindings).toHaveLength(1);
    expect(index.merch).toHaveLength(1);
    expect(index.excluded.map((e) => e.reason).sort()).toEqual(["ambiguous-city", "unclassified-family"]);
    expect(index.productCount).toBe(4);
  });

  test("given a locality product, when indexed, then it keeps the parent city and the locality label", () => {
    const index = buildStoreIndex(
      "use-sul",
      [product("Praia Paraíso | Origem Localidade RS", { tags: ["Torres"] })],
      NOW,
    );
    expect(index.bindings[0]).toMatchObject({
      cityId: torres.id,
      parentCityId: torres.id,
      localityLabel: "Praia Paraíso",
      designFamily: "ponto-de-origem",
    });
  });

  test("given a product price, when indexed, then INK's price is stored untouched", () => {
    const index = buildStoreIndex("use-sul", [product("Torres | Legado RS", { price: 109.9 })], NOW);
    expect(index.bindings[0].price).toBe(109.9);
  });
});

describe("rankBindings", () => {
  test("given a base Origem and a locality, when ranked, then the municipal base is primary and the locality is not", () => {
    const ranked = rank([
      product("Praia Paraíso | Origem Localidade RS", { id: "1", tags: ["Torres"] }),
      product("Torres | Origem RS", { id: "2" }),
    ]);
    const base = ranked.find((b) => b.inkProductId === "2")!;
    const locality = ranked.find((b) => b.inkProductId === "1")!;
    expect(base.isPrimary).toBe(true);
    expect(locality.isPrimary).toBe(false);
  });

  test("given regional and base variants, when ranked, then base wins regardless of API order", () => {
    const products = [
      product("Pato Branco | Origem Regional PR", { id: "10" }),
      product("Pato Branco | Origem PR", { id: "20" }),
    ];
    for (const ordered of [products, [...products].reverse()]) {
      const primary = rank(ordered).find((b) => b.isPrimary && b.cityId === patoBranco.id)!;
      expect(primary.designVariant).toBe("base");
    }
  });

  test("given two identical base products, when ranked, then the lowest INK id wins and both are preserved", () => {
    const ranked = rank([
      product("Torres | Coordenadas RS", { id: "900" }),
      product("Torres | Coordenadas RS", { id: "300" }),
    ]);
    expect(ranked).toHaveLength(2);
    expect(ranked.find((b) => b.isPrimary)!.inkProductId).toBe("300");
  });

  test("given only a locality product for a family, when ranked, then the family has no primary", () => {
    const ranked = rank([product("Praia Paraíso | Origem Localidade RS", { tags: ["Torres"] })]);
    expect(ranked.some((b) => b.isPrimary)).toBe(false);
  });

  test("given the same city in two stores, when ranked, then store priority breaks the tie", () => {
    const sul = { ...buildStoreIndex("use-sul", [product("Torres | Legado RS", { id: "5" })], NOW).bindings[0] };
    const other = { ...sul, commerceStoreKey: "use-origens" as const, inkProductId: "6" };
    const winner = rankBindings([sul, other], ["use-origens", "use-sul"]).find((b) => b.isPrimary)!;
    expect(winner.commerceStoreKey).toBe("use-origens");
  });

  // Regression (bootstrap review §5, found by scripts/verify-bootstrap.mts): a non-numeric inkProductId used
  // to crash BigInt() inside compareIds, taking down the sort for the WHOLE catalog build (one bad id
  // anywhere poisoned every city, not just its own product) — not a fixture-only concern, since a real INK
  // response could in principle carry a malformed id too.
  test("given a non-numeric INK id, when ranked, then it never throws and still produces a deterministic order", () => {
    expect(() =>
      rank([product("Torres | Coordenadas RS", { id: "not-a-number" }), product("Torres | Coordenadas RS", { id: "300" })]),
    ).not.toThrow();
  });
});

describe("compareIds", () => {
  test("given two numeric ids, when compared, then it orders numerically, including past Number.MAX_SAFE_INTEGER", () => {
    expect(compareIds("2", "10")).toBeLessThan(0); // numeric, not lexicographic ("10" < "2" as strings)
    expect(compareIds("99999999999999999999", "100000000000000000000")).toBeLessThan(0);
  });

  test("given a non-numeric id on either side, when compared, then it falls back to string comparison instead of throwing", () => {
    expect(() => compareIds("abc", "123")).not.toThrow();
    expect(compareIds("abc", "abc")).toBe(0);
  });
});
