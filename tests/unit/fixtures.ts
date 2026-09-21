import type { InkProductNormalized } from "@/lib/catalog/types";
import type { CommerceStoreKey } from "@/lib/geo/regions";

let nextId = 1000;

/** Builds a normalized INK product with sensible defaults; override what the test cares about. */
export function product(
  name: string,
  overrides: Partial<InkProductNormalized> & { storeKey?: CommerceStoreKey } = {},
): InkProductNormalized {
  const id = overrides.id ?? String(nextId++);
  return {
    id,
    storeKey: "use-sul",
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    storeProductUrl: `https://www.usesul.com.br/usesul/product/${id}`,
    imageUrl: `https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/${id}.jpg`,
    price: 109.9,
    tags: [],
    clusterId: null,
    totalSalesCount: 0,
    createdAt: null,
    ...overrides,
  };
}
