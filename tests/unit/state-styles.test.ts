import { describe, expect, test } from "vitest";
import { buildStoreIndex } from "@/lib/catalog/indexer";
import { rankBindings } from "@/lib/catalog/ranking";
import { DESIGN_FAMILIES } from "@/lib/catalog/families";
import type { CollectionRecord } from "@/lib/catalog/collections";
import { stateStyles, styleCollectionHref } from "@/lib/editorial/state-styles";
import { cityBySlug } from "@/lib/geo/cities";
import type { CityDesignBinding } from "@/lib/catalog/types";
import type { CityFamilyEntry } from "@/lib/catalog/repository";
import { product } from "./fixtures";

const NOW = "2026-10-05T00:00:00.000Z";
const sc = ["tijucas", "florianopolis", "itajai", "chapeco"].map((slug) => cityBySlug("SC", slug)!);

/** A minimal `{ cityFamilies }` stub — state-styles.ts only ever calls that one method. */
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

const bindingsFor = (names: string[]) => rankBindings(buildStoreIndex("use-sul", names.map((n) => product(n)), NOW).bindings, ["use-sul", "use-norte", "use-centro"]);

function collection(id: number, name: string, slug: string, matchedCount = 10): CollectionRecord {
  return { id, name, slug, position: id, isAvailable: false, reportedProductCount: matchedCount, matchedCount, merchCount: 0, cityDesignCount: matchedCount, memberIds: [] };
}

const NAV = [
  collection(1, "SUL - TRAÇO - SC", "sul-traco-sc"),
  collection(2, "SUL - P. ORIGEM - SC", "sul-p-origem-sc", 0),
  collection(3, "SUL - ORIGEM - SC", "sul-origem-sc"),
  collection(4, "SUL - COORD. - SC", "sul-coord-sc", 2),
];

describe("styleCollectionHref", () => {
  test("given the style-and-state navigation collection, then it links to its live page", () => {
    expect(styleCollectionHref("use-sul", "SC", "traco", NAV)).toBe("https://www.usesul.com.br/usesul/collections/sul-traco-sc");
  });

  test("given an empty 'P. ORIGEM' and a filled 'ORIGEM', then Ponto de Origem links to the filled one", () => {
    expect(styleCollectionHref("use-sul", "SC", "ponto-de-origem", NAV)).toBe("https://www.usesul.com.br/usesul/collections/sul-origem-sc");
  });

  test("given too few products, another UF, or a store without that naming, then there is no link", () => {
    expect(styleCollectionHref("use-sul", "SC", "coordenadas", NAV)).toBeNull();
    expect(styleCollectionHref("use-sul", "PR", "traco", NAV)).toBeNull();
    expect(styleCollectionHref("use-norte", "SC", "traco", NAV)).toBeNull();
  });
});

describe("stateStyles", () => {
  test("given no products, then there are no styles (never a placeholder)", () => {
    expect(stateStyles({ uf: "SC", cities: sc, catalog: stubCatalog([]), store: "use-sul", collections: NAV })).toEqual([]);
  });

  test("given a style in 3+ places and another in only 2, then only the first becomes a row, with real products of the state", () => {
    const bindings = bindingsFor(["Tijucas | Traço SC", "Itajaí | Traço SC", "Chapecó | Traço SC", "Tijucas | Origem SC", "Itajaí | Origem SC"]);
    const styles = stateStyles({ uf: "SC", cities: sc, catalog: stubCatalog(bindings), store: "use-sul", collections: NAV });
    expect(styles.map((s) => s.id)).toEqual(["traco"]);
    const [traco] = styles;
    expect(traco.items.map((i) => i.name).sort()).toEqual(["Chapecó", "Itajaí", "Tijucas"]);
    for (const item of traco.items) {
      expect(item.state).toBe("SC");
      expect(item.context).toBe("Traço · SC");
      expect(item.href).toMatch(/^https:\/\/www\.usesul\.com\.br\//);
    }
    expect(traco.viewAllHref).toBe("https://www.usesul.com.br/usesul/collections/sul-traco-sc");
  });

  test("given a capital slug, then the capital comes first in its rows", () => {
    const bindings = bindingsFor(["Tijucas | Traço SC", "Itajaí | Traço SC", "Florianópolis | Traço SC"]);
    const [traco] = stateStyles({ uf: "SC", cities: sc, catalog: stubCatalog(bindings), store: "use-sul", collections: [], capitalSlug: "florianopolis" });
    expect(traco.items[0].name).toBe("Florianópolis");
    expect(traco.viewAllHref).toBeNull();
  });
});
