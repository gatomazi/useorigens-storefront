import "server-only";
import { purchaseUrl } from "./catalog/commerce";
import { getCatalog } from "./catalog/repository";
import { resolveCity, type ResolvedCity } from "./catalog/resolver";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import { dddProducts, pickDdd, type DddProduct } from "./editorial/ddd";
import { dizeresWithContext } from "./editorial/dizeres";
import { stateLineProduct } from "./editorial/state-lines";
import { FEATURED_LORE_CITIES, HERO_DDD, STATE_ORDER } from "./editorial/sul";
import { formatPrice } from "./format";
import { REGIONS, STATE_CAPITAL_SLUG, STATE_NAMES, type RegionSlug } from "./geo/regions";
import { cityBySlug, citiesOfRegion, areaGroupsOfState } from "./geo/cities";
import { SHOWCASE } from "./site";

export type DddCard = { code: string; regionName: string; uf: string; stateName: string; imageUrl: string; price: string | null; href: string | null };

export type StateCard = {
  uf: string;
  name: string;
  cityCount: number;
  /** IBGE intermediate regions as shortcuts, largest first (E3). */
  regions: { name: string; slug: string; count: number }[];
  /** The state's own clean line (Clean, Minimal, Escritas, Atlas), or null when the state has none (E1). */
  line: { label: string; name: string; imageUrl: string; price: string | null; href: string | null } | null;
};

export type LoreCityCard = {
  uf: string;
  slug: string;
  name: string;
  area: string;
  /** Each real expression/patron product of the city. The first one gives the card its image. */
  items: { text: string; imageUrl: string; href: string | null }[];
};

export type RegionHome = {
  cityCount: number;
  syncedAt: string | null;
  /** City used for the family showcase (real INK photos). */
  showcase: ResolvedCity | null;
  /** One real DDD product per state for the hero (empty entries are dropped, never invented). */
  heroDdd: DddCard[];
  ddd: CarouselItem[];
  fala: CarouselItem[];
  states: StateCard[];
  loreCities: LoreCityCard[];
  /** Crops for the campaign block. */
  campaignCrops: { imageUrl: string; family: string }[];
};

function toDddCard(d: DddProduct): DddCard {
  return {
    code: d.code,
    regionName: d.regionName,
    uf: d.uf,
    stateName: STATE_NAMES[d.uf],
    imageUrl: d.product.imageUrl,
    price: formatPrice(d.product.price),
    href: purchaseUrl(d.product),
  };
}

/** Round-robin by state so no single state (or "bah") dominates the row. */
function interleaveByState<T extends { uf: string }>(items: T[], order: readonly string[]): T[] {
  const buckets = order.map((uf) => items.filter((i) => i.uf === uf));
  const out: T[] = [];
  for (let i = 0; buckets.some((b) => i < b.length); i++) for (const b of buckets) if (i < b.length) out.push(b[i]);
  return out;
}

export function getRegionHome(region: RegionSlug): RegionHome {
  const catalog = getCatalog();
  const covered = catalog.coveredCityIds(region);
  const cities = citiesOfRegion(region);
  const merch = catalog.merch(region);
  const ufs = REGIONS[region].ufs;

  const [heroUf, heroSlug] = SHOWCASE[region].hero;
  const showcase = resolveCity(region, heroUf, heroSlug);

  const allDdd = dddProducts(merch);
  const heroDdd = pickDdd(allDdd, HERO_DDD).map(toDddCard);
  const ddd: CarouselItem[] = allDdd.flatMap((d) => {
    const href = purchaseUrl(d.product);
    return href
      ? [{ id: d.product.inkProductId, name: d.regionName, eyebrow: d.code, context: STATE_NAMES[d.uf], price: formatPrice(d.product.price), imageUrl: d.product.imageUrl, href }]
      : [];
  });

  // "Fala daqui": Dizeres with editorial context + the real local-voice products (state and city expressions).
  const lore = catalog.lore(region);
  type Fala = CarouselItem & { uf: string };
  const falaAll: Fala[] = [];
  for (const d of dizeresWithContext(merch)) {
    const href = purchaseUrl(d.product);
    if (href) falaAll.push({ id: d.product.inkProductId, uf: d.uf, name: d.text, context: d.context, price: formatPrice(d.product.price), imageUrl: d.product.imageUrl, href });
  }
  for (const s of lore.byState) {
    const href = purchaseUrl(s.product);
    if (href) falaAll.push({ id: s.product.inkProductId, uf: s.uf, name: s.text, context: STATE_NAMES[s.uf], price: formatPrice(s.product.price), imageUrl: s.product.imageUrl, href });
  }
  for (const [cityId, items] of lore.byCity) {
    for (const item of items) {
      if (item.kind !== "expressao") continue;
      const href = purchaseUrl(item.product);
      if (href) falaAll.push({ id: item.product.inkProductId, uf: item.city.uf, name: item.text, context: `${item.city.name} · ${item.city.uf}`, price: formatPrice(item.product.price), imageUrl: item.product.imageUrl, href });
    }
    void cityId;
  }
  const fala: CarouselItem[] = interleaveByState(falaAll, STATE_ORDER).slice(0, 12).map(({ uf: _uf, ...rest }) => (void _uf, rest));

  const states: StateCard[] = ufs
    .map((uf) => {
      const stateCities = cities.filter((c) => c.uf === uf && covered.has(c.id));
      const groups = areaGroupsOfState(uf, new Set(stateCities.map((c) => c.id)));
      const found = stateLineProduct(merch, uf);
      return {
        uf,
        name: STATE_NAMES[uf],
        cityCount: stateCities.length,
        // The capital's region first (IBGE fact), then the largest ones.
        regions: [...groups]
          .sort((a, b) => Number(b.cities.some((c) => c.slug === STATE_CAPITAL_SLUG[uf])) - Number(a.cities.some((c) => c.slug === STATE_CAPITAL_SLUG[uf])))
          .map((g) => ({ name: g.name, slug: g.slug, count: g.cities.length })),
        line: found
          ? { label: found.line, name: found.product.name.replace(/\s+/g, " ").trim(), imageUrl: found.product.imageUrl, price: formatPrice(found.product.price), href: purchaseUrl(found.product) }
          : null,
      };
    })
    .sort((a, b) => b.cityCount - a.cityCount);

  const loreCities: LoreCityCard[] = FEATURED_LORE_CITIES.flatMap(([uf, slug]) => {
    const city = cityBySlug(uf, slug);
    if (!city || !covered.has(city.id)) return [];
    const items = (lore.byCity.get(city.id) ?? []).filter((l) => l.kind === "expressao");
    if (items.length === 0) return [];
    return [{ uf, slug, name: city.name, area: city.area, items: items.map((l) => ({ text: l.text, imageUrl: l.product.imageUrl, href: purchaseUrl(l.product) })) }];
  });

  const campaignCrops = (showcase?.families ?? [])
    .filter((f) => f.family.id === "territorio" || f.family.id === "feito-em")
    .slice(0, 2)
    .map((f) => ({ imageUrl: f.primary.imageUrl, family: f.family.id }));

  return { cityCount: covered.size, syncedAt: catalog.syncedAt, showcase, heroDdd, ddd, fala, states, loreCities, campaignCrops };
}
