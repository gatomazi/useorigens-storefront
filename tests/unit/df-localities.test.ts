import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildStoreIndex } from "@/lib/catalog/indexer";
import { isSubLocality, localityOfBinding, withLocality } from "@/lib/catalog/locality-binding";
import { parseProductName, resolveCity } from "@/lib/catalog/parse";
import { rankBindings } from "@/lib/catalog/ranking";
import { getCatalog } from "@/lib/catalog/repository";
import { resolveCity as resolveLocalityPage, resolveCityProduct } from "@/lib/catalog/resolver";
import { buildSearchDocs } from "@/lib/catalog/search-docs";
import { resolveProductDisplay } from "@/lib/catalog/lookup";
import type { CatalogSnapshot, UnrankedBinding } from "@/lib/catalog/types";
import { administrativeRegionByLabel, allAdministrativeRegions, DF_MUNICIPALITY_ID } from "@/lib/geo/administrative-regions";
import { cityBySlug } from "@/lib/geo/cities";
import { localityBySlug, localityById, localitySubtitle, stateBrowseLabel, stateLocalityCounts, stateLocalityGroups, stateLocalityLabel } from "@/lib/geo/localities";
import { searchDocs } from "@/lib/search/catalog-search";
import { placeSearchCopy } from "@/lib/search/copy";
import { prepareCities, searchCities, type SearchCity } from "@/lib/search/rank";
import { cityDescription, cityIntro, stateDescription, stateIntro, stateTitle } from "@/lib/seo/copy";
import { product } from "./fixtures";

const NOW = "2026-09-28T00:00:00.000Z";
const centro = (name: string, id: string) => product(name, { id, storeKey: "use-centro", storeProductUrl: `https://www.usecentro.com.br/usecentro/product/${id}` });

// Real DF titles as INK writes them (with and without accents), plus Brasília and a Goiás city that shares no name with any RA.
const PRODUCTS = [
  centro("Brasília | Origem DF", "100"),
  centro("Taguatinga | Origem DF", "200"),
  centro("Taguatinga | Coordenadas DF", "201"),
  centro("Feito Em Aguas Claras - DF", "300"),
  centro("Águas Claras | Origem DF", "301"),
  centro("Ceilândia | Coordenadas DF", "400"),
  centro("Goiânia | Origem GO", "500"),
];

describe("administrative-region index", () => {
  test("given the official index, when listed, then it has the 35 RAs, each with a unique slug and a DF/centro-oeste locality of type administrative_region", () => {
    const regions = allAdministrativeRegions();
    expect(regions).toHaveLength(35);
    expect(new Set(regions.map((r) => r.slug)).size).toBe(35);
    for (const r of regions) {
      expect(r).toMatchObject({ uf: "DF", regionSlug: "centro-oeste", type: "administrative_region", parentLabel: "Distrito Federal", parentCityId: DF_MUNICIPALITY_ID });
    }
  });

  test("given an accented and an accent-free INK title of the same RA, when matched, then both resolve to the same region", () => {
    expect(administrativeRegionByLabel("Aguas Claras")?.name).toBe("Águas Claras");
    expect(administrativeRegionByLabel("ÁGUAS CLARAS")?.id).toBe(administrativeRegionByLabel("aguas claras")?.id);
    expect(administrativeRegionByLabel("Sudoeste Octogonal")?.name).toBe("Sudoeste/Octogonal");
  });

  test("given the two INK spellings of RA XXV, when matched, then SCIA and Estrutural are the same region", () => {
    expect(administrativeRegionByLabel("SCIA")?.id).toBe(administrativeRegionByLabel("Estrutural")?.id);
  });

  test("given Brasília or a name that is not an RA, when matched, then there is no region (never guessed)", () => {
    expect(administrativeRegionByLabel("Brasília")).toBeUndefined();
    expect(administrativeRegionByLabel("Goiânia")).toBeUndefined();
    expect(administrativeRegionByLabel("Taguatinga do Norte")).toBeUndefined();
  });
});

describe("locality routes", () => {
  test("given a DF administrative region slug, when looked up, then it is a Locality of type administrative_region", () => {
    expect(localityBySlug("df", "aguas-claras")).toMatchObject({ name: "Águas Claras", type: "administrative_region", uf: "DF", parentLabel: "Distrito Federal" });
    expect(localityBySlug("DF", "taguatinga")?.type).toBe("administrative_region");
  });

  test("given Brasília and other states' municipalities, when looked up, then they stay municipalities, unchanged", () => {
    expect(localityBySlug("df", "brasilia")).toMatchObject({ type: "municipality", id: DF_MUNICIPALITY_ID });
    expect(localityBySlug("sc", "florianopolis")).toBe(cityBySlug("SC", "florianopolis"));
    expect(localityBySlug("go", "goiania")?.type).toBe("municipality");
  });

  test("given an RA slug under another state, or an unknown slug, when looked up, then it is unknown (404)", () => {
    expect(localityBySlug("go", "aguas-claras")).toBeUndefined();
    expect(localityBySlug("df", "atlantida")).toBeUndefined();
  });

  test("given an RA, when its subtitle is built, then it says Região Administrativa; a municipality keeps state · mesoregion", () => {
    expect(localitySubtitle(localityBySlug("df", "aguas-claras")!)).toBe("Distrito Federal · Região Administrativa");
    expect(localitySubtitle(localityBySlug("sc", "florianopolis")!)).toBe("Santa Catarina · Grande Florianópolis");
  });

  test("given an RA id, when resolved by id, then the locality comes back", () => {
    const ra = localityBySlug("df", "ceilandia")!;
    expect(localityById(ra.id)).toBe(ra);
  });
});

describe("indexing DF products", () => {
  const parsed = (name: string) => {
    const p = parseProductName(name);
    if (p.kind !== "city-design") throw new Error(`not a city design: ${name}`);
    return p;
  };

  test("given a title in the RA index, when resolved, then it binds to the RA and keeps Brasília as the containing municipality", () => {
    const result = resolveCity(parsed("Taguatinga | Origem DF"), centro("Taguatinga | Origem DF", "1"));
    expect(result).toMatchObject({ ok: true, city: { name: "Brasília" }, localityLabel: "Taguatinga", localityId: localityBySlug("df", "taguatinga")!.id });
  });

  test("given a DF title that is NOT in the index, when resolved, then it is a place inside Brasília with no RA (never guessed into one)", () => {
    const result = resolveCity(parsed("Vila Planalto | Origem DF"), centro("Vila Planalto | Origem DF", "2"));
    expect(result).toMatchObject({ ok: true, city: { name: "Brasília" }, localityLabel: "Vila Planalto" });
    expect(result).not.toHaveProperty("localityId");
  });

  test("given Brasília itself, when resolved, then it is the municipality with no locality", () => {
    const result = resolveCity(parsed("Brasília | Origem DF"), centro("Brasília | Origem DF", "3"));
    expect(result).toMatchObject({ ok: true, city: { name: "Brasília" } });
    expect(result).not.toHaveProperty("localityId");
    expect(result).not.toHaveProperty("localityLabel");
  });

  test("given a Goiás title, when resolved, then the DF branch never touches it", () => {
    const result = resolveCity(parsed("Goiânia | Origem GO"), centro("Goiânia | Origem GO", "4"));
    expect(result).toMatchObject({ ok: true, city: { name: "Goiânia", uf: "GO" } });
    expect(result).not.toHaveProperty("localityId");
  });

  test("given a snapshot written before RAs existed, when a binding is upgraded, then localityId is derived only for DF titles in the index", () => {
    const legacy = buildStoreIndex("use-centro", [centro("Taguatinga | Origem DF", "1")], NOW).bindings[0];
    const old: UnrankedBinding = { ...legacy };
    delete old.localityId;
    expect(withLocality(old).localityId).toBe(localityBySlug("df", "taguatinga")!.id);
    const torres = cityBySlug("RS", "torres")!;
    const inside: UnrankedBinding = { ...legacy, cityId: torres.id, localityLabel: "Taguatinga", localityId: undefined };
    expect(withLocality(inside).localityId).toBeUndefined();
  });

  test("given an RA binding and a Brasília one, when the place is asked, then each is its own locality and only inner places are sub-localities", () => {
    const { bindings } = buildStoreIndex("use-centro", PRODUCTS, NOW);
    const taguatinga = bindings.find((b) => b.inkProductId === "200")!;
    const brasilia = bindings.find((b) => b.inkProductId === "100")!;
    expect(localityOfBinding(taguatinga)?.name).toBe("Taguatinga");
    expect(localityOfBinding(brasilia)?.name).toBe("Brasília");
    expect(isSubLocality(taguatinga)).toBe(false);
    expect(isSubLocality({ cityId: DF_MUNICIPALITY_ID, localityLabel: "Vila Planalto" })).toBe(true);
  });
});

describe("ranking keeps localities apart", () => {
  const order = ["use-centro", "use-sul", "use-norte"] as const;

  test("given Brasília and two RAs with the same family, when ranked, then each is the primary of its own locality", () => {
    const { bindings } = buildStoreIndex("use-centro", PRODUCTS, NOW);
    const ranked = rankBindings(bindings, order);
    const primaries = ranked.filter((b) => b.isPrimary && b.designFamily === "ponto-de-origem").map((b) => localityOfBinding(b)?.name).sort();
    expect(primaries).toEqual(["Brasília", "Goiânia", "Taguatinga", "Águas Claras"].sort());
  });

  test("given two products of the same RA and family, when ranked, then the lowest id is primary and the other is a variant, both kept", () => {
    const { bindings } = buildStoreIndex("use-centro", [centro("Águas Claras | Origem DF", "9"), centro("Águas Claras | Origem DF", "7")], NOW);
    const ranked = rankBindings(bindings, order);
    expect(ranked).toHaveLength(2);
    expect(ranked.find((b) => b.isPrimary)?.inkProductId).toBe("7");
  });

  test("given a place inside a municipality, when ranked, then it is still never primary (unchanged rule)", () => {
    const { bindings } = buildStoreIndex("use-centro", [centro("Vila Planalto | Origem DF", "5")], NOW);
    expect(rankBindings(bindings, order).some((b) => b.isPrimary)).toBe(false);
  });
});

describe("catalog over a DF snapshot", () => {
  let dir: string;
  const previous = process.env.CATALOG_SNAPSHOT_DIR;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "df-localities-"));
    const snapshot: CatalogSnapshot = { version: 1, stores: { "use-centro": buildStoreIndex("use-centro", PRODUCTS, NOW) } };
    // An older snapshot would not carry localityId: strip it so the read-time upgrade is what the catalog exercises.
    for (const b of snapshot.stores["use-centro"]!.bindings) delete b.localityId;
    writeFileSync(path.join(dir, "catalog-snapshot.json"), JSON.stringify(snapshot));
    process.env.CATALOG_SNAPSHOT_DIR = dir;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.CATALOG_SNAPSHOT_DIR;
    else process.env.CATALOG_SNAPSHOT_DIR = previous;
  });

  const id = (uf: string, slug: string) => localityBySlug(uf, slug)!.id;

  test("given RA products, when the catalog is built, then RAs are covered localities but never covered cities", () => {
    const catalog = getCatalog();
    const localities = catalog.coveredLocalityIds("centro-oeste");
    expect(localities).toContain(id("df", "taguatinga"));
    expect(localities).toContain(id("df", "aguas-claras"));
    expect(localities).toContain(id("df", "ceilandia"));
    expect(localities).toContain(DF_MUNICIPALITY_ID);
    const cities = catalog.coveredCityIds("centro-oeste");
    expect(cities).toContain(DF_MUNICIPALITY_ID);
    expect(cities).not.toContain(id("df", "taguatinga"));
    expect(cities.size).toBe(2); // Brasília and Goiânia
  });

  test("given an RA, when its families are read, then only its own products come back (none of Brasília's, none of another RA's)", () => {
    const catalog = getCatalog();
    const ids = (localityId: string) => catalog.cityFamilies(localityId).flatMap((e) => [e.primary, ...e.variants]).map((b) => b.inkProductId).sort();
    expect(ids(id("df", "taguatinga"))).toEqual(["200", "201"]);
    expect(ids(id("df", "aguas-claras"))).toEqual(["300", "301"]);
    expect(ids(id("df", "ceilandia"))).toEqual(["400"]);
    expect(ids(DF_MUNICIPALITY_ID)).toEqual(["100"]);
  });

  test("given RA products, when Brasília's places-inside list is read, then no RA is in it", () => {
    expect(getCatalog().cityLocalities(DF_MUNICIPALITY_ID)).toEqual([]);
  });

  test("given the accent-free and accented Águas Claras titles, when read, then they are one region with both products (Feito em + Origem)", () => {
    const families = getCatalog().cityFamilies(id("df", "aguas-claras")).map((e) => e.family.id).sort();
    expect(families).toEqual(["feito-em", "ponto-de-origem"]);
  });

  test("given the catalog, when product counts are read, then an RA reports its real products and an RA without any reports zero", () => {
    const catalog = getCatalog();
    expect(catalog.localityProductCount(id("df", "taguatinga"))).toBe(2);
    expect(catalog.localityProductCount(id("df", "gama"))).toBe(0);
  });

  test("given a route for an RA with products, when resolved, then it renders the same resolver as a city; one without products is unknown (404)", () => {
    expect(resolveLocalityPage("centro-oeste", "df", "taguatinga")).toMatchObject({ city: { name: "Taguatinga", type: "administrative_region" }, stateName: "Distrito Federal" });
    expect(resolveLocalityPage("centro-oeste", "df", "gama")).toBeNull();
    expect(resolveLocalityPage("sul", "df", "taguatinga")).toBeNull();
    expect(resolveCityProduct("centro-oeste", "df", "taguatinga", "coordenadas")?.primary.inkProductId).toBe("201");
  });

  test("given an RA product, when its display is built (favorites, buy session), then it names the RA, never Brasília", () => {
    expect(resolveProductDisplay("use-centro", "200")).toMatchObject({ title: "Ponto de Origem", context: "Taguatinga · DF" });
    expect(resolveProductDisplay("use-centro", "100")).toMatchObject({ context: "Brasília · DF" });
  });

  test("given the public product search, when an RA is searched, then only that RA's products are found, and a Brasília search does not list RA products", () => {
    const docs = buildSearchDocs(getCatalog(), "centro-oeste", []);
    const found = (q: string) => searchDocs(docs, q).items.map((d) => d.id).sort();
    expect(found("taguatinga")).toEqual(["200", "201"]);
    expect(found("aguas claras")).toEqual(["300", "301"]);
    expect(found("águas claras")).toEqual(["300", "301"]);
    expect(found("brasilia")).toContain("100");
    expect(found("brasilia")).not.toContain("200");
    expect(found("brasilia")).not.toContain("300");
    const context = searchDocs(docs, "ceilandia").items[0]?.context;
    expect(context).toBe("Ceilândia · DF");
  });
});

describe("place search index", () => {
  const index: SearchCity[] = [
    { n: "Brasília", u: "DF", s: "brasilia", m: "Distrito Federal" },
    { n: "Águas Claras", u: "DF", s: "aguas-claras", t: "ra" },
    { n: "Taguatinga", u: "DF", s: "taguatinga", t: "ra" },
    { n: "Sol Nascente/Pôr do Sol", u: "DF", s: "sol-nascente-por-do-sol", t: "ra" },
    { n: "Goiânia", u: "GO", s: "goiania", m: "Centro Goiano" },
  ];
  const prepared = prepareCities(index);
  const top = (q: string) => searchCities(prepared, q, { ufs: ["DF", "GO"], limit: 3 }).find((r) => r.type === "city");

  test("given an accent-free query, when searching, then the RA is found and still flagged as an RA", () => {
    expect(top("aguas claras")).toMatchObject({ type: "city", city: { s: "aguas-claras", t: "ra" } });
    expect(top("taguatinga")).toMatchObject({ city: { s: "taguatinga", t: "ra" } });
  });

  test("given a partial multi-word query, when searching, then the RA is found by its first words", () => {
    expect(top("sol nascente")).toMatchObject({ city: { s: "sol-nascente-por-do-sol" } });
  });

  test("given Brasília, when searching, then it is still found and is not an RA", () => {
    const hit = top("brasilia");
    expect(hit).toMatchObject({ city: { s: "brasilia" } });
    expect(hit?.type === "city" && hit.city.t).toBeFalsy();
  });

  test("given the copy of a region with administrative regions, then it says 'cidade ou região'; the other regions keep 'cidade' verbatim", () => {
    expect(placeSearchCopy("centro-oeste").placeholder).toBe("Busque sua cidade ou região…");
    expect(placeSearchCopy("sul").placeholder).toBe("Busque sua cidade…");
    expect(placeSearchCopy("sul").trigger).toBe("Buscar cidade");
    expect(placeSearchCopy("norte").hero).toBe("Busque sua cidade…");
  });
});

describe("state-level counts and copy", () => {
  const ra = { type: "administrative_region" as const };
  const city = { type: "municipality" as const };

  test("given Brasília and 33 RAs, when the state is labelled, then it counts 'localidades', never 'cidades'", () => {
    const counts = stateLocalityCounts([city, ...Array.from({ length: 33 }, () => ra)]);
    expect(counts).toEqual({ cities: 1, administrativeRegions: 33 });
    expect(stateLocalityLabel(counts)).toBe("34 localidades");
    expect(stateLocalityLabel(counts)).not.toMatch(/cidade/i);
    expect(stateBrowseLabel(counts, "Distrito Federal")).toBe("Ver as localidades de Distrito Federal");
  });

  test("given a state of municipalities only, when labelled, then it keeps 'N cidades' and the original link", () => {
    const counts = stateLocalityCounts([city, city, city]);
    expect(stateLocalityLabel(counts)).toBe("3 cidades");
    expect(stateBrowseLabel(counts, "Goiás")).toBe("Ver todas as cidades de Goiás");
  });

  test("given one RA, when labelled, then the singular is right", () => {
    expect(stateLocalityLabel({ cities: 1, administrativeRegions: 1 })).toBe("2 localidades");
  });

  test("given the DF's places, when grouped, then there is no grouping (the RAs are the places, like a state's cities); Goiás keeps its mesoregions", () => {
    const places = [localityBySlug("df", "brasilia")!, localityBySlug("df", "taguatinga")!, localityBySlug("df", "aguas-claras")!];
    expect(stateLocalityGroups("DF", places)).toEqual([]);
    const goias = stateLocalityGroups("GO", [localityBySlug("go", "goiania")!]);
    expect(goias.map((g) => g.name)).toEqual([localityBySlug("go", "goiania")!.meso]);
  });

  test("given the DF page copy, when built, then no sentence calls an RA a city or municipality", () => {
    const texts = [stateTitle("DF", 33), stateDescription("DF", 1, 33), stateIntro("DF", 1, 33)];
    for (const text of texts) expect(text).not.toMatch(/munic[ií]pio|cidades/i);
    expect(stateTitle("DF", 33)).toBe("Camisetas de Brasília e Regiões Administrativas do DF");
    expect(stateIntro("DF", 1, 33)).toContain("34 localidades");
  });

  test("given a state without administrative regions, when its copy is built, then it is exactly the original wording", () => {
    expect(stateTitle("GO")).toBe("Camisetas de Cidades de Goiás");
    expect(stateIntro("GO", 12)).toContain("12 cidades com estampas");
  });

  test("given an RA, when its description is built, then it says Região Administrativa and the title stays 'Camisetas de X, DF'", () => {
    const ra = localityBySlug("df", "aguas-claras")!;
    expect(cityDescription(ra, ["Coordenadas"])).toContain("Região Administrativa do Distrito Federal");
    expect(cityIntro(ra, "centro-oeste", ["Coordenadas"])).toContain("Região Administrativa do Distrito Federal");
    expect(cityDescription({ name: "Goiânia", uf: "GO" }, ["Coordenadas"])).toContain("em Goiás");
  });
});
