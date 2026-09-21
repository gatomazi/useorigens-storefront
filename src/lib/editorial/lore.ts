import { citiesByName, type City } from "../geo/cities";
import { STATE_NAMES } from "../geo/regions";
import { normalizeText } from "../geo/text";
import type { MerchProduct } from "../catalog/types";

export type CityLore = {
  product: MerchProduct;
  /** What is printed: the expression ("Tax Tolo") or the patron saint ("Nossa Senhora do Desterro"). */
  text: string;
  kind: "expressao" | "padroeiro";
  city: City;
};

export type StateLore = { product: MerchProduct; text: string; uf: string };

export type Lore = {
  byCity: Map<string, CityLore[]>;
  byState: StateLore[];
  /** Products where both sides could be a municipality, or neither. Never guessed, only reported. */
  skipped: { name: string; reason: "ambiguous" }[];
};

const SAINT = /^(nossa senhora|santa|santo|são|sagrado|senhor|bom jesus)\b/i;

/** Adjectives that name a state without ambiguity ("Litoral Catarinense" is Santa Catarina). */
const DEMONYM_STATE: readonly [RegExp, string][] = [
  [/catarinense$/i, "SC"],
  [/paranaense$/i, "PR"],
  [/(ga[uú]cho|rio-grandense)$/i, "RS"],
];

function city(side: string, ufs: readonly string[]): City | null | "ambiguous" {
  const matches = citiesByName(side, ufs);
  if (matches.length === 1) return matches[0];
  return matches.length > 1 ? "ambiguous" : null;
}

function stateOf(side: string): string | null {
  const key = normalizeText(side);
  const byName = Object.entries(STATE_NAMES).find(([, name]) => normalizeText(name) === key);
  if (byName) return byName[0];
  return DEMONYM_STATE.find(([re]) => re.test(side.trim()))?.[1] ?? null;
}

/**
 * Finds the real "local voice" products, respecting the two naming conventions in the catalog:
 *   `<Expression> | <City>`  (Tax Tolo | Florianópolis)
 *   `<City> | <Patron saint>` (Florianópolis | Nossa Senhora do Desterro)
 *   `<Expression> | <State or region>` (Bah Meu | Rio Grande do Sul)
 * A product only counts when exactly one side resolves to a municipality of the region's UFs. If both could be one
 * ("Foz do Iguaçu | São João Batista": São João Batista is also a city in SC) it is skipped, not guessed.
 */
export function buildLore(merch: readonly MerchProduct[], ufs: readonly string[]): Lore {
  const byCity = new Map<string, CityLore[]>();
  const byState: StateLore[] = [];
  const skipped: Lore["skipped"] = [];

  for (const product of merch) {
    const name = product.name.replace(/\s+/g, " ").trim();
    const parts = name.split("|").map((p) => p.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) continue;
    const [left, right] = parts;

    // State / region expression: the right side names a state, the left side is not a state or a city.
    const rightState = stateOf(right);
    if (rightState && !stateOf(left) && city(left, ufs) === null) {
      byState.push({ product, text: left, uf: rightState });
      continue;
    }

    const l = city(left, ufs);
    const r = city(right, ufs);
    if (l === "ambiguous" || r === "ambiguous" || (l && r)) {
      skipped.push({ name, reason: "ambiguous" });
      continue;
    }
    if (r && !l) {
      add(byCity, { product, text: left, kind: "expressao", city: r });
    } else if (l && !r && SAINT.test(right)) {
      add(byCity, { product, text: right, kind: "padroeiro", city: l });
    }
  }
  return { byCity, byState, skipped };
}

function add(map: Map<string, CityLore[]>, item: CityLore) {
  const list = map.get(item.city.id) ?? [];
  list.push(item);
  map.set(item.city.id, list);
}
