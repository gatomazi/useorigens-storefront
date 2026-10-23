import "server-only";
import { effectiveMenu, menuPositionOf } from "../site-config/collection-menu";
import { collectionPagePath, collectionUrl } from "../site-config/sources";
import type { CollectionRef, MenuHighlightColors, ScopeDoc } from "../site-config/schema";
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
  const records = regionRecords(region, filePath);
  const entry = (record: CollectionRecord, position: MenuEntry["position"]): MenuEntry => ({ ...links(region, doc, record, filePath), position });
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

/** The region's collections, read against the synced collections of the store that sells in it (single-store mode: only the region's own). */
const regionRecords = (region: RegionSlug, filePath?: string): CollectionRecord[] => (getStoreCollections(storeForRegion(region), filePath)?.collections ?? []).filter((c) => regionShowsCollection(region, c));

/** Where a collection can link: our page (when the region can show it) and its INK page (when it is public and has products). */
function links(region: RegionSlug, doc: ScopeDoc | undefined, record: CollectionRecord, filePath?: string): Omit<MenuEntry, "position"> {
  const store = storeForRegion(region);
  const pageSlug = collectionPageSlug(doc, store, record.id, filePath);
  return {
    ref: { store, collectionId: record.id },
    record,
    pagePath: pageSlug ? collectionPagePath(region, pageSlug) : null,
    inkUrl: record.isAvailable && record.matchedCount >= 1 ? collectionUrl(store, record.slug) : null,
  };
}

/**
 * For the panel's Menu screen: the collections that COULD be in the menu (they link somewhere) but are not, in INK's menu order: a public one the owner
 * took out ("Não exibir") or an internal one, enabled in the CMS, never brought in.
 */
export function offMenuEntries(region: RegionSlug, doc: ScopeDoc | undefined, filePath?: string): Omit<MenuEntry, "position">[] {
  const store = storeForRegion(region);
  const { menu } = effectiveMenu(doc);
  return regionRecords(region, filePath)
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .filter((c) => menuPositionOf(menu, { store, collectionId: c.id }, c.isAvailable) === "none")
    .map((c) => links(region, doc, c, filePath))
    .filter((e) => e.pagePath !== null || e.inkUrl !== null);
}

/**
 * `detail`: the collection's short description (CMS `collections.descriptions`), under its name in the open menus. `highlight`: its colours when the owner
 * highlighted it (`collections.highlights`), only while it is on the bar.
 */
export type SiteMenuLink = { label: string; href: string; detail?: string; highlight?: MenuHighlightColors };

/** What the storefront header shows: the bar, and "Categorias" = the bar first, then the rest. Only collections with a page of ours. */
export function siteCollectionMenu(region: RegionSlug, doc: ScopeDoc | undefined, filePath?: string): { top: SiteMenuLink[]; categories: SiteMenuLink[] } {
  const { top, more } = collectionMenuEntries(region, doc, filePath);
  const notes = new Map((doc?.collections?.descriptions ?? []).map((d) => [`${d.store}:${d.collectionId}`, d.text]));
  const highlights = new Map((doc?.collections?.highlights ?? []).map(({ store, collectionId, ...colours }) => [`${store}:${collectionId}`, colours]));
  const link = (e: MenuEntry): SiteMenuLink[] => {
    if (!e.pagePath) return [];
    const k = `${e.ref.store}:${e.ref.collectionId}`;
    const detail = notes.get(k);
    const highlight = e.position === "top" ? highlights.get(k) : undefined;
    return [{ label: e.record.name, href: e.pagePath, ...(detail ? { detail } : {}), ...(highlight ? { highlight } : {}) }];
  };
  const bar = top.flatMap(link);
  return { top: bar, categories: [...bar, ...more.flatMap(link)] };
}
