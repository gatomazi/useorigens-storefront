import { describe, expect, test } from "vitest";
import { normalizeSearch, scoreCollection, searchCollections, type SearchableCollection } from "@/lib/admin/collection-search";

const c = (id: number, name: string, slug: string, visibility: "public" | "internal" = "public", position = id): SearchableCollection => ({ id, name, slug, visibility, position, selectable: true });
const LIST = [
  c(152079, "Fala Daqui", "fala-daqui"),
  c(152188, "Da Nossa Terra", "da-nossa-terra"),
  c(152187, "Do Nosso Jeito", "do-nosso-jeito"),
  c(152031, "SUL - RS", "sul-rs", "internal"),
  c(152057, "SUL - TERRIT. - RS", "sul-territ-rs", "internal"),
  c(148122, "Fé de Origem", "fe-de-origem", "internal"),
  c(152270, "Novidades", "novidades"),
];

describe("collection search", () => {
  test("given text with or without accents and in any case, when normalised, then they are the same", () => {
    expect(normalizeSearch("Fé de Origem")).toBe("fe de origem");
    expect(normalizeSearch("  FÉ   DE-origem ")).toBe("fe de origem");
  });

  test("given 'fala', when searched, then 'Fala Daqui' leads", () => {
    expect(searchCollections(LIST, "fala")[0].name).toBe("Fala Daqui");
  });

  test("given a query with and without accents, when searched, then the results are identical", () => {
    expect(searchCollections(LIST, "fé").map((x) => x.id)).toEqual(searchCollections(LIST, "fe").map((x) => x.id));
    expect(searchCollections(LIST, "FÉ DE ORIGEM").map((x) => x.id)).toEqual([148122]);
  });

  test("given a slug or an id, when searched, then it is found by them too", () => {
    expect(searchCollections(LIST, "sul-rs").map((x) => x.id)).toContain(152031);
    expect(searchCollections(LIST, "152188").map((x) => x.id)).toEqual([152188]);
    expect(scoreCollection(LIST[1], "152188")).toBe(100);
  });

  test("given several words in another order, when searched, then a collection containing all of them matches", () => {
    expect(searchCollections(LIST, "terra nossa").map((x) => x.id)).toContain(152188);
  });

  test("given a name prefix and a mid-word match, when ranked, then the prefix wins; ties put public before internal", () => {
    const r = searchCollections(LIST, "sul");
    expect(r.map((x) => x.id)).toEqual([152031, 152057]); // both internal, INK order
    const mixed = searchCollections([c(2, "Terra Sul", "terra-sul", "internal"), c(1, "Terra Sul", "terra-sul", "public")], "terra sul");
    expect(mixed.map((x) => x.id)).toEqual([1, 2]);
  });

  test("given nothing matching or an empty query, when searched, then no match / everything (the caller decides what to show first)", () => {
    expect(searchCollections(LIST, "zzz")).toEqual([]);
    expect(searchCollections(LIST, "").length).toBe(LIST.length);
  });

  test("given a limit, when searched, then only that many come back", () => {
    expect(searchCollections(LIST, "", 3)).toHaveLength(3);
  });

  test("given regex-looking or hostile text, when searched, then it is only text", () => {
    expect(() => searchCollections(LIST, ".*(")).not.toThrow();
    expect(searchCollections(LIST, "<script>")).toEqual([]);
  });
});
