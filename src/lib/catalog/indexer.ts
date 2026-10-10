import { parseProductName, regionOfStore, resolveCity } from "./parse";
import { variantLabel } from "./families";
import type {
  ExcludedProduct,
  InkProductNormalized,
  MerchProduct,
  StoreIndex,
  UnrankedBinding,
} from "./types";
import type { CommerceStoreKey, RegionSlug } from "../geo/regions";

/**
 * Only the unified-store shadow read sets these (src/lib/catalog/unificado/): one INK store that holds several regions, so the UFs a city
 * may resolve in and the merchandise region come from the caller's trusted classification, not from the store. Omitted = production.
 */
export type IndexScope = { ufs: readonly string[]; region: RegionSlug };

/**
 * Turns one store's INK products into bindings + merchandise + an audit trail.
 * Every real product is preserved: nothing is dropped silently and nothing is guessed —
 * products that cannot be reconciled with a municipality are listed in `excluded`.
 */
export function buildStoreIndex(
  storeKey: CommerceStoreKey,
  products: readonly InkProductNormalized[],
  syncedAt: string,
  scope?: IndexScope,
): StoreIndex {
  const bindings: UnrankedBinding[] = [];
  const merch: MerchProduct[] = [];
  const excluded: ExcludedProduct[] = [];
  const region = scope?.region ?? regionOfStore(storeKey);

  for (const product of products) {
    const parsed = parseProductName(product.name);

    if (parsed.kind === "other") {
      if (region) {
        merch.push({
          inkProductId: product.id,
          commerceStoreKey: storeKey,
          regionSlug: region,
          name: product.name.replace(/\s+/g, " ").trim(),
          slug: product.slug,
          storeProductUrl: product.storeProductUrl,
          imageUrl: product.imageUrl,
          price: product.price,
          totalSalesCount: product.totalSalesCount,
          ...(product.clusterId ? { productClusterId: product.clusterId } : {}),
          syncedAt,
        });
      }
      continue;
    }

    if (parsed.kind === "unclassified") {
      excluded.push({
        inkProductId: product.id,
        commerceStoreKey: storeKey,
        name: product.name,
        reason: "unclassified-family",
        detail: parsed.label,
      });
      continue;
    }

    const resolution = resolveCity(parsed, product, scope?.ufs);
    if (!resolution.ok) {
      excluded.push({
        inkProductId: product.id,
        commerceStoreKey: storeKey,
        name: product.name,
        reason: resolution.reason,
        detail: resolution.detail,
      });
      continue;
    }

    const { city, localityLabel, localityId } = resolution;
    bindings.push({
      cityId: city.id,
      designFamily: parsed.family,
      designVariant: parsed.variant,
      variantLabel: variantLabel(parsed.variant),
      ...(localityLabel ? { parentCityId: city.id, localityLabel } : {}),
      ...(localityId ? { localityId } : {}),
      ...(product.clusterId ? { productClusterId: product.clusterId } : {}),
      commerceStoreKey: storeKey,
      inkProductId: product.id,
      slug: product.slug,
      storeProductUrl: product.storeProductUrl,
      imageUrl: product.imageUrl,
      price: product.price,
      syncedAt,
      totalSalesCount: product.totalSalesCount,
    });
  }

  return { commerceStoreKey: storeKey, syncedAt, productCount: products.length, bindings, merch, excluded };
}
