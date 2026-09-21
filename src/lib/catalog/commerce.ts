import { ALLOWED_COMMERCE_HOSTS } from "../ink/config";
import type { CityDesignBinding, MerchProduct } from "./types";

/**
 * Single place that turns a binding into a customer-facing purchase link.
 * The URL is exactly what INK returned (`store_product_url`); we only verify it is https and
 * points to a known commerce host, so a broken or foreign URL never becomes a CTA.
 * When commerce consolidates into loja.useorigens.com.br the binding simply carries the new URL.
 */
export function purchaseUrl(product: Pick<CityDesignBinding | MerchProduct, "storeProductUrl">): string | null {
  try {
    const url = new URL(product.storeProductUrl);
    if (url.protocol !== "https:") return null;
    return ALLOWED_COMMERCE_HOSTS.has(url.host) ? url.toString() : null;
  } catch {
    return null;
  }
}
