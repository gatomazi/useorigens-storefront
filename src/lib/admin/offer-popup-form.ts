/**
 * "Popup da oferta": the panel's form → the region's `offerPopup`. Pure (the INK check is done by the action and handed in), so the rules are testable.
 * The promotion is never taken from the form: its code and whether it can be the popup's come from INK at save time; the form only says WHICH one.
 */
import type { KitInkCheck } from "./post-add-kit-form";
import { offerUnsupportedReason } from "../site-config/offer-popup";
import { offerHrefOk, offerPromotionIdOk, OFFER_CODE, OFFER_HREF_MAX, OFFER_POPUP_DEFAULTS, OFFER_POPUP_LIMITS, OFFER_POPUP_TEXTS, type OfferPopupConfig, type OfferPopupText } from "../site-config/offer-popup-schema";

export type OfferPopupFormInput = { enabled: boolean; promotionId: string; promotionCode: string; ctaHref: string } & Record<OfferPopupText, string>;

export const OFFER_TEXT_LABEL: Record<OfferPopupText, string> = { eyebrow: "Chamada", title: "Título", lead: "Texto de apoio", cta: "Botão" };

const tidy = (v: string): string => v.replace(/\s+/g, " ").trim();

/** The chosen id as typed in the form (`""` = none), or `"bad"`. */
export function offerFormPromotionId(raw: string): number | undefined | "bad" {
  if (raw.trim() === "") return undefined;
  const n = /^\d{1,10}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  return offerPromotionIdOk(n) ? n : "bad";
}

/** "loja.useorigens.com.br/sul/colecoes/x" or a full address of this site → "/sul/colecoes/x". Anything else is left as typed (and refused). */
export function offerHrefFromForm(raw: string): string {
  const v = raw.trim();
  const m = /^(?:https?:\/\/)?(?:www\.)?useorigens\.com\.br(\/.*)?$/i.exec(v);
  return m ? m[1] || "/" : v;
}

export function offerPopupFromForm(input: OfferPopupFormInput, check: KitInkCheck, now: number = Date.now()): { ok: true; value: OfferPopupConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const id = offerFormPromotionId(input.promotionId);
  if (id === "bad") return { ok: false, errors: ["A promoção escolhida não é válida. Recarregue a página e escolha de novo."] };
  const value: OfferPopupConfig = { enabled: input.enabled };
  if (input.enabled && id === undefined) errors.push("Escolha uma promoção progressiva para ligar o popup.");
  if (id !== undefined) {
    if (check.kind === "found") {
      const reason = offerUnsupportedReason(check.promotion, now);
      if (reason && input.enabled) errors.push(`A promoção ${check.promotion.code} não pode ser mostrada no popup: ${reason}`);
      value.promotionId = id;
      value.promotionCode = check.promotion.code;
    } else if (check.kind === "missing") {
      // Deleted in INK: nothing to keep. Turning it on with it is refused; turning it off just forgets it.
      if (input.enabled) errors.push("A promoção escolhida não existe mais na INK. Escolha outra.");
    } else if (check.kind === "unreachable") {
      // INK did not answer: turning it ON is refused (nothing is published unchecked); turning it off keeps the choice as it was.
      if (input.enabled) errors.push("A INK não respondeu para conferir a promoção agora. Nada foi salvo: tente de novo em instantes.");
      value.promotionId = id;
      if (OFFER_CODE.test(input.promotionCode)) value.promotionCode = input.promotionCode;
    }
  }
  for (const key of OFFER_POPUP_TEXTS) {
    const text = tidy(input[key]);
    if (text === "" || text === OFFER_POPUP_DEFAULTS[key]) continue;
    const max = OFFER_POPUP_LIMITS[key];
    if (text.length > max) errors.push(`${OFFER_TEXT_LABEL[key]}: no máximo ${max} caracteres (tem ${text.length}).`);
    else if (/[<>]/.test(text)) errors.push(`${OFFER_TEXT_LABEL[key]}: sem os sinais < e >.`);
    else value[key] = text;
  }
  const href = offerHrefFromForm(input.ctaHref);
  if (href !== "") {
    if (href.length > OFFER_HREF_MAX) errors.push(`Link do botão: no máximo ${OFFER_HREF_MAX} caracteres.`);
    else if (!offerHrefOk(href)) errors.push("Link do botão: use um endereço deste site, começando com / (por exemplo /sul/colecoes/mais-vendidas).");
    else value.ctaHref = href;
  }
  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}
