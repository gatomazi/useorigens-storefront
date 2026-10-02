/**
 * "Cupons e promoções": what is live, the public payload and how a client reads it back. Pure (no I/O, no `server-only`): the public API, the
 * storefront button, the CMS preview and the tests run the very same rules. The Worker of the INK keeps its own copy of the payload check
 * (`use-origens-workers/src/promotions-gateway.js`): the contract between the two is `v: 1` below.
 */
import { HEX_COLOR } from "./color";
import { isPromoInstant, PROMO_CODE, PROMO_ID, PROMO_LIMITS, MAX_PROMOTIONS, type PromotionItem, type PromotionsConfig, type PromotionType } from "./promotions-schema";

export * from "./promotions-schema";

/** One card as the public sees it. `callout` and `badgeLabel` are omitted when empty; `endsAt` lets a client drop an item that expired while cached. */
export type PublicPromotion = {
  id: string;
  type: PromotionType;
  title: string;
  code?: string;
  description: string;
  callout?: string;
  badgeLabel?: string;
  order: number;
  endsAt?: string;
};
/** The region's chrome colour and the text on it, so the INK button wears the same colour as the storefront (both from the published palette). */
export type PromoTheme = { primary: string; onPrimary: string };
export type PublicPromotions = { v: 1; region: string; theme?: PromoTheme; items: PublicPromotion[] };

const at = (iso: string | undefined): number | null => (iso === undefined ? null : Date.parse(iso));

/** Enabled items inside their window at `now`, in the owner's order (ties keep the list order). An item with no window is always live. */
export function activePromotions(config: PromotionsConfig | undefined, now: number): PromotionItem[] {
  return (config?.items ?? [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const start = at(item.startsAt);
      const end = at(item.endsAt);
      return item.enabled && (start === null || now >= start) && (end === null || now < end);
    })
    .sort((a, b) => a.item.order - b.item.order || a.index - b.index)
    .map(({ item }) => item);
}

export function toPublicPromotion(item: PromotionItem, order: number): PublicPromotion {
  const out: PublicPromotion = { id: item.id, type: item.type, title: item.title, description: item.description, order };
  if (item.type === "coupon" && item.code) out.code = item.code;
  if (item.callout && item.callout.trim()) out.callout = item.callout;
  if (item.type === "coupon" && item.badgeLabel && item.badgeLabel.trim()) out.badgeLabel = item.badgeLabel;
  if (item.endsAt) out.endsAt = item.endsAt;
  return out;
}

/** The public, read-only payload of a region: only live items and only display fields (never `enabled`, `startsAt`, drafts or anything administrative). */
export function promotionsPayload(region: string, config: PromotionsConfig | undefined, now: number, theme?: PromoTheme): PublicPromotions {
  const items = activePromotions(config, now).map((item, i) => toPublicPromotion(item, i + 1));
  return theme ? { v: 1, region, theme, items } : { v: 1, region, items };
}

// ── Reading the payload back (storefront button) ─────────────────────────────────────────────────────────────────────────

const CONTROL = /[\u0000-\u001f\u007f]/;
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length >= 1 && t.length <= max && !CONTROL.test(t) ? t : null;
};

function readItem(raw: unknown, now: number): PublicPromotion | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const type = r.type === "coupon" || r.type === "promotion" ? r.type : null;
  const title = text(r.title, PROMO_LIMITS.title);
  const description = text(r.description, PROMO_LIMITS.description);
  if (!type || typeof r.id !== "string" || !PROMO_ID.test(r.id) || !title || !description) return null;
  if (type === "coupon" && (typeof r.code !== "string" || !PROMO_CODE.test(r.code))) return null;
  // `callout` may be a string, null or absent: the last two (and an empty string) all mean "no line".
  const callout = r.callout === undefined || r.callout === null || r.callout === "" ? null : text(r.callout, PROMO_LIMITS.callout);
  if (callout === null && typeof r.callout === "string" && r.callout.trim() !== "") return null;
  if (r.endsAt !== undefined && (!isPromoInstant(r.endsAt) || Date.parse(r.endsAt) <= now)) return null;
  const out: PublicPromotion = { id: r.id, type, title, description, order: 0 };
  if (type === "coupon") out.code = r.code as string;
  if (callout) out.callout = callout;
  const badge = type === "coupon" ? text(r.badgeLabel, PROMO_LIMITS.badgeLabel) : null;
  if (badge) out.badgeLabel = badge;
  if (typeof r.endsAt === "string") out.endsAt = r.endsAt;
  return out;
}

/**
 * The payload as a client trusts it: anything that is not `v: 1` of THIS region is refused whole (the caller then shows nothing); a single bad item is
 * dropped, the others stay. Items that already ended (by the visitor's clock) are dropped too.
 */
export function parsePromotionsPayload(data: unknown, region: string, now: number): { items: PublicPromotion[]; theme?: PromoTheme } | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.v !== 1 || d.region !== region || !Array.isArray(d.items) || d.items.length > MAX_PROMOTIONS) return null;
  const seen = new Set<string>();
  const items = d.items.flatMap((raw) => {
    const item = readItem(raw, now);
    if (!item || seen.has(item.id)) return [];
    seen.add(item.id);
    return [item];
  }).map((item, i) => ({ ...item, order: i + 1 }));
  const t = d.theme as Record<string, unknown> | undefined;
  const theme = t && typeof t.primary === "string" && HEX_COLOR.test(t.primary) && typeof t.onPrimary === "string" && HEX_COLOR.test(t.onPrimary) ? { primary: t.primary, onPrimary: t.onPrimary } : undefined;
  return theme ? { items, theme } : { items };
}

/** Badge of the button: the number of COPYABLE coupons ("9+" above nine); `null` = no badge (only announcements, or nothing). */
export function couponBadgeText(items: readonly Pick<PublicPromotion, "type">[]): string | null {
  const n = items.filter((i) => i.type === "coupon").length;
  return n === 0 ? null : n > 9 ? "9+" : String(n);
}

// ── Editor dates (Brasília time) ─────────────────────────────────────────────────────────────────────────────────────────
// The owner types dates in Brasília time. Brazil has had no daylight saving time since 2019, so America/Sao_Paulo is a fixed UTC-3 and a stored
// instant always carries that offset explicitly (`…-03:00`): the window never depends on the server's or the visitor's timezone.

export const BRASILIA_OFFSET = "-03:00";
const LOCAL_INPUT = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

/** `<input type="datetime-local">` value (`2026-10-05T09:30`, Brasília) → stored instant; empty → `undefined`; anything else → `null`. */
export function fromBrasiliaInput(value: string): string | undefined | null {
  const v = value.trim();
  if (v === "") return undefined;
  const m = LOCAL_INPUT.exec(v);
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:00${BRASILIA_OFFSET}`;
  return isPromoInstant(iso) ? iso : null;
}

/** Stored instant → the `datetime-local` value in Brasília time (an instant stored with another offset is converted). */
export function toBrasiliaInput(iso: string | undefined): string {
  if (!iso || !isPromoInstant(iso)) return "";
  const shifted = new Date(Date.parse(iso) - 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

/** "5 out. 2026, 09:30" in Brasília time, for the editor's status lines. */
export function formatBrasilia(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export type PromotionStatus = "live" | "disabled" | "scheduled" | "ended";
/** What the owner needs to see next to an item: is it public right now, and if not, why. */
export function promotionStatus(item: Pick<PromotionItem, "enabled" | "startsAt" | "endsAt">, now: number): PromotionStatus {
  if (!item.enabled) return "disabled";
  const end = at(item.endsAt);
  if (end !== null && now >= end) return "ended";
  const start = at(item.startsAt);
  if (start !== null && now < start) return "scheduled";
  return "live";
}
