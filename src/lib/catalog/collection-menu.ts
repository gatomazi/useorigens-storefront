import "server-only";
import { effectiveMenu, menuPositionOf } from "../site-config/collection-menu";
import { collectionPagePath, collectionUrl } from "../site-config/sources";
import type { CollectionRef, ScopeDoc } from "../site-config/schema";
import type { RegionSlug } from "../geo/regions";
import type { CollectionRecord } from "./collections";
import { getStoreCollections } from "./collections-file";
import { collectionPageSlug, regionShowsCollection } from "./collection-source";
import { storeForRegion } from "./commerce-mode";

/** One collection of the menu with the places it can link to: our page (when the region can show it) and its INK page (when it is public). */
export type MenuEntry = { ref: CollectionRef; record: CollectionRecord; position: "top" | "more"; pagePath: string | null; inkUrl: string | null };

/**
 * The collections of the region's store that are in its menu, read against the synced collections: the bar (`top`, the owner's order) and "Categorias"
 * (`more`, INK's own menu order). Each surface keeps only what it can link: the storefront needs `pagePath`, the Worker an INK page with products.
 * A chosen collection that can no longer be linked silently drops out; the choice stays in the document.
 */
export function collectionMenuEntries(region: RegionSlug, doc: ScopeDoc | undefined, filePath?: string): { top: MenuEntry[]; more: MenuEntry[]; own: boolean } {
  // The store that sells in the region (commerce-mode.ts); in single-store mode only the collections that are the region's (collection-source.ts).
  const store = storeForRegion(region);
  const { menu, own } = effectiveMenu(doc);
  const records = (getStoreCollections(store, filePath)?.collections ?? []).filter((c) => regionShowsCollection(region, c));
  const entry = (record: CollectionRecord, position: MenuEntry["position"]): MenuEntry => {
    const pageSlug = collectionPageSlug(doc, store, record.id, filePath);
    return {
      ref: { store, collectionId: record.id },
      record,
      position,
      pagePath: pageSlug ? collectionPagePath(region, pageSlug) : null,
      inkUrl: record.isAvailable && record.matchedCount >= 1 ? collectionUrl(store, record.slug) : null,
    };
  };
  const top = menu.top.filter((r) => r.store === store).flatMap((r) => {
    const record = records.find((c) => c.id === r.collectionId);
    return record ? [entry(record, "top")] : [];
  });
  const more = [...records]
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .filter((c) => menuPositionOf(menu, { store, collectionId: c.id }, c.isAvailable) === "more")
    .map((c) => entry(c, "more"));
  return { top, more, own };
}

export type SiteMenuLink = { label: string; href: string };

/** What the storefront header shows: the bar, and "Categorias" = the bar first, then the rest. Only collections with a page of ours. */
export function siteCollectionMenu(region: RegionSlug, doc: ScopeDoc | undefined, filePath?: string): { top: SiteMenuLink[]; categories: SiteMenuLink[] } {
  const { top, more } = collectionMenuEntries(region, doc, filePath);
  const link = (e: MenuEntry): SiteMenuLink[] => (e.pagePath ? [{ label: e.record.name, href: e.pagePath }] : []);
  const bar = top.flatMap(link);
  return { top: bar, categories: [...bar, ...more.flatMap(link)] };
}
