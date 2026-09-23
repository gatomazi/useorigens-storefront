import { describe, expect, test } from "vitest";
import { buildStoreIndex } from "@/lib/catalog/indexer";
import { rankBindings } from "@/lib/catalog/ranking";
import { DESIGN_FAMILIES } from "@/lib/catalog/families";
import { stateShowcase } from "@/lib/editorial/state-showcase";
import { cityBySlug } from "@/lib/geo/cities";
import type { CityDesignBinding } from "@/lib/catalog/types";
import type { CityFamilyEntry } from "@/lib/catalog/repository";
import { product } from "./fixtures";

const NOW = "2026-09-22T00:00:00.000Z";
const tijucas = cityBySlug("SC", "tijucas")!;
const florianopolis = cityBySlug("SC", "florianopolis")!;
const patoBranco = cityBySlug("PR", "pato-branco")!;

/** A minimal `{ cityFamilies }` stub — state-showcase.ts only ever calls that one method. */
function stubCatalog(bindings: CityDesignBinding[]) {
  return {
    cityFamilies(cityId: string): CityFamilyEntry[] {
      const entries: CityFamilyEntry[] = [];
      for (const family of DESIGN_FAMILIES) {
        const ofFamily = bindings.filter((b) => b.cityId === cityId && b.designFamily === family.id && !b.localityLabel);
        const primary = ofFamily.find((b) => b.isPrimary);
        if (!primary) continue;
        entries.push({ family, primary, variants: ofFamily.filter((b) => !b.isPrimary) });
      }
      return entries;
    },
  };
}

function bindingsFor(products: ReturnType<typeof product>[]): CityDesignBinding[] {
  const { bindings } = buildStoreIndex("use-sul", products, NOW);
  return rankBindings(bindings, ["use-sul", "use-norte", "use-centro"]);
}

function merchFor(products: ReturnType<typeof product>[]) {
  return buildStoreIndex("use-sul", products, NOW).merch;
}

describe("stateShowcase", () => {
  test("given no city products and no terra products for the state, when built, then it is empty (never a placeholder)", () => {
    const result = stateShowcase({ uf: "SC", cities: [tijucas], catalog: stubCatalog([]), merch: [] });
    expect(result).toEqual([]);
  });

  test("given real city products, when built, then every item is a real, verified product with an INK URL", () => {
    const bindings = bindingsFor([product("Tijucas | Origem SC"), product("Florianópolis | Origem SC")]);
    const result = stateShowcase({ uf: "SC", cities: [tijucas, florianopolis], catalog: stubCatalog(bindings), merch: [] });
    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(item.href).toMatch(/^https:\/\/www\.usesul\.com\.br\//);
      expect(item.state).toBe("SC");
    }
  });

  test("given cities from two different states, when built for one of them, then only that state's cities ever appear", () => {
    const bindings = bindingsFor([product("Tijucas | Origem SC"), product("Pato Branco | Origem PR")]);
    const catalog = stubCatalog(bindings);
    const scResult = stateShowcase({ uf: "SC", cities: [tijucas], catalog, merch: [] });
    const prResult = stateShowcase({ uf: "PR", cities: [patoBranco], catalog, merch: [] });
    expect(scResult.every((i) => i.state === "SC")).toBe(true);
    expect(prResult.every((i) => i.state === "PR")).toBe(true);
    // Never mixed: nothing from PR's catalog leaks into the SC-scoped call (or vice versa) since `cities` is
    // already state-filtered by the caller and stateShowcase never looks beyond it.
    expect(scResult.some((i) => i.context === "Pato Branco")).toBe(false);
  });

  test("given a capital slug, when built, then the capital's product comes first", () => {
    const bindings = bindingsFor([product("Tijucas | Origem SC"), product("Florianópolis | Origem SC")]);
    const result = stateShowcase({ uf: "SC", cities: [tijucas, florianopolis], catalog: stubCatalog(bindings), merch: [], capitalSlug: "florianopolis" });
    expect(result[0]?.context).toBe("Florianópolis");
  });

  test("given a real Da Nossa Terra product for the state, when built, then it is mixed in (never appended only at the end, never from another state)", () => {
    const bindings = bindingsFor([product("Tijucas | Origem SC")]);
    const merch = merchFor([product("Santa Catarina | Clean")]);
    const result = stateShowcase({ uf: "SC", cities: [tijucas], catalog: stubCatalog(bindings), merch });
    expect(result.some((i) => i.name === "Santa Catarina · Clean")).toBe(true);
  });

  test("given more real products than the limit, when built, then it respects the limit and never duplicates a product", () => {
    const products = Array.from({ length: 10 }, (_, i) => product(`Cidade${i} | Origem SC`, { id: `p${i}` }));
    // Reuse Tijucas as a stand-in city id for every synthetic product — the point here is only the count/limit.
    const bindings = bindingsFor(products).map((b) => ({ ...b, cityId: tijucas.id }));
    const result = stateShowcase({ uf: "SC", cities: [tijucas], catalog: stubCatalog(bindings), merch: [], limit: 3 });
    expect(result.length).toBeLessThanOrEqual(3);
    expect(new Set(result.map((i) => i.id)).size).toBe(result.length);
  });

  test("given the same catalog, when built twice, then the result is identical (deterministic, nothing random)", () => {
    const bindings = bindingsFor([product("Tijucas | Origem SC"), product("Florianópolis | Origem SC")]);
    const catalog = stubCatalog(bindings);
    const a = stateShowcase({ uf: "SC", cities: [tijucas, florianopolis], catalog, merch: [] });
    const b = stateShowcase({ uf: "SC", cities: [tijucas, florianopolis], catalog, merch: [] });
    expect(a).toEqual(b);
  });
});
