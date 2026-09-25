import { describe, expect, test } from "vitest";
import { cleanQuery, parsePage, prepareDocs, queryTerms, searchDocs, type SearchDoc } from "@/lib/search/catalog-search";

let seq = 1;
function doc(overrides: Partial<SearchDoc> & Pick<SearchDoc, "title" | "strong">): SearchDoc {
  const id = String(seq++);
  return { id, kind: "merch", context: null, imageUrl: `https://img/${id}.jpg`, price: 109.9, href: `https://www.usesul.com.br/usesul/product/${id}`, uf: null, sales: 0, order: 0, weak: [], ...overrides };
}
const city = (name: string, uf: string, stateName: string, extra: Partial<SearchDoc> = {}) =>
  doc({ kind: "city-design", title: "Ponto de Origem", context: `${name} · ${uf}`, uf, strong: ["Ponto de Origem", name], weak: [stateName, uf], ...extra });

const catalog = prepareDocs([
  city("Florianópolis", "SC", "Santa Catarina"),
  city("Florianópolis", "SC", "Santa Catarina", { title: "Ponto de Origem · Regional", order: 1, strong: ["Ponto de Origem", "Florianópolis", "Regional"] }),
  city("Tijucas", "SC", "Santa Catarina"),
  city("Porto Alegre", "RS", "Rio Grande do Sul"),
  city("Alegrete", "RS", "Rio Grande do Sul"),
  city("Porto União", "SC", "Santa Catarina"),
  doc({ title: "Made in Santa Catarina", strong: ["Made in Santa Catarina"], weak: ["made-in-santa-catarina"] }),
  doc({ title: "Gaúcho do Chimarrão | Meu Pai", strong: ["Gaúcho do Chimarrão | Meu Pai", "Feito Para Você"] }),
  doc({ title: "All You Need Is Chimarrão", strong: ["All You Need Is Chimarrão"], sales: 9 }),
  doc({ title: "Bah, tchê!", strong: ["Bah, tchê!", "Fala Daqui"] }),
]);
const titles = (query: string, page = 1) => searchDocs(catalog, query, { page }).items.map((d) => `${d.title}${d.context ? ` / ${d.context}` : ""}`);

describe("searchDocs", () => {
  test("given an accent-free, lowercase query, when searched, then accented products match", () => {
    expect(titles("florianopolis")).toEqual(["Ponto de Origem / Florianópolis · SC", "Ponto de Origem · Regional / Florianópolis · SC"]);
    expect(titles("CHIMARRAO")).toHaveLength(2);
  });

  test("given a product literally named like the state, when searching the state, then it leads the many designs that only belong to it", () => {
    const [first, second] = titles("santa catarina");
    expect(first).toBe("Made in Santa Catarina");
    expect(second).toContain("· SC");
    expect(titles("santa catarina")).toHaveLength(5); // the product + the four SC city designs (state is a weak field)
  });

  test("given a compound term, when searched, then every word must match and the whole phrase leads", () => {
    const found = titles("porto alegre");
    expect(found[0]).toBe("Ponto de Origem / Porto Alegre · RS");
    expect(found).not.toContain("Ponto de Origem / Alegrete · RS"); // "porto" is missing there
  });

  test("given a connective in the query, when searched, then it does not block the match", () => {
    expect(titles("camiseta de tijucas")).toEqual([]); // "camiseta" is not in any field: still every meaningful term must match
    expect(titles("origem de tijucas")).toEqual(["Ponto de Origem / Tijucas · SC"]);
  });

  test("given a UF code, when searched, then designs of that state match through the weak field", () => {
    expect(titles("rs")).toEqual(expect.arrayContaining(["Ponto de Origem / Porto Alegre · RS", "Ponto de Origem / Alegrete · RS"]));
  });

  test("given a city with a primary and a variant, when searched, then both stay visible and the primary comes first", () => {
    const [first, second] = titles("florianopolis");
    expect(first).toBe("Ponto de Origem / Florianópolis · SC");
    expect(second).toBe("Ponto de Origem · Regional / Florianópolis · SC");
  });

  test("given equal scores, when searched, then more sales come first", () => {
    expect(titles("chimarrao")[0]).toBe("All You Need Is Chimarrão");
  });

  test("given a term nobody has, when searched, then nothing is invented", () => {
    const result = searchDocs(catalog, "zzzxq");
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.pageCount).toBe(0);
  });

  test("given an empty or whitespace-only query, when searched, then it is a no-op", () => {
    expect(searchDocs(catalog, "   ").total).toBe(0);
    expect(searchDocs(catalog, "").pageCount).toBe(0);
  });

  test("given a punctuation-only query, when searched, then it matches nothing instead of everything", () => {
    expect(searchDocs(catalog, "!!! ???").total).toBe(0);
  });
});

describe("paging", () => {
  const many = prepareDocs(Array.from({ length: 55 }, (_, i) => doc({ title: `Estampa ${String(i).padStart(2, "0")}`, strong: [`Estampa ${String(i).padStart(2, "0")}`, "Gramado"] })));

  test("given 55 hits and a page size of 24, when paging, then the count, page count and slices are consistent", () => {
    const p1 = searchDocs(many, "gramado", { page: 1 });
    const p3 = searchDocs(many, "gramado", { page: 3 });
    expect([p1.total, p1.pageCount, p1.items.length, p3.items.length]).toEqual([55, 3, 24, 7]);
    expect(new Set([...p1.items, ...searchDocs(many, "gramado", { page: 2 }).items, ...p3.items].map((d) => d.id)).size).toBe(55);
  });

  test("given a page past the end or a nonsense page, when paging, then it is clamped into range", () => {
    expect(searchDocs(many, "gramado", { page: 99 }).page).toBe(3);
    expect(searchDocs(many, "gramado", { page: -4 }).page).toBe(1);
    expect(searchDocs(many, "gramado", { page: Number.NaN }).page).toBe(1);
  });

  test("given raw page params, when parsed, then only positive integers survive", () => {
    expect([parsePage("3"), parsePage("0"), parsePage("-1"), parsePage("2.5"), parsePage("abc"), parsePage(undefined), parsePage(["4", "5"]), parsePage("9999999")]).toEqual([3, 1, 1, 1, 1, 1, 4, 1]);
  });
});

describe("query cleaning", () => {
  test("given a padded, multi-line and overlong query, when cleaned, then it is trimmed, single-spaced and capped", () => {
    expect(cleanQuery("  porto \n  alegre  ")).toBe("porto alegre");
    expect(cleanQuery("a".repeat(500))).toHaveLength(80);
    expect(cleanQuery(["x", "y"])).toBe("x");
    expect(cleanQuery(undefined)).toBe("");
    expect(cleanQuery(42)).toBe("");
  });

  test("given many terms, when split, then at most eight are used and connectives are dropped only if others remain", () => {
    expect(queryTerms("um dois tres quatro cinco seis sete oito nove dez")).toHaveLength(8);
    expect(queryTerms("cidade de gramado")).toEqual(["cidade", "gramado"]);
    expect(queryTerms("de da")).toEqual(["de", "da"]);
  });
});
