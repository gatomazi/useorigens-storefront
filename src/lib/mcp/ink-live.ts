import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { INK_API_BASE_URL, INK_STORES, storeSlugMatches, tokenFor, writeTokenFor } from "../ink/config";
import { McpToolError } from "./errors";
import { toCents } from "./money";
import { parseMcpOrder, type McpOrder } from "./orders-model";

/**
 * The MCP's own read path to INK, for questions asked in a conversation (the owner chose "direct from INK on each question" over a stored
 * order base). Unlike the catalog/pódio syncs (src/lib/ink/client.ts: 1.5 s pacing, back-off up to a minute), a question must answer in
 * seconds, so here:
 *   - GET only, credentials only in the Authorization header, every request with a timeout;
 *   - one request per second per store for the MCP as a whole (an in-process gate shared by every call), stores in parallel. With the
 *     catalog sync's 40/min on top, a store stays at or under INK's 100 requests/min, which is shared by every integration of the store;
 *   - every question has a request budget and a deadline; running out is INCOMPLETE_COVERAGE (narrow the period), never a truncated total;
 *   - a 429 waits a few seconds once, then is RATE_LIMITED; a 401/403 is never retried (credential or scope problem);
 *   - results are cached for a few minutes per (store, query); the cache holds only the minimized orders (orders-model.ts). Every caller is
 *     an authorized owner and the data is the store's, so one cache serves them all.
 */
export const MCP_STORES = Object.keys(INK_STORES) as CommerceStoreKey[];
const PER_PAGE = 100;
const STORE_PACE_MS = 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const WRITE_TIMEOUT_MS = 30_000;
const RETRY_429_MS = 4_000;
export const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 64;

export type Budget = { maxRequests: number; used: number; deadline: number };
export const newBudget = (maxRequests = 45, ms = 50_000): Budget => ({ maxRequests, used: 0, deadline: Date.now() + ms });

const nextSlot = new Map<CommerceStoreKey, number>();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function paced(store: CommerceStoreKey): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(store) ?? 0);
  nextSlot.set(store, at + STORE_PACE_MS);
  if (at > now) await sleep(at - now);
}

/**
 * `read` = the token the syncs use; `write` = the separate token with write scopes (writeTokenFor), only for confirmed changes;
 * `write-or-read` = reads that need a scope the read token may lack (exchanges): the write token when this store has one.
 */
export type CredentialKind = "read" | "write" | "write-or-read";

function credential(store: CommerceStoreKey, kind: CredentialKind): string {
  const token = kind === "read" ? tokenFor(store) : kind === "write" ? writeTokenFor(store) : (writeTokenFor(store) ?? tokenFor(store));
  if (token) return token;
  if (kind === "write") throw new McpToolError("MISSING_CREDENTIAL", `A loja ${store} não tem credencial de ESCRITA da INK neste servidor (${INK_STORES[store]?.writeTokenEnv ?? "INK_WRITE_TOKEN_…"}): alterações estão desligadas nela.`);
  throw new McpToolError("MISSING_CREDENTIAL", `A loja ${store} não tem credencial INK configurada neste servidor.`);
}

export type InkCall = { method?: "GET" | "PATCH" | "POST"; body?: unknown; idempotencyKey?: string; credential?: CredentialKind; maxBytes?: number };

/** A response body read as a stream and refused past `max` bytes (a category listing can be megabytes), so it can never exhaust memory. */
async function readJson(res: Response, max: number | undefined): Promise<unknown> {
  if (!max || !res.body) return res.json();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    bytes += chunk.length;
    if (bytes > max) throw new Error("body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** INK's 422 body (`{ error, errors: [...] }`) as one short line, to tell the owner what INK refused. */
async function rejection(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown; errors?: unknown; message?: unknown };
    const errors = Array.isArray(body.errors) ? body.errors.filter((e): e is string => typeof e === "string") : [];
    const text = [typeof body.error === "string" ? body.error : null, typeof body.message === "string" ? body.message : null, ...errors].filter(Boolean).join("; ");
    return text.slice(0, 400) || "sem detalhe";
  } catch {
    return "sem detalhe";
  }
}

/**
 * One INK request under the question's budget and the store's pace. A write (PATCH/POST) always carries an `Idempotency-Key`: when INK does
 * not answer, or answers 5xx/429, it is sent ONCE more with the same key and body — INK then returns the original result instead of
 * changing anything twice. A write that still gets no answer is UPSTREAM_UNAVAILABLE ("may or may not have happened"); a 422 is INK_REJECTED.
 */
export async function inkCall(store: CommerceStoreKey, path: string, budget: Budget, call: InkCall = {}): Promise<unknown> {
  const method = call.method ?? "GET";
  const write = method !== "GET";
  if (write && !call.idempotencyKey) throw new Error("a write needs an Idempotency-Key");
  const token = credential(store, call.credential ?? (write ? "write" : "read"));
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (write) Object.assign(headers, { "Content-Type": "application/json", "Idempotency-Key": call.idempotencyKey! });
  for (let attempt = 0; ; attempt++) {
    if (budget.used >= budget.maxRequests || Date.now() >= budget.deadline) {
      throw new McpToolError("INCOMPLETE_COVERAGE", write ? "O tempo ou o limite de chamadas desta operação acabou antes desta alteração: ela NÃO foi enviada à INK." : "A consulta precisaria de mais leituras da INK do que o limite de uma pergunta. Use um período menor ou uma loja só.");
    }
    budget.used++;
    await paced(store);
    let res: Response;
    try {
      res = await fetch(`${INK_API_BASE_URL}${path}`, { method, headers, body: write ? JSON.stringify(call.body) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(write ? WRITE_TIMEOUT_MS : REQUEST_TIMEOUT_MS) });
    } catch {
      if (write && attempt === 0) continue;
      throw new McpToolError("UPSTREAM_UNAVAILABLE", write ? `A INK não respondeu (loja ${store}): a alteração pode ou não ter sido feita. Confira o registro antes de repetir.` : `A INK não respondeu a tempo (loja ${store}).`);
    }
    if (res.status === 429 && attempt === 0) {
      await sleep(RETRY_429_MS);
      continue;
    }
    if (write && res.status >= 500 && attempt === 0) continue;
    if (res.status === 429) throw new McpToolError("RATE_LIMITED", `A INK limitou as chamadas da loja ${store} (100/min por loja, compartilhado). Tente de novo em um minuto.`);
    if (res.status === 401) throw new McpToolError("MISSING_CREDENTIAL", `A INK recusou a credencial ${write ? "de escrita " : ""}da loja ${store}.`);
    if (res.status === 403) throw new McpToolError("MISSING_SCOPE", `A credencial ${write || call.credential === "write-or-read" ? "de escrita " : ""}da loja ${store} não tem o escopo necessário na INK para ${write ? "esta alteração" : "esta leitura"}.`);
    if (res.status === 404) throw new McpToolError("NOT_FOUND", "A INK não encontrou o registro pedido nesta loja.");
    if (res.status === 409) throw new McpToolError("CONFLICT", `A INK recusou a repetição desta alteração com outro conteúdo (loja ${store}).`);
    if (res.status === 422 || res.status === 400) throw new McpToolError("INK_REJECTED", `A INK recusou (loja ${store}): ${await rejection(res)}`);
    if (!res.ok) throw new McpToolError("UPSTREAM_UNAVAILABLE", write ? `A INK respondeu ${res.status} (loja ${store}): a alteração pode ou não ter sido feita. Confira antes de repetir.` : `A INK respondeu ${res.status} (loja ${store}).`);
    try {
      return await readJson(res, call.maxBytes);
    } catch {
      throw new McpToolError("UPSTREAM_UNAVAILABLE", `A INK devolveu uma resposta ilegível (loja ${store}).`);
    }
  }
}

const inkGet = (store: CommerceStoreKey, path: string, budget: Budget) => inkCall(store, path, budget);

type CacheEntry<T> = { at: number; value: T };
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<{ value: T; fetchedAt: Date; fromCache: boolean }> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { value: hit.value, fetchedAt: new Date(hit.at), fromCache: true };
  const value = await load();
  const at = Date.now();
  cache.delete(key);
  cache.set(key, { at, value });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return { value, fetchedAt: new Date(at), fromCache: false };
}

export function clearInkLiveCacheForTests(): void {
  cache.clear();
  nextSlot.clear();
}

/** After a confirmed change: every cached answer of that store is dropped, so the next question reads INK again. */
export function forgetStoreCache(store: CommerceStoreKey): void {
  for (const key of [...cache.keys()]) if (key.split("|")[1] === store) cache.delete(key);
}

export type OrderQuery = { beginDate: string; endDate: string; paymentStatus?: string; orderStatus?: string };
export type StoreOrders = { store: CommerceStoreKey; orders: McpOrder[]; unreadable: number; fetchedAt: Date; fromCache: boolean; requests: number };

/**
 * Every order of one store created on the given days (INK's whole-day creation filter), optionally narrowed by INK's own `payment_status`
 * / `order_status` filters. Reads all pages; if the distinct orders read are fewer than INK's `total_count` (orders moved between pages
 * while paging), reads the range once more, then gives up with INCOMPLETE_COVERAGE. An unreadable order is counted, never guessed.
 */
export async function storeOrders(store: CommerceStoreKey, q: OrderQuery, budget: Budget): Promise<StoreOrders> {
  const params = new URLSearchParams({ begin_date: q.beginDate, end_date: q.endDate, per_page: String(PER_PAGE) });
  if (q.paymentStatus) params.set("payment_status", q.paymentStatus);
  if (q.orderStatus) params.set("order_status", q.orderStatus);
  const before = budget.used;
  const { value, fetchedAt, fromCache } = await cached(`orders|${store}|${params}`, async () => {
    for (let attempt = 0; ; attempt++) {
      const byId = new Map<string, McpOrder>();
      let unreadable = 0;
      let expected = 0;
      let totalPages = 1;
      for (let page = 1; page <= totalPages; page++) {
        params.set("page", String(page));
        const body = (await inkGet(store, `/v1/stores/orders?${params}`, budget)) as { orders?: unknown; total_pages?: unknown; total_count?: unknown };
        if (!Array.isArray(body.orders) || typeof body.total_pages !== "number" || typeof body.total_count !== "number") {
          throw new McpToolError("UPSTREAM_UNAVAILABLE", `Resposta de pedidos inesperada da INK (loja ${store}).`);
        }
        if (page === 1) {
          totalPages = body.total_pages;
          expected = body.total_count;
        }
        for (const raw of body.orders) {
          const order = parseMcpOrder(raw, store);
          if (order) byId.set(order.orderId, order);
          else unreadable++;
        }
      }
      if (byId.size + unreadable >= expected) return { orders: [...byId.values()], unreadable };
      if (attempt >= 1) throw new McpToolError("INCOMPLETE_COVERAGE", `Leitura incompleta dos pedidos da loja ${store}: ${byId.size} de ${expected}. Tente de novo.`);
    }
  });
  return { store, ...value, fetchedAt, fromCache, requests: budget.used - before };
}

/** `fresh` skips the cache: a change is always planned on INK's state of now. */
export async function storeOrder(store: CommerceStoreKey, orderId: string, budget: Budget, fresh = false): Promise<{ order: McpOrder; fetchedAt: Date }> {
  const load = async () => {
    const body = (await inkGet(store, `/v1/stores/orders/${encodeURIComponent(orderId)}`, budget)) as { order?: unknown };
    const order = parseMcpOrder(body.order ?? body, store);
    if (!order || order.orderId !== orderId) throw new McpToolError("UPSTREAM_UNAVAILABLE", "A INK devolveu um pedido ilegível.");
    return order;
  };
  if (fresh) {
    const order = await load();
    return { order, fetchedAt: new Date() };
  }
  const { value, fetchedAt } = await cached(`order|${store}|${orderId}`, load);
  return { order: value, fetchedAt };
}

export type InkLiveProduct = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  approvalStatus: string | null;
  visibleInStore: boolean | null;
  priceCents: number | null;
  promotionalPriceCents: number | null;
  productType: string | null;
  clusterId: string | null;
  storeProductUrl: string | null;
  imageUrl: string | null;
  /** Every tag, untruncated: a change rewrites the whole list, so none may be lost on the way. */
  tags: string[];
  description: string | null;
  updatedAt: string | null;
  variants: { id: string; model: string | null; color: string | null; size: string | null; sku: string | null; isAvailable: boolean | null; availableQuantity: number | null }[];
};

/** One product, live, verified to belong to `store` (INK's own store slug must be the expected one). `fresh` skips the cache. */
export async function storeProduct(store: CommerceStoreKey, productId: string, budget: Budget, fresh = false): Promise<{ product: InkLiveProduct; fetchedAt: Date }> {
  const load = async () => {
    const body = (await inkGet(store, `/v1/stores/products/${encodeURIComponent(productId)}`, budget)) as { product?: unknown };
    const p = (typeof body.product === "object" && body.product !== null ? body.product : {}) as Record<string, unknown>;
    const s = (typeof p.store === "object" && p.store !== null ? p.store : {}) as Record<string, unknown>;
    if (String(p.id) !== productId) throw new McpToolError("UPSTREAM_UNAVAILABLE", "A INK devolveu um produto ilegível.");
    if (!storeSlugMatches(store, s.slug)) throw new McpToolError("NOT_FOUND", "Este produto não pertence a esta loja.");
    const t = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const pt = (typeof p.product_type === "object" && p.product_type !== null ? p.product_type : {}) as Record<string, unknown>;
    const variants = Array.isArray(p.product_variants) ? p.product_variants : [];
    const product: InkLiveProduct = {
      id: productId,
      name: t(p.name) ?? "",
      slug: t(p.slug),
      status: t(p.status, 40),
      approvalStatus: t(p.approval_status, 40),
      visibleInStore: typeof p.visible_in_store === "boolean" ? p.visible_in_store : null,
      priceCents: toCents(p.price),
      promotionalPriceCents: toCents(p.promotional_price),
      productType: t(pt.name, 80),
      clusterId: typeof p.product_cluster_id === "number" || typeof p.product_cluster_id === "string" ? String(p.product_cluster_id) : null,
      storeProductUrl: t(p.store_product_url, 300),
      imageUrl: t(p.main_image_url, 400),
      tags: Array.isArray(p.tags) ? p.tags.filter((x): x is string => typeof x === "string") : [],
      description: typeof p.description === "string" ? p.description : null,
      updatedAt: t(p.updated_at, 40),
      variants: variants.slice(0, 200).map((raw) => {
        const v = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
        return {
          id: String(v.id ?? ""),
          model: t(v.model, 80),
          color: t(v.color, 80),
          size: t(v.size, 20),
          sku: t(v.sku, 80),
          isAvailable: typeof v.is_available === "boolean" ? v.is_available : null,
          availableQuantity: typeof v.available_quantity === "number" ? v.available_quantity : null,
        };
      }),
    };
    return product;
  };
  if (fresh) {
    const product = await load();
    return { product, fetchedAt: new Date() };
  }
  const { value, fetchedAt } = await cached(`product|${store}|${productId}`, load);
  return { product: value, fetchedAt };
}
