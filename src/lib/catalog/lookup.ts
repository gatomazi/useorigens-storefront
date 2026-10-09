import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { purchaseUrl } from "./commerce";
import { familyById, variantLabel } from "./families";
import { isSubLocality, localityOfBinding } from "./locality-binding";
import { getCatalog } from "./repository";
import { canonicalRef } from "./references";

export type ProductDisplay = {
  /** The product actually served — in single-store mode an old regional ref resolves to its confirmed new id (references.ts). */
  inkProductId: string;
  /** Store that sells it: where a list session must be minted, whatever store the caller's reference came from. */
  commerceStoreKey: CommerceStoreKey;
  title: string;
  context: string | null;
  imageUrl: string;
  price: number | null;
  /** Verified purchase link, or null when INK's own URL can't be trusted (never a CTA in that case). */
  url: string | null;
};

/**
 * The one place that turns `(store, inkProductId)` into what a card shows and where it links — used by favorites'
 * refresh, buy-session creation and the Worker-facing next-item lookup, so all three agree on title/URL rules with
 * `FamilyCard`/`search-docs.ts`. Returns null only when the product is gone from the synced catalog (delisted,
 * removed, or never existed): the caller decides how to represent that ("indisponível", skip, etc.), this function
 * never invents a fallback.
 */
export function resolveProductDisplay(requestedStore: CommerceStoreKey, requestedId: string): ProductDisplay | null {
  const ref = canonicalRef({ store: requestedStore, id: requestedId });
  if (!ref) return null; // an old regional id with no confirmed row in the old → new map: unavailable, never guessed
  const { store: storeKey, id: inkProductId } = ref;
  const { merch, cityDesigns } = getCatalog().productsOfStore(storeKey);

  const binding = cityDesigns.get(inkProductId);
  if (binding) {
    // The place a product is about: its administrative region (Taguatinga), else its municipality. Never Brasília for an RA product.
    const place = localityOfBinding(binding);
    const family = familyById(binding.designFamily);
    if (!place || !family) return null;
    const inside = isSubLocality(binding) ? binding.localityLabel : undefined;
    // `productsOfStore` returns UNRANKED bindings (no `isPrimary`: that is only computed across stores at rank
    // time). "base" is every family's default variant (see families.ts#VARIANT_ORDER), so it doubles as "this is
    // the plain representation, no extra label" here — good enough for a secondary display context like this.
    const label = inside ?? (binding.designVariant === "base" ? null : (binding.variantLabel ?? variantLabel(binding.designVariant)));
    return {
      inkProductId,
      commerceStoreKey: storeKey,
      title: label ? `${family.name} · ${label}` : family.name,
      context: `${inside ?? place.name} · ${place.uf}`,
      imageUrl: binding.imageUrl,
      price: binding.price,
      url: purchaseUrl(binding),
    };
  }

  const product = merch.get(inkProductId);
  if (!product) return null;
  return {
    inkProductId,
    commerceStoreKey: storeKey,
    title: product.name.replace(/\s+/g, " ").trim(),
    context: null,
    imageUrl: product.imageUrl,
    price: product.price,
    url: purchaseUrl(product),
  };
}
