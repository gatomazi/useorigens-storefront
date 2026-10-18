/**
 * Contract of the store-wide "last card" of the product carousels (types + strict validator). Dependency-light on purpose, like `cards-schema.ts`:
 * `schema.ts` imports it, so it must not import anything that imports `schema.ts` back (no import cycle).
 */
import type { PublishedBundle, Scope, ValidationResult } from "./schema";

/** Where the number of products goes in the text. Optional: a text without it is shown as it is. */
export const COUNT_TOKEN = "{n}";
export const DEFAULT_CAROUSEL_END_LABEL = `Ver todas as ${COUNT_TOKEN} peças dessa coleção`;
export const MAX_CAROUSEL_END_LABEL = 60;

/**
 * GLOBAL only ("Use Origens", every region): `label` = one more card at the end of every product carousel that has a "Ver todos", opening the same
 * address, with this text. `{n}` is replaced by the number of products of the destination when it is known (a collection page of the site); where it
 * is not, the token and the space after it are dropped ("Ver todas as peças dessa coleção"). Absent = no last card, as before.
 */
export type CarouselEndConfig = { label: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// Printable text only: a label is rendered into a link, never interpreted; control characters and line breaks are refused.
const CONTROL = /[\u0000-\u001f\u007f]/;

export function validateCarouselEnd(input: unknown, scope: Scope, path = "carouselEnd"): ValidationResult<CarouselEndConfig> {
  const errors: string[] = [];
  if (scope !== "global") return { ok: false, errors: [`${path}: belongs to the global scope (every region)`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { label }`] };
  for (const key of Object.keys(input)) if (key !== "label") errors.push(`${path}.${key}: unknown field`);
  const label = input.label;
  if (typeof label !== "string" || label.trim().length === 0 || label.length > MAX_CAROUSEL_END_LABEL || label.trim() !== label || CONTROL.test(label)) {
    errors.push(`${path}.label: a label of 1 to ${MAX_CAROUSEL_END_LABEL} characters`);
  }
  return errors.length === 0 ? { ok: true, value: input as CarouselEndConfig } : { ok: false, errors };
}

/** The store-wide last card (global `carouselEnd`) in a bundle, or undefined: no last card. */
export const carouselEndOf = (bundle: PublishedBundle | null | undefined): CarouselEndConfig | undefined => bundle?.docs.global?.carouselEnd;

const numberPt = new Intl.NumberFormat("pt-BR");

/**
 * The text of the last card: `{n}` becomes the number of products ("1.234"), or, with no number known (or none at all), leaves with the space after it.
 * Pure. "Ver todas as {n} peças" → "Ver todas as 1.234 peças" / "Ver todas as peças".
 */
export function carouselEndText(label: string, count?: number | null): string {
  if (count !== undefined && count !== null && count > 0) return label.replaceAll(COUNT_TOKEN, numberPt.format(count));
  return label.replaceAll(`${COUNT_TOKEN} `, "").replaceAll(COUNT_TOKEN, "").replace(/\s{2,}/g, " ").trim();
}
