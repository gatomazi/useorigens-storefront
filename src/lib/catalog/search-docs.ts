import "server-only";
import { cityById } from "../geo/cities";
import { REGIONS, STATE_NAMES, type RegionSlug } from "../geo/regions";
import { prepareDocs, type PreparedDoc, type SearchDoc } from "../search/catalog-search";
import { purchaseUrl } from "./commerce";
import { getStoreCollections } from "./collections-file";
import { DESIGN_FAMILIES, variantLabel } from "./families";
import { getCatalog, type Catalog } from "./repository";
import type { CityDesignBinding } from "./types";

/**
 * The searchable products of ONE region, built from the synced catalog snapshot (the same index the rest of the storefront renders from — no
 * second catalog, no INK call at request time). A product is searchable only when it has a verified INK purchase URL, so a result is always a
 * real, buyable card. Fields come only from data the catalog really carries:
 *   - city designs: family, city, UF/state, curated aliases, variant and locality labels;
 *   - merchandise (expressions, state lines, art prints…): the INK product name and slug;
 *   - collections: the name of a PUBLIC INK collection, for products that belong to it (see `collectionNamesByProduct`).
 * INK tags and descriptions are NOT part of the snapshot, so they are not searched (documented gap, never assumed).
 */
const familyById = new Map(DESIGN_FAMILIES.map((f) => [f.id, f]));

/** Product id -> names of the PUBLIC INK collections it belongs to. Only collections whose membership is stored COMPLETELY count: the snapshot keeps the
 * first 48 members of a collection, so matching a bigger one by name would return an arbitrary slice and a misleading total. */
function collectionNamesByProduct(region: RegionSlug): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const record of getStoreCollections(REGIONS[region].storeKey)?.collections ?? []) {
    if (!record.isAvailable || record.needsResync || record.memberIds.length === 0 || record.memberIds.length !== record.matchedCount) continue;
    for (const id of record.memberIds) out.set(id, [...(out.get(id) ?? []), record.name]);
  }
  return out;
}

function cityDoc(binding: CityDesignBinding, tier: number, collections: Map<string, string[]>): SearchDoc | null {
  const href = purchaseUrl(binding);
  const city = cityById(binding.cityId);
  const family = familyById.get(binding.designFamily);
  if (!href || !city || !family) return null;
  const label = binding.localityLabel ?? (binding.isPrimary ? null : binding.variantLabel ?? variantLabel(binding.designVariant));
  const stateName = STATE_NAMES[city.uf] ?? "";
  return {
    id: binding.inkProductId,
    kind: "city-design",
    title: label ? `${family.name} · ${label}` : family.name,
    context: `${binding.localityLabel ?? city.name} · ${city.uf}`,
    imageUrl: binding.imageUrl,
    price: binding.price,
    href,
    uf: city.uf,
    sales: binding.totalSalesCount ?? 0,
    // Tier first (primary, then variants, then localities), then the families in the storefront's own commercial order.
    order: tier * 10 + family.sortOrder,
    strong: [family.name, `${family.name} ${city.name}`, city.name, ...city.aliases, ...(binding.localityLabel ? [binding.localityLabel] : []), ...(label ? [label] : []), ...(collections.get(binding.inkProductId) ?? [])],
    // State only: the mesoregion ("Grande Florianópolis") and the family blurb are editorial text, not product facts; matching them would list
    // every neighbouring city's design under a search for one city.
    weak: [stateName, city.uf],
  };
}

function build(catalog: Catalog, region: RegionSlug): PreparedDoc[] {
  const collections = collectionNamesByProduct(region);
  const docs: SearchDoc[] = [];
  const seen = new Set<string>();
  const push = (doc: SearchDoc | null) => {
    if (doc && !seen.has(doc.id)) {
      seen.add(doc.id);
      docs.push(doc);
    }
  };

  for (const cityId of catalog.coveredCityIds(region)) {
    for (const entry of catalog.cityFamilies(cityId)) {
      // Every real product stays searchable: the primary first, the variants right after it and labelled, never hidden.
      push(cityDoc(entry.primary, 0, collections));
      for (const variant of entry.variants) push(cityDoc(variant, 1, collections));
    }
    for (const locality of catalog.cityLocalities(cityId)) push(cityDoc(locality, 2, collections));
  }

  for (const product of catalog.merch(region)) {
    const href = purchaseUrl(product);
    if (!href) continue;
    const title = product.name.replace(/\s+/g, " ").trim();
    push({
      id: product.inkProductId,
      kind: "merch",
      title,
      context: null,
      imageUrl: product.imageUrl,
      price: product.price,
      href,
      uf: null,
      sales: product.totalSalesCount,
      order: 0,
      strong: [title, ...(collections.get(product.inkProductId) ?? [])],
      weak: [product.slug],
    });
  }
  return prepareDocs(docs);
}

const cache = new Map<RegionSlug, { catalog: Catalog; collectionsKey: string; docs: PreparedDoc[] }>();

/** Cached per region; rebuilt when the catalog snapshot (a new `Catalog` object) or the collections snapshot changes. */
export function regionSearchDocs(region: RegionSlug): PreparedDoc[] {
  const catalog = getCatalog();
  const store = getStoreCollections(REGIONS[region].storeKey);
  const collectionsKey = store ? `${store.syncedAt}:${store.collections.length}` : "none";
  const hit = cache.get(region);
  if (hit && hit.catalog === catalog && hit.collectionsKey === collectionsKey) return hit.docs;
  const docs = build(catalog, region);
  cache.set(region, { catalog, collectionsKey, docs });
  return docs;
}
