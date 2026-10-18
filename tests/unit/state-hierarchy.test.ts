import { describe, expect, test } from "vitest";
import { stateHierarchyRows } from "@/lib/catalog/state-hierarchy";

// Collections as plain id lists. "x…" ids are not in the catalog (no card), so they never count toward a row.
type C = { id: number; name: string; ids: string[]; hidden?: string[] };
const col = (id: number, name: string, ids: string[], hidden: string[] = []): C => ({ id, name, ids, hidden });
const run = (state: C, categories: C[], subcategories: C[], min = 3) =>
  stateHierarchyRows({
    state,
    categories,
    subcategories,
    members: (c) => c.ids,
    items: (c, ids) => ids.filter((id) => !id.startsWith("x") && !(c.hidden ?? []).includes(id)).map((id) => ({ id })),
    min,
  }).map((r) => [r.level, r.collection.name, r.category?.name ?? null, r.items.map((i) => i.id).join(",")]);

const sc = col(1, "Santa Catarina", ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"]);
const terra = col(10, "Da Nossa Terra", ["1", "2", "3", "4", "5", "6", "7", "99"]); // "99" is another state's
const fala = col(11, "Fala Daqui", ["8", "9", "10"]);
const jeito = col(12, "Do Nosso Jeito", ["11"]);

describe("the state page's hierarchy: state > category > subcategory", () => {
  test("given no subcategory, then one row per category with the state's products, then the state's own row with what is left", () => {
    expect(run(sc, [terra, fala, jeito], [])).toEqual([
      ["category", "Da Nossa Terra", "Da Nossa Terra", "1,2,3,4,5,6,7"],
      ["category", "Fala Daqui", "Fala Daqui", "8,9,10"],
      // "Do Nosso Jeito" has one product: below the minimum, so "11" goes up to the state's row with "12" and "13"
      ["state", "Santa Catarina", null, "11,12,13"],
    ]);
  });

  test("given subcategories, then each product is in the deepest row: the subcategories first, then the category with only what they left", () => {
    const bichos = col(20, "Bichos", ["1", "2", "3", "99"]);
    const comidas = col(21, "Comidas", ["4", "5", "6"]);
    expect(run(sc, [terra, fala], [bichos, comidas])).toEqual([
      ["subcategory", "Bichos", "Da Nossa Terra", "1,2,3"],
      ["subcategory", "Comidas", "Da Nossa Terra", "4,5,6"],
      // only "7" is left in Da Nossa Terra: below the minimum, so it goes up to the state's row
      ["category", "Fala Daqui", "Fala Daqui", "8,9,10"],
      ["state", "Santa Catarina", null, "7,11,12,13"],
    ]);
  });

  test("given a subcategory below the minimum, then it is not drawn and its products stay in the category", () => {
    const bichos = col(20, "Bichos", ["1", "2"]);
    expect(run(sc, [terra], [bichos])).toEqual([
      ["category", "Da Nossa Terra", "Da Nossa Terra", "1,2,3,4,5,6,7"],
      ["state", "Santa Catarina", null, "8,9,10,11,12,13"],
    ]);
  });

  test("given a subcategory spanning two categories, then one row, under the first category it shares a product with, taking its products from both", () => {
    const novidades = col(30, "Novidades", ["7", "8", "9"]);
    expect(run(sc, [fala, terra], [novidades])).toEqual([
      ["subcategory", "Novidades", "Fala Daqui", "7,8,9"],
      // Fala Daqui keeps only "10": below the minimum
      ["category", "Da Nossa Terra", "Da Nossa Terra", "1,2,3,4,5,6"],
      ["state", "Santa Catarina", null, "10,11,12,13"],
    ]);
  });

  test("given a subcategory sharing no product with any category, then its row comes after the categories, before the state's", () => {
    const pai = col(31, "Dia dos Pais", ["11", "12", "13"]);
    expect(run(sc, [terra, fala], [pai])).toEqual([
      ["category", "Da Nossa Terra", "Da Nossa Terra", "1,2,3,4,5,6,7"],
      ["category", "Fala Daqui", "Fala Daqui", "8,9,10"],
      ["subcategory", "Dia dos Pais", null, "11,12,13"],
    ]); // nothing is left for the state's row
  });

  test("given a product hidden in a subcategory's arrangement, then it is not drawn there and stays in its category", () => {
    const bichos = col(20, "Bichos", ["1", "2", "3", "4"], ["4"]);
    expect(run(sc, [terra], [bichos], 3)[1]).toEqual(["category", "Da Nossa Terra", "Da Nossa Terra", "4,5,6,7"]);
  });

  test("given a product in two categories, then it shows in both", () => {
    const pai = col(13, "Feito Para Você", ["1", "2", "3"]);
    expect(run(sc, [terra, pai], []).slice(0, 2)).toEqual([
      ["category", "Da Nossa Terra", "Da Nossa Terra", "1,2,3,4,5,6,7"],
      ["category", "Feito Para Você", "Feito Para Você", "1,2,3"],
    ]);
  });

  test("given a collection listed as category AND subcategory, or the state itself in a list, then it counts once, as a category", () => {
    expect(run(sc, [terra, sc], [terra, fala]).map((r) => r[0] + ":" + r[1])).toEqual(["category:Da Nossa Terra", "subcategory:Fala Daqui", "state:Santa Catarina"]);
  });

  test("given a state with nothing outside the drawn rows, or with no products at all, then no state row", () => {
    expect(run(col(2, "Paraná", ["1", "2", "3"]), [terra], [])).toEqual([["category", "Da Nossa Terra", "Da Nossa Terra", "1,2,3"]]);
    expect(run(col(3, "Rio Grande do Sul", []), [terra], [])).toEqual([]);
  });

  test("given a minimum per collection (a grid row), then that row shows below the carousel minimum and the others keep it", () => {
    const rows = stateHierarchyRows({
      state: sc,
      categories: [terra, fala, jeito],
      subcategories: [],
      members: (c) => c.ids,
      items: (c, ids) => ids.filter((id) => !id.startsWith("x")).map((id) => ({ id })),
      min: (c) => (c.id === jeito.id ? 1 : 3),
    }).map((r) => [r.level, r.collection.name, r.items.map((i) => i.id).join(",")]);
    expect(rows).toEqual([
      ["category", "Da Nossa Terra", "1,2,3,4,5,6,7"],
      ["category", "Fala Daqui", "8,9,10"],
      ["category", "Do Nosso Jeito", "11"], // one product, shown: its minimum is 1
    ]); // "12" and "13" are left for the state's row: two, below its minimum of 3
  });
});
