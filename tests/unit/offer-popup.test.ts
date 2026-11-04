import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { offerHrefFromForm, offerPopupFromForm, type OfferPopupFormInput } from "@/lib/admin/offer-popup-form";
import { normalizeProgressivePromotion, type InkProgressivePromotion } from "@/lib/ink/progressive-promotions";
import {
  offerAllowedPath, offerAmount, offerCards, offerDue, offerFinePrint, offerPopupPayload, offerSeenValue, offerUnsupportedReason, parseOfferPopupPayload, validateOfferPopup,
  OFFER_POPUP_DEFAULTS, OFFER_QUIET_MS, type OfferPopupConfig,
} from "@/lib/site-config/offer-popup";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "t1" };
const NOW = Date.parse("2026-11-03T21:00:00-03:00");
const THEME = { primary: "#8a3b12", onPrimary: "#ffffff" };

// The shape INK sends for a progressive promotion (fictional id and code; the tiers mirror a real "leve mais" setup).
const raw = {
  id: 601, type: "progressive", code: "POPTESTE", kind: "value", progress_kind: "cart_items", list_type: "all", apply_automatically: false, available: true,
  first_purchase: false, show_in_cart: true, show_on_product_page: true, usage_limit: null, starts_at: "2026-01-15T00:00:00.000-03:00", expires_at: null,
  discount_tiers: [
    { min_cart_value: null, min_cart_items: 3, discount: "25.0" },
    { min_cart_value: null, min_cart_items: 4, discount: "40.0" },
    { min_cart_value: null, min_cart_items: 5, discount: "60.0" },
    { min_cart_value: null, min_cart_items: 6, discount: "85.0" },
  ],
};
const promo = normalizeProgressivePromotion(raw) as InkProgressivePromotion;
const on: OfferPopupConfig = { enabled: true, promotionId: 601, promotionCode: "POPTESTE" };

describe("Popup da oferta: the region's choice", () => {
  test("given the config, then only a region may have it, on needs a promotion and every text is one clean line", () => {
    expect(validateOfferPopup(on, "sul").ok).toBe(true);
    expect(validateOfferPopup({ enabled: false }, "norte").ok).toBe(true);
    expect(validateOfferPopup({ enabled: true }, "sul").ok).toBe(false);
    expect(validateOfferPopup(on, "global").ok).toBe(false);
    expect(validateOfferPopup({ ...on, tiers: [] }, "sul").ok).toBe(false);
    expect(validateOfferPopup({ ...on, title: " Oferta " }, "sul").ok).toBe(false);
    expect(validateOfferPopup({ ...on, cta: "x".repeat(31) }, "sul").ok).toBe(false);
    expect(validateOfferPopup({ ...on, lead: "<b>oi</b>" }, "sul").ok).toBe(false);
  });

  test("the button's link is always a path of this site", () => {
    expect(validateOfferPopup({ ...on, ctaHref: "/sul/colecoes/mais-vendidas" }, "sul").ok).toBe(true);
    expect(validateOfferPopup({ ...on, ctaHref: "/sul/busca?q=floripa#topo" }, "sul").ok).toBe(true);
    for (const bad of ["//evil.com", "https://evil.com", "javascript:alert(1)", "sul/colecoes", "/a b", '/"x"']) expect(validateOfferPopup({ ...on, ctaHref: bad }, "sul").ok).toBe(false);
  });
});

describe("Popup da oferta: what it shows", () => {
  test("given INK's tiers, then the cards, the amounts, the default title and the small print come from them", () => {
    expect(offerCards(promo.tiers)).toEqual(promo.tiers);
    expect(offerAmount("value", 85)).toBe("R$ 85");
    expect(offerAmount("percentage", 20)).toBe("20%");
    expect(offerFinePrint(false, promo.tiers)).toBe("Cole o cupom no carrinho: vale a partir de 3 peças.");
    expect(offerFinePrint(true, promo.tiers)).toBe("Desconto aplicado automaticamente no carrinho, a partir de 3 peças.");
  });

  test("more tiers than fit: the first ones and the biggest (the title promises the biggest)", () => {
    const many = [2, 3, 4, 5, 6, 8].map((items, i) => ({ items, discount: (i + 1) * 10 }));
    expect(offerCards(many).map((t) => t.items)).toEqual([2, 3, 4, 8]);
  });

  test("given a live promotion, then the payload carries INK's code and tiers, the default texts and the region's colours", () => {
    const p = offerPopupPayload("sul", on, promo, NOW, THEME);
    expect(p).toEqual({
      v: 1, region: "sul", theme: THEME,
      offer: { id: 601, code: "POPTESTE", auto: false, kind: "value", tiers: promo.tiers, eyebrow: OFFER_POPUP_DEFAULTS.eyebrow, title: "Até R$ 85 OFF no seu pedido", lead: OFFER_POPUP_DEFAULTS.lead, cta: OFFER_POPUP_DEFAULTS.cta, delaySeconds: 8 },
    });
    const own = offerPopupPayload("sul", { ...on, title: "Black: leve mais", ctaHref: "/sul/colecoes/black" }, { ...promo, expiresAt: "2026-11-30T23:59:00-03:00" }, NOW);
    expect(own.offer).toMatchObject({ title: "Black: leve mais", ctaHref: "/sul/colecoes/black", endsAt: "2026-12-01T02:59:00.000Z" });
    expect(offerPopupPayload("sul", { ...on, delaySeconds: 20 }, promo, NOW).offer?.delaySeconds).toBe(20);
  });

  test("nothing opens without a live promotion behind the choice", () => {
    expect(offerPopupPayload("sul", undefined, promo, NOW).offer).toBeNull();
    expect(offerPopupPayload("sul", { ...on, enabled: false }, promo, NOW).offer).toBeNull();
    expect(offerPopupPayload("sul", on, null, NOW).offer).toBeNull();
    expect(offerPopupPayload("sul", { ...on, promotionId: 999 }, promo, NOW).offer).toBeNull();
    expect(offerPopupPayload("sul", on, { ...promo, expiresAt: "2026-11-01T00:00:00-03:00" }, NOW).offer).toBeNull();
    expect(offerPopupPayload("sul", on, { ...promo, startsAt: "2026-11-27T00:00:00-03:00" }, NOW).offer).toBeNull();
    expect(offerPopupPayload("sul", on, { ...promo, listType: "collections" }, NOW).offer).toBeNull();
    expect(offerPopupPayload("sul", on, { ...promo, firstPurchase: true }, NOW).offer).toBeNull();
  });

  test("a promotion for only some products is refused with the popup's own reason", () => {
    expect(offerUnsupportedReason(promo, NOW)).toBeNull();
    expect(offerUnsupportedReason({ ...promo, listType: "products" }, NOW)).toMatch(/pedido todo/);
    expect(offerUnsupportedReason({ ...promo, progressKind: "cart_value" }, NOW)).toMatch(/valor do carrinho/);
  });

  test("the browser reads only a payload that keeps to the contract", () => {
    const wire = JSON.parse(JSON.stringify(offerPopupPayload("sul", { ...on, ctaHref: "/sul/colecoes/x" }, promo, NOW, THEME)));
    expect(parseOfferPopupPayload(wire, "sul", NOW)).toMatchObject({ offer: { code: "POPTESTE", ctaHref: "/sul/colecoes/x" }, theme: THEME });
    expect(parseOfferPopupPayload(wire, "norte", NOW)).toBeNull();
    expect(parseOfferPopupPayload({ ...wire, offer: null }, "sul", NOW)).toBeNull();
    expect(parseOfferPopupPayload({ ...wire, offer: { ...wire.offer, tiers: [] } }, "sul", NOW)).toBeNull();
    expect(parseOfferPopupPayload({ ...wire, offer: { ...wire.offer, endsAt: "2026-11-01T00:00:00Z" } }, "sul", NOW)).toBeNull();
    expect(parseOfferPopupPayload({ ...wire, offer: { ...wire.offer, ctaHref: "//evil.com" } }, "sul", NOW)?.offer.ctaHref).toBeUndefined();
    expect(parseOfferPopupPayload({ ...wire, theme: { primary: "red", onPrimary: "#fff" } }, "sul", NOW)?.theme).toBeUndefined();
    // The delay: an older server (none) or an odd value opens at the default.
    expect(parseOfferPopupPayload({ ...wire, offer: { ...wire.offer, delaySeconds: 20 } }, "sul", NOW)?.offer.delaySeconds).toBe(20);
    for (const delaySeconds of [undefined, 0, 9999, "20"]) expect(parseOfferPopupPayload({ ...wire, offer: { ...wire.offer, delaySeconds } }, "sul", NOW)?.offer.delaySeconds).toBe(8);
  });
});

describe("Popup da oferta: when it opens", () => {
  test("once, then quiet for 7 days; a different promotion counts as new; a broken memory counts as nothing", () => {
    expect(offerDue(null, 601, NOW)).toBe(true);
    const seen = offerSeenValue(601, NOW);
    expect(offerDue(seen, 601, NOW + 60_000)).toBe(false);
    expect(offerDue(seen, 601, NOW + OFFER_QUIET_MS - 1)).toBe(false);
    expect(offerDue(seen, 601, NOW + OFFER_QUIET_MS)).toBe(true);
    expect(offerDue(seen, 777, NOW + 60_000)).toBe(true);
    expect(offerDue("{broken", 601, NOW)).toBe(true);
    expect(offerDue(JSON.stringify({ id: 601 }), 601, NOW)).toBe(true);
    // A clock set back does not silence it forever.
    expect(offerDue(offerSeenValue(601, NOW + 30 * 86_400_000), 601, NOW)).toBe(true);
  });

  test("only on the region's own pages, never in the studio, saved prints, partners or privacy", () => {
    for (const ok of ["/sul", "/sul/sc", "/sul/sc/florianopolis", "/sul/colecoes/x", "/sul/busca", "/sul/outros-artigos"]) expect(offerAllowedPath(ok, "sul")).toBe(true);
    for (const no of ["/sul/personalizar/natal-em-familia", "/sul/minhas-estampas", "/sul/seja-parceiro", "/sul/privacidade", "/norte", "/admin/popup"]) expect(offerAllowedPath(no, "sul")).toBe(false);
  });
});

describe("Popup da oferta: the panel's form", () => {
  const input = (over: Partial<OfferPopupFormInput> = {}): OfferPopupFormInput => ({ enabled: true, promotionId: "601", promotionCode: "", eyebrow: "", title: "", lead: "", cta: "", ctaHref: "", delaySeconds: "", ...over });

  test("given INK confirms the promotion, then its code is INK's and the defaults are not stored", () => {
    const r = offerPopupFromForm(input({ promotionCode: "FORJADO", cta: OFFER_POPUP_DEFAULTS.cta, lead: "  Leve   mais  " }), { kind: "found", promotion: promo }, NOW);
    expect(r).toEqual({ ok: true, value: { enabled: true, promotionId: 601, promotionCode: "POPTESTE", lead: "Leve mais" } });
  });

  test("turning it on is refused without a promotion INK confirms; turning it off always works", () => {
    expect(offerPopupFromForm(input({ promotionId: "" }), { kind: "none" }, NOW).ok).toBe(false);
    expect(offerPopupFromForm(input(), { kind: "missing" }, NOW).ok).toBe(false);
    expect(offerPopupFromForm(input(), { kind: "unreachable" }, NOW).ok).toBe(false);
    expect(offerPopupFromForm(input(), { kind: "found", promotion: { ...promo, listType: "collections" } }, NOW).ok).toBe(false);
    expect(offerPopupFromForm(input({ enabled: false, promotionCode: "POPTESTE" }), { kind: "unreachable" }, NOW)).toEqual({ ok: true, value: { enabled: false, promotionId: 601, promotionCode: "POPTESTE" } });
    expect(offerPopupFromForm(input({ enabled: false }), { kind: "missing" }, NOW)).toEqual({ ok: true, value: { enabled: false } });
  });

  test("the link: a full address of this site becomes its path; another site is refused", () => {
    expect(offerHrefFromForm("https://useorigens.com.br/sul/colecoes/x")).toBe("/sul/colecoes/x");
    expect(offerHrefFromForm("www.useorigens.com.br")).toBe("/");
    const r = offerPopupFromForm(input({ ctaHref: "useorigens.com.br/sul/colecoes/x" }), { kind: "found", promotion: promo }, NOW);
    expect(r.ok && r.value.ctaHref).toBe("/sul/colecoes/x");
    expect(offerPopupFromForm(input({ ctaHref: "https://outra.com/x" }), { kind: "found", promotion: promo }, NOW).ok).toBe(false);
  });

  test("the delay: whole seconds in range; empty or the default is not stored", () => {
    const delay = (v: string) => offerPopupFromForm(input({ delaySeconds: v }), { kind: "found", promotion: promo }, NOW);
    expect(delay(" 15 ")).toMatchObject({ ok: true, value: { delaySeconds: 15 } });
    for (const v of ["", "8"]) {
      const r = delay(v);
      expect(r.ok && "delaySeconds" in r.value).toBe(false);
      expect(r.ok).toBe(true);
    }
    for (const v of ["1", "121", "4.5", "dez", "-3"]) expect(delay(v).ok).toBe(false);
  });
});

describe("Popup da oferta: draft, publish list and tolerant read", () => {
  test("given the draft, when the popup is saved, then only `offerPopup` changes and the publish screen lists it", () => {
    const sul = structuredClone(seed().docs.sul);
    const r = applyOp(sul, { type: "set-offer-popup", offerPopup: on }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validateScopeDoc(r.doc).ok).toBe(true);
    const list = (a: ScopeDoc, b: ScopeDoc) => diffDocs(a, b).filter((c) => c.kind === "offer-popup").map((c) => c.text);
    expect(list(sul, r.doc)).toEqual(["Popup da oferta: ligado, com a promoção POPTESTE (abre na loja depois de 8 segundos, 1 vez a cada 7 dias)", "Popup da oferta: nenhuma promoção → promoção POPTESTE"]);
    const edited = applyOp(r.doc, { type: "set-offer-popup", offerPopup: { ...on, enabled: false, title: "Leve mais", ctaHref: "/sul/colecoes/x" } }, ctx);
    expect(edited.ok && list(r.doc, edited.doc)).toEqual(["Popup da oferta: desligado (o popup deixa de abrir)", "Popup da oferta: textos editados", "Popup da oferta: o botão leva a /sul/colecoes/x"]);
    const later = applyOp(r.doc, { type: "set-offer-popup", offerPopup: { ...on, delaySeconds: 20 } }, ctx);
    expect(later.ok && list(r.doc, later.doc)).toEqual(["Popup da oferta: abre depois de 8 → 20 segundos"]);
    expect(applyOp(r.doc, { type: "set-offer-popup", offerPopup: { ...on, delaySeconds: 1 } }, ctx).ok).toBe(false);
    expect(applyOp(structuredClone(seed().docs.global), { type: "set-offer-popup", offerPopup: { enabled: false } }, ctx).ok).toBe(false);
    expect(applyOp(sul, { type: "set-offer-popup", offerPopup: { enabled: true } }, ctx).ok).toBe(false);
  });

  test("an invalid published popup is ignored (no popup), never the region", () => {
    const bundle = seed();
    const rawBundle = structuredClone(bundle) as unknown as { docs: Record<string, ScopeDoc & { offerPopup?: unknown }> };
    (rawBundle.docs.sul as { offerPopup?: unknown }).offerPopup = { enabled: true, promotionId: "601" };
    const read = sanitizeBundle(rawBundle, bundle);
    expect(read.bundle?.docs.sul.offerPopup).toBeUndefined();
    expect(read.bundle?.docs.sul.home).toBeDefined();
    expect(read.diagnostics.some((d) => /offerPopup is invalid/.test(d))).toBe(true);
  });
});
