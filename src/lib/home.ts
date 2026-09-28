import "server-only";
import { purchaseUrl } from "./catalog/commerce";
import { getCatalog } from "./catalog/repository";
import { resolveCity, resolveCityProduct, type ResolvedCity } from "./catalog/resolver";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import { dddProducts } from "./editorial/ddd";
import { dizeresWithContext } from "./editorial/dizeres";
import { lendaProducts } from "./editorial/lenda";
import { recreationProducts } from "./editorial/recreations";
import { stateLineProduct } from "./editorial/state-lines";
import { terraProducts } from "./editorial/terra";
import { HERO_FAMILIES, STATE_ORDER } from "./editorial/sul";
import { formatPrice } from "./format";
import { REGIONS, STATE_CAPITAL_SLUG, STATE_NAMES, type RegionSlug } from "./geo/regions";
import { localitiesOfRegion, stateBrowseLabel, stateLocalityCounts, stateLocalityGroups, stateLocalityLabel, stateLocalityShortcuts } from "./geo/localities";
import { SHOWCASE } from "./site";

/** One hero shirt: a real product of a commercial family, linking to its storefront page. */
export type HeroFamilyCard = { familyId: string; familyName: string; cityName: string; uf: string; imageUrl: string; price: string | null; href: string };

export type StateCard = {
  uf: string;
  name: string;
  /** Municipalities with products. Administrative regions (Federal District) are NOT cities and are counted apart. */
  cityCount: number;
  administrativeRegionCount: number;
  /** How the state counts its places: "12 cidades", or "36 localidades" where some places are administrative regions, not cities. */
  localityLabel: string;
  /** The link that opens the state's places ("Ver todas as cidades de X" / "Ver as localidades de X"). */
  browseLabel: string;
  /**
   * Editorial mesoregions as shortcuts, largest first (E3) — navigation grouping, not the current IBGE division (ADR 0004). In a state whose
   * places are administrative regions (Federal District) the shortcuts are those places themselves (`href` = their own page), like a
   * state's cities, and there is no count.
   */
  regions: { name: string; slug: string; count?: number; href?: string }[];
  /** The state's own clean line (Clean, Minimal, Escritas, Atlas), or null when the state has none (E1). */
  line: { label: string; name: string; imageUrl: string; price: string | null; href: string | null } | null;
};

export type RegionHome = {
  cityCount: number;
  syncedAt: string | null;
  /** City used for the family showcase (real INK photos). */
  showcase: ResolvedCity | null;
  /** The three protagonist shirts of the hero (empty entries are dropped, never invented). */
  heroFamilies: HeroFamilyCard[];
  ddd: CarouselItem[];
  fala: CarouselItem[];
  states: StateCard[];
  /** "Da Nossa Terra": real regional-identity products, balanced across the three states. */
  terra: CarouselItem[];
  /** Redesigns/recreations: an editorial trail parallel to the eight city families, never mixed with them. */
  recreations: CarouselItem[];
  /** "Feito Para Você": the real "Lenda" line — who wears it, never a city/map personalization. */
  feitoParaVoce: CarouselItem[];
  /** Crops for the campaign block. */
  campaignCrops: { imageUrl: string; family: string }[];
};

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
  const coveredLocalities = catalog.coveredLocalityIds(region);
  const localities = localitiesOfRegion(region);
  const merch = catalog.merch(region);
  const ufs = REGIONS[region].ufs;

  const [heroUf, heroSlug] = SHOWCASE[region].hero;
  const showcase = resolveCity(region, heroUf, heroSlug);

  const allDdd = dddProducts(merch);
  const heroFamilies: HeroFamilyCard[] = HERO_FAMILIES.flatMap(({ family, uf, slug }) => {
    const hit = resolveCityProduct(region, uf, slug, family);
    if (!hit) return [];
    return [{ familyId: hit.family.id, familyName: hit.family.name, cityName: hit.city.name, uf: hit.city.uf, imageUrl: hit.primary.imageUrl, price: formatPrice(hit.primary.price), href: `/${region}/${uf}/${slug}/${family}` }];
  });
  const ddd: CarouselItem[] = allDdd.flatMap((d) => {
    const href = purchaseUrl(d.product);
    return href
      ? [{ id: d.product.inkProductId, name: d.regionName, eyebrow: d.code, context: STATE_NAMES[d.uf], price: formatPrice(d.product.price), rawPrice: d.product.price, state: d.uf, imageUrl: d.product.imageUrl, href }]
      : [];
  });

  // "Fala daqui": Dizeres with editorial context + the real local-voice products (state and city expressions).
  const lore = catalog.lore(region);
  type Fala = CarouselItem & { uf: string };
  const falaAll: Fala[] = [];
  for (const d of dizeresWithContext(merch)) {
    const href = purchaseUrl(d.product);
    if (href) falaAll.push({ id: d.product.inkProductId, uf: d.uf, state: d.uf, name: d.text, context: d.context, price: formatPrice(d.product.price), rawPrice: d.product.price, imageUrl: d.product.imageUrl, href });
  }
  for (const s of lore.byState) {
    const href = purchaseUrl(s.product);
    if (href) falaAll.push({ id: s.product.inkProductId, uf: s.uf, state: s.uf, name: s.text, context: STATE_NAMES[s.uf], price: formatPrice(s.product.price), rawPrice: s.product.price, imageUrl: s.product.imageUrl, href });
  }
  for (const [cityId, items] of lore.byCity) {
    for (const item of items) {
      if (item.kind !== "expressao") continue;
      const href = purchaseUrl(item.product);
      if (href) falaAll.push({ id: item.product.inkProductId, uf: item.city.uf, state: item.city.uf, name: item.text, context: `${item.city.name} · ${item.city.uf}`, price: formatPrice(item.product.price), rawPrice: item.product.price, imageUrl: item.product.imageUrl, href });
    }
    void cityId;
  }
  const fala: CarouselItem[] = interleaveByState(falaAll, STATE_ORDER).slice(0, 12).map(({ uf: _uf, ...rest }) => (void _uf, rest));

  const states: StateCard[] = ufs
    .map((uf) => {
      // Municipalities AND administrative regions that really have products: the Federal District is not "1 city".
      const stateLocalities = localities.filter((c) => c.uf === uf && coveredLocalities.has(c.id));
      const counts = stateLocalityCounts(stateLocalities);
      const groups = stateLocalityGroups(uf, stateLocalities);
      const found = stateLineProduct(merch, uf);
      // Federal District: the administrative regions are the places, so they (not "Brasília" + a bucket) are the shortcuts, each opening its products.
      const shortcuts = counts.administrativeRegions > 0
        ? stateLocalityShortcuts(stateLocalities, (place) => catalog.localityProductCount(place.id)).map((place) => ({ name: place.name, slug: place.slug, href: `/${region}/${uf.toLowerCase()}/${place.slug}` }))
        : null;
      return {
        uf,
        name: STATE_NAMES[uf],
        cityCount: counts.cities,
        administrativeRegionCount: counts.administrativeRegions,
        localityLabel: stateLocalityLabel(counts),
        browseLabel: stateBrowseLabel(counts, STATE_NAMES[uf]),
        // The capital's group first (editorial choice, ADR 0004), then the largest ones.
        regions: shortcuts ?? [...groups]
          .sort((a, b) => Number(b.localities.some((c) => c.slug === STATE_CAPITAL_SLUG[uf])) - Number(a.localities.some((c) => c.slug === STATE_CAPITAL_SLUG[uf])))
          .map((g) => ({ name: g.name, slug: g.slug, count: g.localities.length })),
        line: found
          ? { label: found.line, name: found.product.name.replace(/\s+/g, " ").trim(), imageUrl: found.product.imageUrl, price: formatPrice(found.product.price), href: purchaseUrl(found.product) }
          : null,
      };
    })
    .sort((a, b) => b.cityCount + b.administrativeRegionCount - (a.cityCount + a.administrativeRegionCount));

  const campaignCrops = (showcase?.families ?? [])
    .filter((f) => f.family.id === "territorio" || f.family.id === "feito-em")
    .slice(0, 2)
    .map((f) => ({ imageUrl: f.primary.imageUrl, family: f.family.id }));

  const recreations: CarouselItem[] = recreationProducts(merch).flatMap(({ product, theme }) => {
    const href = purchaseUrl(product);
    return href ? [{ id: product.inkProductId, name: product.name.replace(/\s+/g, " ").trim(), context: theme, price: formatPrice(product.price), rawPrice: product.price, imageUrl: product.imageUrl, href }] : [];
  });

  // terraProducts already balances across the three states (see its own doc comment), but which UF a given
  // pick belongs to isn't threaded back out of it here — `state` stays unset rather than guessed from the
  // label text.
  const terra: CarouselItem[] = terraProducts(merch, ufs).flatMap(({ product, label }) => {
    const href = purchaseUrl(product);
    return href ? [{ id: product.inkProductId, name: label, price: formatPrice(product.price), rawPrice: product.price, imageUrl: product.imageUrl, href }] : [];
  });

  const feitoParaVoce: CarouselItem[] = lendaProducts(merch).flatMap((product) => {
    const href = purchaseUrl(product);
    return href ? [{ id: product.inkProductId, name: product.name.replace(/\s+/g, " ").replace(/\s*\|\s*Lenda$/i, "").trim(), context: "Lenda", price: formatPrice(product.price), rawPrice: product.price, imageUrl: product.imageUrl, href }] : [];
  });

  return { cityCount: covered.size, syncedAt: catalog.syncedAt, showcase, heroFamilies, ddd, fala, states, terra, recreations, feitoParaVoce, campaignCrops };
}
