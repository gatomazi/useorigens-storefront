import type { DesignFamilyId } from "../catalog/families";
import type { GarmentIndex } from "../catalog/garment-index-file";
import { localityKeyOf, withLocality } from "../catalog/locality-binding";
import { parseProductName, resolveCity } from "../catalog/parse";
import type { CatalogSnapshot, UnrankedBinding } from "../catalog/types";
import { cityById } from "../geo/cities";
import { localityById } from "../geo/localities";
import { UF_TO_REGION, type CommerceStoreKey, type RegionSlug } from "../geo/regions";

/**
 * Sold or listed product → the DESIGN it carries (UF, place, family), using only what the catalog already knows — the same rules as the
 * pódio (src/lib/podio/resolve.ts), without its one-region restriction, because one store may sell another region's designs (products
 * copied between stores keep their own store id; nothing is matched across stores by a similar name). Order:
 *   1. the product is a city design of the SAME store in the catalog snapshot (by INK product id);
 *   2. it is a garment-type sibling (Oversized, Body…) of one, linked ONLY by INK's `product_cluster_id` in the garment index;
 *   3. the deterministic name parser + city resolver of the indexer (`catalog/parse.ts`). A UF stated in the name is the design's UF even
 *      in another region's store; with no UF in the name, only the store's own UFs are tried. An ambiguous or unknown city is never guessed.
 * The buyer's address never decides anything here (that is the separate "cidade de entrega" dimension).
 */
export type DesignClassification =
  | {
      status: "classified";
      via: "catalog" | "garment-cluster" | "name";
      uf: string;
      region: RegionSlug | null;
      /** Locality key (IBGE municipality id or DF administrative-region id), null when only the UF is known. */
      localityKey: string | null;
      localityName: string | null;
      family: DesignFamilyId | null;
    }
  | { status: "unclassified"; reason: "not-a-city-design" | "unclassified-family" | "ambiguous-city" | "city-not-found" | "no-unambiguous-uf" };

export type CatalogContext = {
  bindingByProduct: ReadonlyMap<string, UnrankedBinding>;
  garmentParentByProduct: ReadonlyMap<string, UnrankedBinding>;
};

const key = (store: CommerceStoreKey, productId: string) => `${store}:${productId}`;

export function buildCatalogContext(snapshot: CatalogSnapshot, garments: GarmentIndex | null): CatalogContext {
  const bindingByProduct = new Map<string, UnrankedBinding>();
  const garmentParentByProduct = new Map<string, UnrankedBinding>();
  for (const [store, index] of Object.entries(snapshot.stores) as [CommerceStoreKey, CatalogSnapshot["stores"][CommerceStoreKey]][]) {
    if (!index) continue;
    const byCluster = new Map<string, UnrankedBinding>();
    for (const b of index.bindings) {
      const located = withLocality(b);
      bindingByProduct.set(key(store, b.inkProductId), located);
      // Only the family's main product represents the cluster; a variant never overrides it.
      if (b.productClusterId && (!byCluster.has(b.productClusterId) || b.designVariant === "base")) byCluster.set(b.productClusterId, located);
    }
    const clusters = garments?.stores[store]?.clusters ?? {};
    for (const [clusterId, pieces] of Object.entries(clusters)) {
      const parent = byCluster.get(clusterId);
      if (!parent) continue;
      for (const piece of pieces) garmentParentByProduct.set(key(store, piece[1]), parent);
    }
  }
  return { bindingByProduct, garmentParentByProduct };
}

function fromBinding(binding: UnrankedBinding, via: "catalog" | "garment-cluster"): DesignClassification {
  const localityKey = localityKeyOf(binding);
  const locality = localityById(localityKey) ?? cityById(binding.cityId);
  const uf = locality?.uf;
  if (!uf) return { status: "unclassified", reason: "no-unambiguous-uf" };
  return { status: "classified", via, uf, region: UF_TO_REGION[uf] ?? null, localityKey, localityName: locality?.name ?? null, family: binding.designFamily };
}

export function classifyProduct(store: CommerceStoreKey, product: { id: string; name: string; tags: readonly string[] }, ctx: CatalogContext): DesignClassification {
  const binding = ctx.bindingByProduct.get(key(store, product.id));
  if (binding) return fromBinding(binding, "catalog");
  const parent = ctx.garmentParentByProduct.get(key(store, product.id));
  if (parent) return fromBinding(parent, "garment-cluster");

  const parsed = parseProductName(product.name);
  if (parsed.kind === "other") return { status: "unclassified", reason: "not-a-city-design" };
  if (parsed.kind === "unclassified") return { status: "unclassified", reason: "unclassified-family" };
  const resolution = resolveCity(parsed, { tags: [...product.tags], storeKey: store }, parsed.uf ? [parsed.uf] : undefined);
  if (resolution.ok) {
    const localityKey = resolution.localityId ?? resolution.city.id;
    const uf = resolution.city.uf;
    return { status: "classified", via: "name", uf, region: UF_TO_REGION[uf] ?? null, localityKey, localityName: localityById(localityKey)?.name ?? resolution.city.name, family: parsed.family };
  }
  // City unknown or ambiguous: the family still counts for a UF the name STATES, never for one guessed from the store.
  if (parsed.uf && UF_TO_REGION[parsed.uf]) return { status: "classified", via: "name", uf: parsed.uf, region: UF_TO_REGION[parsed.uf], localityKey: null, localityName: null, family: parsed.family };
  if (resolution.reason === "ambiguous-city" || resolution.reason === "city-not-found") return { status: "unclassified", reason: resolution.reason };
  return { status: "unclassified", reason: "no-unambiguous-uf" };
}
