import "server-only";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import { purchaseUrl } from "../catalog/commerce";
import { collectionUrl } from "../site-config/sources";
import { MIN_USABLE_PRODUCTS, type CollectionRecord } from "../catalog/collections";
import { DESIGN_FAMILIES, type DesignFamilyId } from "../catalog/families";
import type { Catalog } from "../catalog/repository";
import { formatListPrice, formatPrice } from "../format";
import type { City } from "../geo/cities";
import type { CommerceStoreKey } from "../geo/regions";
import { normalizeText } from "../geo/text";

/**
 * "Escolha o estilo" on a state page: the state's city designs grouped by design family (the "Seu Lugar" styles), one short row per
 * family, built from the catalog snapshot only — every product is a real city design of THIS state, never one from elsewhere.
 *
 * "Ver todos" goes to the store's own navigation collection for that style and state ("SUL - TRAÇO - SC"). Those collections are hidden
 * from the store's menus (`isAvailable: false`), but their pages are live and list the products: checked on 2026-10-05 for
 * `sul-traco-sc`, `sul-origem-sc` and `sul-feito-em-sc`. `SUL - P. ORIGEM - *` exist but are empty — Ponto de Origem lives in
 * `SUL - ORIGEM - *`. Only collections with enough matched products are linked; a store without this naming (Norte, Centro-Oeste)
 * gets no link, never a guessed one.
 */

/** How each family is abbreviated in the store's navigation collection names, in order of preference. */
const NAV_ABBREVIATIONS: Record<DesignFamilyId, readonly string[]> = {
  "ponto-de-origem": ["ORIGEM", "P ORIGEM"],
  "feito-em": ["FEITO EM"],
  coordenadas: ["COORD"],
  legado: ["LEGADO"],
  territorio: ["TERRIT"],
  tipografia: ["TIPOG"],
  traco: ["TRACO"],
  gentilico: ["GENTILICO"],
};

/** The prefix of the navigation collections of each store (only the Sul store has them today). */
const NAV_PREFIX: Partial<Record<CommerceStoreKey, string>> = { "use-sul": "SUL" };

const navKey = (name: string) => normalizeText(name).toUpperCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();

/** Live store URL of the navigation collection of one family in one UF, or null when there is none worth linking. */
export function styleCollectionHref(store: CommerceStoreKey, uf: string, family: DesignFamilyId, collections: readonly CollectionRecord[]): string | null {
  const prefix = NAV_PREFIX[store];
  if (!prefix) return null;
  const byName = new Map(collections.map((c) => [navKey(c.name), c]));
  for (const abbreviation of NAV_ABBREVIATIONS[family]) {
    const record = byName.get(navKey(`${prefix} - ${abbreviation} - ${uf}`));
    if (record && !record.needsResync && record.matchedCount >= MIN_USABLE_PRODUCTS) return collectionUrl(store, record.slug);
  }
  return null;
}

export type StateStyle = {
  id: DesignFamilyId;
  name: string;
  description: string;
  items: CarouselItem[];
  viewAllHref: string | null;
};

export function stateStyles(params: {
  uf: string;
  /** Covered places of this UF only — the same list the state showcase uses. */
  cities: readonly City[];
  catalog: Pick<Catalog, "cityFamilies">;
  store: CommerceStoreKey;
  collections: readonly CollectionRecord[];
  /** Shown first in every row when it has the style, for recognizability. */
  capitalSlug?: string;
  limit?: number;
}): StateStyle[] {
  const { uf, cities, catalog, store, collections, capitalSlug, limit = 12 } = params;

  type StylePick = { city: City; item: CarouselItem; salesCount: number };
  const byFamily = new Map<DesignFamilyId, StylePick[]>();
  for (const city of cities) {
    for (const entry of catalog.cityFamilies(city.id)) {
      const href = purchaseUrl(entry.primary);
      if (!href) continue;
      const list = byFamily.get(entry.family.id) ?? [];
      list.push({
        city,
        salesCount: entry.primary.totalSalesCount ?? 0,
        item: {
          id: entry.primary.inkProductId,
          name: city.name,
          context: `${entry.family.name} · ${uf}`,
          price: formatPrice(entry.primary.price), listPrice: formatListPrice(entry.primary),
          rawPrice: entry.primary.price,
          state: uf,
          imageUrl: entry.primary.imageUrl,
          href,
        },
      });
      byFamily.set(entry.family.id, list);
    }
  }

  const styles: StateStyle[] = [];
  for (const family of DESIGN_FAMILIES) {
    const picks = byFamily.get(family.id) ?? [];
    // Same order as the showcase: the capital first, then the real sales signal (never shown), then A–Z — deterministic.
    picks.sort((a, b) => {
      const aCapital = a.city.slug === capitalSlug ? 1 : 0;
      const bCapital = b.city.slug === capitalSlug ? 1 : 0;
      return bCapital - aCapital || b.salesCount - a.salesCount || a.city.name.localeCompare(b.city.name, "pt-BR");
    });
    const seen = new Set<string>();
    const items: CarouselItem[] = [];
    for (const pick of picks) {
      if (seen.has(pick.item.id)) continue;
      seen.add(pick.item.id);
      items.push(pick.item);
      if (items.length >= limit) break;
    }
    // A row of one or two cards is not a style to browse: it is left out.
    if (items.length < MIN_USABLE_PRODUCTS) continue;
    styles.push({ id: family.id, name: family.name, description: family.description, items, viewAllHref: styleCollectionHref(store, uf, family.id, collections) });
  }
  return styles;
}
