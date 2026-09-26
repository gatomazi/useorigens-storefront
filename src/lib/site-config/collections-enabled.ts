import type { CommerceStoreKey } from "../geo/regions";
import type { ScopeDoc, Section } from "./schema";

/** The internal collections a scope's document has explicitly enabled, for one store. Pure. */
export function enabledInternalIds(doc: ScopeDoc | undefined, store: CommerceStoreKey): ReadonlySet<number> {
  return new Set((doc?.collections?.enabled ?? []).filter((r) => r.store === store).map((r) => r.collectionId));
}

/** Which sections of a document use a collection, as its product source or as the target of their "Ver todos" button. Pure. */
export function sectionsUsing(doc: ScopeDoc, store: string, collectionId: number): Section[] {
  return (doc.home?.sections ?? []).filter(
    (s) => (s.source?.kind === "ink-category" && s.source.store === store && s.source.collectionId === collectionId) || (s.cta?.dest.kind === "ink-collection" && s.cta.dest.store === store && s.cta.dest.collectionId === collectionId),
  );
}
