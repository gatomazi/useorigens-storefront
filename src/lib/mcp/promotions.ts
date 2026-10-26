import type { CommerceStoreKey, RegionSlug } from "../geo/regions";
import { promotionStatus, type PromotionItem, type PromotionStatus } from "../site-config/promotions";
import { money } from "./money";
import { netUnits, type McpOrder } from "./orders-model";
import type { Period } from "./period";
import { eligibleOrders } from "./sales";

/**
 * Coupons and promotions, from two sources that are never mixed up:
 *   - what the owner PUBLISHED in the panel ("Cupons e promoções" per region): a description shown on the storefront and on the INK pages.
 *     The panel holds no discount rule; INK executes the promotion. Status (live, scheduled, ended, off) is the one at query time — the
 *     panel keeps no history of when an item was switched on;
 *   - what the ORDERS say: INK's `promotion_code` and `promotion_value` on the paid orders of the period (same universe as the sales).
 * A configured coupon and a code on the orders are tied by the code, ignoring case. An order with a code does not prove the coupon caused
 * the sale; with/without-code averages are a description, not an effect.
 */
export type ConfiguredPromotions = { source: "published" | "seed"; asOf: string | null; regions: { region: RegionSlug; items: PromotionItem[] }[] };

export const codeKey = (code: string) => code.trim().toUpperCase();

export function configuredRows(config: ConfiguredPromotions, now: number, region?: RegionSlug) {
  return config.regions
    .filter((r) => !region || r.region === region)
    .flatMap((r) =>
      [...r.items]
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          region: r.region,
          id: item.id,
          type: item.type,
          title: item.title,
          ...(item.code ? { code: item.code } : {}),
          description: item.description,
          ...(item.callout ? { callout: item.callout } : {}),
          ...(item.badgeLabel ? { badge_label: item.badgeLabel } : {}),
          order: item.order,
          enabled: item.enabled,
          ...(item.startsAt ? { starts_at: item.startsAt } : {}),
          ...(item.endsAt ? { ends_at: item.endsAt } : {}),
          status: promotionStatus(item, now),
        })),
    );
}

type Agg = { orders: number; units: number; total: number; merchandise: number; promotion: number; shipping: number; unknownMoney: number; stores: Set<CommerceStoreKey>; spellings: Set<string> };
const agg = (): Agg => ({ orders: 0, units: 0, total: 0, merchandise: 0, promotion: 0, shipping: 0, unknownMoney: 0, stores: new Set(), spellings: new Set() });

function add(a: Agg, o: McpOrder): void {
  a.orders++;
  a.units += o.items.reduce((s, i) => s + netUnits(i), 0);
  for (const [field, cents] of [["total", o.totalCents], ["promotion", o.promotionCents], ["shipping", o.shippingCents]] as const) {
    if (cents === null) a.unknownMoney++;
    else a[field] += cents;
  }
  for (const i of o.items) {
    if (i.totalValueCents === null) a.unknownMoney++;
    else a.merchandise += i.totalValueCents;
  }
  a.stores.add(o.store);
}

const aggOut = (a: Agg) => ({
  orders: a.orders,
  units_net: a.units,
  order_total: money(a.total),
  merchandise: money(a.merchandise),
  promotion_discount: money(a.promotion),
  shipping: money(a.shipping),
  average_order_value: a.orders ? money(Math.round(a.total / a.orders)) : null,
  average_units_per_order: a.orders ? Math.round((a.units / a.orders) * 100) / 100 : null,
  ...(a.unknownMoney ? { unknown_money_fields: a.unknownMoney } : {}),
});

type ConfiguredRef = { region: RegionSlug; id: string; title: string; status: PromotionStatus };

/** Usage of every code on the paid orders of the period, with the configured coupon it matches (if any) and the configured coupons nobody used. */
export function promotionUsage(orders: readonly McpOrder[], period: Pick<Period, "start" | "endExclusive">, config: ConfiguredPromotions, regions: readonly RegionSlug[], now: number) {
  const { orders: kept, excluded } = eligibleOrders(orders, period);
  const configured = new Map<string, ConfiguredRef[]>();
  for (const r of config.regions) {
    for (const item of r.items) {
      if (item.type !== "coupon" || !item.code) continue;
      const k = codeKey(item.code);
      configured.set(k, [...(configured.get(k) ?? []), { region: r.region, id: item.id, title: item.title, status: promotionStatus(item, now) }]);
    }
  }
  const byCode = new Map<string, Agg>();
  const withoutCode = agg();
  const automatic = agg(); // no code, but INK applied a promotion discount (an automatic promotion)
  let discountTotal = 0;
  let paymentDiscountTotal = 0;
  for (const o of kept) {
    discountTotal += o.promotionCents ?? 0;
    paymentDiscountTotal += o.paymentDiscountCents ?? 0;
    if (o.promotionCode) {
      const k = codeKey(o.promotionCode);
      const a = byCode.get(k) ?? agg();
      add(a, o);
      a.spellings.add(o.promotionCode);
      byCode.set(k, a);
    } else {
      add(withoutCode, o);
      if ((o.promotionCents ?? 0) > 0) add(automatic, o);
    }
  }
  const rows = [...byCode.entries()]
    .sort(([ka, a], [kb, b]) => b.orders - a.orders || b.promotion - a.promotion || ka.localeCompare(kb))
    .map(([code, a]) => ({
      code,
      ...(a.spellings.size > 1 ? { spellings: [...a.spellings].sort() } : {}),
      stores: [...a.stores].sort(),
      ...aggOut(a),
      share_of_orders: kept.length ? Math.round((a.orders / kept.length) * 1000) / 1000 : 0,
      configured_in_panel: configured.get(code) ?? null,
    }));
  const queriedRegions = new Set(regions);
  const unused = [...configured.entries()].filter(([code]) => !byCode.has(code)).flatMap(([code, refs]) => refs.filter((r) => queriedRegions.has(r.region)).map((r) => ({ code, ...r })));
  const withCode = kept.length - withoutCode.orders;
  return {
    orders_in_period: kept.length,
    orders_with_code: withCode,
    share_of_orders_with_code: kept.length ? Math.round((withCode / kept.length) * 1000) / 1000 : 0,
    promotion_discount_total: money(discountTotal),
    payment_discount_total: money(paymentDiscountTotal),
    by_code: rows,
    without_code: { ...aggOut(withoutCode), orders_with_promotion_discount: automatic.orders },
    configured_coupons_without_orders: unused,
    excluded,
  };
}
