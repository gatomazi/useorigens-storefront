/**
 * INK's progressive promotions ("desconto escalonado por patamares", `GET /v1/stores/promotions?type=progressive`), as "Monte seu kit" uses them. Pure:
 * the reading itself is in `promotions-client.ts` (server-only). Everything INK sends is checked here; anything off the documented shape is dropped, never
 * guessed. INK applies the discount at the cart: the numbers built here are only what the modal shows, from INK's own tiers.
 */

export type KitDiscountKind = "value" | "percentage";

export type InkProgressivePromotion = {
  id: number;
  code: string;
  /** `value` = R$ off the whole order; `percentage` = % off it. */
  kind: KitDiscountKind;
  /** `cart_items` = the tiers count pieces; `cart_value` = they count the cart total. */
  progressKind: string;
  /** `all` = every product; `products` / `product_types` / `collections` = only those. */
  listType: string;
  applyAutomatically: boolean;
  available: boolean;
  firstPurchase: boolean;
  showInCart: boolean;
  showOnProductPage: boolean;
  usageLimit: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  /** By quantity, smallest first. Empty when INK's tiers are not by quantity (or not usable). */
  tiers: KitTier[];
};

/** "From `items` pieces, `discount` off" (R$ or %, by the promotion's kind). */
export type KitTier = { items: number; discount: number };

/** More than this and the modal gets too long on a phone: the first ones are shown and the panel says so. */
export const MAX_KIT_TIERS = 6;
const MAX_ITEMS = 999;
const CODE = /^[A-Za-z0-9_-]{2,40}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const instant = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);
/** INK sends money and percentages as decimal strings ("25.0"). */
const decimal = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,7}(\.\d{1,4})?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function tiersOf(raw: unknown, kind: KitDiscountKind): KitTier[] {
  if (!Array.isArray(raw)) return [];
  const byItems = new Map<number, number>();
  for (const t of raw) {
    if (!isRecord(t)) return [];
    const items = t.min_cart_items;
    const discount = decimal(t.discount);
    if (typeof items !== "number" || !Number.isInteger(items) || items < 2 || items > MAX_ITEMS || discount === null || discount <= 0) return [];
    if (kind === "percentage" && discount >= 100) return [];
    if (byItems.has(items)) return [];
    byItems.set(items, discount);
  }
  return [...byItems.entries()].sort((a, b) => a[0] - b[0]).map(([items, discount]) => ({ items, discount }));
}

/** One promotion as INK sends it, or null when it is not a usable progressive promotion. */
export function normalizeProgressivePromotion(raw: unknown): InkProgressivePromotion | null {
  if (!isRecord(raw) || raw.type !== "progressive") return null;
  const { id, code } = raw;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || typeof code !== "string" || !CODE.test(code)) return null;
  if (raw.kind !== "value" && raw.kind !== "percentage") return null;
  const kind = raw.kind;
  return {
    id,
    code,
    kind,
    progressKind: typeof raw.progress_kind === "string" ? raw.progress_kind : "",
    listType: typeof raw.list_type === "string" ? raw.list_type : "",
    applyAutomatically: raw.apply_automatically === true,
    available: raw.available === true,
    firstPurchase: raw.first_purchase === true,
    showInCart: raw.show_in_cart === true,
    showOnProductPage: raw.show_on_product_page === true,
    usageLimit: typeof raw.usage_limit === "number" && Number.isInteger(raw.usage_limit) ? raw.usage_limit : null,
    startsAt: instant(raw.starts_at),
    expiresAt: instant(raw.expires_at),
    tiers: raw.progress_kind === "cart_items" ? tiersOf(raw.discount_tiers, kind) : [],
  };
}

/**
 * Why a promotion cannot be the kit (pt-BR, for the panel), or null when it can. v1 shows only what is TRUE for any piece the customer adds: tiers by
 * quantity, on every product, for every customer. A promotion that has not started yet can be chosen: it shows from the moment it starts.
 */
export function kitUnsupportedReason(p: InkProgressivePromotion, now: number = Date.now()): string | null {
  if (p.progressKind !== "cart_items") return "As faixas são por valor do carrinho, não por quantidade de peças.";
  if (p.listType !== "all") return "Vale só para alguns produtos, tipos ou coleções: o modal não tem como saber se a peça adicionada participa.";
  if (p.firstPurchase) return "Vale só na primeira compra: quem já comprou veria um desconto que não tem.";
  if (!p.available) return "A INK marca a promoção como indisponível.";
  if (p.expiresAt && Date.parse(p.expiresAt) <= now) return "A promoção já terminou.";
  if (p.tiers.length === 0) return "Não tem faixas por quantidade que dê para mostrar.";
  return null;
}

/** Live at `now`: usable, started and not finished. */
export const kitPromotionLive = (p: InkProgressivePromotion, now: number = Date.now()): boolean =>
  kitUnsupportedReason(p, now) === null && (!p.startsAt || Date.parse(p.startsAt) <= now);

/** The tiers the modal shows (the first MAX_KIT_TIERS). */
export const shownKitTiers = (tiers: readonly KitTier[]): KitTier[] => tiers.slice(0, MAX_KIT_TIERS);

const brl = (cents: number): string => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const percent = (n: number): string => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** "R$ 25 OFF" / "10% OFF" (whole reais without cents, as the store writes them). */
export const kitDiscountLabel = (kind: KitDiscountKind, discount: number): string =>
  kind === "value" ? `${brl(Math.round(discount * 100)).replace(/,00$/, "")} OFF` : `${percent(discount)} OFF`;

/** "3 peças: R$ 25 OFF · 4 peças: R$ 40 OFF" */
export const kitTiersSummary = (p: Pick<InkProgressivePromotion, "kind" | "tiers">): string =>
  p.tiers.map((t) => `${t.items} peças: ${kitDiscountLabel(p.kind, t.discount)}`).join(" · ");

export type KitTierPrice = { items: number; fullCents: number; totalCents: number; eachCents: number; savedCents: number };

/**
 * What a tier costs with `unitCents` per piece (the price of the piece just added). `value`: R$ off the total; `percentage`: % off it. A tier whose discount
 * would leave nothing to pay is not a price anyone gets: null (the modal then shows only the discounts). The same arithmetic as the Worker's block.
 */
export function kitTierPrices(unitCents: number, kind: KitDiscountKind, tiers: readonly KitTier[]): KitTierPrice[] | null {
  if (!Number.isInteger(unitCents) || unitCents <= 0) return null;
  const out: KitTierPrice[] = [];
  for (const t of tiers) {
    const fullCents = unitCents * t.items;
    const totalCents = kind === "value" ? fullCents - Math.round(t.discount * 100) : Math.round((fullCents * (100 - t.discount)) / 100);
    if (totalCents <= 0 || totalCents >= fullCents) return null;
    out.push({ items: t.items, fullCents, totalCents, eachCents: Math.round(totalCents / t.items), savedCents: fullCents - totalCents });
  }
  return out;
}

export const formatKitMoney = brl;
