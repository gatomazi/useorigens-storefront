import "server-only";
import { findCollection } from "../catalog/collections-file";
import { collectionUrl } from "./sources";
import { readPublished } from "./published";
import { MAX_NAVBAR_COLLECTIONS } from "./schema";
import { REGIONS, type RegionSlug } from "../geo/regions";

/**
 * The lean, PUBLIC navbar configuration the Worker turns into the header it draws on the INK product pages. It carries only what the CMS decides
 * (which collections, in which order); logo, cities link and search route are constants of the Worker's per-store config, so a menu change never
 * needs a Worker deploy and this payload never grows into a second site config.
 *
 * Every entry is checked at read time against the synced INK collections, not just when it was picked in the CMS: a collection is listed only if it
 * is PUBLIC on INK (it has a real page), has products in the catalog, and has a valid slug. A collection that later becomes internal or empties out
 * silently drops out of the menu instead of leaving a dead link. Order = INK's own navbar position (the existing menu order), then id.
 */
export type NavbarCollection = { name: string; slug: string };
export type NavbarConfig = { v: 1; region: RegionSlug; collections: NavbarCollection[] };

export function publicNavbar(region: RegionSlug): NavbarConfig {
  const store = REGIONS[region].storeKey;
  const refs = readPublished().bundle.docs[region]?.collections?.navbar ?? [];
  const records = refs
    .filter((ref) => ref.store === store)
    .flatMap((ref) => {
      const record = findCollection(ref.store, ref.collectionId);
      // collectionUrl doubles as the slug validator: null for an invalid slug or a store without a verified public pattern.
      return record && record.isAvailable && record.matchedCount >= 1 && collectionUrl(store, record.slug) ? [record] : [];
    })
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .slice(0, MAX_NAVBAR_COLLECTIONS);
  return { v: 1, region, collections: records.map((r) => ({ name: r.name, slug: r.slug })) };
}
