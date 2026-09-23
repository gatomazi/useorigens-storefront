import "server-only";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import { purchaseUrl } from "../catalog/commerce";
import { DESIGN_FAMILIES } from "../catalog/families";
import type { Catalog } from "../catalog/repository";
import type { MerchProduct } from "../catalog/types";
import { formatPrice } from "../format";
import type { City } from "../geo/cities";
import { terraProducts } from "./terra";

/**
 * "Destaques de {estado}" (CLAUDE_USE_ORIGENS_META_PIXEL_INK_ESTADOS.md §4): a short, honest showcase for a
 * state page. Never claims "Mais vendidas" — INK's `totalSalesCount` has no known period or "as of" date
 * (see the field's own doc comment in catalog/types.ts), so a public best-seller claim can't be substantiated;
 * it is only used here internally, to prefer a real, popular product when there is a choice, never surfaced
 * as a ranking. Mixes real city-style products from several *different* cities of this state with the state's
 * own "Da Nossa Terra" line, when both exist — never a product from another state. Deterministic: the same
 * catalog always produces the same picks, nothing random.
 */
export function stateShowcase(params: {
  uf: string;
  /** Covered cities of this UF only — already filtered by the caller. */
  cities: readonly City[];
  /** Only `cityFamilies` is used — narrowed on purpose so a test can pass a minimal stub instead of a full Catalog. */
  catalog: Pick<Catalog, "cityFamilies">;
  merch: readonly MerchProduct[];
  /** City slug of the state capital, if known — shown first when it has a real product, for recognizability. */
  capitalSlug?: string;
  limit?: number;
}): CarouselItem[] {
  const { uf, cities, catalog, merch, capitalSlug, limit = 6 } = params;

  // One product per city: the first family that exists for it, in the site's own commercial priority order
  // (families.ts) — never a "featured"/bigger pick, just the first real one.
  type CityPick = { city: City; item: CarouselItem; salesCount: number };
  const cityPicks: CityPick[] = [];
  for (const city of cities) {
    const families = catalog.cityFamilies(city.id);
    if (families.length === 0) continue;
    const byPriority = [...families].sort((a, b) => DESIGN_FAMILIES.findIndex((f) => f.id === a.family.id) - DESIGN_FAMILIES.findIndex((f) => f.id === b.family.id));
    const entry = byPriority[0];
    const href = purchaseUrl(entry.primary);
    if (!href) continue;
    cityPicks.push({
      city,
      salesCount: entry.primary.totalSalesCount ?? 0,
      item: {
        id: entry.primary.inkProductId,
        name: entry.family.name,
        context: city.name,
        price: formatPrice(entry.primary.price),
        rawPrice: entry.primary.price,
        state: uf,
        imageUrl: entry.primary.imageUrl,
        href,
      },
    });
  }

  // Capital first (recognizable), then by real sales signal (never disclosed as such — see doc comment
  // above), then alphabetically for a stable, deterministic order among ties.
  cityPicks.sort((a, b) => {
    const aCapital = a.city.slug === capitalSlug ? 1 : 0;
    const bCapital = b.city.slug === capitalSlug ? 1 : 0;
    return bCapital - aCapital || b.salesCount - a.salesCount || a.city.name.localeCompare(b.city.name, "pt-BR");
  });

  const terra = terraProducts(merch, [uf])
    .filter((t) => t.uf === uf)
    .flatMap((t): CarouselItem[] => {
      const href = purchaseUrl(t.product);
      return href ? [{ id: t.product.inkProductId, name: t.label, price: formatPrice(t.product.price), rawPrice: t.product.price, state: uf, imageUrl: t.product.imageUrl, href }] : [];
    });

  // Interleave so the row reads as "this state", not "one city's products with a state item tacked on": the
  // capital's product anchors the row, then the real state-wide items, then more cities for variety.
  const [anchor, ...otherCities] = cityPicks;
  const mixed: CarouselItem[] = [...(anchor ? [anchor.item] : []), ...terra, ...otherCities.map((c) => c.item)];

  // Never the same product twice (a city and terra could in principle share an id if the catalog ever
  // duplicated one) and never past the limit.
  const seen = new Set<string>();
  const result: CarouselItem[] = [];
  for (const item of mixed) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}
