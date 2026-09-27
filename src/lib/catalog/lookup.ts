import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { cityById } from "../geo/cities";
import { purchaseUrl } from "./commerce";
import { familyById, variantLabel } from "./families";
import { getCatalog } from "./repository";

export type ProductDisplay = {
  inkProductId: string;
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
export function resolveProductDisplay(storeKey: CommerceStoreKey, inkProductId: string): ProductDisplay | null {
  const { merch, cityDesigns } = getCatalog().productsOfStore(storeKey);

  const binding = cityDesigns.get(inkProductId);
  if (binding) {
    const city = cityById(binding.cityId);
    const family = familyById(binding.designFamily);
    if (!city || !family) return null;
    // `productsOfStore` returns UNRANKED bindings (no `isPrimary`: that is only computed across stores at rank
    // time). "base" is every family's default variant (see families.ts#VARIANT_ORDER), so it doubles as "this is
    // the plain representation, no extra label" here — good enough for a secondary display context like this.
    const label = binding.localityLabel ?? (binding.designVariant === "base" ? null : (binding.variantLabel ?? variantLabel(binding.designVariant)));
    return {
      inkProductId,
      title: label ? `${family.name} · ${label}` : family.name,
      context: `${binding.localityLabel ?? city.name} · ${city.uf}`,
      imageUrl: binding.imageUrl,
      price: binding.price,
      url: purchaseUrl(binding),
    };
  }

  const product = merch.get(inkProductId);
  if (!product) return null;
  return {
    inkProductId,
    title: product.name.replace(/\s+/g, " ").trim(),
    context: null,
    imageUrl: product.imageUrl,
    price: product.price,
    url: purchaseUrl(product),
  };
}
