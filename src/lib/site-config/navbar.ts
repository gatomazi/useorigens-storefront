import "server-only";
import { collectionMenuEntries, type MenuEntry } from "../catalog/collection-menu";
import { findCollection } from "../catalog/collections-file";
import { SITE_URL } from "../site";
import { collectionUrl } from "./sources";
import { readPublished } from "./published";
import { effectiveNavbarGroups } from "./navbar-groups";
import { regionChrome } from "./chrome";
import { homeBundle, siteConfigHomeEnabled } from "./flag";
import { hasStatesSection } from "./nav";
import { DEFAULT_CATEGORIES_BLOCK_LABEL, headerBarItems, JOURNEY_HASH, regionPath, type NavBlockData, type NavItemData } from "./navigation";
import { MAX_NAVBAR_GROUP, type CollectionRef, type MenuHighlightColors, type ScopeDoc } from "./schema";
import { REGIONS, STATE_NAMES, type RegionSlug } from "../geo/regions";
import { storeForRegion } from "../catalog/commerce-mode";

/**
 * The lean, PUBLIC navbar configuration the Worker turns into the header it draws on the INK product pages: the region's collection menu (`top` on the
 * bar, `more` = "Demais categorias"), plus the fixed states of the region for the "Regiões" menu. Nothing else of
 * the CMS is exposed; logo, "Cidades" and the search route are constants of the Worker's per-store config, so a menu change never needs a Worker deploy.
 *
 * Every entry is re-checked at read time against the synced INK collections, not just when it was picked: a collection is listed only if it is PUBLIC on INK
 * (it has a real page), has products in the catalog and a valid slug. One that later becomes internal or empties out silently drops out of the payload
 * (the owner's choice stays in the CMS document). No collection has a special role: "Novidades" is just a name.
 */
export type NavbarEntry = { id: number; title: string; slug: string; url: string; order: number };
export type NavbarState = { uf: string; name: string; path: string };
/** `moreLabel` only once the region has its collection menu: the name the owner gave "Categorias" (Navegação), for the Worker's dropdown. */
export type NavbarConfig = { v: 2; region: RegionSlug; states: NavbarState[]; top: NavbarEntry[]; more: NavbarEntry[]; moreLabel?: string; site?: NavbarSite };

/** One link of the site's own menus, with an absolute address on the site (`url`) and what the site draws with it. */
export type NavbarSiteLink = { label: string; url: string; badge?: string; detail?: string; highlight?: MenuHighlightColors };
/**
 * The site's header exactly as the storefront draws it (`SiteChrome`), so the INK header can be the same instead of a second list kept by hand:
 * "Sua cidade" (`journey`, a link that opens the journey on arrival), "Estados" (`states`, and `statesMore` = "Ver estados" when the home has the chooser),
 * "Categorias" (`categoriesLabel` + `categories`, the bar's collections included, with their descriptions), the bar's links (`bar`, the highlighted ones
 * with their colours) and, for the phone menu, the menu's blocks in the order and with the titles the CMS published (`blocks`).
 * Added beside `top`/`more` on purpose: a Worker that does not know `site` keeps drawing its own layout from those, untouched.
 */
export type NavbarSite = {
  journey: { label: string; menuLabel: string; url: string };
  states: NavbarSiteLink[];
  statesMore?: string;
  categoriesLabel: string;
  categories: NavbarSiteLink[];
  bar: NavbarSiteLink[];
  blocks: { kind: NavBlockData["kind"]; label: string; items: NavbarSiteLink[] }[];
};

export function publicNavbar(region: RegionSlug): NavbarConfig {
  const doc = readPublished().bundle.docs[region];
  const states = REGIONS[region].ufs.map((uf) => ({ uf, name: STATE_NAMES[uf], path: `/${region}/${uf.toLowerCase()}` }));
  const base = doc?.collections?.menu ? menuNavbar(region, doc, states) : legacyNavbar(region, doc, states);
  return { ...base, site: siteNavbar(region) };
}

const siteOrigin = () => SITE_URL.replace(/\/$/, "");
/** A path of the site becomes its full address; anything else (already absolute) stays as it is. */
const siteAddress = (href: string): string => (href.startsWith("/") ? `${siteOrigin()}${href}` : href);
const siteLink = (item: NavItemData): NavbarSiteLink => ({
  label: item.label,
  url: siteAddress(item.href),
  ...(item.badge ? { badge: item.badge } : {}),
  ...(item.detail ? { detail: item.detail } : {}),
  ...(item.highlight ? { highlight: item.highlight } : {}),
});

/** The site's header, from the same resolution the storefront header uses (`regionChrome`), as full addresses on the site. */
function siteNavbar(region: RegionSlug): NavbarSite {
  const { navigation } = regionChrome(region);
  // The document the site header reads for "Ver estados" (SiteChrome's headerDoc): none while the config-driven home is off.
  const doc = siteConfigHomeEnabled() ? homeBundle().docs[region] : undefined;
  return {
    journey: { label: "Sua cidade", menuLabel: "Encontre aqui a sua cidade", url: siteAddress(`${regionPath(region)}${JOURNEY_HASH}`) },
    states: navigation.states.map(siteLink),
    ...(navigation.states.length > 0 && hasStatesSection(doc) ? { statesMore: siteAddress(`${regionPath(region)}#estados`) } : {}),
    categoriesLabel: navigation.categoriesLabel,
    categories: navigation.categories.map(siteLink),
    bar: headerBarItems(navigation).map(siteLink),
    blocks: navigation.blocks.map((b) => ({ kind: b.kind, label: b.label, items: b.items.map(siteLink) })),
  };
}

/**
 * The region's collection menu, as the Worker reads it: only collections with an INK page and products (the Worker links by INK slug), the bar in the
 * owner's order, "Demais categorias" = the rest of "Categorias" in INK's order (never one that is on the bar: the Worker refuses the payload otherwise).
 * `url` is our page of the collection when the region has one, so the Worker can send the visitor back to the site.
 */
function menuNavbar(region: RegionSlug, doc: ScopeDoc, states: NavbarState[]): NavbarConfig {
  const { top, more } = collectionMenuEntries(region, doc);
  const entries = (list: MenuEntry[]): NavbarEntry[] =>
    list
      .filter((e) => e.inkUrl)
      .slice(0, MAX_NAVBAR_GROUP)
      .map((e, i) => ({ id: e.record.id, title: e.record.name, slug: e.record.slug, url: e.pagePath ? `${SITE_URL.replace(/\/$/, "")}${e.pagePath}` : e.inkUrl!, order: i + 1 }));
  const bar = entries(top);
  const onBar = new Set(bar.map((e) => e.id));
  const rest = entries(more.filter((e) => !onBar.has(e.record.id)));
  return { v: 2, region, states, top: bar, more: rest, moreLabel: doc.navigation?.categoriesBlock?.label ?? DEFAULT_CATEGORIES_BLOCK_LABEL };
}

/** A document from before the collection menu: exactly what the Worker always received (the older INK navbar choice, INK links). */
function legacyNavbar(region: RegionSlug, doc: ScopeDoc | undefined, states: NavbarState[]): NavbarConfig {
  // The region's store under the effective commerce mode: in single-store mode a published ref to use-norte/use-centro is dropped (its
  // collection does not exist in the single store and its URL would send the buyer to the old store) until the CMS is re-pointed.
  const store = storeForRegion(region);
  const { groups, legacy } = effectiveNavbarGroups(doc);

  const resolve = (refs: readonly CollectionRef[]): NavbarEntry[] => {
    const found = refs
      .filter((ref) => ref.store === store)
      .flatMap((ref) => {
        const record = findCollection(ref.store, ref.collectionId);
        // collectionUrl doubles as the slug validator: null for an invalid slug or a store without a verified public pattern.
        const url = record && record.isAvailable && record.matchedCount >= 1 ? collectionUrl(store, record.slug) : null;
        return record && url ? [{ record, url }] : [];
      });
    // A document from before the groups existed kept INK's own menu order for its flat list; new documents keep the owner's order exactly as listed.
    if (legacy) found.sort((a, b) => a.record.position - b.record.position || a.record.id - b.record.id);
    return found.slice(0, MAX_NAVBAR_GROUP).map(({ record, url }, i) => ({ id: record.id, title: record.name, slug: record.slug, url, order: i + 1 }));
  };

  const top = resolve(groups.top);
  const topIds = new Set(top.map((e) => e.id));
  const more = resolve(groups.more).filter((e) => !topIds.has(e.id)).map((e, i) => ({ ...e, order: i + 1 })); // defensive: never on both
  return { v: 2, region, states, top, more };
}
