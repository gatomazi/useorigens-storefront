const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formats exactly what INK returned. Returns null when INK gave no price (never invents one). */
export function formatPrice(price: number | null): string | null {
  return price === null ? null : brl.format(price);
}

export const numberPt = new Intl.NumberFormat("pt-BR");

/** "1 cidade" / "2 cidades" — correct singular/plural, never a bare number glued to "cidades". */
export function pluralCidades(n: number): string {
  return `${numberPt.format(n)} ${n === 1 ? "cidade" : "cidades"}`;
}
