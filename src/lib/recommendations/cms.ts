import type { CommerceStoreKey } from "../geo/regions";
import type { PublishedBundle, Section } from "../site-config/schema";

/**
 * INK collections the PUBLISHED CMS gives a public place to — navbar groups, sections of the home and of live (non-archived) hotpages and
 * category landings — for one store (MD §8.5). Read from the published bundle only: a draft never reaches it, an archived page is skipped.
 * Used as a small bonus on a shared collection, never as a reason on its own and never as a manual pin.
 */
export function featuredCollectionIds(bundle: PublishedBundle | null, store: CommerceStoreKey): Set<number> {
  const ids = new Set<number>();
  if (!bundle) return ids;
  const fromSections = (sections: readonly Section[] | undefined) => {
    for (const s of sections ?? []) {
      if (s.source?.kind === "ink-category" && s.source.store === store) ids.add(s.source.collectionId);
      if (s.cta?.dest.kind === "ink-collection" && s.cta.dest.store === store) ids.add(s.cta.dest.collectionId);
    }
  };
  for (const doc of Object.values(bundle.docs ?? {})) {
    if (!doc) continue;
    fromSections(doc.home?.sections);
    for (const page of doc.pages ?? []) if (!page.archived) fromSections(page.sections);
    const groups = doc.collections?.navbarGroups;
    for (const ref of [...(groups?.top ?? []), ...(groups?.more ?? []), ...(doc.collections?.navbar ?? [])]) if (ref.store === store) ids.add(ref.collectionId);
  }
  return ids;
}
