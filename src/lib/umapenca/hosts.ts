/**
 * Hosts an Uma Penca article may point to. Plain constants (no `server-only`): `next.config.ts` imports the image hosts
 * to open exactly these in `images.remotePatterns`, and the parser drops any item whose photo is not on one of them
 * (next/image would throw on it).
 */
export const UMAPENCA_IMAGE_HOSTS: readonly string[] = ["umapenca.imgix.net", "uma-penca.imgix.net"];

/** The Use Origens store on Uma Penca under our own domain: what the feed's `g:link` points to. */
export const UMAPENCA_STORE_HOST = "artigos.useorigens.com.br";

/**
 * The product link must be https on the store's own domain (`UMAPENCA_STORE_HOST`) or on umapenca.com (or a subdomain), where the same store
 * also answers. Anything else is treated as a broken destination.
 */
export function isUmaPencaProductUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (url.hostname === UMAPENCA_STORE_HOST || url.hostname === "umapenca.com" || url.hostname.endsWith(".umapenca.com"));
  } catch {
    return false;
  }
}

export function isUmaPencaImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && UMAPENCA_IMAGE_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}
