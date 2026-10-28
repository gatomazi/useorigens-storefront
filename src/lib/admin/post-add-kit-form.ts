/**
 * "Monte seu kit": the panel's form → the region's `postAddKit`. Pure (the INK check is done by the action and handed in), so the rules are testable.
 * The promotion is never taken from the form: its code and whether it can be the kit come from INK at save time; the form only says WHICH one.
 */
import { kitUnsupportedReason, type InkProgressivePromotion } from "../ink/progressive-promotions";
import { kitPromotionIdOk, KIT_CODE, POST_ADD_KIT_DEFAULTS, POST_ADD_KIT_LIMITS, POST_ADD_KIT_TEXTS, type PostAddKitConfig, type PostAddKitText } from "../site-config/post-add-kit-schema";

export type PostAddKitFormInput = { enabled: boolean; promotionId: string; promotionCode: string } & Record<PostAddKitText, string>;

/** What INK said about the chosen promotion when saving: `none` = nothing chosen (no INK read). */
export type KitInkCheck = { kind: "found"; promotion: InkProgressivePromotion } | { kind: "missing" } | { kind: "unreachable" } | { kind: "none" };

export const KIT_TEXT_LABEL: Record<PostAddKitText, string> = { eyebrow: "Chamada", title: "Título", lead: "Texto de apoio" };

const tidy = (v: string): string => v.replace(/\s+/g, " ").trim();

/** The chosen id as typed in the form (`""` = none), or `"bad"`. */
export function kitFormPromotionId(raw: string): number | undefined | "bad" {
  if (raw.trim() === "") return undefined;
  const n = /^\d{1,10}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  return kitPromotionIdOk(n) ? n : "bad";
}

export function postAddKitFromForm(input: PostAddKitFormInput, check: KitInkCheck, now: number = Date.now()): { ok: true; value: PostAddKitConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const id = kitFormPromotionId(input.promotionId);
  if (id === "bad") return { ok: false, errors: ["A promoção escolhida não é válida. Recarregue a página e escolha de novo."] };
  const value: PostAddKitConfig = { enabled: input.enabled };
  if (input.enabled && id === undefined) errors.push("Escolha uma promoção progressiva para ligar o kit.");
  if (id !== undefined) {
    if (check.kind === "found") {
      const reason = kitUnsupportedReason(check.promotion, now);
      if (reason && input.enabled) errors.push(`A promoção ${check.promotion.code} não pode ser mostrada no kit: ${reason}`);
      value.promotionId = id;
      value.promotionCode = check.promotion.code;
    } else if (check.kind === "missing") {
      // Deleted in INK: nothing to keep. Turning it on with it is refused; turning it off just forgets it.
      if (input.enabled) errors.push("A promoção escolhida não existe mais na INK. Escolha outra.");
    } else if (check.kind === "unreachable") {
      // INK did not answer: turning it ON is refused (nothing is published unchecked); turning it off keeps the choice as it was.
      if (input.enabled) errors.push("A INK não respondeu para conferir a promoção agora. Nada foi salvo: tente de novo em instantes.");
      value.promotionId = id;
      if (KIT_CODE.test(input.promotionCode)) value.promotionCode = input.promotionCode;
    }
  }
  for (const key of POST_ADD_KIT_TEXTS) {
    const text = tidy(input[key]);
    if (text === "" || text === POST_ADD_KIT_DEFAULTS[key]) continue;
    const max = POST_ADD_KIT_LIMITS[key];
    if (text.length > max) errors.push(`${KIT_TEXT_LABEL[key]}: no máximo ${max} caracteres (tem ${text.length}).`);
    else if (/[<>]/.test(text)) errors.push(`${KIT_TEXT_LABEL[key]}: sem os sinais < e >.`);
    else value[key] = text;
  }
  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}
