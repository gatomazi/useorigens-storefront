import { normalizeText } from "../geo/text";

/**
 * Editorial curation for the Sul. This file is the ONLY place where a human choice lives; everything else
 * is derived from real catalog data. Each block says whether it has been validated with the brand.
 */

/** Hero trio: one DDD product per state. Real products; captions always show number + region + state. */
export const HERO_DDD = [
  { code: "054", regionName: "Serra Gaúcha" },
  { code: "048", regionName: "Grande Florianópolis" },
  { code: "041", regionName: "Grande Curitiba" },
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

/**
 * Cities with real local-voice products, in the order they are featured. A city is only shown when the
 * catalog really has such a product for it (checked at render time), never from this list alone.
 * PENDING VALIDATION: the choice and order of featured cities.
 */
export const FEATURED_LORE_CITIES: readonly [uf: string, slug: string][] = [
  ["sc", "florianopolis"],
  ["sc", "blumenau"],
  ["pr", "curitiba"],
  ["pr", "foz-do-iguacu"],
];

/** Order in which the three states are listed everywhere they alternate (RS, SC, PR). */
export const STATE_ORDER = ["RS", "SC", "PR"] as const;
