// Shared fixture catalog for the production-mode verification scripts (verify-bootstrap, verify-prerender) —
// never real INK data. Built from the real Sul municipality ids already versioned in data/geo/municipios.json,
// enough of them to legitimately cross the 50% readiness bar (src/lib/catalog/readiness.ts): a 1-city fixture
// would correctly be rejected as "not ready" by that same guard.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const TIJUCAS_ID = "4218004"; // Tijucas, SC — a real municipality already in the build-time geo dataset

// Porto Alegre, RS — the first hero card of /sul (HERO_FAMILIES), so a fixture that covers it exercises the hero.
export const PORTO_ALEGRE_ID = "4314902";

const geoRows = JSON.parse(await readFile(path.join(process.cwd(), "data", "geo", "municipios.json"), "utf8")) as [number, string, string, string, string][];
const sulCityIds = geoRows.filter((r) => r[2] === "PR" || r[2] === "SC" || r[2] === "RS").map((r) => String(r[0]));

export const SUL_CITY_COUNT = sulCityIds.length;

/** The city ids a fixture covering `coverage` (0-1) of the Sul cities binds products to. */
export function fixtureCityIds(coverage = 0.6): string[] {
  return Array.from(new Set([TIJUCAS_ID, PORTO_ALEGRE_ID, ...sulCityIds])).slice(0, Math.ceil(sulCityIds.length * coverage));
}

export function fixtureSnapshot(priceForTijucas: number, coverage = 0.6) {
  const bindings = fixtureCityIds(coverage).map((cityId, i) => ({
    cityId,
    designFamily: "ponto-de-origem",
    designVariant: "base",
    isPrimary: true,
    priority: 0,
    commerceStoreKey: "use-sul",
    inkProductId: String(9_000_000_000 + i), // realistic (numeric, like real INK ids) — see ranking.ts compareIds
    slug: `fixture-${i}`,
    storeProductUrl: "https://www.usesul.com.br/usesul/product/fixture",
    imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/fixture.jpg",
    price: cityId === TIJUCAS_ID ? priceForTijucas : 109.9,
    syncedAt: new Date().toISOString(),
  }));
  return {
    version: 1,
    stores: {
      "use-sul": {
        commerceStoreKey: "use-sul",
        syncedAt: new Date().toISOString(),
        productCount: bindings.length,
        bindings,
        merch: [],
        excluded: [],
      },
    },
  };
}
