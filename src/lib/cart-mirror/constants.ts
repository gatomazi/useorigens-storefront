import type { RegionSlug } from "../geo/regions";

/** Client-safe: imported by browser code too, so it must not pull in server-only modules (`@/lib/site` does). */
export const INK_SUL_ORIGIN = "https://www.usesul.com.br";

/**
 * One INK store (and one Worker) per region. The cart token minted by a region's Worker lives in THAT Worker's KV only, so the storefront
 * must ask the same region's Worker for it and send the visitor back to the same region's INK cart. `cartPath` is a real product page
 * covered by that region's Worker (the loader turns `?origens_open_cart=1` there into the native cart drawer).
 */
export const CART_MIRROR_STORES: Readonly<Record<RegionSlug, { origin: string; cartPath: string }>> = {
  sul: { origin: INK_SUL_ORIGIN, cartPath: "/usesul/product/serra-catarinense" },
  norte: { origin: "https://www.usenorte.com.br", cartPath: "/usenorte/product/acara-origem-pa-51b9a32f-0281-478d-b641-77b8df830cc2" },
  "centro-oeste": { origin: "https://www.usecentro.com.br", cartPath: "/usecentro/product/goiania-origem-go" },
};
export const inkOriginFor = (region: RegionSlug): string => CART_MIRROR_STORES[region].origin;
/** Fixed origin per region: the browser never talks to it, only our server route does. */
export const upstreamCartRefUrlFor = (region: RegionSlug): string => `${CART_MIRROR_STORES[region].origin}/__origens/cart-ref/`;
/** Opens the page the region's INK-side loader recognises and turns into the native cart drawer. */
export const inkCartUrlFor = (region: RegionSlug): string => `${CART_MIRROR_STORES[region].origin}${CART_MIRROR_STORES[region].cartPath}?origens_open_cart=1`;

/** Query parameter the INK-side loader appends to its own links to /sul (docs/storefront-cart-mirror-contract.md). */
export const CART_REF_PARAM = "cart_ref";

/** Opaque token: 16 random bytes, base64url without padding. */
export const CART_REF_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** The ONLY thing kept in sessionStorage: the token, never the snapshot. One key per region (the Sul keeps the original key). */
export const CART_REF_STORAGE_KEY = "origens:cart_ref";
export const cartRefStorageKey = (region: RegionSlug): string => (region === "sul" ? CART_REF_STORAGE_KEY : `${CART_REF_STORAGE_KEY}:${region}`);

/** A snapshot older than this is discarded (the Worker's own TTL is the same 30 minutes). */
export const MAX_SNAPSHOT_AGE_SECONDS = 1800;

/** Up to this age the label says "poucos segundos" instead of a minute count. */
export const FRESH_SECONDS = 30;

export const UPSTREAM_TIMEOUT_MS = 2000;
export const UPSTREAM_MAX_BODY_BYTES = 16 * 1024;
export const MAX_ITEMS = 20;

/** Fixed origin: the browser never talks to it, only our server route does. */
export const UPSTREAM_CART_REF_URL = upstreamCartRefUrlFor("sul");

/** Opens the page the INK-side loader recognises and turns into the native cart drawer. */
export const INK_CART_URL = inkCartUrlFor("sul");

/** INK image CDN. Only `/images/product_art/**` is added to next.config for the mirror. */
export const INK_IMAGE_HOST = "gcp-images.majestic.ink.rsvcloud.com";
export const INK_IMAGE_PATH_PREFIX = "/images/product_art/";
