import type { CommerceStoreKey } from "../geo/regions";
import { toCents } from "./money";

/**
 * INK order → the fields the MCP tools may use. Buyer (name, e-mail, phone, document), billing address, street/number/CEP of the shipping
 * address, payment method and PIX data, art/mockup URLs and the free-text descriptions of delivery events are dropped HERE, at the boundary:
 * they never reach a cache, a log or a tool result. Of the destination only city and UF are kept (the "cidade de entrega" dimension).
 * Product names and tags are INK data, shown as data, never followed as instructions.
 *
 * Money is integer cents (src/lib/mcp/money.ts). Reconciled on 400 real orders (Sul + Centro-Oeste, 2026-07..10, counts only):
 *   item.total_value = item.unit_value × item.quantity                                                         (400/400)
 *   order.total_value = Σ item.total_value + shipping_value − promotion_value − payment_discount_value − freight_value_difference   (400/400)
 * A refunded order keeps its total_value; only its payment status changes ("Reembolsado").
 */
export type McpOrderItem = {
  itemId: string;
  productId: string;
  productName: string;
  productTags: string[];
  sku: string | null;
  variant: { id: string | null; model: string | null; color: string | null; size: string | null };
  quantity: number;
  refundedQuantity: number;
  freeQuantity: number;
  unitValueCents: number | null;
  totalValueCents: number | null;
  produced: boolean | null;
};

export type McpOrder = {
  store: CommerceStoreKey;
  orderId: string;
  createdAt: string;
  orderStatus: string;
  orderStatusLabel: string;
  paymentStatusLabel: string;
  isExchange: boolean;
  /** INK: a troca (POST /v1/stores/exchanges) is accepted now — before production, or up to 30 days after delivery. */
  exchangeable: boolean | null;
  /** INK: the items may still be swapped in place (same price), before the order enters the factory. Never true with `exchangeable`. */
  itemsEditable: boolean | null;
  totalCents: number | null;
  shippingCents: number | null;
  promotionCents: number | null;
  paymentDiscountCents: number | null;
  freightDifferenceCents: number | null;
  kickbackCents: number | null;
  promotionCode: string | null;
  destination: { city: string | null; uf: string | null };
  delivery: {
    carrier: string | null;
    currentStatus: string | null;
    productionDeadline: string | null;
    productionDelayed: boolean | null;
    estimatedDeliveryDate: string | null;
    deliveryDelayed: boolean | null;
    deliveredAt: string | null;
    trackingCode: string | null;
    /** Last delivery events, newest first: type, short label and time only (descriptions and observations are dropped). */
    lastEvents: { type: string | null; event: string | null; at: string | null }[];
  };
  items: McpOrderItem[];
};

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
const id = (v: unknown): string | null => (typeof v === "number" && Number.isSafeInteger(v) ? String(v) : typeof v === "string" && /^\d{1,15}$/.test(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const count = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
const UF = /^[A-Z]{2}$/;

/** Null for anything that is not a readable order (no id, no creation date, items not a list, an item without product id or quantity). */
export function parseMcpOrder(raw: unknown, store: CommerceStoreKey): McpOrder | null {
  const o = rec(raw);
  const orderId = id(o.id);
  const createdAt = str(o.created_at, 40);
  if (!orderId || !createdAt || !Number.isFinite(Date.parse(createdAt)) || !Array.isArray(o.items)) return null;
  const items: McpOrderItem[] = [];
  for (const rawItem of o.items) {
    const it = rec(rawItem);
    const p = rec(it.product_v2);
    const v = rec(it.product_variant);
    const itemId = id(it.id);
    const productId = id(p.id);
    if (!itemId || !productId || typeof it.quantity !== "number" || !Number.isInteger(it.quantity) || it.quantity < 0) return null;
    items.push({
      itemId,
      productId,
      productName: str(p.name) ?? "",
      productTags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === "string").map((t) => t.slice(0, 80)).slice(0, 20) : [],
      sku: str(it.sku, 80) ?? str(v.sku, 80),
      variant: { id: id(v.id), model: str(v.model, 80), color: str(v.color, 80), size: str(v.size, 20) },
      quantity: it.quantity,
      refundedQuantity: count(it.refunded_quantity),
      freeQuantity: count(it.free_quantity),
      unitValueCents: toCents(it.unit_value),
      totalValueCents: toCents(it.total_value),
      produced: bool(it.produced),
    });
  }
  const shipping = rec(o.shipping_address);
  const d = rec(o.delivery);
  const history = Array.isArray(d.history) ? d.history.map(rec) : [];
  const lastEvents = history
    .map((e) => ({ type: str(e.event_type, 60), event: str(e.event, 120), at: str(e.created_at, 40) }))
    .sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0))
    .slice(0, 3);
  const uf = str(shipping.state, 2)?.toUpperCase() ?? null;
  return {
    store,
    orderId,
    createdAt,
    orderStatus: str(o.order_status, 60) ?? "",
    orderStatusLabel: str(o.formatted_order_status, 60) ?? "",
    paymentStatusLabel: str(o.payment_status, 60) ?? "",
    isExchange: o.is_exchange === true,
    exchangeable: bool(o.exchangeable),
    itemsEditable: bool(o.items_editable),
    totalCents: toCents(o.total_value),
    shippingCents: toCents(o.shipping_value),
    promotionCents: toCents(o.promotion_value),
    paymentDiscountCents: toCents(o.payment_discount_value),
    freightDifferenceCents: toCents(o.freight_value_difference),
    kickbackCents: toCents(o.kickback_value),
    promotionCode: str(o.promotion_code, 60),
    destination: { city: str(shipping.city, 80), uf: uf && UF.test(uf) ? uf : null },
    delivery: {
      carrier: str(d.carrier, 60),
      currentStatus: str(d.current_status, 80),
      productionDeadline: str(d.production_deadline, 40),
      productionDelayed: bool(d.production_delayed),
      estimatedDeliveryDate: str(d.estimated_delivery_date, 40),
      deliveryDelayed: bool(d.delivery_delayed),
      deliveredAt: str(d.delivered_at, 40),
      trackingCode: str(d.tracking_code, 60),
      lastEvents,
    },
    items,
  };
}

/**
 * INK answers `payment_status` localized ("Pago") while its filter takes the machine value (`paid`), see src/lib/podio/orders.ts. The tools
 * filter with the machine value and re-check the label, so an order whose status changed between pages is not counted as paid.
 */
export const PAYMENT_STATUS_FILTERS = ["paid", "waiting_payment", "refund_requested", "refunded", "canceled", "expired", "chargeback"] as const;
const PAID_LABELS = new Set(["pago", "paid", "succeeded"]);
export const isPaidLabel = (label: string): boolean => PAID_LABELS.has(label.trim().toLowerCase());

/**
 * `order_status` machine values seen on the three stores (2026-10: all of these but `sent`) or listed in INK's reconciliation guide (`sent`).
 * Not an exhaustive enum: INK publishes none, so the filter also accepts any other lower-case value it may use.
 */
export const KNOWN_ORDER_STATUSES = ["waiting_payment", "awaiting_production", "sent", "left_for_delivery", "delivery_in_progress", "delivered", "delivery_failure", "returned", "refunded", "canceled"] as const;

/** Net units of a line: refunded and free units never count; never negative. */
export const netUnits = (item: Pick<McpOrderItem, "quantity" | "refundedQuantity" | "freeQuantity">): number => Math.max(0, item.quantity - item.refundedQuantity - item.freeQuantity);
