/**
 * Contract of the store-wide setting of the product cards (types + strict validator). Dependency-light on purpose, like `navigation-schema.ts`:
 * `schema.ts` imports it, so it must not import anything that imports `schema.ts` back (no import cycle).
 */
import type { PublishedBundle, Scope, ValidationResult } from "./schema";

export const DEFAULT_BUY_LABEL = "Ver produto";
export const MAX_BUY_LABEL = 20;

/**
 * How a card shows its buy button: "button" = the bar under the price (the default, also when absent); "fab" = a small round cart button over the
 * bottom-right corner of the picture, with the label as its accessible name and tooltip. Both are part of the card's own link: same store page,
 * same click reported.
 */
export const CARD_BUY_STYLES = ["button", "fab"] as const;
export type CardBuyStyle = (typeof CARD_BUY_STYLES)[number];
/** What a card draws: the label and its style, resolved from the section's own choice or the store-wide one. */
export type CardBuy = { label: string; style: CardBuyStyle };
/** A label (absent = no button) and a style (absent = "button") as a `CardBuy`. */
export const cardBuy = (label: string | undefined, style?: CardBuyStyle): CardBuy | undefined => (label ? { label, style: style ?? "button" } : undefined);

/**
 * GLOBAL only ("Use Origens", every region): `buyLabel` = a buy button with this text under EVERY product card of the store (the product sections,
 * the collection pages, the styles of a city, the search results, the Uma Penca articles). Absent = each section decides, as before. A section that
 * set a text of its own keeps it. `buyStyle`: "fab" puts it as a cart button on the picture; absent = the button under the price ("button" is
 * never stored, so the documents saved before the choice existed stay as they were).
 */
export type CardsConfig = { buyLabel: string; buyStyle?: CardBuyStyle };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// Printable text only: a label is rendered into a link, never interpreted; control characters and line breaks are refused.
const CONTROL = /[\u0000-\u001f\u007f]/;

export function validateCards(input: unknown, scope: Scope, path = "cards"): ValidationResult<CardsConfig> {
  const errors: string[] = [];
  if (scope !== "global") return { ok: false, errors: [`${path}: belongs to the global scope (every region)`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { buyLabel, buyStyle? }`] };
  for (const key of Object.keys(input)) if (key !== "buyLabel" && key !== "buyStyle") errors.push(`${path}.${key}: unknown field`);
  if (input.buyStyle !== undefined && !(CARD_BUY_STYLES as readonly unknown[]).includes(input.buyStyle)) errors.push(`${path}.buyStyle: ${CARD_BUY_STYLES.join(" | ")}`);
  const label = input.buyLabel;
  if (typeof label !== "string" || label.trim().length === 0 || label.length > MAX_BUY_LABEL || label.trim() !== label || CONTROL.test(label)) {
    errors.push(`${path}.buyLabel: a label of 1 to ${MAX_BUY_LABEL} characters`);
  }
  return errors.length === 0 ? { ok: true, value: input as CardsConfig } : { ok: false, errors };
}

/** The store-wide buy button of the product cards (global `cards`) in a bundle, or undefined: each section decides. */
export const cardButtonOf = (bundle: PublishedBundle | null | undefined): CardBuy | undefined => {
  const cards = bundle?.docs.global?.cards;
  return cardBuy(cards?.buyLabel, cards?.buyStyle);
};
