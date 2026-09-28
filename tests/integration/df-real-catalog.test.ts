import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DESIGN_FAMILIES } from "@/lib/catalog/families";
import { getCatalog } from "@/lib/catalog/repository";
import { resolveCity } from "@/lib/catalog/resolver";
import { buildSearchDocs } from "@/lib/catalog/search-docs";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { allAdministrativeRegions, DF_MUNICIPALITY_ID } from "@/lib/geo/administrative-regions";
import { cityById } from "@/lib/geo/cities";
import { localitiesOfRegion, localityBySlug } from "@/lib/geo/localities";
import { REGION_SLUGS } from "@/lib/geo/regions";
import { searchDocs } from "@/lib/search/catalog-search";

/**
 * The FEDERAL DISTRICT against the REAL locally synced snapshot (data/generated/catalog-snapshot.json is git-ignored, so this is skipped when a
 * checkout has none). It pins what the audit found (docs/storefront/df-administrative-regions-round.md) and, above all, that adding the
 * administrative regions moved nothing else: same municipalities covered, no product lost, duplicated or re-homed.
 */
const file = path.join(process.cwd(), "data", "generated", "catalog-snapshot.json");
const present = existsSync(file);

describe.skipIf(!present)("real catalog", () => {
  const snapshot = (present ? JSON.parse(readFileSync(file, "utf8")) : { version: 1, stores: {} }) as CatalogSnapshot;
  const raw = Object.values(snapshot.stores).flatMap((s) => s?.bindings ?? []);
  const catalog = getCatalog();

  test("given the snapshot, when the DF is audited, then all 102 RA products sit in 35 regions and only 2 products are Brasília's own", () => {
    const inDf = raw.filter((b) => b.cityId === DF_MUNICIPALITY_ID);
    expect(inDf).toHaveLength(104);
    const own = inDf.filter((b) => !b.localityLabel);
    expect(own).toHaveLength(2);
    const regions = allAdministrativeRegions();
    const counts = regions.map((r) => catalog.localityProductCount(r.id));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(102);
    expect(counts.every((n) => n >= 1)).toBe(true);
    expect(catalog.localityProductCount(DF_MUNICIPALITY_ID)).toBe(2);
    expect(catalog.cityLocalities(DF_MUNICIPALITY_ID)).toEqual([]); // nothing left as an unmapped "place inside Brasília"
  });

  test("given three real RAs, when their families are read, then each holds exactly its own products", () => {
    const byRa = (slug: string) => catalog.cityFamilies(localityBySlug("df", slug)!.id);
    const productsOf = (slug: string) => byRa(slug).flatMap((e) => [e.primary, ...e.variants]);
    expect(byRa("aguas-claras").map((e) => e.family.id).sort()).toEqual(["coordenadas", "feito-em", "ponto-de-origem"]);
    expect(productsOf("aguas-claras")).toHaveLength(3);
    expect(productsOf("taguatinga")).toHaveLength(4); // two Ponto de Origem: one primary, one variant, both kept
    expect(byRa("taguatinga").find((e) => e.family.id === "ponto-de-origem")?.variants).toHaveLength(1);
    expect(productsOf("ceilandia")).toHaveLength(3);
    const ids = new Set(["aguas-claras", "taguatinga", "ceilandia"].flatMap((s) => productsOf(s).map((b) => b.inkProductId)));
    expect(ids.size).toBe(10); // no product is in two regions
    // Each product's own INK slug names its region (the structured slug agrees with the title the binding was made from).
    for (const slug of ["aguas-claras", "taguatinga", "ceilandia"]) {
      for (const b of productsOf(slug)) expect(b.slug).toContain(slug);
    }
  });

  test("given the whole Centro-Oeste, when localities are summed, then every product is in exactly one locality (nothing lost, nothing duplicated)", () => {
    const total = raw.filter((b) => cityById(b.cityId)?.regionSlug === "centro-oeste").length;
    const summed = localitiesOfRegion("centro-oeste").reduce((n, l) => n + catalog.localityProductCount(l.id), 0);
    expect(summed).toBe(total);
  });

  test("given every region, when the covered CITIES are counted, then they are exactly the municipalities the old rule covered (RAs never counted as cities)", () => {
    for (const region of REGION_SLUGS) {
      const before = new Set(raw.filter((b) => !b.localityLabel && cityById(b.cityId)?.regionSlug === region).map((b) => b.cityId));
      // "Old rule": a municipality is covered when it has a non-locality product; an RA-only municipality would not be. Brasília has two of its own.
      const now = catalog.coveredCityIds(region);
      expect([...now].sort()).toEqual([...before].sort());
    }
  });

  test("given every covered locality, when its route is resolved, then it renders; an RA is a page only because it has products", () => {
    for (const id of catalog.coveredLocalityIds("centro-oeste")) {
      const place = allAdministrativeRegions().find((r) => r.id === id) ?? cityById(id)!;
      expect(resolveCity("centro-oeste", place.uf.toLowerCase(), place.slug), place.name).not.toBeNull();
    }
    expect(catalog.coveredLocalityIds("centro-oeste").size - catalog.coveredCityIds("centro-oeste").size).toBe(35);
  });

  test("given the public search, when RAs are searched, then each one returns only its own products and Brasília returns none of theirs", () => {
    const docs = buildSearchDocs(catalog, "centro-oeste", []);
    const ctx = (q: string) => searchDocs(docs, q).items.map((d) => d.context);
    expect(ctx("taguatinga").every((c) => c === "Taguatinga · DF")).toBe(true);
    expect(ctx("taguatinga")).toHaveLength(4);
    expect(ctx("aguas claras")).toHaveLength(3);
    expect(ctx("gama").filter((c) => c === "Gama · DF")).toHaveLength(3);
    expect(ctx("brasilia").every((c) => c === null || !/Taguatinga|Águas Claras|Gama|Ceilândia/.test(c))).toBe(true);
  });

  test("given the DF, when every family of every RA is counted, then no family is empty and the family order is the storefront's", () => {
    const order = DESIGN_FAMILIES.map((f) => f.id);
    for (const region of allAdministrativeRegions()) {
      const families = catalog.cityFamilies(region.id).map((e) => e.family.id);
      expect(families.length, region.name).toBeGreaterThan(0);
      expect(families).toEqual([...families].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    }
  });
});
