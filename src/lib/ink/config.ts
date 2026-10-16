import "server-only";
import { ConfigError } from "../config/env";
import type { CommerceStoreKey } from "../geo/regions";
import { INK_COMMERCE_HOSTS } from "./hosts";
import { SUL_INK, SUL_INK_ALL, SUL_INK_ORIGIN } from "./sul-domain";

/**
 * Regional INK stores that exist today. Credentials are server-only (never NEXT_PUBLIC_*).
 * When the operation consolidates, add "use-origens" here and reorder COMMERCE_STORE_PRIORITY.
 */
export const INK_STORES: Readonly<
  Partial<Record<CommerceStoreKey, { tokenEnv: string; writeTokenEnv: string; expectedStoreSlug: string }>>
> = {
  "use-sul": { tokenEnv: "INK_TOKEN_SUL", writeTokenEnv: "INK_WRITE_TOKEN_SUL", expectedStoreSlug: SUL_INK.storeSlug },
  "use-norte": { tokenEnv: "INK_TOKEN_NORTE", writeTokenEnv: "INK_WRITE_TOKEN_NORTE", expectedStoreSlug: "usenorte" },
  "use-centro": { tokenEnv: "INK_TOKEN_CENTRO", writeTokenEnv: "INK_WRITE_TOKEN_CENTRO", expectedStoreSlug: "usecentro" },
};

function validatedInkApiBaseUrl(): string {
  const raw = process.env.INK_API_BASE_URL;
  if (!raw) return "https://api.reserva.ink";
  try {
    new URL(raw);
    return raw;
  } catch {
    throw new ConfigError("INK_API_BASE_URL", "must be a valid absolute URL, e.g. https://api.reserva.ink");
  }
}

export const INK_API_BASE_URL = validatedInkApiBaseUrl();

/** Hosts a purchase link may point to. Anything else is treated as a broken destination. */
export const ALLOWED_COMMERCE_HOSTS: ReadonlySet<string> = new Set(INK_COMMERCE_HOSTS);

/**
 * Public product-URL prefix of each store: `<base>/<slug>` is exactly INK's `store_product_url` (verified
 * against every stored piece). The compact garment index keeps only the slug and rebuilds the URL from this
 * map; a piece whose real URL does not have that shape is excluded at write time (never guessed).
 * Every host here must also be in `ALLOWED_COMMERCE_HOSTS` (unit-tested).
 */
export const STORE_PRODUCT_URL_BASE: Readonly<Partial<Record<CommerceStoreKey, string>>> = {
  "use-sul": `${SUL_INK_ORIGIN}${SUL_INK.base}/product`,
  "use-norte": "https://www.usenorte.com.br/usenorte/product",
  "use-centro": "https://www.usecentro.com.br/usecentro/product",
};

/**
 * Every product-URL prefix INK may send for a store, the active one first. The single store answers on two domains around its move
 * (src/lib/ink/sul-domain.ts): a URL of either is INK's own and is accepted; links are always REBUILT from `STORE_PRODUCT_URL_BASE` (the active one).
 */
export function acceptedStoreProductBases(storeKey: CommerceStoreKey): readonly string[] {
  if (storeKey === "use-sul") return SUL_INK_ALL.map((d) => `https://${d.host}${d.base}/product`);
  const base = STORE_PRODUCT_URL_BASE[storeKey];
  return base ? [base] : [];
}

/** INK's own store slug for a product of `storeKey` (both slugs of the single store around its move). */
export function storeSlugMatches(storeKey: CommerceStoreKey, slug: unknown): boolean {
  if (storeKey === "use-sul") return SUL_INK_ALL.some((d) => d.storeSlug === slug);
  return slug === INK_STORES[storeKey]?.expectedStoreSlug;
}

export function tokenFor(storeKey: CommerceStoreKey): string | null {
  const env = INK_STORES[storeKey]?.tokenEnv;
  const token = env ? process.env[env] : undefined;
  return token && token.length > 0 ? token : null;
}

/**
 * The credential with WRITE scopes, used only by the MCP's confirmed changes (docs/mcp/README.md §9): kept apart from the read token the
 * syncs use, so the storefront never holds write power and removing this variable switches every write off for that store.
 */
export function writeTokenFor(storeKey: CommerceStoreKey): string | null {
  const env = INK_STORES[storeKey]?.writeTokenEnv;
  const token = env ? process.env[env] : undefined;
  return token && token.length > 0 ? token : null;
}
