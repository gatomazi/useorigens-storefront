import { purchaseUrl } from "../catalog/commerce";
import { BRAZIL_UF_NAMES } from "../geo/brazil-cities";
import { isPaid, netUnits } from "../podio/orders";

/**
 * "Em alta" — an INK order reduced to what the sales signals need. Buyer, addresses (except the delivery STATE, the only place a purchase notice
 * mentions), payment, delivery and every price but the order total are dropped HERE, at the boundary: nothing personal reaches the Volume, a log or a
 * page. Same eligibility as the pódio (`podio/orders.ts`): paid, not an exchange, positive total, refunded and free units out.
 */
export type EmAltaItem = {
  itemId: string;
  productId: string;
  /** Net units (refunded and free ones out). */
  units: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  /** INK's product page, only when it is an allowed https store host (`purchaseUrl`). */
  url: string | null;
};

export type EmAltaOrder = {
  orderId: string;
  /** ISO 8601, as INK returned it (order creation). */
  createdAt: string;
  paymentStatus: string;
  isExchange: boolean;
  totalValue: number | null;
  /** The delivery state (UF), when INK gave a real one. Never the city, the address or the buyer. */
  uf: string | null;
  items: EmAltaItem[];
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const id = (v: unknown): string | null => (typeof v === "number" || typeof v === "string" ? String(v) : null);

function httpsUrl(v: unknown): string | null {
  try {
    const url = new URL(str(v));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseEmAltaOrder(raw: unknown): EmAltaOrder | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const orderId = id(o.id);
  const createdAt = str(o.created_at);
  if (!orderId || !createdAt || !Number.isFinite(Date.parse(createdAt)) || !Array.isArray(o.items)) return null;
  const items: EmAltaItem[] = [];
  for (const rawItem of o.items) {
    if (typeof rawItem !== "object" || rawItem === null) return null;
    const it = rawItem as Record<string, unknown>;
    const p = (typeof it.product_v2 === "object" && it.product_v2 !== null ? it.product_v2 : {}) as Record<string, unknown>;
    const itemId = id(it.id);
    const productId = id(p.id);
    if (!itemId || !productId || typeof it.quantity !== "number") return null;
    items.push({
      itemId,
      productId,
      units: netUnits({
        quantity: it.quantity,
        refundedQuantity: typeof it.refunded_quantity === "number" ? it.refunded_quantity : 0,
        freeQuantity: typeof it.free_quantity === "number" ? it.free_quantity : 0,
      }),
      name: str(p.name),
      slug: str(p.slug),
      imageUrl: httpsUrl(p.main_image_url),
      url: purchaseUrl({ storeProductUrl: str(p.store_product_url) }),
    });
  }
  const address = (typeof o.shipping_address === "object" && o.shipping_address !== null ? o.shipping_address : {}) as Record<string, unknown>;
  const uf = str(address.state).toUpperCase();
  const total = typeof o.total_value === "string" || typeof o.total_value === "number" ? Number(o.total_value) : NaN;
  return {
    orderId,
    createdAt,
    paymentStatus: str(o.payment_status),
    isExchange: o.is_exchange === true,
    totalValue: Number.isFinite(total) ? total : null,
    uf: uf in BRAZIL_UF_NAMES ? uf : null,
    items,
  };
}

/** One sold line that counts: an eligible order's item with at least one net unit. `at` = the order's creation, in ms. */
export type SaleLine = Omit<EmAltaItem, "itemId"> & { key: string; at: number; uf: string | null };

/** Eligible lines, deduplicated by order and by line (paging can repeat an order when new ones arrive mid-fetch). */
export function saleLines(orders: readonly EmAltaOrder[]): SaleLine[] {
  const seen = new Set<string>();
  const lines: SaleLine[] = [];
  for (const order of orders) {
    if (seen.has(order.orderId)) continue;
    seen.add(order.orderId);
    if (!isPaid(order.paymentStatus) || order.isExchange || order.totalValue === null || order.totalValue <= 0) continue;
    const at = Date.parse(order.createdAt);
    for (const { itemId, ...item } of order.items) {
      const key = `${order.orderId}:${itemId}`;
      if (item.units <= 0 || seen.has(key)) continue;
      seen.add(key);
      lines.push({ ...item, key, at, uf: order.uf });
    }
  }
  return lines;
}
