import "server-only";
import { ALLOWED_COMMERCE_HOSTS } from "@/lib/ink/config";
import { SITE_URL } from "@/lib/site";
import { cleanInkProductUrl, pageShareText, productShareText, storefrontShareUrl, type SharePayload } from "./url";

/**
 * Share payloads built on the server from canonical catalog data, so the client button already has its URL and text
 * before the click (the native share sheet must open straight from the tap, never after a fetch).
 */

/** A single real INK product: its public INK page (the storefront has no route that pins one product + its piece). */
export function inkProductShare(product: { inkProductId: string; storeProductUrl: string }, name: string, garmentTypeId?: number): SharePayload | null {
  const url = cleanInkProductUrl(product.storeProductUrl, ALLOWED_COMMERCE_HOSTS);
  if (!url) return null;
  return {
    url,
    name,
    title: `${name} | Use Origens`,
    text: productShareText(name, garmentTypeId),
    label: "Compartilhar",
    kind: "product",
    itemId: product.inkProductId,
  };
}

/** A grouped design (city + family, with its versions): the storefront family page, labelled "Compartilhar estampa". */
export function designShare(path: string, name: string): SharePayload | null {
  const url = storefrontShareUrl(SITE_URL, path);
  if (!url) return null;
  return { url, name, title: `${name} | Use Origens`, text: productShareText(name), label: "Compartilhar estampa", kind: "design", itemId: path };
}

/** A city or state page: its canonical public URL. */
export function pageShare(path: string, name: string): SharePayload | null {
  const url = storefrontShareUrl(SITE_URL, path);
  if (!url) return null;
  return { url, name, title: `${name} | Use Origens`, text: pageShareText(name), label: "Compartilhar", kind: "page", itemId: path };
}
