import { normalizeText } from "../geo/text";

/**
 * Editorial curation for the Sul. This file is the ONLY place where a human choice lives; everything else
 * is derived from real catalog data. Each block says whether it has been validated with the brand.
 */

/**
 * Hero trio: the three commercially strongest city families, one real product each, in this order.
 * Cities are spread over RS, PR and SC, chosen for how well each design reads at phone size:
 * the Ponto de Origem map is the most expressive in miniature (Porto Alegre's primary is also the navy shirt,
 * which adds colour to the row); Feito em and Coordenadas are typographic. City names are short on purpose: the
 * three captions share a ~106px column on a 375px phone ("Florianópolis" in the serif does not fit). Each entry is resolved from the
 * catalog at render time and dropped when it does not exist; nothing is invented.
 * DDD is no longer in the hero: it lives in the "O número de cada região" section.
 */
export const HERO_FAMILIES = [
  { family: "ponto-de-origem", uf: "rs", slug: "porto-alegre" },
  { family: "feito-em", uf: "pr", slug: "curitiba" },
  { family: "coordenadas", uf: "sc", slug: "joinville" },
] as const;

/**
 * Dizeres (real "| Dizeres" products) that can be shown WITH context. The catalog gives no state or city for
 * them, so this attribution is editorial.
 * PENDING VALIDATION with the brand: every entry below. Expressions without an entry are simply not shown.
 * Keys are normalized expression texts (no accents, lowercase, no punctuation).
 */
export const DIZERES_CONTEXT: Readonly<Record<string, { uf: string; place?: string }>> = {
  [normalizeText("Bah")]: { uf: "RS" },
  [normalizeText("Tchê")]: { uf: "RS" },
  [normalizeText("Ô piá")]: { uf: "PR" },
  [normalizeText("Talvez esteja em Jaraguá")]: { uf: "SC", place: "Jaraguá do Sul" },
};

/** Order in which the three states are listed everywhere they alternate (RS, SC, PR). */
export const STATE_ORDER = ["RS", "SC", "PR"] as const;
