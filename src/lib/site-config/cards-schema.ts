/**
 * Contract of the store-wide setting of the product cards (types + strict validator). Dependency-light on purpose, like `navigation-schema.ts`:
 * `schema.ts` imports it, so it must not import anything that imports `schema.ts` back (no import cycle).
 */
import type { PublishedBundle, Scope, ValidationResult } from "./schema";

export const DEFAULT_BUY_LABEL = "Ver produto";
export const MAX_BUY_LABEL = 20;

/**
 * GLOBAL only ("Use Origens", every region): `buyLabel` = a buy button with this text under EVERY product card of the store (the product sections,
 * the collection pages, the styles of a city, the search results, the Uma Penca articles). Absent = each section decides, as before. A section that
 * set a text of its own keeps it.
 */
export type CardsConfig = { buyLabel: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// Printable text only: a label is rendered into a link, never interpreted; control characters and line breaks are refused.
const CONTROL = /[\u0000-\u001f\u007f]/;

export function validateCards(input: unknown, scope: Scope, path = "cards"): ValidationResult<CardsConfig> {
  const errors: string[] = [];
  if (scope !== "global") return { ok: false, errors: [`${path}: belongs to the global scope (every region)`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { buyLabel }`] };
  for (const key of Object.keys(input)) if (key !== "buyLabel") errors.push(`${path}.${key}: unknown field`);
  const label = input.buyLabel;
  if (typeof label !== "string" || label.trim().length === 0 || label.length > MAX_BUY_LABEL || label.trim() !== label || CONTROL.test(label)) {
    errors.push(`${path}.buyLabel: a label of 1 to ${MAX_BUY_LABEL} characters`);
  }
  return errors.length === 0 ? { ok: true, value: input as CardsConfig } : { ok: false, errors };
}

/** The store-wide buy button of the product cards (global `cards.buyLabel`) in a bundle, or undefined: each section decides. */
export const cardButtonOf = (bundle: PublishedBundle | null | undefined): string | undefined => bundle?.docs.global?.cards?.buyLabel;
