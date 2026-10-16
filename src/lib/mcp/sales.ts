import { familyById, type DesignFamilyId } from "../catalog/families";
import { REGIONS, STATE_NAMES, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { classifyProduct, type CatalogContext, type DesignClassification } from "./classify";
import { money, type Money } from "./money";
import { isPaidLabel, netUnits, type McpOrder, type McpOrderItem } from "./orders-model";
import { inPeriod, type Period } from "./period";

/**
 * The sales contract of the MCP, computed on the server over EVERY order of the period (never over a first page sent to the model).
 *
 * Universe ("venda"): an INK order CREATED in the period (São Paulo days, `date_basis: order_created_at`) whose payment status is "Pago" at
 * query time (INK exposes no payment-confirmation date, so this is "pedidos criados no período com pagamento aprovado", not "pagamentos
 * recebidos no período"). Excluded and counted: not paid, exchanges (`is_exchange`: a replacement of a unit already sold), orders with no
 * positive total (courtesy/test: INK has no test flag), duplicates from paging.
 *
 * Units are net: quantity − refunded − free. Order money is exactly INK's fields (see orders-model.ts for the reconciled identity). Item
 * value is `unit_value × net units`: the price of the pieces before the order's promotion/payment discount and without shipping — INK gives
 * no per-line split of those, so no "net per item" is invented. `kickback_value` is INK's payout to the store ("repasse informado pela INK"),
 * never profit. The current catalog price is never used for past sales, nor INK's cumulative `total_sales_count`.
 */
export type ItemFilters = {
  design_region?: RegionSlug;
  design_uf?: string;
  /** Locality key: IBGE municipality id, or a DF administrative-region id. */
  design_locality?: string;
  family?: DesignFamilyId;
  product_id?: string;
  delivery_uf?: string;
  /** Delivery city name, compared without accents/case. */
  delivery_city?: string;
  /** INK category (collection) as the owner gave it (id, slug or name); the matching uses `CategoryMatcher.selected`. */
  category?: string;
  /** Order-level: the coupon code INK recorded on the order, compared without case. */
  promotion_code?: string;
};

/**
 * What the category filter and dimension need (categories.ts, wired in tools.ts): the categories of a sold product, or `null` when its
 * membership is UNKNOWN (a product outside the categories snapshot: garment siblings, products delisted since the sync). `selected` holds the
 * category keys (`store:id`) of the filter.
 */
export type CategoryTag = { key: string; label: string; store: CommerceStoreKey; id: number; slug: string; visibility: "public" | "internal" };
export type CategoryMatcher = { of: (store: CommerceStoreKey, productId: string) => readonly CategoryTag[] | null; selected?: ReadonlySet<string> };
export type CategoryVisibility = "public" | "internal" | "all";

export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export type Exclusions = { not_paid: number; exchange: number; zero_or_unknown_total: number; outside_period: number; duplicate: number };

type Line = { order: McpOrder; item: McpOrderItem; units: number; valueCents: number | null; design: DesignClassification };

export function eligibleOrders(orders: readonly McpOrder[], period: Pick<Period, "start" | "endExclusive">) {
  const excluded: Exclusions = { not_paid: 0, exchange: 0, zero_or_unknown_total: 0, outside_period: 0, duplicate: 0 };
  const seen = new Set<string>();
  const kept: McpOrder[] = [];
  for (const o of orders) {
    const k = `${o.store}:${o.orderId}`;
    if (seen.has(k)) {
      excluded.duplicate++;
      continue;
    }
    seen.add(k);
    if (!inPeriod(o.createdAt, period)) excluded.outside_period++;
    else if (!isPaidLabel(o.paymentStatusLabel)) excluded.not_paid++;
    else if (o.isExchange) excluded.exchange++;
    else if (o.totalCents === null || o.totalCents <= 0) excluded.zero_or_unknown_total++;
    else kept.push(o);
  }
  return { orders: kept, excluded };
}

function linesOf(orders: readonly McpOrder[], ctx: CatalogContext): Line[] {
  const lines: Line[] = [];
  for (const order of orders) {
    for (const item of order.items) {
      const units = netUnits(item);
      if (units <= 0) continue;
      lines.push({
        order,
        item,
        units,
        valueCents: item.unitValueCents === null ? null : item.unitValueCents * units,
        design: classifyProduct(order.store, { id: item.productId, name: item.productName, tags: item.productTags }, ctx),
      });
    }
  }
  return lines;
}

const hasItemFilter = (f: ItemFilters) => Object.values(f).some((v) => v !== undefined);

function lineMatches(line: Line, f: ItemFilters, cat?: CategoryMatcher): boolean {
  if (f.product_id && line.item.productId !== f.product_id) return false;
  if (f.delivery_uf && line.order.destination.uf !== f.delivery_uf) return false;
  if (f.delivery_city && fold(line.order.destination.city ?? "") !== fold(f.delivery_city)) return false;
  if (f.promotion_code && fold(line.order.promotionCode ?? "") !== fold(f.promotion_code)) return false;
  if (f.category) {
    const tags = cat?.of(line.order.store, line.item.productId);
    if (!tags || !tags.some((t) => cat?.selected?.has(t.key))) return false;
  }
  const needsDesign = f.design_region || f.design_uf || f.design_locality || f.family;
  if (!needsDesign) return true;
  const d = line.design;
  if (d.status !== "classified") return false;
  if (f.design_region && d.region !== f.design_region) return false;
  if (f.design_uf && d.uf !== f.design_uf) return false;
  if (f.design_locality && d.localityKey !== f.design_locality) return false;
  if (f.family && d.family !== f.family) return false;
  return true;
}

function sumKnown(values: readonly (number | null)[]): { cents: number; unknown: number } {
  let cents = 0;
  let unknown = 0;
  for (const v of values) {
    if (v === null) unknown++;
    else cents += v;
  }
  return { cents, unknown };
}

function designCoverage(lines: readonly Line[]) {
  const reasons: Record<string, number> = {};
  let classified = 0;
  let unclassified = 0;
  for (const l of lines) {
    if (l.design.status === "classified") classified += l.units;
    else {
      unclassified += l.units;
      reasons[l.design.reason] = (reasons[l.design.reason] ?? 0) + l.units;
    }
  }
  const total = classified + unclassified;
  return { classified_units: classified, unclassified_units: unclassified, unclassified_share: total ? Math.round((unclassified / total) * 1000) / 1000 : 0, unclassified_by_reason: reasons };
}

/** How much of the period's units the categories snapshot can place at all: an unknown membership is reported, never read as "no category". */
function categoryCoverage(lines: readonly Line[], cat: CategoryMatcher) {
  let inSome = 0;
  let none = 0;
  let unknown = 0;
  for (const l of lines) {
    const tags = cat.of(l.order.store, l.item.productId);
    if (tags === null) unknown += l.units;
    else if (tags.length === 0) none += l.units;
    else inSome += l.units;
  }
  const total = inSome + none + unknown;
  return { units_in_some_category: inSome, units_without_category: none, units_membership_unknown: unknown, membership_unknown_share: total ? Math.round((unknown / total) * 1000) / 1000 : 0 };
}

export type SalesSummary = ReturnType<typeof salesSummary>;

export function salesSummary(orders: readonly McpOrder[], period: Pick<Period, "start" | "endExclusive">, ctx: CatalogContext, filters: ItemFilters, cat?: CategoryMatcher) {
  const { orders: kept, excluded } = eligibleOrders(orders, period);
  const lines = linesOf(kept, ctx);
  const coverage = designCoverage(lines);
  const byStore: Record<string, { orders: number; order_total: Money }> = {};

  if (!hasItemFilter(filters)) {
    const total = sumKnown(kept.map((o) => o.totalCents));
    const merchandise = sumKnown(kept.flatMap((o) => o.items.map((i) => i.totalValueCents)));
    const shipping = sumKnown(kept.map((o) => o.shippingCents));
    const promotion = sumKnown(kept.map((o) => o.promotionCents));
    const paymentDiscount = sumKnown(kept.map((o) => o.paymentDiscountCents));
    const freightDifference = sumKnown(kept.map((o) => o.freightDifferenceCents));
    const kickback = sumKnown(kept.map((o) => o.kickbackCents));
    for (const o of kept) {
      const s = (byStore[o.store] ??= { orders: 0, order_total: money(0) });
      s.orders++;
      s.order_total = money(s.order_total.cents + (o.totalCents ?? 0));
    }
    const unknownMoney = total.unknown + merchandise.unknown + shipping.unknown + promotion.unknown + paymentDiscount.unknown + freightDifference.unknown + kickback.unknown;
    return {
      scope: "orders" as const,
      orders: kept.length,
      units_net: lines.reduce((a, l) => a + l.units, 0),
      refunded_units: kept.reduce((a, o) => a + o.items.reduce((b, i) => b + i.refundedQuantity, 0), 0),
      order_total: money(total.cents),
      merchandise: money(merchandise.cents),
      shipping: money(shipping.cents),
      promotion_discount: money(promotion.cents),
      payment_discount: money(paymentDiscount.cents),
      freight_value_difference: money(freightDifference.cents),
      store_payout_reported_by_ink: money(kickback.cents),
      average_order_value: kept.length ? money(Math.round(total.cents / kept.length)) : null,
      by_store: byStore,
      design_coverage: coverage,
      excluded,
      unknown_money_fields: unknownMoney,
    };
  }

  const matching = lines.filter((l) => lineMatches(l, filters, cat));
  const ordersWith = new Set(matching.map((l) => `${l.order.store}:${l.order.orderId}`));
  const linesByOrder = new Map<string, Line[]>();
  for (const l of lines) {
    const k = `${l.order.store}:${l.order.orderId}`;
    linesByOrder.set(k, [...(linesByOrder.get(k) ?? []), l]);
  }
  let ordersOnly = 0;
  for (const k of ordersWith) if ((linesByOrder.get(k) ?? []).every((l) => lineMatches(l, filters, cat))) ordersOnly++;
  const value = sumKnown(matching.map((l) => l.valueCents));
  const storeOrders: Record<string, number> = {};
  for (const k of ordersWith) storeOrders[k.split(":")[0]] = (storeOrders[k.split(":")[0]] ?? 0) + 1;
  return {
    scope: "items" as const,
    orders_with_matching_items: ordersWith.size,
    orders_only_matching_items: ordersOnly,
    units_net: matching.reduce((a, l) => a + l.units, 0),
    items_value: money(value.cents),
    average_items_value_per_order: ordersWith.size ? money(Math.round(value.cents / ordersWith.size)) : null,
    orders_in_period: kept.length,
    by_store_orders_with_matching_items: storeOrders,
    design_coverage: coverage,
    ...(filters.category && cat ? { category_coverage: categoryCoverage(lines, cat) } : {}),
    excluded,
    unknown_money_fields: value.unknown,
    limitation:
      "Com filtro por item, o valor é preço unitário × unidades líquidas dos itens filtrados, antes de promoção/desconto do pedido e sem frete: a INK não informa o rateio desses valores por item. Total, frete e descontos do pedido só valem sem filtro de item.",
  };
}

export const RANK_DIMENSIONS = ["product", "design_city", "design_uf", "design_region", "family", "category", "model", "size", "color", "delivery_city", "delivery_uf", "store"] as const;
export type RankDimension = (typeof RANK_DIMENSIONS)[number];
export const RANK_METRICS = ["units", "items_value", "orders"] as const;
export type RankMetric = (typeof RANK_METRICS)[number];

const DESIGN_DIMENSIONS: ReadonlySet<RankDimension> = new Set(["design_city", "design_uf", "design_region", "family"]);
const VARIANT_DIMENSIONS: ReadonlySet<RankDimension> = new Set(["model", "size", "color"]);

type Key = { key: string; label: string; detail?: Record<string, string | number | null> };
type Bucket = Key & { units: number; valueCents: number; unknownValue: number; orders: Set<string> };
type Tally = { units: number; valueCents: number; orders: Set<string> };

/** The keys a line counts under: one for every dimension but `category` (a product may be in several); `null` = the line cannot be placed. */
function keysOf(line: Line, dim: RankDimension, cat: CategoryMatcher | undefined, visibility: CategoryVisibility): Key[] | null {
  const d = line.design;
  const one = (k: Key | null) => (k ? [k] : null);
  switch (dim) {
    case "product":
      return [{ key: `${line.order.store}:${line.item.productId}`, label: line.item.productName || `Produto ${line.item.productId}`, detail: { store: line.order.store, product_id: line.item.productId } }];
    case "design_city":
      return one(d.status === "classified" && d.localityKey ? { key: d.localityKey, label: `${d.localityName ?? d.localityKey} (${d.uf})`, detail: { locality_id: d.localityKey, uf: d.uf } } : null);
    case "design_uf":
      return one(d.status === "classified" ? { key: d.uf, label: STATE_NAMES[d.uf] ?? d.uf, detail: { uf: d.uf } } : null);
    case "design_region":
      return one(d.status === "classified" && d.region ? { key: d.region, label: REGIONS[d.region].name, detail: { region: d.region } } : null);
    case "family":
      return one(d.status === "classified" && d.family ? { key: d.family, label: familyById(d.family)?.name ?? d.family, detail: { family: d.family } } : null);
    case "category": {
      const tags = cat?.of(line.order.store, line.item.productId) ?? null;
      if (tags === null) return null;
      return tags.filter((t) => visibility === "all" || t.visibility === visibility).map((t) => ({ key: t.key, label: t.label, detail: { store: t.store, category_id: t.id, slug: t.slug, visibility: t.visibility } }));
    }
    case "model":
    case "size":
    case "color": {
      const v = line.item.variant[dim];
      return one(v ? { key: fold(v), label: v } : null);
    }
    case "delivery_city":
      return one(
        line.order.destination.city && line.order.destination.uf
          ? { key: `${line.order.destination.uf}:${fold(line.order.destination.city)}`, label: `${line.order.destination.city} (${line.order.destination.uf})`, detail: { uf: line.order.destination.uf } }
          : null,
      );
    case "delivery_uf":
      return one(line.order.destination.uf ? { key: line.order.destination.uf, label: STATE_NAMES[line.order.destination.uf] ?? line.order.destination.uf, detail: { uf: line.order.destination.uf } } : null);
    case "store":
      return [{ key: line.order.store, label: line.order.store, detail: { store: line.order.store } }];
  }
}

const tally = (): Tally => ({ units: 0, valueCents: 0, orders: new Set() });
function count(t: Tally, line: Line): void {
  t.units += line.units;
  t.valueCents += line.valueCents ?? 0;
  t.orders.add(`${line.order.store}:${line.order.orderId}`);
}
const tallyOut = (t: Tally) => ({ units_net: t.units, items_value: money(t.valueCents), orders: t.orders.size });

function notPlacedReason(dim: RankDimension): string | null {
  if (DESIGN_DIMENSIONS.has(dim)) return "unclassified_design";
  if (dim === "category") return "category_membership_unknown";
  if (VARIANT_DIMENSIONS.has(dim)) return "unknown_variant";
  return dim.startsWith("delivery_") ? "unknown_destination" : null;
}

export function salesRanking(
  orders: readonly McpOrder[],
  period: Pick<Period, "start" | "endExclusive">,
  ctx: CatalogContext,
  args: { dimension: RankDimension; metric: RankMetric; limit: number; filters: ItemFilters; categories?: CategoryMatcher; categoryVisibility?: CategoryVisibility },
) {
  const { orders: kept, excluded } = eligibleOrders(orders, period);
  const allLines = linesOf(kept, ctx);
  const lines = allLines.filter((l) => lineMatches(l, args.filters, args.categories));
  const visibility = args.categoryVisibility ?? "public";
  const buckets = new Map<string, Bucket>();
  const outside = tally();
  const withoutCategory = tally();
  const all = tally();
  for (const line of lines) {
    count(all, line);
    const keys = keysOf(line, args.dimension, args.categories, visibility);
    if (keys === null) count(outside, line);
    else if (keys.length === 0) count(withoutCategory, line);
    for (const k of keys ?? []) {
      const b = buckets.get(k.key) ?? { ...k, units: 0, valueCents: 0, unknownValue: 0, orders: new Set<string>() };
      b.units += line.units;
      if (line.valueCents === null) b.unknownValue++;
      else b.valueCents += line.valueCents;
      b.orders.add(`${line.order.store}:${line.order.orderId}`);
      buckets.set(k.key, b);
    }
  }
  const metricOf = (b: Tally) => (args.metric === "units" ? b.units : args.metric === "items_value" ? b.valueCents : b.orders.size);
  const ranked = [...buckets.values()].sort((a, b) => metricOf(b) - metricOf(a) || b.units - a.units || a.key.localeCompare(b.key));
  // A line counts under every category of its product, so category shares are over the lines themselves (they do not add up to 1).
  const overlapping = args.dimension === "category";
  const totalMetric = overlapping ? metricOf(all) : ranked.reduce((a, b) => a + metricOf(b), 0) + metricOf(outside);
  const rows = ranked.slice(0, args.limit).map((b, i) => ({
    position: i + 1,
    key: b.key,
    label: b.label,
    ...(b.detail ? { detail: b.detail } : {}),
    units_net: b.units,
    items_value: money(b.valueCents),
    orders: b.orders.size,
    share_of_metric: totalMetric ? Math.round((metricOf(b) / totalMetric) * 1000) / 1000 : 0,
    ...(b.unknownValue ? { lines_with_unknown_value: b.unknownValue } : {}),
  }));
  return {
    dimension: args.dimension,
    metric: args.metric,
    rows,
    ranked_keys: ranked.length,
    ...(overlapping ? { category_visibility: visibility, overlapping: true, without_category: tallyOut(withoutCategory) } : {}),
    ...(args.categories && (overlapping || args.filters.category) ? { category_coverage: categoryCoverage(allLines, args.categories) } : {}),
    // Lines the dimension cannot place: no reliable design (design dimensions), unknown category membership, no variant field or no destination. Reported, never ranked.
    not_placed: { reason: notPlacedReason(args.dimension), ...tallyOut(outside) },
    orders_in_period: kept.length,
    design_coverage: designCoverage(allLines),
    excluded,
  };
}
