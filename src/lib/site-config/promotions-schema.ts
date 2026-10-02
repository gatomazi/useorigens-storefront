/**
 * Contract of the regional "Cupons e promoções" configuration (types + strict validator). Pure and dependency-light on purpose: `schema.ts`
 * imports it, so it must not import anything that imports `schema.ts` back (no import cycle).
 *
 * The CMS DESCRIBES a promotion; the INK EXECUTES it. Nothing here holds a discount rule, a value or a condition the storefront could compute:
 * every text is the owner's own words, shown as written, and a coupon `code` is only ever copied (never applied, never validated here).
 * The region of an item is the document it lives in (one document per region): an item can never be read by another region.
 */
import type { Scope, ValidationResult } from "./schema";

export const PROMOTION_TYPES = ["coupon", "promotion"] as const;
/** `coupon`: a copyable code. `promotion`: an announcement without a code (no "Copiar", not counted in the badge). */
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export type PromotionItem = {
  id: string;
  type: PromotionType;
  enabled: boolean;
  /** Main line of the card ("LEVE MAIS", "Semana do Frete Grátis"). */
  title: string;
  /** Coupons only: the exact code the "Copiar" button copies. */
  code?: string;
  /** What the offer is, in the owner's words ("3 peças: R$ 30 OFF · 4 peças: R$ 50 OFF"). */
  description: string;
  /** Optional line under the description ("Um cupom por pedido."). Absent = nothing is rendered, not even an empty line. */
  callout?: string;
  /** Coupons only: a small optional tag on the card ("Novo", "Só esta semana"). */
  badgeLabel?: string;
  /** Owner's order (smaller first; the editor writes 1..n). */
  order: number;
  /** Optional window, ISO 8601 with an explicit offset. Outside it the item is not public. */
  startsAt?: string;
  endsAt?: string;
};

export type PromotionsConfig = { items: PromotionItem[] };

export const MAX_PROMOTIONS = 20;
export const PROMO_LIMITS = { title: 60, code: 40, description: 200, callout: 160, badgeLabel: 24 } as const;
export const MAX_PROMO_ORDER = 999;
export const PROMO_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** What a checkout coupon field accepts in practice: letters, digits, "-" and "_". Kept exactly as typed (case included). */
export const PROMO_CODE = /^[A-Za-z0-9_-]{2,40}$/;
/** `2026-10-05T00:00:00-03:00`, `…Z` or with milliseconds: always an explicit offset, so the instant never depends on the server's timezone. */
export const PROMO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// Printable, single-line text only: it is rendered as text (never HTML); control characters and line breaks are refused.
const CONTROL = /[\u0000-\u001f\u007f]/;
const ITEM_KEYS = ["id", "type", "enabled", "title", "code", "description", "callout", "badgeLabel", "order", "startsAt", "endsAt"];

export const isPromoInstant = (v: unknown): v is string => typeof v === "string" && PROMO_INSTANT.test(v) && Number.isFinite(Date.parse(v));

function checkText(errors: string[], path: string, v: unknown, max: number): void {
  if (typeof v !== "string" || v.trim().length === 0 || v !== v.trim() || v.length > max || CONTROL.test(v)) errors.push(`${path}: a text of 1 to ${max} characters, one line, no leading or trailing spaces`);
}

function checkItem(errors: string[], path: string, v: unknown): void {
  if (!isRecord(v)) return void errors.push(`${path}: must be an object`);
  for (const key of Object.keys(v)) if (!ITEM_KEYS.includes(key)) errors.push(`${path}.${key}: unknown field`);
  if (typeof v.id !== "string" || !PROMO_ID.test(v.id)) errors.push(`${path}.id: invalid`);
  if (!(PROMOTION_TYPES as readonly unknown[]).includes(v.type)) errors.push(`${path}.type: coupon or promotion`);
  if (typeof v.enabled !== "boolean") errors.push(`${path}.enabled: must be boolean`);
  checkText(errors, `${path}.title`, v.title, PROMO_LIMITS.title);
  checkText(errors, `${path}.description`, v.description, PROMO_LIMITS.description);
  if (v.callout !== undefined) checkText(errors, `${path}.callout`, v.callout, PROMO_LIMITS.callout);
  if (v.type === "coupon") {
    if (typeof v.code !== "string" || !PROMO_CODE.test(v.code)) errors.push(`${path}.code: 2 to 40 letters, digits, "-" or "_"`);
    if (v.badgeLabel !== undefined) checkText(errors, `${path}.badgeLabel`, v.badgeLabel, PROMO_LIMITS.badgeLabel);
  } else {
    // A promotion has no code: it would read as a coupon to copy. Nor a coupon tag.
    if (v.code !== undefined) errors.push(`${path}.code: only coupons have a code`);
    if (v.badgeLabel !== undefined) errors.push(`${path}.badgeLabel: only coupons have a tag`);
  }
  if (typeof v.order !== "number" || !Number.isInteger(v.order) || v.order < 0 || v.order > MAX_PROMO_ORDER) errors.push(`${path}.order: an integer from 0 to ${MAX_PROMO_ORDER}`);
  if (v.startsAt !== undefined && !isPromoInstant(v.startsAt)) errors.push(`${path}.startsAt: a date and time with offset`);
  if (v.endsAt !== undefined && !isPromoInstant(v.endsAt)) errors.push(`${path}.endsAt: a date and time with offset`);
  if (isPromoInstant(v.startsAt) && isPromoInstant(v.endsAt) && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) errors.push(`${path}.endsAt: must be after startsAt`);
}

/** An empty list is valid (nothing to show: the storefront and the INK render no button at all). */
export function validatePromotions(input: unknown, scope: Scope, path = "promotions"): ValidationResult<PromotionsConfig> {
  const errors: string[] = [];
  if (scope === "global") return { ok: false, errors: [`${path}: promotions belong to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { items: [...] }`] };
  for (const key of Object.keys(input)) if (key !== "items") errors.push(`${path}.${key}: unknown field`);
  if (!Array.isArray(input.items) || input.items.length > MAX_PROMOTIONS) return { ok: false, errors: [...errors, `${path}.items: a list of at most ${MAX_PROMOTIONS} items`] };
  const ids = new Set<string>();
  input.items.forEach((item, i) => {
    checkItem(errors, `${path}.items[${i}]`, item);
    if (isRecord(item) && typeof item.id === "string") {
      if (ids.has(item.id)) errors.push(`${path}.items[${i}].id: duplicate`);
      ids.add(item.id);
    }
  });
  return errors.length === 0 ? { ok: true, value: input as PromotionsConfig } : { ok: false, errors };
}
