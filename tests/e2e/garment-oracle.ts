import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DESIGN_FAMILIES, type DesignFamilyId } from "../../src/lib/catalog/families";
import { GARMENT_TYPES } from "../../src/lib/catalog/garments";
import { formatPrice } from "../../src/lib/format";
import { allCities, type City } from "../../src/lib/geo/cities";
import type { RegionSlug } from "../../src/lib/geo/regions";

/**
 * Expected values for the e2e, derived straight from the local data files (catalog snapshot + compact
 * garment index) with an independent, minimal implementation — never through the app's own resolver, so a
 * bug there cannot make a test pass by agreeing with itself. Ties are broken the same documented way the app
 * documents them (lowest numeric INK id).
 */
type Binding = { cityId: string; designFamily: string; designVariant: string; localityLabel?: string; inkProductId: string; commerceStoreKey: string; productClusterId?: string };
type Snapshot = { stores: Record<string, { bindings: Binding[] }> };
type Index = { stores: Record<string, { clusters: Record<string, [number, string, string, string, number][]> }> };

const STORE_BASE: Record<string, string> = {
  "use-sul": "https://www.usesul.com.br/usesul/product",
  "use-norte": "https://www.usenorte.com.br/usenorte/product",
  "use-centro": "https://www.usecentro.com.br/usecentro/product",
};

export type ExpectedPiece = { typeId: number; typeSlug: string; typeLabel: string; familyId: DesignFamilyId; familyName: string; href: string; priceText: string };

const dir = process.env.CATALOG_SNAPSHOT_DIR ?? path.join(process.cwd(), "data", "generated");
const snapshotFile = path.join(dir, "catalog-snapshot.json");
const indexFile = path.join(dir, "garment-index.json");

export const oracleAvailable = existsSync(snapshotFile) && existsSync(indexFile);

const cmpId = (a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

let cache: { byCity: Map<string, Binding[]>; index: Index } | null = null;
function load() {
  if (cache) return cache;
  const snapshot = JSON.parse(readFileSync(snapshotFile, "utf8")) as Snapshot;
  const index = JSON.parse(readFileSync(indexFile, "utf8")) as Index;
  const byCity = new Map<string, Binding[]>();
  for (const store of Object.values(snapshot.stores)) for (const b of store.bindings) byCity.set(b.cityId, [...(byCity.get(b.cityId) ?? []), b]);
  cache = { byCity, index };
  return cache;
}

/** The family's primary product: `base` variant, not a locality product, lowest INK id (the app's documented ranking). */
function primaryOf(cityId: string, familyId: string): Binding | undefined {
  return (load().byCity.get(cityId) ?? [])
    .filter((b) => b.designFamily === familyId && b.designVariant === "base" && !b.localityLabel)
    .sort((a, b) => cmpId(a.inkProductId, b.inkProductId))[0];
}

export function piecesOfCity(cityId: string): ExpectedPiece[] {
  const { index } = load();
  const out: ExpectedPiece[] = [];
  for (const family of DESIGN_FAMILIES) {
    const primary = primaryOf(cityId, family.id);
    if (!primary?.productClusterId) continue;
    const tuples = index.stores[primary.commerceStoreKey]?.clusters[primary.productClusterId] ?? [];
    for (const type of GARMENT_TYPES.filter((t) => t.id !== 1)) {
      const best = tuples.filter((t) => t[0] === type.id).sort((a, b) => cmpId(a[1], b[1]))[0];
      if (!best) continue;
      out.push({
        typeId: type.id,
        typeSlug: type.slug,
        typeLabel: type.label,
        familyId: family.id,
        familyName: family.name,
        href: `${STORE_BASE[primary.commerceStoreKey]}/${best[2]}`,
        priceText: formatPrice(best[4]) ?? "",
      });
    }
  }
  return out;
}

/** Real cities of a region, in a stable order, that have at least `minFamilies` families with a Peruano piece. */
export function citiesWithPeruano(region: RegionSlug, minFamilies: number, exclude: string[] = []): { city: City; pieces: ExpectedPiece[] }[] {
  return allCities()
    .filter((c) => c.regionSlug === region && !exclude.includes(c.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id))
    .map((city) => ({ city, pieces: piecesOfCity(city.id) }))
    .filter(({ pieces }) => pieces.filter((p) => p.typeSlug === "peruano").length >= minFamilies);
}

/** A real city of the region whose families have canonical products but no garment piece at all. */
export function cityWithoutPieces(region: RegionSlug): City | undefined {
  return allCities()
    .filter((c) => c.regionSlug === region && (load().byCity.get(c.id)?.length ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id))
    .find((c) => piecesOfCity(c.id).length === 0);
}
