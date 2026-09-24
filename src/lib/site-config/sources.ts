import type { CarouselItem } from "@/components/catalog/ProductCarousel";
import type { CommerceStoreKey } from "../geo/regions";
import type { Destination, EditorialModuleKey, Source } from "./schema";

/**
 * Section data sources (docs/admin/cms-v1-round2.md §3, docs/admin/cms-v1-round3.md §3). A source either yields items or says,
 * explicitly, why it cannot: an unavailable source hides its section (like an empty one does today) instead of guessing products.
 */
export type UnavailableReason =
  | "ink-collections-not-synced" // no collections snapshot (yet) — the current production state
  | "collection-not-found" // the collection is not in the snapshot of that store
  | "collection-unavailable" // hidden on the live store (`is_available` false): internal segmentation, never a showcase
  | "collection-has-no-products" // none of its products exist in the store's catalog snapshot
  | "manual-source-not-implemented";

export type SourceResult = { status: "ok"; items: CarouselItem[] } | { status: "unavailable"; reason: UnavailableReason };

export type EditorialItems = Readonly<Record<EditorialModuleKey, CarouselItem[]>>;

/** Real products of one INK collection, already limited to this store's own catalog. Supplied by the server (never fetched here). */
export type CategoryLookup = (store: CommerceStoreKey, collectionId: number, limit: number) => SourceResult;

export function resolveSource(source: Source, editorial: EditorialItems, categories?: CategoryLookup): SourceResult {
  switch (source.kind) {
    case "editorial-module":
      return { status: "ok", items: editorial[source.key] };
    case "ink-category":
      // Only a real, synced, available collection resolves. Categories are never inferred from product names or tags.
      return categories ? categories(source.store, source.collectionId, source.limit) : { status: "unavailable", reason: "ink-collections-not-synced" };
    case "manual":
      return { status: "unavailable", reason: "manual-source-not-implemented" };
  }
}

/**
 * Public storefront URL of a collection. The pattern `https://www.<store>.com.br/<store>/collections/<slug>` was checked against the
 * live stores on 2026-09-23: the 4 editorial Sul slugs, plus `fala-de-onde` (Norte) and `lenda-do-centro` (Centro), answer 200,
 * and an unknown slug answers 404 on both. `use-origens` (the future consolidated store) has no verified pattern, so it is null.
 */
const STORE_SITE: Partial<Record<CommerceStoreKey, string>> = { "use-sul": "usesul", "use-norte": "usenorte", "use-centro": "usecentro" };
const COLLECTION_SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function collectionUrl(store: CommerceStoreKey, slug: string): string | null {
  const site = STORE_SITE[store];
  return site && COLLECTION_SLUG.test(slug) ? `https://www.${site}.com.br/${site}/collections/${slug}` : null;
}

/** Real href of a CTA destination, or `null` when it cannot be resolved (an INK collection needs its slug from the snapshot). */
export function destinationHref(dest: Destination, slugOf?: (store: CommerceStoreKey, collectionId: number) => string | null): string | null {
  if (dest.kind === "route") return dest.path;
  if (dest.kind === "external") return dest.url;
  const slug = slugOf?.(dest.store, dest.collectionId);
  return slug ? collectionUrl(dest.store, slug) : null;
}
