import { describe, expect, test } from "vitest";
import { dddProducts, pickDdd, ufOfAreaCode } from "@/lib/editorial/ddd";
import { dizeresWithContext } from "@/lib/editorial/dizeres";
import { buildLore } from "@/lib/editorial/lore";
import { stateLineProduct } from "@/lib/editorial/state-lines";
import { cityBySlug, areaGroupsOfState, citiesOfSameArea } from "@/lib/geo/cities";
import { REGIONS } from "@/lib/geo/regions";

const SUL = REGIONS.sul.ufs;
import type { MerchProduct } from "@/lib/catalog/types";

let n = 1;
function merch(name: string): MerchProduct {
  const id = String(n++);
  return {
    inkProductId: id,
    commerceStoreKey: "use-sul",
    regionSlug: "sul",
    name,
    slug: `s-${id}`,
    storeProductUrl: `https://www.usesul.com.br/usesul/product/s-${id}`,
    imageUrl: `https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/${id}.jpg`,
    price: 109.9,
    totalSalesCount: 0,
    syncedAt: "2026-09-21T00:00:00.000Z",
  };
}

describe("DDD products", () => {
  test("given area codes, when mapped to a state, then the state comes from the code and nothing else", () => {
    expect(ufOfAreaCode("054")).toBe("RS");
    expect(ufOfAreaCode("048")).toBe("SC");
    expect(ufOfAreaCode("041")).toBe("PR");
    expect(ufOfAreaCode("011")).toBeNull();
  });

  test("given DDD-named products, when parsed, then code, region and state are extracted and ordered RS, SC, PR", () => {
    const all = dddProducts([merch("Grande Curitiba | 041"), merch("Serra Gaúcha | 054"), merch("Grande Florianópolis | 048"), merch("Made in Paraná")]);
    expect(all.map((d) => `${d.uf}:${d.code}`)).toEqual(["RS:054", "SC:048", "PR:041"]);
    expect(all[0].regionName).toBe("Serra Gaúcha");
  });

  test("given the hero wish list, when a product does not exist, then it is left out instead of invented", () => {
    const all = dddProducts([merch("Serra Gaúcha | 054")]);
    const trio = pickDdd(all, [{ code: "054", regionName: "Serra Gaúcha" }, { code: "048", regionName: "Grande Florianópolis" }]);
    expect(trio).toHaveLength(1);
  });
});

describe("local voice (lore)", () => {
  test("given an expression named for a city, when built, then it belongs to that city", () => {
    const lore = buildLore([merch("Tax Tolo | Florianópolis")], SUL);
    const floripa = cityBySlug("SC", "florianopolis")!;
    expect(lore.byCity.get(floripa.id)?.[0]).toMatchObject({ text: "Tax Tolo", kind: "expressao" });
  });

  test("given the reverse convention, when a patron saint follows the city, then it is a patron of that city", () => {
    const lore = buildLore([merch("Santa Maria | Nossa Senhora Medianeira")], SUL);
    const santaMaria = cityBySlug("RS", "santa-maria")!;
    expect(lore.byCity.get(santaMaria.id)?.[0]).toMatchObject({ text: "Nossa Senhora Medianeira", kind: "padroeiro" });
  });

  test("given a saint name that is also a city, when both sides could be a city, then it is skipped and never guessed", () => {
    const lore = buildLore([merch("Foz do Iguaçu | São João Batista")], SUL);
    expect(lore.byCity.size).toBe(0);
    expect(lore.skipped).toEqual([{ name: "Foz do Iguaçu | São João Batista", reason: "ambiguous" }]);
  });

  test("given state expressions, when built, then the state comes from the name or an unambiguous demonym", () => {
    const lore = buildLore([merch("Bah Meu | Rio Grande do Sul"), merch("Vai da Onda | Litoral Catarinense")], SUL);
    expect(lore.byState.map((s) => s.uf)).toEqual(["RS", "SC"]);
  });

  test("given lines that are not local voice, when built, then they are ignored", () => {
    const lore = buildLore([merch("Rio Grande do Sul | Clean"), merch("Laura | Meu Pai"), merch("Tongo | Dizeres"), merch("Norte Catarinense | 047")], SUL);
    expect(lore.byCity.size + lore.byState.length + lore.skipped.length).toBe(0);
  });
});

describe("Dizeres with context", () => {
  test("given Dizeres, when only some have an editorial context, then only those are returned with it", () => {
    const shown = dizeresWithContext([merch("Bah | Dizeres"), merch("Tongo | Dizeres"), merch("Talvez esteja em Jaraguá | Dizeres")]);
    expect(shown.map((d) => `${d.text} / ${d.context}`)).toEqual(["Bah / Rio Grande do Sul", "Talvez esteja em Jaraguá / Jaraguá do Sul · SC"]);
  });
});

describe("state lines", () => {
  test("given several lines for a state, when picking, then Clean wins and flag-colored Made in is never chosen", () => {
    const list = [merch("Made in Santa Catarina"), merch("Santa Catarina | Minimal"), merch("Santa Catarina | Clean"), merch("SC | Minimal")];
    expect(stateLineProduct(list, "SC")?.line).toBe("Clean");
  });

  test("given no approved line for a state, when picking, then nothing is returned", () => {
    expect(stateLineProduct([merch("Made in Paraná")], "PR")).toBeNull();
  });
});

describe("official geography", () => {
  test("given Torres, when read, then its IBGE intermediate region is exposed", () => {
    expect(cityBySlug("RS", "torres")?.area).toBe("Região de Porto Alegre");
  });

  test("given a state, when grouped, then groups follow IBGE intermediate regions and cover every municipality", () => {
    const groups = areaGroupsOfState("SC");
    expect(groups).toHaveLength(7);
    expect(groups.reduce((sum, g) => sum + g.cities.length, 0)).toBe(295);
  });

  test("given the whole Sul, when read, then every municipality has an intermediate region and there are 21", () => {
    const groups = ["PR", "SC", "RS"].flatMap((uf) => areaGroupsOfState(uf));
    expect(groups).toHaveLength(21);
    expect(groups.reduce((sum, g) => sum + g.cities.length, 0)).toBe(1191);
    expect(groups.every((g) => g.name.startsWith("Região de "))).toBe(true);
  });

  test("given a city, when asking for neighbours, then they share its region and exclude itself", () => {
    const floripa = cityBySlug("SC", "florianopolis")!;
    const same = citiesOfSameArea(floripa);
    expect(same.length).toBe(16);
    expect(same.every((c) => c.areaSlug === floripa.areaSlug && c.id !== floripa.id)).toBe(true);
  });
});
