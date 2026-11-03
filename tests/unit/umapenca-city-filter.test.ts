import { describe, expect, test } from "vitest";
import { filterByCity, stateCounts } from "@/lib/umapenca/city-filter";
import { articleCity } from "@/lib/umapenca/region";

describe("Uma Penca article city, from the title", () => {
  test("the place's own spelling, its UF and the title without the UF suffix", () => {
    expect(articleCity("Caneca Lá de Aceguá | RS")).toEqual({ name: "Aceguá", uf: "RS", label: "Caneca Lá de Aceguá" });
    expect(articleCity("Caneca Lá de Palmas – TO")).toEqual({ name: "Palmas", uf: "TO", label: "Caneca Lá de Palmas" });
    expect(articleCity("CANECA LÁ DE PORTO VELHO")).toEqual({ name: "Porto Velho", uf: "RO", label: "CANECA LÁ DE PORTO VELHO" });
    expect(articleCity("Caneca Lá da Ceilândia")).toMatchObject({ uf: "DF", label: "Caneca Lá da Ceilândia" });
  });

  test("a generic article, or a place the region rules refuse, has no city", () => {
    expect(articleCity("Caneca Use Origens")).toBeNull();
    expect(articleCity("Caneca Lá de Palmas")).toBeNull();
    expect(articleCity("Caneca Lá de Lugar Nenhum")).toBeNull();
  });
});

describe("\"Outros artigos\" city filter", () => {
  const items = [
    { id: "a", city: "Aceguá", uf: "RS" },
    { id: "pa", city: "Porto Alegre", uf: "RS" },
    { id: "cu", city: "Curitiba", uf: "PR" },
    { id: "cb", city: "Curitibanos", uf: "SC" },
    { id: "al", city: "Alegrete", uf: "RS" },
    { id: "g", city: null, uf: null },
  ];
  const ids = (list: { id: string }[]) => list.map((i) => i.id);

  test("the exact city first, then the cities that start with it (A–Z), then a word, then anywhere; accents and case never matter", () => {
    expect(ids(filterByCity(items, "curitiba", null))).toEqual(["cu", "cb"]);
    expect(ids(filterByCity(items, "CURITIBANOS", null))).toEqual(["cb"]);
    expect(ids(filterByCity(items, "alegre", null))).toEqual(["al", "pa"]);
    expect(ids(filterByCity(items, "acegua", null))).toEqual(["a"]);
    expect(ids(filterByCity(items, "egr", null))).toEqual(["al", "pa"]);
    expect(ids(filterByCity(items, "curi", null))).toEqual(["cu", "cb"]);
    expect(ids(filterByCity(items, "eg", null))).toEqual([]);
  });

  test("the state keeps only its UF; nothing asked keeps everything in the feed's order", () => {
    expect(ids(filterByCity(items, "", "RS"))).toEqual(["a", "pa", "al"]);
    expect(ids(filterByCity(items, "cur", "SC"))).toEqual(["cb"]);
    expect(ids(filterByCity(items, "  ", null))).toEqual(ids(items));
    expect(stateCounts(items, ["PR", "SC", "RS", "XX"])).toEqual([{ uf: "PR", count: 1 }, { uf: "SC", count: 1 }, { uf: "RS", count: 3 }]);
  });
});
