import type { MerchProduct } from "../catalog/types";

/**
 * "Feito Para Você": the real "Lenda" line ("Pai Gaúcho Pescador Churrasqueiro | Lenda", "Mãe Gaúcha Gremista |
 * Lenda", ...) — verified to be exactly the live store's "Feito Para Você" collection (editorial/collections.ts).
 * Never Ponto de Origem or any city/map personalization: this line is about who wears it (Pai/Mãe/Marido/
 * Esposa/Filho), not a personalized city product (CLAUDE_HOME_LENDA_ORDER_VIEW_ALL.md).
 *
 * No hardcoded id list: matched by the real "| Lenda" suffix in the product name, same pattern INK uses. `merch`
 * is already sorted by real sales (repository.ts), so `count` picks the best-selling ones first — a real
 * popularity signal, not an invented order.
 */
export function lendaProducts(merch: readonly MerchProduct[], count = 6): MerchProduct[] {
  const lenda = merch.filter((m) => /\|\s*Lenda\s*$/i.test(m.name.trim()));
  return lenda.slice(0, count);
}
