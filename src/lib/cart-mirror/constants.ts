/** Client-safe: imported by browser code too, so it must not pull in server-only modules (`@/lib/site` does). */
export const INK_SUL_ORIGIN = "https://www.usesul.com.br";

/** Query parameter the INK-side loader appends to its own links to /sul (docs/storefront-cart-mirror-contract.md). */
export const CART_REF_PARAM = "cart_ref";

/** Opaque token: 16 random bytes, base64url without padding. */
export const CART_REF_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** The ONLY thing kept in sessionStorage: the token, never the snapshot. */
export const CART_REF_STORAGE_KEY = "origens:cart_ref";

/** A snapshot older than this is discarded (the Worker's own TTL is the same 30 minutes). */
export const MAX_SNAPSHOT_AGE_SECONDS = 1800;

/** Up to this age the label says "poucos segundos" instead of a minute count. */
export const FRESH_SECONDS = 30;

export const UPSTREAM_TIMEOUT_MS = 2000;
export const UPSTREAM_MAX_BODY_BYTES = 16 * 1024;
export const MAX_ITEMS = 20;

/** Fixed origin: the browser never talks to it, only our server route does. */
export const UPSTREAM_CART_REF_URL = `${INK_SUL_ORIGIN}/__origens/cart-ref/`;

/** Opens the page the INK-side loader recognises and turns into the native cart drawer. */
export const INK_CART_URL = `${INK_SUL_ORIGIN}/usesul/product/serra-catarinense?origens_open_cart=1`;

/** INK image CDN. Only `/images/product_art/**` is added to next.config for the mirror. */
export const INK_IMAGE_HOST = "gcp-images.majestic.ink.rsvcloud.com";
export const INK_IMAGE_PATH_PREFIX = "/images/product_art/";
