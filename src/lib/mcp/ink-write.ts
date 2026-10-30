import "server-only";
import { parseCollectionsPage } from "../catalog/collections";
import type { CommerceStoreKey } from "../geo/regions";
import { McpToolError } from "./errors";
import { inkCall, type Budget } from "./ink-live";
import { parseExchange, type McpExchange } from "./exchanges-model";

/**
 * The MCP's write path to INK and the reads a change needs (docs/mcp/README.md §9). Every write goes through `inkCall` with the store's
 * WRITE credential and an Idempotency-Key derived from the confirmed change, so a retry can never apply it twice. Only fixed routes:
 *   PATCH /v1/stores/products/{id}   — name, description, price, promotional_price (null ends the sale), visible_in_store, tags, collections
 *                                      (the product's whole set);
 *   PATCH /v1/stores/orders/{id}     — swap items before the factory (same price), `items_editable`;
 *   POST  /v1/stores/exchanges       — open an exchange, `exchangeable`;
 *   PATCH /v1/stores/collections/{id} — ONLY `is_available` (show or hide a collection), `store.categories.write`.
 * Category membership is changed on the PRODUCT (its `collections`), never with PATCH /collections/{id}: that one replaces the whole list
 * of a category and accepts at most 100 ids, so on a large category it would silently drop thousands of products. The collection route is
 * used for its visibility alone: the body never carries `product_ids` or `kit_ids`.
 */
const COLLECTIONS_MAX_BYTES = 40 * 1024 * 1024;
const MAX_COLLECTION_PAGES = 10;

export type LiveCategory = { id: number; name: string; slug: string; visibility: "public" | "internal"; position: number; members: ReadonlySet<string> };

/**
 * Every category of a store, read live, each with which of `productIds` belong to it — the only way to know a product's current categories
 * (INK's product does not list them). Refused as INCOMPLETE_COVERAGE when the pages do not add up to INK's total: a half-read set would make
 * the product lose categories nobody asked to remove.
 */
export async function storeCategoriesLive(store: CommerceStoreKey, productIds: readonly string[], budget: Budget): Promise<LiveCategory[]> {
  const wanted = new Set(productIds);
  const match = (ids: readonly string[]) => {
    const all = [...new Set(ids.filter((id) => wanted.has(id)))];
    return { members: all, matched: all.length, merch: 0, cityDesigns: 0, all };
  };
  const out: LiveCategory[] = [];
  let totalPages = 1;
  let totalCount = 0;
  for (let page = 1; page <= totalPages; page++) {
    if (page > MAX_COLLECTION_PAGES) throw new McpToolError("INCOMPLETE_COVERAGE", `A loja ${store} tem categorias demais para ler numa operação.`);
    const raw = await inkCall(store, `/v1/stores/collections?per_page=100&page=${page}`, budget, { maxBytes: COLLECTIONS_MAX_BYTES });
    const parsed = parseCollectionsPage(raw, match);
    if (!parsed.ok) throw new McpToolError("UPSTREAM_UNAVAILABLE", `Resposta de categorias inesperada da INK (loja ${store}).`);
    totalPages = parsed.value.totalPages;
    totalCount = parsed.value.totalCount;
    for (const c of parsed.value.collections) out.push({ id: c.id, name: c.name.replace(/\s+/g, " ").trim(), slug: c.slug, visibility: c.isAvailable ? "public" : "internal", position: c.position, members: new Set(c.allMemberIds ?? []) });
  }
  if (out.length !== totalCount || new Set(out.map((c) => c.id)).size !== out.length) {
    throw new McpToolError("INCOMPLETE_COVERAGE", `Leitura incompleta das categorias da loja ${store} (${out.length} de ${totalCount}). Tente de novo.`);
  }
  return out;
}

export type ProductPatchBody = { name?: string; description?: string; price?: string; promotional_price?: string | null; visible_in_store?: boolean; tags?: string[]; collections?: number[] };
export type PatchedProduct = { id: string; name: string | null; price: string | null; visibleInStore: boolean | null; approvalStatus: string | null };

export async function patchProduct(store: CommerceStoreKey, productId: string, body: ProductPatchBody, idempotencyKey: string, budget: Budget): Promise<PatchedProduct> {
  const res = (await inkCall(store, `/v1/stores/products/${encodeURIComponent(productId)}`, budget, { method: "PATCH", body, idempotencyKey })) as { product?: Record<string, unknown> };
  const p = res.product ?? {};
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return { id: String(p.id ?? productId), name: s(p.name), price: s(p.price), visibleInStore: typeof p.visible_in_store === "boolean" ? p.visible_in_store : null, approvalStatus: s(p.approval_status) };
}

/** Shows (`is_available: true`) or hides a collection at INK. The body is exactly `{ is_available }`: membership is never sent from here. */
export async function patchCollectionVisibility(store: CommerceStoreKey, collectionId: number, visible: boolean, idempotencyKey: string, budget: Budget): Promise<{ id: number; visible: boolean | null }> {
  const res = (await inkCall(store, `/v1/stores/collections/${encodeURIComponent(String(collectionId))}`, budget, { method: "PATCH", body: { is_available: visible }, idempotencyKey })) as { collection?: Record<string, unknown> };
  const c = res.collection ?? {};
  return { id: typeof c.id === "number" ? c.id : collectionId, visible: typeof c.is_available === "boolean" ? c.is_available : null };
}

export type OrderItemSwap = { id: number; product_v2_id: number; product_variant_id: number };

export async function patchOrderItems(store: CommerceStoreKey, orderId: string, items: readonly OrderItemSwap[], idempotencyKey: string, budget: Budget): Promise<{ orderId: string }> {
  await inkCall(store, `/v1/stores/orders/${encodeURIComponent(orderId)}`, budget, { method: "PATCH", body: { items }, idempotencyKey });
  return { orderId };
}

export type ExchangeBody = {
  original_order_id: number;
  exchange_reason: string;
  items: { old_item_id: number; product_v2_id: number; product_variant_id: number; quantity: number }[];
  problem_description?: string;
  photos?: { photo_url: string }[];
};

export async function createExchange(store: CommerceStoreKey, body: ExchangeBody, idempotencyKey: string, budget: Budget): Promise<McpExchange> {
  const res = (await inkCall(store, "/v1/stores/exchanges", budget, { method: "POST", body, idempotencyKey })) as { exchange?: unknown };
  const exchange = parseExchange(res.exchange, store);
  if (!exchange) throw new McpToolError("UPSTREAM_UNAVAILABLE", "A INK confirmou a troca, mas devolveu um registro ilegível: confira em origens_list_exchanges.");
  return exchange;
}

export type ExchangeQuery = { orderId?: string; beginDate?: string; endDate?: string; waitingForApproval?: boolean };

/** Exchanges of one store (every page, they are few), with the write credential when the store has one: the read token may lack `store.exchanges.read`. */
export async function storeExchanges(store: CommerceStoreKey, q: ExchangeQuery, budget: Budget): Promise<{ exchanges: McpExchange[]; unreadable: number; fetchedAt: Date }> {
  const params = new URLSearchParams({ per_page: "100" });
  if (q.orderId) params.set("order_id", q.orderId);
  if (q.beginDate) params.set("begin_date", q.beginDate);
  if (q.endDate) params.set("end_date", q.endDate);
  if (q.waitingForApproval !== undefined) params.set("waiting_for_approval", String(q.waitingForApproval));
  const exchanges: McpExchange[] = [];
  let unreadable = 0;
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    params.set("page", String(page));
    const body = (await inkCall(store, `/v1/stores/exchanges?${params}`, budget, { credential: "write-or-read" })) as { exchanges?: unknown; total_pages?: unknown };
    if (!Array.isArray(body.exchanges)) throw new McpToolError("UPSTREAM_UNAVAILABLE", `Resposta de trocas inesperada da INK (loja ${store}).`);
    totalPages = typeof body.total_pages === "number" ? body.total_pages : 1;
    for (const raw of body.exchanges) {
      const e = parseExchange(raw, store);
      if (e) exchanges.push(e);
      else unreadable++;
    }
  }
  return { exchanges, unreadable, fetchedAt: new Date() };
}

export async function storeExchange(store: CommerceStoreKey, exchangeId: string, budget: Budget): Promise<McpExchange> {
  const body = (await inkCall(store, `/v1/stores/exchanges/${encodeURIComponent(exchangeId)}`, budget, { credential: "write-or-read" })) as { exchange?: unknown };
  const e = parseExchange(body.exchange, store);
  if (!e) throw new McpToolError("UPSTREAM_UNAVAILABLE", "A INK devolveu uma troca ilegível.");
  return e;
}
