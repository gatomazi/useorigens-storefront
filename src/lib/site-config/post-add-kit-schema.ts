/**
 * Contract of the region's "Monte seu kit" (types + strict validator): the block the Worker draws in INK's "Produto adicionado ao carrinho" modal, built from
 * ONE progressive promotion of the INK store. Only the choice and the texts live here: the tiers, the code and the window are INK's, read live
 * (`src/lib/ink/progressive-promotions.ts`), so an edit of the promotion inside INK never leaves a stale discount on the page.
 * Dependency-light on purpose, like `top-bar-schema.ts`: `schema.ts` imports it, so it must not import anything that imports `schema.ts` back.
 */
import type { Scope, ValidationResult } from "./schema";

export type PostAddKitConfig = {
  /** Off = the modal stays as it is. Turning it off keeps the choice, so turning it back on needs no new pick. */
  enabled: boolean;
  /** INK id of the chosen progressive promotion (`GET /v1/stores/promotions/{id}`). Required while `enabled`. */
  promotionId?: number;
  /** The promotion's code when it was chosen: only a label for the panel and the publish list. What the customer sees is INK's live code. */
  promotionCode?: string;
  /** The owner's texts. Absent = the default copy (POST_ADD_KIT_DEFAULTS). */
  eyebrow?: string;
  title?: string;
  lead?: string;
};

export const POST_ADD_KIT_DEFAULTS = {
  eyebrow: "Economize montando seu kit",
  title: "Monte seu kit e pague menos",
  lead: "Você pode combinar produtos participantes. Os valores abaixo usam o preço atual deste produto como referência.",
} as const;
export const POST_ADD_KIT_LIMITS = { eyebrow: 40, title: 60, lead: 160 } as const;
export type PostAddKitText = keyof typeof POST_ADD_KIT_LIMITS;
export const POST_ADD_KIT_TEXTS = ["eyebrow", "title", "lead"] as const satisfies readonly PostAddKitText[];

/** The code exactly as INK keeps it (the same shape the coupons of "Cupons e promoções" accept). */
export const KIT_CODE = /^[A-Za-z0-9_-]{2,40}$/;
export const MAX_KIT_PROMOTION_ID = 2_147_483_647;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// Printable, single-line text only: the Worker writes it with textContent; `<` and `>` are refused too (defence in depth).
const CONTROL = /[\u0000-\u001f\u007f<>]/;
const KEYS = ["enabled", "promotionId", "promotionCode", ...POST_ADD_KIT_TEXTS];

export const kitTextOk = (v: unknown, max: number): v is string => typeof v === "string" && v.length >= 1 && v.length <= max && v === v.trim() && !CONTROL.test(v);
export const kitPromotionIdOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_KIT_PROMOTION_ID;

export function validatePostAddKit(input: unknown, scope: Scope, path = "postAddKit"): ValidationResult<PostAddKitConfig> {
  if (scope === "global") return { ok: false, errors: [`${path}: belongs to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { enabled, promotionId? }`] };
  const errors = Object.keys(input).filter((key) => !KEYS.includes(key)).map((key) => `${path}.${key}: unknown field`);
  if (typeof input.enabled !== "boolean") errors.push(`${path}.enabled: must be boolean`);
  if (input.promotionId !== undefined && !kitPromotionIdOk(input.promotionId)) errors.push(`${path}.promotionId: an INK promotion id`);
  if (input.enabled === true && input.promotionId === undefined) errors.push(`${path}.promotionId: required to turn it on`);
  if (input.promotionCode !== undefined && (typeof input.promotionCode !== "string" || !KIT_CODE.test(input.promotionCode))) errors.push(`${path}.promotionCode: invalid`);
  for (const key of POST_ADD_KIT_TEXTS) {
    const max = POST_ADD_KIT_LIMITS[key];
    if (input[key] !== undefined && !kitTextOk(input[key], max)) errors.push(`${path}.${key}: a text of 1 to ${max} characters, one line, no leading or trailing spaces`);
  }
  return errors.length === 0 ? { ok: true, value: input as PostAddKitConfig } : { ok: false, errors };
}

/** The texts the block shows: the owner's, or the default of each one left empty. */
export const kitTexts = (config: Pick<PostAddKitConfig, PostAddKitText> | undefined): Record<PostAddKitText, string> => ({
  eyebrow: config?.eyebrow ?? POST_ADD_KIT_DEFAULTS.eyebrow,
  title: config?.title ?? POST_ADD_KIT_DEFAULTS.title,
  lead: config?.lead ?? POST_ADD_KIT_DEFAULTS.lead,
});
