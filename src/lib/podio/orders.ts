import type { PodioExclusions, PodioOrder, PodioOrderItem } from "./types";
import { inWindow, type PodioWindow } from "./window";

/**
 * INK order → the few fields the ranking needs. Buyer, addresses, payment method/card, delivery history and every price except the order
 * total are dropped HERE, at the boundary, so nothing personal ever reaches a snapshot, a log or a test fixture. Returns null for anything
 * malformed (an order the ranking cannot read is never counted).
 */
export function parseInkOrder(raw: unknown): PodioOrder | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const orderId = typeof o.id === "number" || typeof o.id === "string" ? String(o.id) : null;
  const createdAt = typeof o.created_at === "string" ? o.created_at : null;
  if (!orderId || !createdAt || !Array.isArray(o.items)) return null;
  const items: PodioOrderItem[] = [];
  for (const rawItem of o.items) {
    if (typeof rawItem !== "object" || rawItem === null) return null;
    const it = rawItem as Record<string, unknown>;
    const p = (typeof it.product_v2 === "object" && it.product_v2 !== null ? it.product_v2 : {}) as Record<string, unknown>;
    const itemId = typeof it.id === "number" || typeof it.id === "string" ? String(it.id) : null;
    const productId = typeof p.id === "number" || typeof p.id === "string" ? String(p.id) : null;
    if (!itemId || !productId || typeof it.quantity !== "number") return null;
    items.push({
      itemId,
      quantity: it.quantity,
      refundedQuantity: typeof it.refunded_quantity === "number" ? it.refunded_quantity : 0,
      freeQuantity: typeof it.free_quantity === "number" ? it.free_quantity : 0,
      product: {
        id: productId,
        name: typeof p.name === "string" ? p.name : "",
        tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === "string") : [],
      },
    });
  }
  const total = typeof o.total_value === "string" || typeof o.total_value === "number" ? Number(o.total_value) : NaN;
  return {
    orderId,
    createdAt,
    paymentStatus: typeof o.payment_status === "string" ? o.payment_status : "",
    isExchange: o.is_exchange === true,
    totalValue: Number.isFinite(total) ? total : null,
    items,
  };
}

/**
 * INK answers `payment_status` localized ("Pago") even though its filter takes the raw value (`paid`). Verified against real orders on the
 * three stores (2026-10): `?payment_status=paid` returns exactly the orders whose text is "Pago". Anything else — "Expirado", "Cancelado",
 * "Reembolsado", "Não Autorizado", "Aguardando análise" — is not a confirmed payment.
 */
const PAID = new Set(["pago", "paid", "succeeded"]);
export const isPaid = (status: string): boolean => PAID.has(status.trim().toLowerCase());

/** Net units of one line: refunded and free units never count; never negative. */
export function netUnits(item: Pick<PodioOrderItem, "quantity" | "refundedQuantity" | "freeQuantity">): number {
  return Math.max(0, item.quantity - Math.max(0, item.refundedQuantity) - Math.max(0, item.freeQuantity));
}

export type EligibleLine = { key: string; productId: string; product: PodioOrderItem["product"]; units: number };

export const emptyExclusions = (): PodioExclusions => ({ notPaid: 0, exchange: 0, zeroValue: 0, outsideWindow: 0, duplicate: 0 });

/**
 * Eligible order lines of one store, deduplicated by `<store>:<order id>` (paging can repeat an order when new ones arrive mid-fetch) and
 * line identity `<store>:<order id>:<item id>`. Excluded:
 *  - not paid (current status), refunded/cancelled orders included;
 *  - exchanges (`is_exchange`): a replacement for a unit already counted in its original order;
 *  - orders with no positive total (courtesy/test orders: INK has no explicit test flag);
 *  - created outside [start, end) — INK exposes no payment-confirmation date (see docs/storefront/podio.md).
 */
export function eligibleLines(storeKey: string, orders: readonly PodioOrder[], window: Pick<PodioWindow, "start" | "end">) {
  const excluded = emptyExclusions();
  const seenOrders = new Set<string>();
  const lines: EligibleLine[] = [];
  let ordersEligible = 0;
  for (const order of orders) {
    const orderKey = `${storeKey}:${order.orderId}`;
    if (seenOrders.has(orderKey)) {
      excluded.duplicate++;
      continue;
    }
    seenOrders.add(orderKey);
    if (!isPaid(order.paymentStatus)) excluded.notPaid++;
    else if (order.isExchange) excluded.exchange++;
    else if (order.totalValue === null || order.totalValue <= 0) excluded.zeroValue++;
    else if (!inWindow(order.createdAt, window)) excluded.outsideWindow++;
    else {
      ordersEligible++;
      const seenItems = new Set<string>();
      for (const item of order.items) {
        const key = `${orderKey}:${item.itemId}`;
        if (seenItems.has(key)) continue;
        seenItems.add(key);
        const units = netUnits(item);
        if (units > 0) lines.push({ key, productId: item.product.id, product: item.product, units });
      }
    }
  }
  return { lines, excluded, ordersEligible };
}
