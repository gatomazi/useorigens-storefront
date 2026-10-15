import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { cityBySlug } from "@/lib/geo/cities";
import { localityBySlug } from "@/lib/geo/localities";

/**
 * The CMS side of the Federal District: the hero product search and the INK-collection sections used to hide every product of an
 * administrative region (it was "a locality, not a city") or label it "Brasília". The snapshot below is written in the OLD shape (an RA only
 * as `localityLabel`, bound to Brasília, no `localityId`), exactly like the real one, so the read-time upgrade is what these tests exercise.
 */
const NOW = "2026-09-28T00:00:00.000Z";
const brasilia = cityBySlug("DF", "brasilia")!;
const goiania = cityBySlug("GO", "goiania")!;
const binding = (id: string, cityId: string, family: string, extra: Record<string, unknown> = {}) => ({
  cityId, designFamily: family, designVariant: "base", commerceStoreKey: "use-centro", inkProductId: id, slug: `p-${id}`,
  storeProductUrl: `https://www.usecentro.com.br/usecentro/product/p-${id}`, imageUrl: `https://img.example/${id}.jpg`, price: 109.9, syncedAt: NOW, ...extra,
});
const inRa = (id: string, family: string, label: string) => binding(id, brasilia.id, family, { parentCityId: brasilia.id, localityLabel: label });
const BINDINGS = [
  binding("100", brasilia.id, "ponto-de-origem"), // Brasília itself
  inRa("200", "ponto-de-origem", "Taguatinga"),
  inRa("201", "coordenadas", "Taguatinga"),
  inRa("300", "feito-em", "Aguas Claras"),
  inRa("301", "ponto-de-origem", "Águas Claras"),
  inRa("400", "coordenadas", "Ceilândia"),
  inRa("500", "ponto-de-origem", "Vila Planalto"), // a DF title outside the official index: a place inside Brasília, not a card
  binding("600", goiania.id, "ponto-de-origem"),
];

let dir: string;
let collectionsFile: string;
let hero: typeof import("@/lib/hero-featured");
let source: typeof import("@/lib/catalog/collection-source");
let repo: typeof import("@/lib/catalog/repository");

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "uo-df-cms-"));
  const snapshot = { version: 1, stores: { "use-centro": { commerceStoreKey: "use-centro", syncedAt: NOW, productCount: BINDINGS.length, bindings: BINDINGS, merch: [], excluded: [] } } };
  await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(snapshot));
  collectionsFile = path.join(dir, "collections-snapshot.json");
  const collection = { id: 139672, name: "DF", slug: "df", position: 4, isAvailable: true, reportedProductCount: 546, matchedCount: 6, merchCount: 0, cityDesignCount: 6, memberIds: ["100", "200", "201", "300", "400", "500"] };
  await writeFile(collectionsFile, JSON.stringify({ version: 2, stores: { "use-centro": { commerceStoreKey: "use-centro", syncedAt: NOW, catalogSyncedAt: NOW, totalCount: 1, collections: [collection] } } }));
  vi.stubEnv("CATALOG_SNAPSHOT_DIR", dir);
  vi.resetModules();
  hero = await import("@/lib/hero-featured");
  source = await import("@/lib/catalog/collection-source");
  repo = await import("@/lib/catalog/repository");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

const ids = (query: string) => hero.searchFeaturedCandidates("centro-oeste", query).results.map((r) => r.productId).sort();

describe("CMS product search over the Federal District", () => {
  test("given 'Taguatinga', when searched, then its products are found, tagged as an administrative region, and link to the RA's own route", () => {
    const { results } = hero.searchFeaturedCandidates("centro-oeste", "taguatinga");
    expect(results.map((r) => r.productId).sort()).toEqual(["200", "201"]);
    expect(results[0]).toMatchObject({ cityName: "Taguatinga", uf: "DF", localityType: "administrative_region" });
    expect(results.map((r) => r.href).sort()).toEqual(["/centro-oeste/df/taguatinga/coordenadas", "/centro-oeste/df/taguatinga/ponto-de-origem"]);
  });

  test("given 'Águas Claras' with and without accents, when searched, then both spellings reach the same two products", () => {
    expect(ids("águas claras")).toEqual(["300", "301"]);
    expect(ids("aguas claras")).toEqual(["300", "301"]);
  });

  test("given 'Brasília', when searched, then Brasília's own product is found and no RA product leaks in", () => {
    expect(ids("brasília")).toEqual(["100"]);
    expect(ids("brasilia")).toEqual(["100"]);
    expect(hero.searchFeaturedCandidates("centro-oeste", "brasilia").results[0]).toMatchObject({ cityName: "Brasília", localityType: "municipality" });
  });

  test("given an RA and a style, when searched together, then only that RA's product of that style is found", () => {
    expect(ids("taguatinga coordenadas")).toEqual(["201"]);
  });

  test("given 'região administrativa', when searched, then only administrative-region products are found, none of Brasília or Goiânia", () => {
    const found = ids("regiao administrativa");
    expect(found).toEqual(["200", "201", "300", "301", "400"]);
  });

  test("given the state and the store's UF, when searched, then the RA products are reachable by 'df' too", () => {
    expect(ids("df")).toEqual(["100", "200", "201", "300", "301", "400"]);
  });

  test("given a place inside Brasília that is not an RA, when searched, then it is not a candidate (still 'localidade', never guessed into an RA)", () => {
    expect(ids("vila planalto")).toEqual([]);
    const [slot] = hero.resolveFeatured("centro-oeste", [{ store: "use-centro", productId: "500" }]);
    expect(slot).toMatchObject({ ok: false, card: null });
    expect(slot.reason).toContain("localidade");
  });

  test("given an RA product chosen for the hero, when resolved, then the card is the RA's (name, route) and is eligible", () => {
    const [slot] = hero.resolveFeatured("centro-oeste", [{ store: "use-centro", productId: "400" }]);
    expect(slot.ok).toBe(true);
    expect(slot.card).toMatchObject({ cityName: "Ceilândia", uf: "DF", href: "/centro-oeste/df/ceilandia/coordenadas" });
  });

  test("given the whole region, when eligible products are counted, then the RA products count (they were all hidden before)", () => {
    // Brasília's 100 + the five RA products (200, 201, 300, 301, 400) in the DF, plus Goiânia's 600; the outside place (500) is not eligible.
    expect(hero.eligibleFeaturedCount("centro-oeste")).toBe(7);
  });

  test("given a Goiás city, when searched, then it behaves exactly as before", () => {
    expect(ids("goiania")).toEqual(["600"]);
    expect(hero.searchFeaturedCandidates("centro-oeste", "goiania").results[0]).toMatchObject({ localityType: "municipality" });
  });
});

describe("INK-collection sections over the Federal District", () => {
  test("given the DF collection, when a section resolves it, then each RA product reads as its own RA ('Taguatinga · DF'), never Brasília", () => {
    const catalog = repo.getCatalog();
    const lookup = source.categoryLookup((store) => catalog.productsOfStore(store), () => new Set<number>(), collectionsFile);
    const result = lookup({ kind: "ink-category", store: "use-centro", collectionId: 139672, order: "category", limit: 24 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const context = Object.fromEntries(result.items.map((i) => [i.id, i.context]));
    expect(context).toEqual({ "100": "Brasília · DF", "200": "Taguatinga · DF", "201": "Taguatinga · DF", "300": "Águas Claras · DF", "400": "Ceilândia · DF", "500": "Brasília · DF" });
  });

  test("given a product of Brasília and one of an RA, when their localities are read, then they differ", () => {
    const products = repo.getCatalog().productsOfStore("use-centro").cityDesigns;
    expect(products.get("200")?.localityId).toBe(localityBySlug("df", "taguatinga")!.id);
    expect(products.get("100")?.localityId).toBeUndefined();
    expect(products.get("500")?.localityId).toBeUndefined();
  });
});
