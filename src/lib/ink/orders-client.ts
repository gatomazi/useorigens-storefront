import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { parseInkOrder } from "../podio/orders";
import type { PodioOrder } from "../podio/types";
import { getJson, InkApiError, PACE_MS, sleep, type RequestBudget } from "./client";
import { INK_API_BASE_URL, tokenFor } from "./config";

const PER_PAGE = 100;

/**
 * Every PAID order of one store created between two calendar days (both inclusive — INK's `begin_date`/`end_date` filter the creation
 * date, whole days, time zone undocumented, so the caller pads the range by a day and filters exact instants itself). GET only, same
 * 1.5 s pacing and 429 back-off as the catalog sync, one store at a time.
 *
 * Fails loudly instead of returning a partial list: a malformed page or order, a hit request cap, or fewer distinct orders than INK said
 * exist (`total_count` of the first page) all throw — a truncated fetch must never be published as "fewer sales". Orders are parsed (and
 * their personal data dropped) page by page, so buyer data never accumulates in memory.
 */
export async function fetchStorePaidOrders(
  storeKey: CommerceStoreKey,
  range: { beginDate: string; endDate: string },
  options: { maxRequests?: number } = {},
): Promise<{ orders: PodioOrder[]; requests: number }> {
  const token = tokenFor(storeKey);
  if (!token) throw new InkApiError(`missing credential for ${storeKey}`, 0);
  const budget: RequestBudget = { max: options.maxRequests ?? 120, used: 0 };

  for (let attempt = 0; ; attempt++) {
    const byId = new Map<string, PodioOrder>();
    let expected = 0;
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
      if (page > 1) await sleep(PACE_MS);
      const url = `${INK_API_BASE_URL}/v1/stores/orders?payment_status=paid&begin_date=${range.beginDate}&end_date=${range.endDate}&per_page=${PER_PAGE}&page=${page}`;
      const body = (await getJson(url, token, budget)) as { orders?: unknown; total_pages?: unknown; total_count?: unknown };
      if (!Array.isArray(body.orders) || typeof body.total_pages !== "number" || typeof body.total_count !== "number") {
        throw new InkApiError("unexpected INK orders response shape", 200);
      }
      if (page === 1) {
        totalPages = body.total_pages;
        expected = body.total_count;
      }
      for (const raw of body.orders) {
        const order = parseInkOrder(raw);
        if (!order) throw new InkApiError(`unreadable order on page ${page} of ${storeKey}`, 200);
        byId.set(order.orderId, order);
      }
    }
    if (byId.size >= expected) return { orders: [...byId.values()], requests: budget.used };
    // Orders moved between pages while paging (e.g. one got refunded): read the whole range once more, then give up.
    if (attempt >= 1) throw new InkApiError(`incomplete orders fetch for ${storeKey}: ${byId.size} of ${expected}`, 200);
    await sleep(PACE_MS);
  }
}
