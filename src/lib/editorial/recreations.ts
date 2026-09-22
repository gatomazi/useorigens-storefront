import type { MerchProduct } from "../catalog/types";

/**
 * Curated recreations/redesigns: real INK merch products that redesign a work, an icon or a reference with a
 * regional accent — a parallel editorial trail, never mixed with the eight city design families.
 *
 * This is the ONLY human curation for this section (docs/content/sul-recriations-audit.md has the full audit of
 * 28 products; these six are its "A — releitura forte" group, the ones that read as a real collection even
 * without explaining the reference). Each entry is resolved from the catalog by INK id at render time and
 * dropped when missing — nothing is invented, and the product's own art is never altered.
 *
 * `theme` describes the card's own visual content, not the work it recreates: the reference itself (band, film,
 * game, painting) is not named in public storefront copy, both to keep the copy accurate without a rights check
 * and because it reads better on its own regional terms. PENDING VALIDATION: which six lead, their order, and
 * whether any reference clears for direct naming later.
 */
export const RECREATIONS: readonly { inkProductId: string; theme: string }[] = [
  { inkProductId: "4933129", theme: "Colagem de cenas do litoral" },
  { inkProductId: "4933847", theme: "Retrato ao estilo pintura clássica" },
  { inkProductId: "4932866", theme: "Emblema com pinhão e rosas" },
  { inkProductId: "4932801", theme: "Ilustração noir com mate" },
  { inkProductId: "4934477", theme: "Cena de truco em quadrinho" },
  { inkProductId: "4932825", theme: "Ave símbolo do pampa" },
];

export type Recreation = { product: MerchProduct; theme: string };

/** Resolves the curated list against the real merch catalog, in the curated order, skipping anything missing. */
export function recreationProducts(merch: readonly MerchProduct[]): Recreation[] {
  const byId = new Map(merch.map((p) => [p.inkProductId, p]));
  return RECREATIONS.flatMap(({ inkProductId, theme }) => {
    const product = byId.get(inkProductId);
    return product ? [{ product, theme }] : [];
  });
}
