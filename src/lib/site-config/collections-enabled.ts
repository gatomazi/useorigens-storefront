import type { CommerceStoreKey } from "../geo/regions";
import type { CategoryArrangement } from "./sources";
import type { CollectionRef, Destination, ScopeDoc, Section, Source } from "./schema";

/** The internal collections a scope's document has explicitly enabled, for one store. Pure. */
export function enabledInternalIds(doc: ScopeDoc | undefined, store: CommerceStoreKey): ReadonlySet<number> {
  return new Set((doc?.collections?.enabled ?? []).filter((r) => r.store === store).map((r) => r.collectionId));
}

const leadsTo = (dest: { kind: string; store?: string; collectionId?: number } | undefined, store: string, collectionId: number) =>
  (dest?.kind === "ink-collection" || dest?.kind === "collection-page") && dest.store === store && dest.collectionId === collectionId;

/** Which sections of a document use a collection, as its product source or as the target of their "Ver todos" button. Pure. */
export function sectionsUsing(doc: ScopeDoc, store: string, collectionId: number): Section[] {
  return (doc.home?.sections ?? []).filter((s) => (s.source?.kind === "ink-category" && s.source.store === store && s.source.collectionId === collectionId) || leadsTo(s.cta?.dest, store, collectionId));
}

const sameRef = (a: CollectionRef, store: string, collectionId: number) => a.store === store && a.collectionId === collectionId;

/** The order / hidden products a section saved before arrangements belonged to the collection (undefined: it had none). */
function legacyArrangement(source: Source | undefined): CategoryArrangement | undefined {
  if (source?.kind !== "ink-category") return undefined;
  const productIds = source.order === "manual" && source.productIds?.length ? source.productIds : undefined;
  const hiddenIds = source.hiddenIds?.length ? source.hiddenIds : undefined;
  return productIds || hiddenIds ? { productIds, hiddenIds } : undefined;
}

/** Every section of the document, the home's first, then each page's: where an older arrangement of a collection may still be. */
const allSections = (doc: ScopeDoc): Section[] => [...(doc.home?.sections ?? []), ...(doc.pages ?? []).flatMap((p) => p.sections)];

/**
 * How this region arranges a collection: its own entry (`collections.arrangements`); otherwise, for a section saved before the order belonged to the
 * collection, that section's own; otherwise the first older arrangement any section of the document has for it (so a section without one, and the
 * collection page, follow what the owner already set). Undefined = INK's order, nothing hidden. Pure: the storefront and the panel use the same rule.
 */
export function arrangementOf(doc: ScopeDoc | undefined, store: string, collectionId: number, section?: Source): CategoryArrangement | undefined {
  if (!doc) return legacyArrangement(section);
  const own = doc.collections?.arrangements?.find((a) => sameRef(a, store, collectionId));
  if (own) return { productIds: own.productIds, hiddenIds: own.hiddenIds };
  const fromSection = section?.kind === "ink-category" && sameRef(section, store, collectionId) ? legacyArrangement(section) : undefined;
  if (fromSection) return fromSection;
  for (const s of allSections(doc)) {
    if (s.source?.kind !== "ink-category" || !sameRef(s.source, store, collectionId)) continue;
    const found = legacyArrangement(s.source);
    if (found) return found;
  }
  return undefined;
}

/** Every link of the document (buttons, menu links, grid tiles; home and pages) that still leads to a collection's page ON INK. Pure. */
export function inkCollectionLinks(doc: ScopeDoc): CollectionRef[] {
  const out: CollectionRef[] = [];
  const take = (dest: Destination | undefined) => {
    if (dest?.kind === "ink-collection") out.push({ store: dest.store, collectionId: dest.collectionId });
  };
  for (const s of allSections(doc)) {
    take(s.cta?.dest);
    take(s.nav?.dest);
    for (const t of s.tiles ?? []) take(t.dest);
  }
  return out;
}
