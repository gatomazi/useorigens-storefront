import type { CollectionsSnapshot } from "../catalog/collections";
import type { CommerceStoreKey } from "../geo/regions";
import { collectionUrl } from "../site-config/sources";
import { McpToolError } from "./errors";
import { fold } from "./sales";

/**
 * The categories side of the MCP: INK collections ("categorias") per store, read from the collections snapshot the storefront already syncs
 * (src/lib/catalog/collections.ts). No extra INK read: the raw `product_ids` of a collection (one Sul collection has > 100k) are never kept,
 * only the members the sync matched against the same store's catalog snapshot — city designs and merch. So the membership of a product
 * outside that snapshot (garment siblings sold by direct link, products delisted since) is UNKNOWN here, never "no category".
 *
 * Two independent facts per category: INK visibility (`public` = shown on the INK store; `internal` = a hidden segmentation such as
 * "SUL - RS") and its size in the catalog. A product may belong to several categories, so category totals overlap.
 */
export type CategoryEntry = {
  store: CommerceStoreKey;
  id: number;
  name: string;
  slug: string;
  /** INK's own navbar position (ascending). */
  position: number;
  visibility: "public" | "internal";
  /** Members found in the store's catalog snapshot (city designs + merch): the useful count. */
  productsInCatalog: number;
  cityDesigns: number;
  merch: number;
  /** How many product ids INK reported (hidden and unpublished products included). Informational only. */
  reportedProducts: number;
  /** False on records of an older sync that kept only a slice of the members: the category needs a collections resync. */
  membershipComplete: boolean;
  url: string | null;
  members: ReadonlySet<string>;
};

export type CategoryIndex = {
  stores: { store: CommerceStoreKey; syncedAt: string; catalogSyncedAt: string; categories: number; public: number; incomplete: number }[];
  entries: CategoryEntry[];
  /** `store:productId` → the categories the product belongs to (only products the sync matched). */
  byProduct: Map<string, CategoryEntry[]>;
};

export const EMPTY_CATEGORY_INDEX: CategoryIndex = { stores: [], entries: [], byProduct: new Map() };

export function buildCategoryIndex(snapshot: CollectionsSnapshot): CategoryIndex {
  const stores: CategoryIndex["stores"] = [];
  const entries: CategoryEntry[] = [];
  const byProduct = new Map<string, CategoryEntry[]>();
  for (const [store, s] of Object.entries(snapshot.stores) as [CommerceStoreKey, NonNullable<CollectionsSnapshot["stores"][CommerceStoreKey]>][]) {
    if (!s) continue;
    let incomplete = 0;
    for (const c of s.collections) {
      const complete = c.allMemberIds !== undefined && !c.needsResync;
      if (!complete) incomplete++;
      const entry: CategoryEntry = {
        store,
        id: c.id,
        name: c.name.replace(/\s+/g, " ").trim(),
        slug: c.slug,
        position: c.position,
        visibility: c.isAvailable ? "public" : "internal",
        productsInCatalog: c.matchedCount,
        cityDesigns: c.cityDesignCount,
        merch: c.merchCount,
        reportedProducts: c.reportedProductCount,
        membershipComplete: complete,
        url: c.isAvailable ? collectionUrl(store, c.slug) : null,
        members: new Set(c.allMemberIds ?? c.memberIds),
      };
      entries.push(entry);
      for (const id of entry.members) {
        const k = `${store}:${id}`;
        byProduct.set(k, [...(byProduct.get(k) ?? []), entry]);
      }
    }
    stores.push({ store, syncedAt: s.syncedAt, catalogSyncedAt: s.catalogSyncedAt, categories: s.collections.length, public: s.collections.filter((c) => c.isAvailable).length, incomplete });
  }
  return { stores, entries, byProduct };
}

export const categoryKey = (e: Pick<CategoryEntry, "store" | "id">) => `${e.store}:${e.id}`;

/**
 * A category given by the owner: its numeric INK id, or a slug/name ("territorio", "Território") that may exist in several stores (each its
 * own category, same name). Restricted to `stores` when given. Not found is an error that points to the listing, never a guess.
 */
export function resolveCategories(index: CategoryIndex, ref: string, stores?: readonly CommerceStoreKey[]): CategoryEntry[] {
  const wanted = ref.trim();
  const inStores = (e: CategoryEntry) => !stores || stores.includes(e.store);
  const found = /^\d{1,12}$/.test(wanted) ? index.entries.filter((e) => String(e.id) === wanted && inStores(e)) : index.entries.filter((e) => inStores(e) && (e.slug === fold(wanted) || fold(e.name) === fold(wanted)));
  if (found.length === 0) throw new McpToolError("INVALID_INPUT", `Categoria "${wanted}" não encontrada${stores ? ` nas lojas ${stores.join(", ")}` : ""}. Veja os ids e slugs em origens_list_categories.`);
  return found;
}

export type CategoryFilters = { store?: CommerceStoreKey; text?: string; visibility?: CategoryEntry["visibility"]; include_empty?: boolean };

/** Deterministic order: store, then INK's navbar position, then id. Empty categories (no product of the catalog) only when asked. */
export function searchCategories(index: CategoryIndex, f: CategoryFilters): CategoryEntry[] {
  const words = f.text ? fold(f.text).split(/\s+/).filter(Boolean) : [];
  return index.entries
    .filter((e) => (!f.store || e.store === f.store) && (!f.visibility || e.visibility === f.visibility) && (f.include_empty || e.productsInCatalog > 0))
    .filter((e) => words.every((w) => fold(`${e.name} ${e.slug}`).includes(w)))
    .sort((a, b) => a.store.localeCompare(b.store) || a.position - b.position || a.id - b.id);
}
