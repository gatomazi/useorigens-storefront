import type { MerchProduct } from "../catalog/types";
import { STATE_NAMES } from "../geo/regions";

/** Clean state lines approved for the home. "Made in" (flag colors) is deliberately not one of them. */
const LINE_PREFERENCE = ["Clean", "Minimal", "Escritas", "Atlas do Sul"] as const;

export type StateLineProduct = { line: string; product: MerchProduct };

/**
 * The state's own product: `<State name> | <Line>` for the preferred lines, in fixed preference order.
 * Only the full state name counts ("RS | Minimal" is a duplicate abbreviation and is ignored).
 */
export function stateLineProduct(merch: readonly MerchProduct[], uf: string): StateLineProduct | null {
  const stateName = STATE_NAMES[uf];
  if (!stateName) return null;
  for (const line of LINE_PREFERENCE) {
    const expected = `${stateName} | ${line}`.toLowerCase();
    const hit = merch.find((m) => m.name.replace(/\s+/g, " ").trim().toLowerCase() === expected);
    if (hit) return { line, product: hit };
  }
  return null;
}
