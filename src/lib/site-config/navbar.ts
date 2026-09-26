import "server-only";
import { findCollection } from "../catalog/collections-file";
import { collectionUrl } from "./sources";
import { readPublished } from "./published";
import { effectiveNavbarGroups } from "./navbar-groups";
import { MAX_NAVBAR_GROUP, type CollectionRef } from "./schema";
import { REGIONS, STATE_NAMES, type RegionSlug } from "../geo/regions";

/**
 * The lean, PUBLIC navbar configuration the Worker turns into the header it draws on the INK product pages. Two groups the owner fills freely in the CMS
 * (`top` on the bar, `more` = "Demais categorias"), each in the owner's order, plus the fixed states of the region for the "Regiões" menu. Nothing else of
 * the CMS is exposed; logo, "Cidades" and the search route are constants of the Worker's per-store config, so a menu change never needs a Worker deploy.
 *
 * Every entry is re-checked at read time against the synced INK collections, not just when it was picked: a collection is listed only if it is PUBLIC on INK
 * (it has a real page), has products in the catalog and a valid slug. One that later becomes internal or empties out silently drops out of the payload
 * (the owner's choice stays in the CMS document). No collection has a special role: "Novidades" is just a name.
 */
export type NavbarEntry = { id: number; title: string; slug: string; url: string; order: number };
export type NavbarState = { uf: string; name: string; path: string };
export type NavbarConfig = { v: 2; region: RegionSlug; states: NavbarState[]; top: NavbarEntry[]; more: NavbarEntry[] };

export function publicNavbar(region: RegionSlug): NavbarConfig {
  const store = REGIONS[region].storeKey;
  const { groups, legacy } = effectiveNavbarGroups(readPublished().bundle.docs[region]);

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
  const states = REGIONS[region].ufs.map((uf) => ({ uf, name: STATE_NAMES[uf], path: `/${region}/${uf.toLowerCase()}` }));
  return { v: 2, region, states, top, more };
}
