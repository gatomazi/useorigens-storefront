/**
 * Contract of the region's "Popup da oferta" (types + strict validator): a dialog on the storefront that presents ONE progressive promotion of the INK store
 * (3 peças, 4 peças…) N seconds into the visit. Only the choice, the texts and the button's destination live here: the tiers, the code and the window are
 * INK's, read live (`src/lib/ink/progressive-promotions.ts`), the same way "Monte seu kit" reads them.
 * Dependency-light on purpose, like `post-add-kit-schema.ts`: `schema.ts` imports it, so it must not import anything that imports `schema.ts` back.
 */
import type { Scope, ValidationResult } from "./schema";

export type OfferPopupConfig = {
  /** Off = no popup. Turning it off keeps the choice, so turning it back on needs no new pick. */
  enabled: boolean;
  /** INK id of the chosen progressive promotion (`GET /v1/stores/promotions/{id}`). Required while `enabled`. */
  promotionId?: number;
  /** The promotion's code when it was chosen: only a label for the panel and the publish list. What the customer sees is INK's live code. */
  promotionCode?: string;
  /** The owner's texts. Absent = the default copy (OFFER_POPUP_DEFAULTS; the title's default is built from the biggest tier). */
  eyebrow?: string;
  title?: string;
  lead?: string;
  cta?: string;
  /** Where the main button goes: a path of this site ("/sul/colecoes/mais-vendidas"). Absent = the button only closes the popup. */
  ctaHref?: string;
  /** Seconds into the visit before it opens (OFFER_DELAY_MIN_S…OFFER_DELAY_MAX_S). Absent = OFFER_DELAY_DEFAULT_S. */
  delaySeconds?: number;
};

export const OFFER_POPUP_DEFAULTS = {
  eyebrow: "Leve mais, pague menos",
  /** Shown only in the panel's placeholder: the storefront writes "Até R$ 85 OFF no seu pedido" from the promotion's biggest tier. */
  title: "Até {maior desconto} no seu pedido",
  lead: "Quanto mais peças você leva, maior o desconto.",
  cta: "Escolher minhas peças",
} as const;
export const OFFER_POPUP_LIMITS = { eyebrow: 40, title: 60, lead: 160, cta: 30 } as const;
export type OfferPopupText = keyof typeof OFFER_POPUP_LIMITS;
export const OFFER_POPUP_TEXTS = ["eyebrow", "title", "lead", "cta"] as const satisfies readonly OfferPopupText[];
export const OFFER_HREF_MAX = 200;
/** When it opens: N seconds into the visit, chosen in the panel. */
export const OFFER_DELAY_DEFAULT_S = 8;
export const OFFER_DELAY_MIN_S = 2;
export const OFFER_DELAY_MAX_S = 120;

/** The code exactly as INK keeps it (the same shape the coupons of "Cupons e promoções" accept). */
export const OFFER_CODE = /^[A-Za-z0-9_-]{2,40}$/;
export const MAX_OFFER_PROMOTION_ID = 2_147_483_647;
/** A path of this site: one leading "/", no "//" (another host), no scheme, no spaces or quotes. Query and anchor allowed. */
export const OFFER_HREF = /^\/(?!\/)[A-Za-z0-9\-._~/?#=&%+]*$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// Printable, single-line text only: it is rendered as text; `<` and `>` are refused too (defence in depth).
const CONTROL = /[\u0000-\u001f\u007f<>]/;
const KEYS = ["enabled", "promotionId", "promotionCode", ...OFFER_POPUP_TEXTS, "ctaHref", "delaySeconds"];

export const offerTextOk = (v: unknown, max: number): v is string => typeof v === "string" && v.length >= 1 && v.length <= max && v === v.trim() && !CONTROL.test(v);
export const offerPromotionIdOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_OFFER_PROMOTION_ID;
export const offerHrefOk = (v: unknown): v is string => typeof v === "string" && v.length <= OFFER_HREF_MAX && OFFER_HREF.test(v);
export const offerDelayOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= OFFER_DELAY_MIN_S && v <= OFFER_DELAY_MAX_S;

export function validateOfferPopup(input: unknown, scope: Scope, path = "offerPopup"): ValidationResult<OfferPopupConfig> {
  if (scope === "global") return { ok: false, errors: [`${path}: belongs to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { enabled, promotionId? }`] };
  const errors = Object.keys(input).filter((key) => !KEYS.includes(key)).map((key) => `${path}.${key}: unknown field`);
  if (typeof input.enabled !== "boolean") errors.push(`${path}.enabled: must be boolean`);
  if (input.promotionId !== undefined && !offerPromotionIdOk(input.promotionId)) errors.push(`${path}.promotionId: an INK promotion id`);
  if (input.enabled === true && input.promotionId === undefined) errors.push(`${path}.promotionId: required to turn it on`);
  if (input.promotionCode !== undefined && (typeof input.promotionCode !== "string" || !OFFER_CODE.test(input.promotionCode))) errors.push(`${path}.promotionCode: invalid`);
  for (const key of OFFER_POPUP_TEXTS) {
    const max = OFFER_POPUP_LIMITS[key];
    if (input[key] !== undefined && !offerTextOk(input[key], max)) errors.push(`${path}.${key}: a text of 1 to ${max} characters, one line, no leading or trailing spaces`);
  }
  if (input.ctaHref !== undefined && !offerHrefOk(input.ctaHref)) errors.push(`${path}.ctaHref: a path of this site, starting with /`);
  if (input.delaySeconds !== undefined && !offerDelayOk(input.delaySeconds)) errors.push(`${path}.delaySeconds: whole seconds, ${OFFER_DELAY_MIN_S} to ${OFFER_DELAY_MAX_S}`);
  return errors.length === 0 ? { ok: true, value: input as OfferPopupConfig } : { ok: false, errors };
}
