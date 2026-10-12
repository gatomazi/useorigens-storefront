import "server-only";
import { collectionMenuEntries, type MenuEntry } from "../catalog/collection-menu";
import { findCollection } from "../catalog/collections-file";
import { SITE_URL } from "../site";
import { collectionUrl } from "./sources";
import { readPublished } from "./published";
import { effectiveNavbarGroups } from "./navbar-groups";
import { DEFAULT_CATEGORIES_BLOCK_LABEL } from "./navigation";
import { MAX_NAVBAR_GROUP, type CollectionRef, type ScopeDoc } from "./schema";
import { REGIONS, STATE_NAMES, type RegionSlug } from "../geo/regions";

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
export type NavbarConfig = { v: 2; region: RegionSlug; states: NavbarState[]; top: NavbarEntry[]; more: NavbarEntry[]; moreLabel?: string };

export function publicNavbar(region: RegionSlug): NavbarConfig {
  const doc = readPublished().bundle.docs[region];
  const states = REGIONS[region].ufs.map((uf) => ({ uf, name: STATE_NAMES[uf], path: `/${region}/${uf.toLowerCase()}` }));
  return doc?.collections?.menu ? menuNavbar(region, doc, states) : legacyNavbar(region, doc, states);
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
  const store = REGIONS[region].storeKey;
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
