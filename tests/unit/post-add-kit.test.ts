import { beforeEach, describe, expect, test, vi } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { postAddKitFromForm, type PostAddKitFormInput } from "@/lib/admin/post-add-kit-form";
import { kitDiscountLabel, kitPromotionLive, kitTierPrices, kitTiersSummary, kitUnsupportedReason, normalizeProgressivePromotion, shownKitTiers, type InkProgressivePromotion } from "@/lib/ink/progressive-promotions";
import { cachedProgressivePromotion, clearKitPromotionCache, KIT_PROMOTION_FRESH_MS, KIT_PROMOTION_RETRY_MS, KIT_PROMOTION_STALE_MS } from "@/lib/ink/promotions-client";
import { postAddKitPayload, POST_ADD_KIT_DEFAULTS, validatePostAddKit, type PostAddKitConfig } from "@/lib/site-config/post-add-kit";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "t1" };
const NOW = Date.parse("2026-10-27T21:00:00-03:00");

// The shape INK sends for GET /v1/stores/promotions?type=progressive (fictional ids and codes; the tiers mirror a real "leve mais" setup).
const rawValue = {
  id: 501, type: "progressive", code: "KITTESTE", kind: "value", progress_kind: "cart_items", list_type: "all", apply_automatically: false, available: true,
  first_purchase: false, show_in_cart: true, show_on_product_page: true, usage_limit: null, starts_at: "2026-01-15T00:00:00.000-03:00", expires_at: null,
  discount_tiers: [
    { min_cart_value: null, min_cart_items: 4, discount: "40.0" },
    { min_cart_value: null, min_cart_items: 3, discount: "25.0" },
    { min_cart_value: null, min_cart_items: 5, discount: "60.0" },
    { min_cart_value: null, min_cart_items: 6, discount: "85.0" },
  ],
  product_ids: [], product_type_ids: [], collection_ids: [], created_at: "2026-01-15T12:40:53.330-03:00", updated_at: "2026-10-04T16:04:32.122-03:00",
};
const rawPercent = { ...rawValue, id: 502, code: "ATACADOTESTE", kind: "percentage", show_in_cart: false, discount_tiers: [{ min_cart_value: null, min_cart_items: 15, discount: "20.0" }, { min_cart_value: null, min_cart_items: 20, discount: "28.0" }] };
const kitValue = normalizeProgressivePromotion(rawValue) as InkProgressivePromotion;
const kitPercent = normalizeProgressivePromotion(rawPercent) as InkProgressivePromotion;

describe("Monte seu kit: INK's progressive promotions", () => {
  test("given INK's promotion, then the tiers are by quantity, smallest first, with INK's numbers", () => {
    expect(kitValue).toMatchObject({ id: 501, code: "KITTESTE", kind: "value", progressKind: "cart_items", listType: "all", applyAutomatically: false, showInCart: true });
    expect(kitValue.tiers).toEqual([{ items: 3, discount: 25 }, { items: 4, discount: 40 }, { items: 5, discount: 60 }, { items: 6, discount: 85 }]);
    expect(kitTiersSummary(kitValue)).toBe("3 peças: R$ 25 OFF · 4 peças: R$ 40 OFF · 5 peças: R$ 60 OFF · 6 peças: R$ 85 OFF");
    expect(kitTiersSummary(kitPercent)).toBe("15 peças: 20% OFF · 20 peças: 28% OFF");
  });

  test("anything off the documented shape is dropped, never guessed", () => {
    expect(normalizeProgressivePromotion({ ...rawValue, type: "standard" })).toBeNull();
    expect(normalizeProgressivePromotion({ ...rawValue, kind: "free" })).toBeNull();
    expect(normalizeProgressivePromotion({ ...rawValue, code: "<b>" })).toBeNull();
    // A broken tier list is no tier list (not the tiers that happened to parse).
    expect(normalizeProgressivePromotion({ ...rawValue, discount_tiers: [{ min_cart_items: 3, discount: "25.0" }, { min_cart_items: 3, discount: "30.0" }] })?.tiers).toEqual([]);
    expect(normalizeProgressivePromotion({ ...rawValue, discount_tiers: [{ min_cart_items: 1, discount: "25.0" }] })?.tiers).toEqual([]);
    expect(normalizeProgressivePromotion({ ...rawPercent, discount_tiers: [{ min_cart_items: 3, discount: "100.0" }] })?.tiers).toEqual([]);
    expect(normalizeProgressivePromotion({ ...rawValue, progress_kind: "cart_value", discount_tiers: [{ min_cart_value: "300.0", min_cart_items: null, discount: "25.0" }] })?.tiers).toEqual([]);
  });

  test("only what is true for any piece the customer adds can be the kit", () => {
    expect(kitUnsupportedReason(kitValue, NOW)).toBeNull();
    expect(kitUnsupportedReason({ ...kitValue, progressKind: "cart_value" }, NOW)).toMatch(/valor do carrinho/);
    expect(kitUnsupportedReason({ ...kitValue, listType: "collections" }, NOW)).toMatch(/só para alguns produtos/);
    expect(kitUnsupportedReason({ ...kitValue, firstPurchase: true }, NOW)).toMatch(/primeira compra/);
    expect(kitUnsupportedReason({ ...kitValue, available: false }, NOW)).toMatch(/indisponível/);
    expect(kitUnsupportedReason({ ...kitValue, expiresAt: "2026-10-01T00:00:00-03:00" }, NOW)).toMatch(/terminou/);
    expect(kitUnsupportedReason({ ...kitValue, tiers: [] }, NOW)).toMatch(/faixas por quantidade/);
    // Not started yet: it can be chosen, and goes live when it starts.
    const later = { ...kitValue, startsAt: "2026-11-27T00:00:00-03:00" };
    expect(kitUnsupportedReason(later, NOW)).toBeNull();
    expect(kitPromotionLive(later, NOW)).toBe(false);
    expect(kitPromotionLive(later, Date.parse("2026-11-27T00:00:00-03:00"))).toBe(true);
  });

  test("given the price of the piece just added, then each tier reads de/por, each and saved, in exact cents", () => {
    expect(kitTierPrices(10990, kitValue.kind, kitValue.tiers)).toEqual([
      { items: 3, fullCents: 32970, totalCents: 30470, eachCents: 10157, savedCents: 2500 },
      { items: 4, fullCents: 43960, totalCents: 39960, eachCents: 9990, savedCents: 4000 },
      { items: 5, fullCents: 54950, totalCents: 48950, eachCents: 9790, savedCents: 6000 },
      { items: 6, fullCents: 65940, totalCents: 57440, eachCents: 9573, savedCents: 8500 },
    ]);
    expect(kitTierPrices(10990, kitPercent.kind, kitPercent.tiers)?.[0]).toEqual({ items: 15, fullCents: 164850, totalCents: 131880, eachCents: 8792, savedCents: 32970 });
    // A discount that would leave nothing to pay is no price anyone gets; no price, no numbers.
    expect(kitTierPrices(800, "value", [{ items: 3, discount: 25 }])).toBeNull();
    expect(kitTierPrices(0, "value", kitValue.tiers)).toBeNull();
    expect(kitDiscountLabel("value", 25)).toBe("R$ 25 OFF");
    expect(kitDiscountLabel("value", 25.5)).toBe("R$ 25,50 OFF");
    expect(kitDiscountLabel("percentage", 12.5)).toBe("12,5% OFF");
    expect(shownKitTiers(Array.from({ length: 9 }, (_, i) => ({ items: i + 2, discount: i + 1 })))).toHaveLength(6);
  });
});

describe("Monte seu kit: the region's choice and the public payload", () => {
  const on: PostAddKitConfig = { enabled: true, promotionId: 501, promotionCode: "KITTESTE" };

  test("the choice is strictly validated and belongs to a region", () => {
    expect(validatePostAddKit(on, "sul").ok).toBe(true);
    expect(validatePostAddKit({ enabled: false }, "sul").ok).toBe(true);
    expect(validatePostAddKit({ enabled: true }, "sul").ok).toBe(false);
    expect(validatePostAddKit({ ...on, tiers: [] }, "sul").ok).toBe(false);
    expect(validatePostAddKit({ ...on, title: " Monte " }, "sul").ok).toBe(false);
    expect(validatePostAddKit({ ...on, title: "x".repeat(61) }, "sul").ok).toBe(false);
    expect(validatePostAddKit(on, "global").ok).toBe(false);
  });

  test("on, with the promotion live in INK, the payload carries INK's code and tiers and the texts (default ones filled in)", () => {
    expect(postAddKitPayload("sul", on, kitValue, NOW)).toEqual({
      v: 1, region: "sul",
      kit: { id: 501, code: "KITTESTE", auto: false, kind: "value", tiers: kitValue.tiers, eyebrow: POST_ADD_KIT_DEFAULTS.eyebrow, title: POST_ADD_KIT_DEFAULTS.title, lead: POST_ADD_KIT_DEFAULTS.lead },
    });
    const custom = postAddKitPayload("sul", { ...on, title: "Leve mais, pague menos" }, { ...kitValue, expiresAt: "2026-12-01T00:00:00.000-03:00" }, NOW);
    expect(custom.kit?.title).toBe("Leve mais, pague menos");
    expect(custom.kit?.endsAt).toBe("2026-12-01T03:00:00.000Z");
  });

  test("off, nothing chosen, another promotion, not started, finished or unreadable = kit null (the modal as INK draws it)", () => {
    expect(postAddKitPayload("sul", undefined, kitValue, NOW).kit).toBeNull();
    expect(postAddKitPayload("sul", { ...on, enabled: false }, kitValue, NOW).kit).toBeNull();
    expect(postAddKitPayload("sul", { ...on, promotionId: 999 }, kitValue, NOW).kit).toBeNull();
    expect(postAddKitPayload("sul", on, { ...kitValue, startsAt: "2026-11-27T00:00:00-03:00" }, NOW).kit).toBeNull();
    expect(postAddKitPayload("sul", on, { ...kitValue, expiresAt: "2026-10-27T20:00:00-03:00" }, NOW).kit).toBeNull();
    expect(postAddKitPayload("sul", on, { ...kitValue, listType: "products" }, NOW).kit).toBeNull();
    expect(postAddKitPayload("sul", on, null, NOW).kit).toBeNull();
  });
});

describe("Monte seu kit: the panel's form", () => {
  const form = (patch: Partial<PostAddKitFormInput> = {}): PostAddKitFormInput => ({ enabled: true, promotionId: "501", promotionCode: "", eyebrow: "", title: "", lead: "", ...patch });

  test("the code is INK's (never the form's) and texts equal to the defaults are not stored", () => {
    const r = postAddKitFromForm(form({ promotionCode: "OUTRO", title: POST_ADD_KIT_DEFAULTS.title, lead: "  Combine   peças participantes. " }), { kind: "found", promotion: kitValue }, NOW);
    expect(r).toEqual({ ok: true, value: { enabled: true, promotionId: 501, promotionCode: "KITTESTE", lead: "Combine peças participantes." } });
  });

  test("turning it on needs a promotion INK confirms can be the kit; turning it off never needs INK", () => {
    expect(postAddKitFromForm(form({ promotionId: "" }), { kind: "none" }, NOW)).toEqual({ ok: false, errors: ["Escolha uma promoção progressiva para ligar o kit."] });
    const unsupported = postAddKitFromForm(form(), { kind: "found", promotion: { ...kitValue, firstPurchase: true } }, NOW);
    expect(!unsupported.ok && unsupported.errors[0]).toMatch(/^A promoção KITTESTE não pode ser mostrada no kit: Vale só na primeira compra/);
    expect(postAddKitFromForm(form(), { kind: "missing" }, NOW).ok).toBe(false);
    expect(postAddKitFromForm(form(), { kind: "unreachable" }, NOW).ok).toBe(false);
    // Off while INK is down: the choice stays as it was (the label from the form is only a label).
    expect(postAddKitFromForm(form({ enabled: false, promotionCode: "KITTESTE" }), { kind: "unreachable" }, NOW)).toEqual({ ok: true, value: { enabled: false, promotionId: 501, promotionCode: "KITTESTE" } });
    // Off with the promotion deleted in INK: it is forgotten.
    expect(postAddKitFromForm(form({ enabled: false }), { kind: "missing" }, NOW)).toEqual({ ok: true, value: { enabled: false } });
    expect(postAddKitFromForm(form({ promotionId: "abc" }), { kind: "none" }, NOW).ok).toBe(false);
    const long = postAddKitFromForm(form({ eyebrow: "x".repeat(41) }), { kind: "found", promotion: kitValue }, NOW);
    expect(!long.ok && long.errors).toEqual(["Chamada: no máximo 40 caracteres (tem 41)."]);
  });
});

describe("Monte seu kit: draft, publish list and tolerant read", () => {
  test("given the draft, when the kit is saved, then only `postAddKit` changes and the publish screen lists it", () => {
    const sul = structuredClone(seed().docs.sul);
    const r = applyOp(sul, { type: "set-post-add-kit", postAddKit: { enabled: true, promotionId: 501, promotionCode: "KITTESTE" } }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validateScopeDoc(r.doc).ok).toBe(true);
    const texts = diffDocs(sul, r.doc).filter((c) => c.kind === "post-add-kit").map((c) => c.text);
    expect(texts).toEqual(["Monte seu kit: ligado, com a promoção KITTESTE (aparece depois de adicionar ao carrinho na INK)", "Monte seu kit: nenhuma promoção → promoção KITTESTE"]);
    const edited = applyOp(r.doc, { type: "set-post-add-kit", postAddKit: { enabled: false, promotionId: 501, promotionCode: "KITTESTE", title: "Leve mais" } }, ctx);
    expect(edited.ok && diffDocs(r.doc, edited.doc).filter((c) => c.kind === "post-add-kit").map((c) => c.text)).toEqual(["Monte seu kit: desligado (o modal da INK volta a ser como ela desenha)", "Monte seu kit: textos editados"]);
    // Writing the default texts changes nothing on the page, so nothing is listed.
    const same = applyOp(r.doc, { type: "set-post-add-kit", postAddKit: { enabled: true, promotionId: 501, promotionCode: "KITTESTE", title: POST_ADD_KIT_DEFAULTS.title } }, ctx);
    expect(same.ok && diffDocs(r.doc, same.doc).filter((c) => c.kind === "post-add-kit")).toEqual([]);
    expect(applyOp(structuredClone(seed().docs.global), { type: "set-post-add-kit", postAddKit: { enabled: false } }, ctx).ok).toBe(false);
    expect(applyOp(sul, { type: "set-post-add-kit", postAddKit: { enabled: true } }, ctx).ok).toBe(false);
  });

  test("an invalid published kit is ignored (the modal as INK draws it), never the region", () => {
    const bundle = seed();
    const raw = structuredClone(bundle) as unknown as { docs: Record<string, ScopeDoc & { postAddKit?: unknown }> };
    (raw.docs.sul as { postAddKit?: unknown }).postAddKit = { enabled: true, promotionId: "501" };
    const read = sanitizeBundle(raw, bundle);
    expect(read.bundle?.docs.sul.postAddKit).toBeUndefined();
    expect(read.bundle?.docs.sul.home).toBeDefined();
    expect(read.diagnostics.some((d) => /postAddKit is invalid/.test(d))).toBe(true);
    raw.docs.sul.postAddKit = { enabled: true, promotionId: 501 };
    expect(sanitizeBundle(raw, bundle).bundle?.docs.sul.postAddKit).toEqual({ enabled: true, promotionId: 501 });
  });
});

describe("Monte seu kit: the INK read behind the public route", () => {
  beforeEach(() => clearKitPromotionCache());
  const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);

  test("a fresh answer is reused for a few minutes: one INK read, however many visitors", async () => {
    const read = vi.fn(async () => kitValue);
    expect(await cachedProgressivePromotion("use-sul", 501, NOW, read)).toBe(kitValue);
    expect(await cachedProgressivePromotion("use-sul", 501, NOW + KIT_PROMOTION_FRESH_MS - 1, read)).toBe(kitValue);
    expect(read).toHaveBeenCalledTimes(1);
    await cachedProgressivePromotion("use-sul", 501, NOW + KIT_PROMOTION_FRESH_MS, read);
    expect(read).toHaveBeenCalledTimes(2);
  });

  test("INK failing: the last good answer while it is recent, then nothing; INK's 'not found' replaces it at once", async () => {
    const warn = quiet();
    await cachedProgressivePromotion("use-sul", 501, NOW, async () => kitValue);
    const failing = async () => { throw new Error("INK responded 503"); };
    expect(await cachedProgressivePromotion("use-sul", 501, NOW + KIT_PROMOTION_FRESH_MS, failing)).toBe(kitValue);
    // Right after a failure INK is not asked again (the 100 req/min are shared): the stale answer meanwhile.
    const counted = vi.fn(failing);
    expect(await cachedProgressivePromotion("use-sul", 501, NOW + KIT_PROMOTION_FRESH_MS + 1000, counted)).toBe(kitValue);
    expect(counted).not.toHaveBeenCalled();
    expect(await cachedProgressivePromotion("use-sul", 501, NOW + KIT_PROMOTION_FRESH_MS + KIT_PROMOTION_RETRY_MS, counted)).toBe(kitValue);
    expect(counted).toHaveBeenCalledTimes(1);
    expect(await cachedProgressivePromotion("use-sul", 501, NOW + KIT_PROMOTION_STALE_MS, failing)).toBeNull();
    clearKitPromotionCache();
    await cachedProgressivePromotion("use-sul", 501, NOW, async () => kitValue);
    expect(await cachedProgressivePromotion("use-sul", 501, NOW + KIT_PROMOTION_FRESH_MS, async () => null)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
