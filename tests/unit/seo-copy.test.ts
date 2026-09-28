import { describe, expect, test } from "vitest";
import { allCities } from "@/lib/geo/cities";
import { DESIGN_FAMILIES } from "@/lib/catalog/families";
import { REGIONS, STATE_NAMES } from "@/lib/geo/regions";
import { cityDescription, cityIntro, cityTitle, familyDescription, familyTitle, fitDescription, listNames, regionDescription, regionTitle, stateDescription, stateIntro, stateTitle } from "@/lib/seo/copy";

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const ALL_FAMILY_NAMES = DESIGN_FAMILIES.map((f) => f.name);

describe("region home copy", () => {
  test("given the Sul, when title and description are built, then they follow the reviewed wording", () => {
    expect(regionTitle("sul")).toBe("Camisetas do Sul e da Sua Cidade");
    expect(regionDescription("sul")).toBe("Encontre camisetas de cidades do Paraná, de Santa Catarina e do Rio Grande do Sul. Escolha sua cidade, explore as estampas e vista suas origens.");
  });

  test("given a region with many states, when the description is built, then it names the region instead of a long list", () => {
    expect(regionDescription("norte")).toContain("cidades do Norte");
    for (const region of Object.keys(REGIONS) as (keyof typeof REGIONS)[]) expect(regionDescription(region).length, region).toBeLessThanOrEqual(160);
  });

  test("given the three regions, when titles are built, then they are all different", () => {
    const titles = (Object.keys(REGIONS) as (keyof typeof REGIONS)[]).map(regionTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("state copy", () => {
  test("given RS, SC and PR, when titles are built, then they use the demonym, the right preposition and stay short", () => {
    expect(stateTitle("RS")).toBe("Camisetas Gaúchas e de Cidades do RS");
    expect(stateTitle("SC")).toBe("Camisetas Catarinenses e de Cidades de SC");
    expect(stateTitle("PR")).toBe("Camisetas Paranaenses e de Cidades do PR");
    for (const uf of ["RS", "SC", "PR"]) expect(`${stateTitle(uf)} | Use Origens`.length, uf).toBeLessThanOrEqual(60);
  });

  test("given a state without a demonym, when the title is built, then it uses the plain wording", () => {
    expect(stateTitle("PA")).toBe("Camisetas de Cidades do Pará");
    expect(stateTitle("GO")).toBe("Camisetas de Cidades de Goiás");
  });

  test("given every state, when titles and descriptions are built, then they are unique and never the wrong 'de Paraná' form", () => {
    const ufs = Object.keys(STATE_NAMES);
    expect(new Set(ufs.map(stateTitle)).size).toBe(ufs.length);
    expect(new Set(ufs.map((uf) => stateDescription(uf, 100))).size).toBe(ufs.length);
    for (const uf of ufs) {
      for (const text of [stateTitle(uf), stateDescription(uf, 100), stateIntro(uf, 100)]) {
        expect(text, uf).not.toMatch(/\bde (Paraná|Rio Grande do Sul|Pará|Acre|Amazonas|Amapá|Tocantins|Distrito Federal)\b/);
      }
      expect(stateDescription(uf, 100).length, uf).toBeLessThanOrEqual(160);
    }
  });

  test("given the real count, when the description and the intro are built, then both state it", () => {
    expect(stateDescription("RS", 497)).toContain("497 cidades");
    expect(stateIntro("RS", 497)).toContain("497 cidades");
    expect(stateIntro("RS", 497)).toBe("Camisetas gaúchas e de cidades do Rio Grande do Sul: 497 cidades com estampas de nome, mapa e coordenadas. Busque a sua cidade ou escolha por região ou em ordem alfabética.");
  });

  test("given no covered city, when the description is built, then it claims no count", () => {
    expect(stateDescription("RS", 0)).not.toMatch(/\d/);
  });
});

describe("city copy", () => {
  const bage = { name: "Bagé", uf: "RS" };

  test("given Bagé, when the title is built, then it is unchanged from the audited one", () => {
    expect(cityTitle(bage)).toBe("Camisetas de Bagé, RS");
  });

  test("given Bagé with three real styles, when the description is built, then it lists exactly those and counts them", () => {
    const text = cityDescription(bage, ["Ponto de Origem", "Coordenadas", "Traço"]);
    expect(text).toBe("Camisetas de Bagé, no Rio Grande do Sul: 3 estilos disponíveis, como Ponto de Origem, Coordenadas e Traço. Veja os estilos e escolha o seu na loja.");
  });

  test("given eight styles, when the description is built, then it shows three and counts the rest", () => {
    expect(cityDescription(bage, ALL_FAMILY_NAMES)).toContain("8 estilos disponíveis, como Ponto de Origem, Feito em, Coordenadas e mais 5");
  });

  test("given one style, when the description is built, then it says '1 estilo' and never claims eight", () => {
    const text = cityDescription(bage, ["Traço"]);
    expect(text).toBe("Camisetas de Bagé, no Rio Grande do Sul: 1 estilo disponível, Traço. Veja o estilo e escolha na loja.");
    expect(text).not.toContain("8");
  });

  test("given no style, when the description is built, then it claims no style", () => {
    expect(cityDescription(bage, [])).toBe("Camisetas de Bagé, no Rio Grande do Sul. Veja os estilos e escolha o seu na loja.");
    expect(cityIntro(bage, "sul", [])).toBeNull();
  });

  test("given a city, when the intro is built, then it names only the given styles and sends the shopper to the store", () => {
    const intro = cityIntro(bage, "sul", ["Ponto de Origem", "Traço"]) ?? "";
    expect(intro).toContain("2 estilos para vestir Bagé: Ponto de Origem e Traço.");
    expect(intro).toContain("Use Sul");
    expect(intro).not.toMatch(/gentílico de|orgulho|gaúch|bageense|frete grátis|personaliz/i);
  });

  test("given one to eight styles, when the intro is built, then it stays a short paragraph", () => {
    for (let n = 1; n <= 8; n += 1) {
      const count = words(cityIntro(bage, "sul", ALL_FAMILY_NAMES.slice(0, n)) ?? "");
      expect(count, `${n} styles`).toBeGreaterThanOrEqual(35);
      expect(count, `${n} styles`).toBeLessThanOrEqual(80);
    }
  });

  test("given every municipality, when the title is built, then all are unique (homonyms are told apart by the UF)", () => {
    const cities = allCities();
    expect(new Set(cities.map(cityTitle)).size).toBe(cities.length);
  });

  test("given every municipality with the same styles, when descriptions are built, then all are unique and fit a snippet", () => {
    const cities = allCities();
    const descriptions = cities.map((c) => cityDescription(c, ALL_FAMILY_NAMES));
    expect(new Set(descriptions).size).toBe(cities.length);
    for (const [i, text] of descriptions.entries()) expect(text.length, cities[i].name).toBeLessThanOrEqual(160);
  });

  test("given names with accents, hyphens and apostrophes, when copy is built, then they survive untouched", () => {
    const cities = allCities().filter((c) => /['’-]|[^\x00-\x7F]/.test(c.name));
    expect(cities.length).toBeGreaterThan(50);
    for (const city of cities.slice(0, 200)) expect(cityDescription(city, ["Traço"]), city.name).toContain(city.name);
  });
});

describe("design family copy", () => {
  test("given a family and a city, when title and description are built, then the UF is in the title", () => {
    const family = DESIGN_FAMILIES[0];
    expect(familyTitle(family, { name: "Bagé", uf: "RS" })).toBe("Ponto de Origem de Bagé, RS");
    expect(familyDescription(family, { name: "Bagé", uf: "RS" })).toBe("Camiseta Ponto de Origem de Bagé, no Rio Grande do Sul. Sua cidade marcada no mapa do estado.");
  });

  test("given every city and family, when titles are built, then they are all unique", () => {
    const cities = allCities();
    const titles = cities.flatMap((c) => DESIGN_FAMILIES.map((f) => familyTitle(f, c)));
    expect(new Set(titles).size).toBe(cities.length * DESIGN_FAMILIES.length);
  });
});

describe("text helpers", () => {
  test("given long text, when fitted, then it is cut at a word with an ellipsis; short text is untouched", () => {
    expect(fitDescription("curto  demais")).toBe("curto demais");
    const cut = fitDescription("palavra ".repeat(40));
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/\s…$/);
  });

  test("given names, when listed, then the last one is joined by 'e'", () => {
    expect(listNames(["A", "B", "C"])).toBe("A, B e C");
    expect(listNames(["A", "B"])).toBe("A e B");
    expect(listNames(["A"])).toBe("A");
    expect(listNames([])).toBe("");
  });
});
