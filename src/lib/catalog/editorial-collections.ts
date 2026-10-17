import "server-only";
import type { RegionSlug } from "../geo/regions";
import { EDITORIAL_COLLECTION_SLUGS, type EditorialCollections } from "../site-config/home-themes";
import type { ScopeDoc } from "../site-config/schema";
import { getStoreCollections } from "./collections-file";
import { collectionPageSlug, regionShowsCollection } from "./collection-source";
import { storeForRegion } from "./commerce-mode";

/**
 * The real collections the editorial home theme is built on, found by slug in the store that sells in the region (the synced snapshot): only those the
 * region shows and that have a page of ours. A missing one is simply absent, and the editorial composition leaves out what needs it.
 */
export function editorialCollections(region: RegionSlug, doc: ScopeDoc | undefined, filePath?: string): EditorialCollections {
  const store = storeForRegion(region);
  const records = getStoreCollections(store, filePath)?.collections ?? [];
  const out: EditorialCollections = {};
  for (const [key, slug] of Object.entries(EDITORIAL_COLLECTION_SLUGS) as [keyof EditorialCollections, string][]) {
    const record = records.find((c) => c.slug === slug && regionShowsCollection(region, c));
    if (record && collectionPageSlug(doc, store, record.id, filePath)) out[key] = { store, collectionId: record.id };
  }
  return out;
}
