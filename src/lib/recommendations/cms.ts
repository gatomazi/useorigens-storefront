import type { CommerceStoreKey } from "../geo/regions";
import type { PublishedBundle, Section } from "../site-config/schema";

/**
 * INK collections the PUBLISHED CMS gives a public place to — the collection menu's explicit choices (or the older navbar groups), sections of the home and of live (non-archived) hotpages and
 * category landings — for one store (MD §8.5). Read from the published bundle only: a draft never reaches it, an archived page is skipped.
 * Used as a small bonus on a shared collection, never as a reason on its own and never as a manual pin.
 */
export function featuredCollectionIds(bundle: PublishedBundle | null, store: CommerceStoreKey): Set<number> {
  const ids = new Set<number>();
  if (!bundle) return ids;
  const fromSections = (sections: readonly Section[] | undefined) => {
    for (const s of sections ?? []) {
      if (s.source?.kind === "ink-category" && s.source.store === store) ids.add(s.source.collectionId);
      if ((s.cta?.dest.kind === "ink-collection" || s.cta?.dest.kind === "collection-page") && s.cta.dest.store === store) ids.add(s.cta.dest.collectionId);
    }
  };
  for (const doc of Object.values(bundle.docs ?? {})) {
    if (!doc) continue;
    fromSections(doc.home?.sections);
    for (const page of doc.pages ?? []) if (!page.archived) fromSections(page.sections);
    // The menu's explicit choices (its automatic "Categorias" is every public collection: no signal), or the older INK navbar lists.
    const menu = doc.collections?.menu;
    const groups = doc.collections?.navbarGroups;
    const chosen = menu ? [...menu.top, ...menu.added] : [...(groups?.top ?? []), ...(groups?.more ?? []), ...(doc.collections?.navbar ?? [])];
    for (const ref of chosen) if (ref.store === store) ids.add(ref.collectionId);
  }
  return ids;
}
