import { describe, expect, test } from "vitest";
import { prepareGlobalDocs, searchGlobal, GROUP_OF, type GlobalDoc, type PreparedGlobalDoc } from "@/lib/search/global";
import { editDistance, suggestPlace } from "@/lib/search/suggest";

const doc = (kind: GlobalDoc["kind"], title: string, names: string[] = [title], extra: Partial<GlobalDoc> = {}): GlobalDoc => ({
  key: `${kind}:${title}:${extra.uf ?? ""}`, kind, title, region: "sul", subtitle: "", href: "/sul/sc/x", tag: kind, rank: 0, names, strong: [], weak: [], ...extra,
});
const isPlace = (p: PreparedGlobalDoc) => GROUP_OF[p.doc.kind] === "places";
const places = prepareGlobalDocs([
  doc("locality", "Florianópolis", ["Florianópolis", "Floripa"]),
  doc("locality", "Curitiba"),
  doc("locality", "Joinville"),
  doc("locality", "Porto"),
  doc("locality", "Ibirama"),
  doc("locality", "Ibirapa"),
  doc("locality", "Bom Jesus", ["Bom Jesus"], { uf: "PR" }),
  doc("locality", "Bom Jesus", ["Bom Jesus"], { uf: "SC" }),
  doc("state", "Santa Catarina"),
  doc("design", "Florianópolis · Ponto de Origem", ["Florianópolis · Ponto de Origem"]),
]);
const suggest = (q: string) => suggestPlace(places, q, isPlace);

describe("editDistance", () => {
  test("counts an insertion, a deletion, a replacement and a swap of neighbours as one edit each", () => {
    expect(editDistance("curitba", "curitiba", 2)).toBe(1);
    expect(editDistance("curitiba", "curitba", 2)).toBe(1);
    expect(editDistance("curitibo", "curitiba", 2)).toBe(1);
    expect(editDistance("ab", "ba", 2)).toBe(1);
  });
  test("returns max + 1 for anything farther, without scanning the whole word", () => {
    expect(editDistance("abcdef", "uvwxyz", 2)).toBe(3);
    expect(editDistance("abc", "abcdefgh", 2)).toBe(3);
  });
});

describe("suggestPlace: \"Você quis dizer…\"", () => {
  test("given a typo of a city, then it suggests the city's title", () => {
    expect(suggest("florianopolsi")).toBe("Florianópolis");
    expect(suggest("curitba")).toBe("Curitiba");
    expect(suggest("joinvile")).toBe("Joinville");
    expect(suggest("santa catrina")).toBe("Santa Catarina");
  });
  test("given a typo of an alias, then it suggests the place the alias belongs to", () => {
    expect(suggest("floripo")).toBe("Florianópolis");
  });
  test("ignores case and accents", () => {
    expect(suggest("FLORIANÓPOLSI")).toBe("Florianópolis");
  });
  test("given the same city name in two states, then it is ONE suggestion (the search that follows lists both)", () => {
    expect(suggest("bon jesus")).toBe("Bom Jesus");
  });
  test("given two different places equally close, then it does not guess", () => {
    expect(suggest("ibiraxa")).toBeNull();
  });
  test("given a short query, then it is a prefix being typed, not a mistake", () => {
    expect(suggest("cur")).toBeNull();
    expect(suggest("tij")).toBeNull();
  });
  test("allows one edit up to 5 letters and two above", () => {
    expect(suggest("pxrto")).toBe("Porto");
    expect(suggest("pxrtx")).toBeNull();
    expect(suggest("curtba")).toBe("Curitiba"); // 6 letters, two insertions away
  });
  test("given nothing close, then it suggests nothing", () => {
    expect(suggest("zzzxq")).toBeNull();
  });
  test("given the exact name, then there is nothing to correct", () => {
    expect(suggest("curitiba")).toBeNull();
  });
  test("only places are suggested: a design title never is", () => {
    const onlyDesigns = prepareGlobalDocs([doc("design", "Florianópolis · Ponto de Origem", ["Florianópolis"])]);
    expect(suggestPlace(onlyDesigns, "florianopolsi", isPlace)).toBeNull();
  });
  test("stays fast on a region the size of the real one (about 6 thousand places, a name and an alias each)", () => {
    const big = prepareGlobalDocs(Array.from({ length: 6000 }, (_, i) => doc("locality", `Cidade ${i} Exemplo`, [`Cidade ${i} Exemplo`, `Apelido ${i}`], { uf: "SC" })));
    const started = performance.now();
    suggestPlace(big, "florianopolsi", isPlace);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe("searchGlobal carries the suggestion only when nothing matched", () => {
  const byRegion = new Map([["sul" as const, places]]);
  test("given a typo with no result, then the response suggests the place", () => {
    const response = searchGlobal(byRegion, "sul", "florianopolsi");
    expect(response).toMatchObject({ total: 0, groups: [], others: [], suggestion: "Florianópolis" });
  });
  test("given a query that matches, then there is no suggestion field", () => {
    const response = searchGlobal(byRegion, "sul", "floria");
    expect(response.total).toBeGreaterThan(0);
    expect(response).not.toHaveProperty("suggestion");
  });
  test("given an empty query or nothing close, then there is no suggestion field", () => {
    expect(searchGlobal(byRegion, "sul", "  ")).not.toHaveProperty("suggestion");
    expect(searchGlobal(byRegion, "sul", "zzzxq")).not.toHaveProperty("suggestion");
  });
});
