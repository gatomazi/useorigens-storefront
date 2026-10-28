import { describe, expect, test } from "vitest";
import { journeyModels, journeyPiece } from "@/lib/catalog/city-journey";
import { familyById } from "@/lib/catalog/families";
import type { CityFamilyEntry, GarmentTabsForCity } from "@/lib/catalog/repository";
import type { CityDesignBinding } from "@/lib/catalog/types";

const binding = (id: string, family: CityDesignBinding["designFamily"], over: Partial<CityDesignBinding> = {}): CityDesignBinding => ({
  cityId: "4205407", designFamily: family, designVariant: "base", isPrimary: true, priority: 0, commerceStoreKey: "use-sul", inkProductId: id, slug: `p-${id}`,
  storeProductUrl: `https://www.usesul.com.br/usesul/product/p-${id}`, imageUrl: `https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/${id}.jpg`, price: 109.9, syncedAt: "2026-10-27T00:00:00.000Z", ...over,
});
const entry = (id: string, family: string, over: Partial<CityDesignBinding> = {}, variants: CityDesignBinding[] = []): CityFamilyEntry => ({
  family: familyById(family)!,
  primary: binding(id, family as CityDesignBinding["designFamily"], over),
  variants,
});
const PAGE = "/sul/sc/florianopolis";
const NO_TABS: GarmentTabsForCity = { tabs: [], entriesByGarment: {} };

describe("Sua cidade journey: the designs of a place and their pieces", () => {
  test("given a place with piece tabs, when built, then each design lists its real pieces, classic first and then in the tabs' order, and a piece a design lacks is simply absent", () => {
    const classic = [entry("1", "ponto-de-origem"), entry("2", "feito-em"), entry("3", "coordenadas")];
    const garment: GarmentTabsForCity = {
      tabs: [
        { id: 1, slug: "classica", label: "Camiseta clássica", count: 3 },
        { id: 178, slug: "oversized", label: "Oversized", count: 2 },
        { id: 2, slug: "infantil", label: "Infantil", count: 1 },
      ],
      entriesByGarment: {
        1: classic,
        178: [entry("11", "ponto-de-origem", { price: 139.9 }), entry("21", "feito-em", { price: 139.9 })],
        2: [entry("22", "feito-em", { price: 89.9 })],
      },
    };
    const models = journeyModels(classic, garment, PAGE);
    expect(models.map((m) => m.familyId)).toEqual(["ponto-de-origem", "feito-em", "coordenadas"]);
    expect(models[1].pieces.map((p) => [p.slug, p.productId, p.price])).toEqual([["classica", "2", 109.9], ["oversized", "21", 139.9], ["infantil", "22", 89.9]]);
    expect(models[2].pieces.map((p) => p.slug)).toEqual(["classica"]);
    expect(models[0]).toMatchObject({ name: "Ponto de Origem", description: "Sua cidade marcada no mapa do estado.", versions: 0, page: `${PAGE}/ponto-de-origem` });
    expect(models[0].pieces[0]).toEqual({ garmentTypeId: 1, slug: "classica", label: "Camiseta clássica", productId: "1", image: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/1.jpg", price: 109.9, href: "https://www.usesul.com.br/usesul/product/p-1" });
  });

  test("given a place without piece tabs, when built, then every design is offered as the classic tee only", () => {
    const models = journeyModels([entry("1", "ponto-de-origem"), entry("2", "gentilico")], NO_TABS, PAGE);
    expect(models.map((m) => m.pieces.map((p) => p.label))).toEqual([["Camiseta clássica"], ["Camiseta clássica"]]);
  });

  test("given pieces without a trustworthy link or a price, when built, then they are skipped, and a design left with none is not offered at all", () => {
    expect(journeyPiece(binding("1", "legado", { storeProductUrl: "http://evil.example/x" }), 1)).toBeNull();
    expect(journeyPiece(binding("1", "legado", { price: null }), 1)).toBeNull();
    expect(journeyPiece(binding("1", "legado", { price: 0 }), 1)).toBeNull();
    expect(journeyPiece(binding("1", "legado"), 999)).toBeNull(); // a garment type the store does not know is never labelled
    const classic = [entry("1", "legado", { simulated: true }), entry("2", "traco", { price: null })];
    const garment: GarmentTabsForCity = {
      tabs: [{ id: 1, slug: "classica", label: "Camiseta clássica", count: 2 }, { id: 23, slug: "cropped", label: "Cropped", count: 1 }],
      entriesByGarment: { 1: classic, 23: [entry("12", "legado")] },
    };
    // The classic Legado cannot be sold (a hidden, simulated product) but its cropped can: offered by that piece. Traço has nothing: absent.
    expect(journeyModels(classic, garment, PAGE).map((m) => [m.familyId, m.pieces.map((p) => p.productId)])).toEqual([["legado", ["12"]]]);
  });

  test("given a promotion, when built, then INK's current price is the price and the regular one travels as listPrice", () => {
    expect(journeyPiece(binding("1", "feito-em", { price: 89.9, listPrice: 109.9 }), 1)).toMatchObject({ price: 89.9, listPrice: 109.9 });
  });

  test("given a design with versions, when built, then it is offered by its primary and says how many versions its own page has", () => {
    const withVersions = entry("1", "ponto-de-origem", {}, [binding("5", "ponto-de-origem", { isPrimary: false, designVariant: "regional" }), binding("6", "ponto-de-origem", { isPrimary: false, designVariant: "personalizado" })]);
    const [model] = journeyModels([withVersions], NO_TABS, PAGE);
    expect(model.pieces.map((p) => p.productId)).toEqual(["1"]);
    expect(model.versions).toBe(2);
    expect(model.page).toBe("/sul/sc/florianopolis/ponto-de-origem");
  });
});
