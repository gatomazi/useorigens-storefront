/**
 * What a "Compartilhar" action sends: a clean public URL, a title and a short text. Pure and client-safe (no
 * `server-only` import), so it is unit-tested directly; the server wrappers in `./server.ts` feed it the real host
 * allowlist and site origin.
 *
 * The URL is ALWAYS rebuilt from an allowlist (scheme + host + path), never copied from `location.href`: every query
 * parameter and fragment is dropped, so `cart_ref`, `ls`, `origens_*`, `peca`, utm tags, session ids or anything the
 * sender's own navigation carried can never leak into what they share. When the destination cannot be verified the
 * answer is `null` and the caller offers no share action at all — never a substitute link (home, city, another piece).
 */

export type ShareKind = "product" | "design" | "page";

export type SharePayload = {
  url: string;
  /** What is shared, as people read it ("Ponto de Origem – Florianópolis") — the icon button's accessible name. */
  name: string;
  title: string;
  text: string;
  /** Button label: "Compartilhar" or, for a grouped design (family page with versions), "Compartilhar estampa". */
  label: string;
  /** GA4 `content_type` — never the URL. */
  kind: ShareKind;
  /** GA4 `item_id`: the INK product id or the page path, never a URL with parameters. */
  itemId: string;
};

/** An INK product path: `/<store base>/product/<slug>` (e.g. `/usesul/product/florianopolis-origem-sc-0faeb956-…`). */
const INK_PRODUCT_PATH = /^\/[a-z0-9][a-z0-9-]{0,63}\/product\/[a-z0-9][a-z0-9_-]{0,159}$/;

/**
 * The public INK product page for a verified `store_product_url`, or `null`. https only, host in `allowedHosts`
 * (the project's commerce allowlist), path shaped like a product page; query and hash removed.
 */
export function cleanInkProductUrl(raw: string | null | undefined, allowedHosts: ReadonlySet<string>): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!allowedHosts.has(url.host)) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (!INK_PRODUCT_PATH.test(path)) return null;
  return `https://${url.host}${path}`;
}

/** A storefront page's canonical public URL: `siteUrl` origin + an absolute path, no query or hash. */
export function storefrontShareUrl(siteUrl: string, path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  let origin: URL;
  try {
    origin = new URL(siteUrl);
  } catch {
    return null;
  }
  if (origin.protocol !== "https:" && origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1") return null;
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return `${origin.origin}${clean}`;
}

/** INK `product_type.id`s that are t-shirts ("Olha essa camiseta…"); every other piece gets the neutral sentence. */
const TSHIRT_TYPE_IDS: ReadonlySet<number> = new Set([1, 72, 178, 2]);

/** Suggested message. `garmentTypeId` absent = the classic piece (a family's primary binding). */
export function productShareText(name: string, garmentTypeId?: number): string {
  return TSHIRT_TYPE_IDS.has(garmentTypeId ?? 1) ? `Olha essa camiseta da Use Origens: ${name}` : `Olha o que encontrei na Use Origens: ${name}`;
}

export function pageShareText(name: string): string {
  return `Olha o que encontrei na Use Origens: ${name}`;
}

/** `https://wa.me/?text=…` — the official click-to-chat link with no recipient: the person picks who receives it. */
export function whatsappShareHref(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}
