/**
 * "Popup da oferta": the public payload and the rules of when it opens. Pure (no I/O, no `server-only`): the public API, the storefront, the CMS editor and the
 * tests run the very same rules.
 *
 * The region's document says IF and WHICH promotion; INK says WHAT it is (code, tiers, window). With no live promotion behind the choice the payload says
 * `offer: null` and nothing opens. The storefront never applies a discount: "Copiar" copies the code and INK's cart applies it.
 */
import { kitDiscountLabel, kitPromotionLive, kitUnsupportedReason, type InkProgressivePromotion, type KitDiscountKind, type KitTier } from "../ink/progressive-promotions";
import { HEX_COLOR } from "./color";
import { offerHrefOk, OFFER_CODE, OFFER_POPUP_DEFAULTS, type OfferPopupConfig, type OfferPopupText } from "./offer-popup-schema";

export * from "./offer-popup-schema";

/** The popup's colours: the header pair the CMS already checks for contrast (Aparência), like the coupon button. */
export type OfferTheme = { primary: string; onPrimary: string };

export type PublicOffer = {
  /** INK's id (the "already seen" memory and analytics). */
  id: number;
  /** What the customer types in INK's cart ("Copiar"). */
  code: string;
  /** INK applies it by itself (no code to type). */
  auto: boolean;
  kind: KitDiscountKind;
  /** All of INK's tiers by quantity, smallest first (the popup picks which cards to draw: `offerCards`). */
  tiers: KitTier[];
  /** When the promotion ends, if it does (the storefront drops the popup once it is over, even from its cache). */
  endsAt?: string;
  eyebrow: string;
  title: string;
  lead: string;
  cta: string;
  ctaHref?: string;
};
export type PublicOfferPopup = { v: 1; region: string; offer: PublicOffer | null; theme?: OfferTheme };

/** More cards than this do not fit side by side on a 360px phone. */
export const MAX_OFFER_CARDS = 4;

/** The cards the popup draws: every tier when they fit; otherwise the first ones and the biggest (the title promises the biggest). */
export function offerCards(tiers: readonly KitTier[]): KitTier[] {
  if (tiers.length <= MAX_OFFER_CARDS) return [...tiers];
  return [...tiers.slice(0, MAX_OFFER_CARDS - 1), tiers[tiers.length - 1]];
}

/** "R$ 85" / "20%": the big number of a card (the "OFF" goes on its own line). */
export const offerAmount = (kind: KitDiscountKind, discount: number): string => kitDiscountLabel(kind, discount).replace(/ OFF$/, "");

/** "Até R$ 85 OFF no seu pedido": the default title, from the biggest tier. */
export const offerDefaultTitle = (kind: KitDiscountKind, tiers: readonly KitTier[]): string =>
  tiers.length === 0 ? "Quanto mais peças, maior o desconto" : `Até ${kitDiscountLabel(kind, tiers[tiers.length - 1].discount)} no seu pedido`;

/** The small print under the buttons: how the discount is applied and from how many pieces. */
export function offerFinePrint(auto: boolean, tiers: readonly KitTier[]): string {
  const from = tiers.length > 0 ? `a partir de ${tiers[0].items} peças` : "";
  return auto ? `Desconto aplicado automaticamente no carrinho${from ? `, ${from}` : ""}.` : `Cole o cupom no carrinho${from ? `: vale ${from}` : ""}.`;
}

/** The texts the popup shows: the owner's, or the default of each one left empty. */
export function offerTexts(config: Pick<OfferPopupConfig, OfferPopupText> | undefined, kind: KitDiscountKind, tiers: readonly KitTier[]): Record<OfferPopupText, string> {
  return {
    eyebrow: config?.eyebrow ?? OFFER_POPUP_DEFAULTS.eyebrow,
    title: config?.title ?? offerDefaultTitle(kind, tiers),
    lead: config?.lead ?? OFFER_POPUP_DEFAULTS.lead,
    cta: config?.cta ?? OFFER_POPUP_DEFAULTS.cta,
  };
}

/**
 * Why a promotion cannot be the popup's (pt-BR, for the panel), or null when it can. The same rules as the kit: the popup says "no seu pedido", so only what
 * is true for ANY order fits (tiers by quantity, every product, every customer).
 */
export function offerUnsupportedReason(p: InkProgressivePromotion, now: number = Date.now()): string | null {
  if (p.progressKind === "cart_items" && p.listType !== "all") return "Vale só para alguns produtos, tipos ou coleções: o popup promete o desconto no pedido todo.";
  return kitUnsupportedReason(p, now);
}

/** The payload of a region at `now`, from its published choice and the promotion INK returned for it (null = none, or INK could not say). */
export function offerPopupPayload(region: string, config: OfferPopupConfig | undefined, promotion: InkProgressivePromotion | null, now: number, theme?: OfferTheme): PublicOfferPopup {
  if (!config?.enabled || config.promotionId === undefined || !promotion || promotion.id !== config.promotionId || !kitPromotionLive(promotion, now) || offerUnsupportedReason(promotion, now)) return { v: 1, region, offer: null };
  const offer: PublicOffer = { id: promotion.id, code: promotion.code, auto: promotion.applyAutomatically, kind: promotion.kind, tiers: promotion.tiers, ...offerTexts(config, promotion.kind, promotion.tiers) };
  if (config.ctaHref) offer.ctaHref = config.ctaHref;
  if (promotion.expiresAt) offer.endsAt = new Date(promotion.expiresAt).toISOString();
  return theme ? { v: 1, region, offer, theme } : { v: 1, region, offer };
}

// ── Reading the payload in the browser (never trust the wire) ──────────────────────────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** The payload as the storefront may use it, or null (anything off the contract, another region, an ended promotion: no popup). */
export function parseOfferPopupPayload(raw: unknown, region: string, now: number): { offer: PublicOffer; theme?: OfferTheme } | null {
  if (!isRecord(raw) || raw.v !== 1 || raw.region !== region || !isRecord(raw.offer)) return null;
  const o = raw.offer;
  if (typeof o.id !== "number" || !Number.isInteger(o.id) || o.id < 1 || typeof o.code !== "string" || !OFFER_CODE.test(o.code)) return null;
  if (o.kind !== "value" && o.kind !== "percentage") return null;
  if (!Array.isArray(o.tiers) || o.tiers.length === 0 || o.tiers.length > 20) return null;
  const tiers: KitTier[] = [];
  for (const t of o.tiers) {
    if (!isRecord(t) || typeof t.items !== "number" || !Number.isInteger(t.items) || t.items < 2 || typeof t.discount !== "number" || !(t.discount > 0)) return null;
    if (tiers.length > 0 && t.items <= tiers[tiers.length - 1].items) return null;
    tiers.push({ items: t.items, discount: t.discount });
  }
  if (!text(o.eyebrow, 40) || !text(o.title, 60) || !text(o.lead, 160) || !text(o.cta, 30)) return null;
  if (o.endsAt !== undefined && (typeof o.endsAt !== "string" || !Number.isFinite(Date.parse(o.endsAt)) || Date.parse(o.endsAt) <= now)) return null;
  const offer: PublicOffer = { id: o.id, code: o.code, auto: o.auto === true, kind: o.kind, tiers, eyebrow: o.eyebrow, title: o.title, lead: o.lead, cta: o.cta };
  if (typeof o.ctaHref === "string" && offerHrefOk(o.ctaHref)) offer.ctaHref = o.ctaHref;
  if (typeof o.endsAt === "string") offer.endsAt = o.endsAt;
  const theme = isRecord(raw.theme) && typeof raw.theme.primary === "string" && HEX_COLOR.test(raw.theme.primary) && typeof raw.theme.onPrimary === "string" && HEX_COLOR.test(raw.theme.onPrimary) ? { primary: raw.theme.primary, onPrimary: raw.theme.onPrimary } : undefined;
  return theme ? { offer, theme } : { offer };
}

// ── When it opens ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Opens this long into the visit… */
export const OFFER_DELAY_MS = 8000;
/** …or earlier, once the visitor scrolled past this share of the page (never before OFFER_MIN_MS). */
export const OFFER_SCROLL_RATIO = 0.5;
export const OFFER_MIN_MS = 2500;
/** Something of the page is busy (a menu, the search, a dialog, typing) when it is due: tried again after this. */
export const OFFER_RETRY_MS = 3000;
/** Shown once, then quiet for this long in this browser (owner's choice: once every 7 days). A different promotion counts as new. */
export const OFFER_QUIET_MS = 7 * 24 * 60 * 60_000;
export const offerSeenKey = (region: string): string => `origens:offer-popup:${region}`;

/** What is kept in localStorage once the popup was shown. */
export const offerSeenValue = (promotionId: number, now: number): string => JSON.stringify({ id: promotionId, at: now });

/** Whether the popup may open, given what this browser kept (`null` = nothing). A broken value counts as nothing. */
export function offerDue(stored: string | null, promotionId: number, now: number): boolean {
  if (stored === null) return true;
  try {
    const seen = JSON.parse(stored) as unknown;
    if (!isRecord(seen) || typeof seen.id !== "number" || typeof seen.at !== "number") return true;
    if (seen.id !== promotionId) return true;
    return seen.at > now || now - seen.at >= OFFER_QUIET_MS;
  } catch {
    return true;
  }
}

/** Pages where the popup never opens: the visitor is creating, managing or reading something else (studio, saved prints, partners, privacy). */
const QUIET_PAGES = ["personalizar", "minhas-estampas", "seja-parceiro", "privacidade"];
export function offerAllowedPath(pathname: string, region: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== region) return false;
  return !QUIET_PAGES.includes(parts[1] ?? "");
}
