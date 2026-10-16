/**
 * Domain of the single store (the Use Sul on INK). It moves from www.usesul.com.br/usesul to loja.useorigens.com.br/useorigens: the SAME INK store
 * (same products, slugs, variants and orders), only host, prefix and store slug change. `NEXT_PUBLIC_INK_SUL_DOMAIN=next` switches every link the
 * storefront builds; anything else (or unset) keeps today's domain. Client-safe: NEXT_PUBLIC_* is inlined at `next build`, so a change needs a new build.
 * The Worker switches with SINGLE_STORE_DOMAIN=next (worker-lojas docs/mudanca-dominio-loja-unica.md). Both domains are always ACCEPTED when
 * verifying a URL INK sent (see `acceptedStoreProductBases`), so a sync that runs between the INK switch and this flag never drops a piece.
 */
export const SUL_INK_DOMAINS = {
  current: { host: "www.usesul.com.br", base: "/usesul", storeSlug: "usesul" },
  next: { host: "loja.useorigens.com.br", base: "/useorigens", storeSlug: "useorigens" },
} as const;

export type SulInkDomainKey = keyof typeof SUL_INK_DOMAINS;
export const sulInkDomainKey = (raw: string | undefined = process.env.NEXT_PUBLIC_INK_SUL_DOMAIN): SulInkDomainKey => (raw?.trim() === "next" ? "next" : "current");

/** The domain the storefront links to now. */
export const SUL_INK = SUL_INK_DOMAINS[sulInkDomainKey()];
export const SUL_INK_ORIGIN = `https://${SUL_INK.host}`;
/** Both domains, the active one first. */
export const SUL_INK_ALL = [SUL_INK, ...Object.values(SUL_INK_DOMAINS).filter((d) => d !== SUL_INK)] as const;
