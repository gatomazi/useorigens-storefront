import "server-only";
import { ConfigError } from "../config/env";
import type { CommerceStoreKey } from "../geo/regions";

/**
 * Regional INK stores that exist today. Credentials are server-only (never NEXT_PUBLIC_*).
 * When the operation consolidates, add "use-origens" here and reorder COMMERCE_STORE_PRIORITY.
 */
export const INK_STORES: Readonly<
  Partial<Record<CommerceStoreKey, { tokenEnv: string; expectedStoreSlug: string }>>
> = {
  "use-sul": { tokenEnv: "INK_TOKEN_SUL", expectedStoreSlug: "usesul" },
  "use-norte": { tokenEnv: "INK_TOKEN_NORTE", expectedStoreSlug: "usenorte" },
  "use-centro": { tokenEnv: "INK_TOKEN_CENTRO", expectedStoreSlug: "usecentro" },
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
export const ALLOWED_COMMERCE_HOSTS: ReadonlySet<string> = new Set([
  "www.usesul.com.br",
  "www.usenorte.com.br",
  "www.usecentro.com.br",
  "loja.useorigens.com.br",
]);

export function tokenFor(storeKey: CommerceStoreKey): string | null {
  const env = INK_STORES[storeKey]?.tokenEnv;
  const token = env ? process.env[env] : undefined;
  return token && token.length > 0 ? token : null;
}
