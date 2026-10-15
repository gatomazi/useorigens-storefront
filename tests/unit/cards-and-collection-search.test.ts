import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { cardButtonOf, validateCards } from "@/lib/site-config/cards-schema";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import {
  activeFilterCount,
  applyCollectionFilters,
  collectionFacets,
  collectionQueryString,
  collectionQueryTerms,
  filterCollection,
  isCollectionQueryActive,
  MAX_COLLECTION_QUERY,
  parseCollectionQuery,
  runCollectionQuery,
  sortCollection,
  usefulFacets,
} from "@/lib/search/collection-filter";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "t1" };
const ok = (d: ScopeDoc, op: Parameters<typeof applyOp>[1]) => {
  const r = applyOp(d, op, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};

describe("store-wide buy button on the product cards (global scope)", () => {
  test("given the global document, when the button is turned on and off, then only `cards` changes and the document stays valid", () => {
    const global = structuredClone(seed().docs.global);
    const on = ok(global, { type: "set-cards", cards: { buyLabel: "Comprar" } });
    expect(on.cards).toEqual({ buyLabel: "Comprar" });
    expect(validateScopeDoc(on).ok).toBe(true);
    const off = ok(on, { type: "set-cards", cards: null });
    expect("cards" in off).toBe(false);
    expect(off).toEqual(global);
  });

  test("given a region, when the button is set there, then it is refused: it belongs to the global scope (every region)", () => {
    expect(applyOp(structuredClone(seed().docs.sul), { type: "set-cards", cards: { buyLabel: "Comprar" } }, ctx).ok).toBe(false);
    expect(validateScopeDoc({ ...seed().docs.sul, cards: { buyLabel: "Comprar" } }).ok).toBe(false);
  });

  test("given bad labels, when validated, then each is refused", () => {
    for (const buyLabel of ["", " Comprar", "Comprar ", "x".repeat(21), "Com\nprar"]) expect(validateCards({ buyLabel }, "global").ok).toBe(false);
    expect(validateCards({ buyLabel: "Ver produto", extra: 1 }, "global").ok).toBe(false);
    expect(validateCards({ buyLabel: "Ver produto" }, "global").ok).toBe(true);
  });

  test("given a published bundle, when read, then the label comes from the global document; an invalid one is dropped without touching the tracking", () => {
    const bundle = seed();
    expect(cardButtonOf(bundle)).toBeUndefined();
    const raw = { ...bundle, releaseId: "r1", docs: { ...bundle.docs, global: { ...bundle.docs.global, cards: { buyLabel: "Comprar" } } } };
    expect(cardButtonOf(sanitizeBundle(raw, bundle).bundle)).toEqual({ label: "Comprar", style: "button" });
    const fab = { ...raw, docs: { ...raw.docs, global: { ...raw.docs.global, cards: { buyLabel: "Comprar", buyStyle: "fab" } } } };
    expect(cardButtonOf(sanitizeBundle(fab, bundle).bundle)).toEqual({ label: "Comprar", style: "fab" });
    const bad = { ...raw, docs: { ...raw.docs, global: { ...raw.docs.global, cards: { buyLabel: "" } } } };
    const read = sanitizeBundle(bad, bundle);
    expect(cardButtonOf(read.bundle)).toBeUndefined();
    expect(read.bundle?.docs.global.tracking).toEqual(bundle.docs.global.tracking);
    expect(read.diagnostics.some((d) => d.includes("cards is invalid"))).toBe(true);
  });

  test("given a change of the button, when the publish screen diffs the global document, then it says what changes", () => {
    const global = structuredClone(seed().docs.global);
    const on = ok(global, { type: "set-cards", cards: { buyLabel: "Comprar" } });
    expect(diffDocs(global, on).map((c) => c.text)).toEqual(["Botão nos cards de produto: cada seção decide → botão “Comprar” em todos os cards"]);
    expect(diffDocs(on, on)).toEqual([]);
    const fab = ok(on, { type: "set-cards", cards: { buyLabel: "Comprar", buyStyle: "fab" } });
    expect(diffDocs(on, fab).map((c) => c.text)).toEqual(["Botão nos cards de produto: botão “Comprar” em todos os cards → carrinho na imagem “Comprar” em todos os cards"]);
  });

  test("given the style of the button, when validated, then the cart on the picture and the bar pass, anything else is refused", () => {
    expect(validateCards({ buyLabel: "Ver produto", buyStyle: "fab" }, "global").ok).toBe(true);
    expect(validateCards({ buyLabel: "Ver produto", buyStyle: "button" }, "global").ok).toBe(true);
    expect(validateCards({ buyLabel: "Ver produto", buyStyle: "floating" }, "global").ok).toBe(false);
  });
});

describe("mini search of a collection page", () => {
  const cards = [
    { id: "1", name: "Ponto de Origem", context: "Florianópolis · SC", state: "SC" },
    { id: "2", name: "Feito em", context: "Porto Alegre · RS", state: "RS" },
    { id: "3", name: "Coordenadas", context: "Alegrete · RS", state: "RS" },
    { id: "4", name: "Camiseta Bah Tchê", context: undefined, state: undefined },
    { id: "5", name: "Feito em", context: "Tijucas · SC", state: "SC" },
    { id: "6", name: "Território", context: "Curitiba · PR", state: "PR" },
  ];
  const ids = (q: string) => filterCollection(cards, q).map((c) => c.id);

  test("given a city, a style or a state, when searched, then the matching cards come back in the collection's order", () => {
    expect(ids("tijucas")).toEqual(["5"]);
    expect(ids("feito em")).toEqual(["2", "5"]);
    expect(ids("santa catarina")).toEqual(["1", "5"]);
    expect(ids("RS")).toEqual(["2", "3"]);
    expect(ids("bah")).toEqual(["4"]);
  });

  test("given accents, case and the city nicknames, when searched, then they do not matter", () => {
    expect(ids("FLORIANOPOLIS")).toEqual(["1"]);
    expect(ids("floripa")).toEqual(["1"]);
    expect(ids("poa")).toEqual(["2"]);
    expect(ids("ctba")).toEqual(["6"]);
    expect(ids("territorio")).toEqual(["6"]);
  });

  test("given several terms, when searched, then every one must start a word (no fuzzy, no middle-of-word hits)", () => {
    expect(ids("porto alegre")).toEqual(["2"]);
    expect(ids("alegre")).toEqual(["2", "3"]);
    expect(ids("flor")).toEqual(["1"]);
    expect(ids("polis")).toEqual([]);
    expect(ids("feito curitiba")).toEqual([]);
  });

  test("given a query too short or empty, when searched, then nothing is searched", () => {
    expect(collectionQueryTerms("a")).toEqual([]);
    expect(collectionQueryTerms("  ")).toEqual([]);
    expect(ids("")).toEqual([]);
    expect(collectionQueryTerms("x".repeat(MAX_COLLECTION_QUERY + 50))[0]).toHaveLength(MAX_COLLECTION_QUERY);
  });
});

describe("filters, facets and sort of a collection page (Catalog UX V1)", () => {
  const cards = [
    { name: "Ponto de Origem", context: "Tijucas · SC", state: "SC", city: "Tijucas", family: "ponto-de-origem", garmentTypeId: 1, rawPrice: 109.9 },
    { name: "Feito em", context: "Tijucas · SC", state: "SC", city: "Tijucas", family: "feito-em", garmentTypeId: 1, rawPrice: 104.9 },
    { name: "Ponto de Origem", context: "Curitiba · PR", state: "PR", city: "Curitiba", family: "ponto-de-origem", garmentTypeId: 1, rawPrice: 109.9 },
    { name: "Catarinense | Essência", garmentTypeId: 178, rawPrice: 129 },
    { name: "Gaúcho | Essência", garmentTypeId: 999, rawPrice: null },
  ];

  test("given cards of a collection, when the facets are counted, then each attribute counts only the cards that really carry it, in commercial order", () => {
    const facets = collectionFacets(cards, {});
    expect(facets.garment).toEqual([
      { value: "1", label: "Camiseta clássica", count: 3 },
      { value: "178", label: "Oversized", count: 1 },
    ]);
    expect(facets.state).toEqual([
      { value: "PR", label: "Paraná", count: 1 },
      { value: "SC", label: "Santa Catarina", count: 2 },
    ]);
    expect(facets.family.map((f) => [f.label, f.count])).toEqual([
      ["Ponto de Origem", 2],
      ["Feito em", 1],
    ]);
    // No city facet before a state is chosen (a region-wide collection has over a thousand cities).
    expect(facets.city).toEqual([]);
  });

  test("given a state chosen, when the facets are counted again, then the cities are that state's and the other states stay offered", () => {
    const facets = collectionFacets(cards, { state: "SC" });
    expect(facets.city).toEqual([{ value: "Tijucas", label: "Tijucas", count: 2 }]);
    expect(facets.state.map((s) => s.value)).toEqual(["PR", "SC"]);
    // The family facet narrows to SC: Ponto de Origem once, Feito em once.
    expect(facets.family.map((f) => [f.value, f.count])).toEqual([
      ["ponto-de-origem", 1],
      ["feito-em", 1],
    ]);
  });

  test("given filters, when applied, then only the matching cards remain and a card without the attribute never matches", () => {
    expect(applyCollectionFilters(cards, { garment: 1, state: "SC" }).map((c) => c.name)).toEqual(["Ponto de Origem", "Feito em"]);
    expect(applyCollectionFilters(cards, { family: "ponto-de-origem" })).toHaveLength(2);
    expect(applyCollectionFilters(cards, { garment: 999 })).toHaveLength(1);
    expect(applyCollectionFilters(cards, { city: "Curitiba" }).map((c) => c.state)).toEqual(["PR"]);
    expect(activeFilterCount({ garment: 1, state: "SC", city: undefined })).toBe(2);
  });

  test("given a price sort, when applied, then cheaper first (or dearer), ties keep the collection's order and a card without a price goes last", () => {
    expect(sortCollection(cards, "price-asc").map((c) => c.rawPrice)).toEqual([104.9, 109.9, 109.9, 129, null]);
    expect(sortCollection(cards, "price-asc").map((c) => c.context)[1]).toBe("Tijucas · SC");
    expect(sortCollection(cards, "price-desc").map((c) => c.rawPrice)).toEqual([129, 109.9, 109.9, 104.9, null]);
    expect(sortCollection(cards, "collection")).toEqual(cards);
  });

  test("given the API's query string, when parsed, then only valid values survive and the string round-trips", () => {
    const parsed = parseCollectionQuery(new URLSearchParams("q=tijucas&peca=178&uf=SC&cidade=Tijucas&estilo=ponto-de-origem&ordem=price-asc"));
    expect(parsed).toEqual({ q: "tijucas", filters: { garment: 178, state: "SC", city: "Tijucas", family: "ponto-de-origem" }, sort: "price-asc" });
    expect(collectionQueryString(parsed)).toBe("q=tijucas&peca=178&uf=SC&cidade=Tijucas&estilo=ponto-de-origem&ordem=price-asc");
    const bad = parseCollectionQuery(new URLSearchParams("peca=abc&uf=santa&cidade=%3Cb%3E&estilo=nope&ordem=random"));
    expect(bad).toEqual({ q: "", filters: { garment: undefined, state: undefined, city: undefined, family: undefined }, sort: "collection" });
    expect(isCollectionQueryActive(bad)).toBe(false);
    expect(isCollectionQueryActive({ q: "", filters: {}, sort: "price-asc" })).toBe(true);
    expect(isCollectionQueryActive({ q: "t", filters: {}, sort: "collection" })).toBe(false); // too short to search
  });

  test("given a whole query, when run, then the text search comes first, the filters next and the sort last, with facets over the searched cards", () => {
    const { items, facets } = runCollectionQuery(cards, { q: "tijucas", filters: { family: "ponto-de-origem" }, sort: "price-desc" });
    expect(items.map((c) => c.name)).toEqual(["Ponto de Origem"]);
    expect(facets.family.map((f) => [f.value, f.count])).toEqual([
      ["ponto-de-origem", 1],
      ["feito-em", 1],
    ]);
    expect(usefulFacets(facets)).toEqual(["family"]);
  });
});
