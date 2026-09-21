import { describe, expect, test } from "vitest";
import { allCities } from "@/lib/geo/cities";
import { prepareCities, searchCities, type SearchCity } from "@/lib/search/rank";

const sul: SearchCity[] = allCities()
  .filter((c) => c.regionSlug === "sul")
  .map((c) => ({ n: c.name, u: c.uf, s: c.slug, ...(c.aliases.length ? { a: [...c.aliases] } : {}) }));
const prepared = prepareCities(sul);

function names(query: string, limit = 8) {
  return searchCities(prepared, query, { limit }).map((r) => (r.type === "city" ? `${r.city.n}/${r.city.u}` : `UF:${r.uf}`));
}

describe("searchCities", () => {
  test("given a partial city name, when searched, then the prefix match comes first", () => {
    expect(names("tij")[0]).toBe("Tijucas/SC");
  });

  test("given an accent-free query, when searched, then accented cities are found", () => {
    expect(names("florianopolis")[0]).toBe("Florianópolis/SC");
  });

  test("given a curated alias, when searched, then the aliased city is returned", () => {
    expect(names("floripa")[0]).toBe("Florianópolis/SC");
  });

  test("given an exact city name that is also a prefix of others, when searched, then the exact match ranks first", () => {
    expect(names("torres")[0]).toBe("Torres/RS");
  });

  test("given equal prefix matches, when searched, then the well-known city with curated aliases leads", () => {
    expect(names("flo")[0]).toBe("Florianópolis/SC");
  });

  test("given a UF code, when searched, then the state is offered", () => {
    expect(names("sc")).toContain("UF:SC");
  });

  test("given a typo, when searched, then no unrelated city is invented", () => {
    expect(names("zzzxq")).toEqual([]);
  });

  test("given a UF restriction, when searched, then only that state's cities are returned", () => {
    const results = searchCities(prepared, "santa", { ufs: ["SC"], limit: 20 });
    expect(results.every((r) => (r.type === "city" ? r.city.u === "SC" : r.uf === "SC"))).toBe(true);
  });
});
