const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formats exactly what INK returned. Returns null when INK gave no price (never invents one). */
export function formatPrice(price: number | null): string | null {
  return price === null ? null : brl.format(price);
}

/** INK's regular price, formatted, ONLY while a promotion is on (shown struck through before the price); undefined otherwise. */
export function formatListPrice(product: { listPrice?: number }): string | undefined {
  return product.listPrice === undefined ? undefined : brl.format(product.listPrice);
}

/**
 * The "% OFF" of a product on promotion, as INK's own page shows it: the discount over the regular price, TRUNCATED to a whole percent (checked
 * on the live stores on 2026-10-10: 104,90 → 94,90 is "9% OFF", 104,90 → 89,90 "14% OFF", 109,90 → 89,90 "18% OFF"). Worked out in whole cents
 * so an exact 20% never comes out as 19. Undefined without a promotion or under 1%.
 */
export function discountPercent(product: { price: number | null; listPrice?: number }): number | undefined {
  if (product.price === null || product.listPrice === undefined) return undefined;
  const list = Math.round(product.listPrice * 100);
  const now = Math.round(product.price * 100);
  if (list <= 0 || now >= list) return undefined;
  const percent = Math.floor(((list - now) * 100) / list);
  return percent >= 1 ? percent : undefined;
}

export const numberPt = new Intl.NumberFormat("pt-BR");

/** "1 cidade" / "2 cidades" — correct singular/plural, never a bare number glued to "cidades". */
export function pluralCidades(n: number): string {
  return `${numberPt.format(n)} ${n === 1 ? "cidade" : "cidades"}`;
}
