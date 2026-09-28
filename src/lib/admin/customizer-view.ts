import "server-only";
import { findCollection } from "../catalog/collections-file";
import { getCatalog } from "../catalog/repository";
import { familyById } from "../catalog/families";
import { localityOfBinding } from "../catalog/locality-binding";
import type { CommerceStoreKey } from "../geo/regions";

export type CollectionProduct = { id: string; label: string };

/**
 * The real products of ONE INK collection that exist in the SAME store's catalog snapshot, labelled so an operator can recognise them: the exact product
 * a personalization model may point at. Bounded (never hundreds of ids to the browser); a collection with more is narrowed by the search box.
 */
export function collectionProducts(store: CommerceStoreKey, collectionId: number, query = "", limit = 60): { items: CollectionProduct[]; total: number } {
  const record = findCollection(store, collectionId);
  if (!record) return { items: [], total: 0 };
  const products = getCatalog().productsOfStore(store);
  const q = query.trim().toLowerCase();
  const all: CollectionProduct[] = [];
  for (const id of record.memberIds) {
    const merch = products.merch.get(id);
    if (merch) {
      all.push({ id, label: `${merch.name.replace(/\s+/g, " ").trim()} · #${id}` });
      continue;
    }
    const design = products.cityDesigns.get(id);
    if (design) {
      const city = localityOfBinding(design);
      all.push({ id, label: `${familyById(design.designFamily)?.name ?? design.designFamily} · ${city ? `${city.name}/${city.uf}` : design.cityId} · #${id}` });
    }
  }
  const filtered = q ? all.filter((p) => p.label.toLowerCase().includes(q)) : all;
  return { items: filtered.slice(0, limit), total: filtered.length };
}
