import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";
import type { CollectionRecord, CollectionsSnapshot } from "@/lib/catalog/collections";
import { buildStoreIndex } from "@/lib/catalog/indexer";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { GarmentIndex } from "@/lib/catalog/garment-index-file";
import { citiesByName } from "@/lib/geo/cities";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { buildProductIndex, searchProducts } from "@/lib/mcp/catalog-index";
import { buildCategoryIndex, resolveCategories } from "@/lib/mcp/categories";
import { buildCatalogContext, classifyProduct } from "@/lib/mcp/classify";
import { decodeCursor, encodeCursor } from "@/lib/mcp/cursor";
import { McpToolError } from "@/lib/mcp/errors";
import type { Budget, OrderQuery } from "@/lib/mcp/ink-live";
import { toCents } from "@/lib/mcp/money";
import { parseMcpOrder, type McpOrder } from "@/lib/mcp/orders-model";
import { inPeriod, resolvePeriod } from "@/lib/mcp/period";
import type { ConfiguredPromotions } from "@/lib/mcp/promotions";
import { salesRanking, salesSummary } from "@/lib/mcp/sales";
import { createUseOrigensMcpServer, servedStores } from "@/lib/mcp/server";
import * as tools from "@/lib/mcp/tools";
import type { AllDeps } from "@/lib/mcp/write-tools";
import { product } from "./fixtures";
import { fakeWrite } from "./mcp-write-fakes";

// ── Synthetic catalog: Sul sells Joinville/SC (with a garment sibling) and a GO design copied from the Centro-Oeste; Centro sells Goiânia ──
const SYNC = "2026-10-14T03:00:00.000Z";
const sul = buildStoreIndex("use-sul", [
  product("Joinville | Origem SC", { id: "101", clusterId: "900" }),
  product("Joinville | Coordenadas SC", { id: "102" }),
  product("Caneca Use Sul", { id: "103", price: 40, listPrice: 50 }),
  product("Bom Jesus | Origem", { id: "104" }),
], SYNC);
const centro = buildStoreIndex("use-centro", [product("Goiânia | Origem GO", { id: "201", storeKey: "use-centro" })], SYNC);
const snapshot: CatalogSnapshot = { version: 1, stores: { "use-sul": sul, "use-centro": centro } };
const garments: GarmentIndex = { version: 1, stores: { "use-sul": { syncedAt: SYNC, clusters: { "900": [[178, "150", "joinville-oversized", "product_v2/main_image/150.jpg", 139.9]] } } } };
const ctx = buildCatalogContext(snapshot, garments);
const index = buildProductIndex(snapshot, garments);
// ── Synthetic INK categories: "Território" exists in two stores (two categories, same slug); "SUL - SC" is an internal segmentation ──
const col = (id: number, name: string, slug: string, position: number, isAvailable: boolean, ids: string[], merch = 0): CollectionRecord => ({ id, name, slug, position, isAvailable, reportedProductCount: ids.length + 3, matchedCount: ids.length, merchCount: merch, cityDesignCount: ids.length - merch, memberIds: ids, allMemberIds: ids });
const collections: CollectionsSnapshot = {
  version: 2,
  stores: {
    "use-sul": { commerceStoreKey: "use-sul", syncedAt: "2026-10-14T04:00:00.000Z", catalogSyncedAt: SYNC, totalCount: 4, collections: [col(1001, "Território", "territorio", 1, true, ["101", "102"]), col(1002, "Canecas", "canecas", 2, true, ["103"], 1), col(1003, "SUL - SC", "sul-sc", 3, false, ["101", "102", "103"], 1), col(1004, "Vazia", "vazia", 4, true, [])] },
    "use-centro": { commerceStoreKey: "use-centro", syncedAt: "2026-10-14T04:00:00.000Z", catalogSyncedAt: SYNC, totalCount: 1, collections: [col(2001, "Território", "territorio", 1, true, ["201"])] },
  },
};
const categories = buildCategoryIndex(collections);
const promotions: ConfiguredPromotions = {
  source: "published",
  asOf: "2026-10-14T10:00:00.000Z",
  regions: [
    {
      region: "sul",
      items: [
        { id: "leve-mais", type: "coupon", enabled: true, title: "LEVE MAIS", code: "LEVEMAIS", description: "3 peças: R$ 25 OFF", order: 2 },
        { id: "primeira", type: "coupon", enabled: true, title: "PRIMEIRA COMPRA", code: "PRIMEIRACOMPRA", description: "10% OFF", order: 1, endsAt: "2026-10-01T00:00:00-03:00" },
        { id: "frete", type: "promotion", enabled: true, title: "Frete Grátis", description: "Frete grátis no Sul", order: 3, startsAt: "2026-11-01T00:00:00-03:00" },
      ],
    },
  ],
};
const JOINVILLE = citiesByName("Joinville", ["SC"])[0].id;
const GOIANIA = citiesByName("Goiânia", ["GO"])[0].id;

// ── Synthetic INK orders, with personal data that must never come out ──
const PII = { buyer: { first_name: "Fulana", last_name: "Secreta", email: "fulana@example.com", phone: "48999990000", document: "12345678900" }, billing_address: { street: "Rua Privada", number: "77", cep: "88000000", city: "Joinville", state: "SC", name: "Fulana" }, pix: { qr: "000201PIXSECRETO" }, payment_method: "credit_card" };
let nextItem = 1;
const item = (productId: string, name: string, unit: string, qty: number, extra: Record<string, unknown> = {}) => ({ id: nextItem++, quantity: qty, refunded_quantity: 0, free_quantity: 0, unit_value: unit, total_value: (Number(unit) * qty).toFixed(2), sku: `SKU${productId}`, product_v2: { id: Number(productId), name, tags: [] }, product_variant: { model: "Camiseta", color: "Preta", size: "M" }, art_image_url: "https://x/art.png", ...extra });
const order = (id: number, createdAt: string, items: unknown[], o: Record<string, unknown> = {}) => ({
  id,
  created_at: createdAt,
  order_status: "delivered",
  formatted_order_status: "Entregue",
  payment_status: "Pago",
  is_exchange: false,
  shipping_value: "0.00",
  promotion_value: "0.00",
  payment_discount_value: "0.00",
  freight_value_difference: "0.00",
  kickback_value: "10.00",
  promotion_code: "",
  shipping_address: { street: "Rua Privada", number: "77", cep: "88000000", city: "Florianópolis", state: "SC", name: "Fulana", neighbourhood: "Centro", complement: "ap 1" },
  delivery: { carrier: "Correios", current_status: "Entregue", production_deadline: "2026-10-05", production_delayed: false, estimated_delivery_date: "2026-10-12", delivery_delayed: false, delivered_at: "2026-10-11T10:00:00-03:00", tracking_code: "BR123", history: [{ event: "Entregue", event_type: "delivered", description: "Entregue a Fulana na Rua Privada 77", observation: "porteiro", created_at: "2026-10-11T10:00:00-03:00" }] },
  items,
  ...PII,
  ...o,
});
const sum = (...v: number[]) => v.reduce((a, b) => a + b, 0);
const rawSul = [
  // In the period: SC ×2, GO (copied design sold by the Sul) ×1, merch ×1; shipping 15, promotion 10 → total 374.70
  order(1, "2026-10-13T23:30:00-03:00", [item("101", "Joinville | Origem SC", "109.90", 2), item("999", "Goiânia | Origem GO", "99.90", 1), item("103", "Caneca Use Sul", "50.00", 1)], { shipping_value: "15.00", promotion_value: "10.00", promotion_code: "levemais", total_value: (sum(219.8, 99.9, 50, 15) - 10).toFixed(2) }),
  order(2, "2026-10-10T12:00:00-03:00", [item("101", "Joinville | Origem SC", "109.90", 1)], { is_exchange: true, total_value: "109.90" }),
  order(4, "2026-10-10T12:00:00-03:00", [item("101", "Joinville | Origem SC", "109.90", 1)], { payment_status: "Expirado", total_value: "109.90" }),
  // 00:00 of the day after the period, São Paulo time: outside.
  order(5, "2026-10-14T00:00:00-03:00", [item("101", "Joinville | Origem SC", "109.90", 1)], { total_value: "109.90" }),
  order(6, "2026-10-12T12:00:00-03:00", [item("101", "Joinville | Origem SC", "0.00", 1)], { total_value: "0.00" }),
];
const rawCentro = [
  // Joinville bought on the Centro store? no: Goiânia ×1 refunded (0 net) and a garment-less SC design by name ×1.
  order(3, "2026-09-15T00:00:00-03:00", [item("201", "Goiânia | Origem GO", "99.90", 1, { refunded_quantity: 1 }), item("777", "Joinville | Coordenadas SC", "109.90", 1)], { total_value: "209.80", order_status: "awaiting_production", formatted_order_status: "Aguardando produção", delivery: { production_delayed: true, delivery_delayed: false, history: [] } }),
];
const parse = (raw: unknown[], store: CommerceStoreKey) => raw.map((r) => parseMcpOrder(r, store)!);
const orders: McpOrder[] = [...parse(rawSul, "use-sul"), ...parse(rawCentro, "use-centro")];
const NOW = new Date("2026-10-14T12:00:00-03:00");
const period = resolvePeriod({ start_date: "2026-09-15", end_date: "2026-10-13" }, NOW, 186);

describe("money and period", () => {
  test("decimal strings become exact cents; anything else is unknown, never zero", () => {
    expect(toCents("109.90")).toBe(10990);
    expect(toCents("0.0")).toBe(0);
    expect(toCents("-5.00")).toBe(-500);
    expect(toCents("7")).toBe(700);
    expect(toCents("1e3")).toBeNull();
    expect(toCents(null)).toBeNull();
    expect(toCents("")).toBeNull();
  });

  test("a period is São Paulo days, end inclusive, kept as [start, day after end); INK is asked one day wider on each side", () => {
    expect(period.inkRange).toEqual({ beginDate: "2026-09-14", endDate: "2026-10-14" });
    expect(inPeriod("2026-10-13T23:59:59-03:00", period)).toBe(true);
    expect(inPeriod("2026-10-14T00:00:00-03:00", period)).toBe(false);
    expect(inPeriod("2026-09-15T00:00:00-03:00", period)).toBe(true);
    expect(inPeriod("2026-09-14T23:59:59-03:00", period)).toBe(false);
  });

  test("defaults, clamping and limits", () => {
    expect(resolvePeriod({}, NOW, 186)).toMatchObject({ startDate: "2026-09-14", endDate: "2026-10-13", days: 30 });
    expect(resolvePeriod({ last_days: 7, include_today: true }, NOW, 186)).toMatchObject({ startDate: "2026-10-08", endDate: "2026-10-14" });
    expect(resolvePeriod({ start_date: "2026-10-01", end_date: "2027-01-01" }, NOW, 186).endDate).toBe("2026-10-14");
    expect(() => resolvePeriod({ start_date: "2026-02-30", end_date: "2026-03-01" }, NOW, 186)).toThrow(McpToolError);
    expect(() => resolvePeriod({ start_date: "2026-01-01", end_date: "2026-10-01" }, NOW, 186)).toThrow(/186/);
    expect(() => resolvePeriod({ start_date: "2026-10-01" }, NOW, 186)).toThrow(/juntos/);
  });
});

describe("orders are minimized at the boundary", () => {
  test("no buyer, address, payment data or event description survives the parse", () => {
    const text = JSON.stringify(orders);
    for (const secret of ["Fulana", "Secreta", "fulana@example.com", "48999990000", "12345678900", "Rua Privada", "88000000", "PIXSECRETO", "credit_card", "porteiro", "art.png", "Centro", "ap 1"]) expect(text).not.toContain(secret);
    expect(orders[0].destination).toEqual({ city: "Florianópolis", uf: "SC" });
    expect(orders[0].delivery.lastEvents).toEqual([{ type: "delivered", event: "Entregue", at: "2026-10-11T10:00:00-03:00" }]);
  });

  test("an order without id, date or readable items is rejected, not guessed", () => {
    expect(parseMcpOrder({ created_at: "2026-10-01T00:00:00Z", items: [] }, "use-sul")).toBeNull();
    expect(parseMcpOrder({ id: 1, created_at: "ontem", items: [] }, "use-sul")).toBeNull();
    expect(parseMcpOrder({ id: 1, created_at: "2026-10-01T00:00:00Z", items: [{ id: 1, product_v2: { id: 2 } }] }, "use-sul")).toBeNull();
  });
});

describe("design classification", () => {
  test("catalog binding, garment sibling by cluster, a UF stated in the name in another region's store, and what stays unclassified", () => {
    expect(classifyProduct("use-sul", { id: "101", name: "x", tags: [] }, ctx)).toMatchObject({ status: "classified", via: "catalog", uf: "SC", region: "sul", localityKey: JOINVILLE, family: "ponto-de-origem" });
    expect(classifyProduct("use-sul", { id: "150", name: "Joinville Oversized", tags: [] }, ctx)).toMatchObject({ status: "classified", via: "garment-cluster", uf: "SC" });
    expect(classifyProduct("use-sul", { id: "999", name: "Goiânia | Origem GO", tags: [] }, ctx)).toMatchObject({ status: "classified", via: "name", uf: "GO", region: "centro-oeste", localityKey: GOIANIA });
    expect(classifyProduct("use-sul", { id: "103", name: "Caneca Use Sul", tags: [] }, ctx)).toEqual({ status: "unclassified", reason: "not-a-city-design" });
    // "Bom Jesus" exists in more than one Sul state and the name states no UF: never guessed.
    expect(classifyProduct("use-sul", { id: "104", name: "Bom Jesus | Origem", tags: [] }, ctx)).toMatchObject({ status: "unclassified" });
    // A product id of ANOTHER store is not matched to this store's catalog.
    expect(classifyProduct("use-centro", { id: "101", name: "Produto qualquer", tags: [] }, ctx)).toEqual({ status: "unclassified", reason: "not-a-city-design" });
  });
});

describe("sales contract", () => {
  test("summary over orders: exclusions counted, money exact, units net of refunds", () => {
    const s = salesSummary(orders, period, ctx, {});
    expect(s.scope).toBe("orders");
    if (s.scope !== "orders") return;
    expect(s.orders).toBe(2);
    expect(s.excluded).toEqual({ not_paid: 1, exchange: 1, zero_or_unknown_total: 1, outside_period: 1, duplicate: 0 });
    expect(s.units_net).toBe(5); // 2 + 1 + 1 (order 1) + 1 (order 3: the refunded unit does not count)
    expect(s.refunded_units).toBe(1);
    expect(s.order_total.cents).toBe(37470 + 20980);
    expect(s.merchandise.cents).toBe(21980 + 9990 + 5000 + 9990 + 10990);
    expect(s.shipping.cents).toBe(1500);
    expect(s.promotion_discount.cents).toBe(1000);
    expect(s.store_payout_reported_by_ink.cents).toBe(2000);
    expect(s.average_order_value?.cents).toBe(Math.round((37470 + 20980) / 2));
    expect(s.design_coverage).toMatchObject({ classified_units: 4, unclassified_units: 1, unclassified_by_reason: { "not-a-city-design": 1 } });
  });

  test("item filters: a two-region order counts only its matching lines, and 'only matching' is told apart", () => {
    const sc = salesSummary(orders, period, ctx, { design_uf: "SC" });
    expect(sc).toMatchObject({ scope: "items", units_net: 3, orders_with_matching_items: 2, orders_only_matching_items: 1 });
    if (sc.scope === "items") expect(sc.items_value.cents).toBe(21980 + 10990);
    const co = salesSummary(orders, period, ctx, { design_region: "centro-oeste" });
    // The refunded Goiânia unit is not a sale; the GO design sold by the Sul store is.
    expect(co).toMatchObject({ scope: "items", units_net: 1, orders_with_matching_items: 1, orders_only_matching_items: 0 });
    const destination = salesSummary(orders, period, ctx, { delivery_city: "florianopolis" });
    expect(destination).toMatchObject({ units_net: 5, orders_with_matching_items: 2 });
  });

  test("ranking: computed on the items, unclassified lines reported apart, never ranked", () => {
    const byUf = salesRanking(orders, period, ctx, { dimension: "design_uf", metric: "units", limit: 10, filters: {} });
    expect(byUf.rows.map((r) => [r.key, r.units_net, r.orders])).toEqual([["SC", 3, 2], ["GO", 1, 1]]);
    expect(byUf.not_placed).toMatchObject({ reason: "unclassified_design", units_net: 1, orders: 1 });
    const byCity = salesRanking(orders, period, ctx, { dimension: "design_city", metric: "items_value", limit: 1, filters: {} });
    expect(byCity.rows).toHaveLength(1);
    expect(byCity.rows[0]).toMatchObject({ key: JOINVILLE, units_net: 3 });
    expect(byCity.ranked_keys).toBe(2);
    const byFamily = salesRanking(orders, period, ctx, { dimension: "family", metric: "units", limit: 10, filters: {} });
    expect(byFamily.rows.map((r) => [r.key, r.units_net])).toEqual([["ponto-de-origem", 3], ["coordenadas", 1]]);
  });
});

describe("catalog index", () => {
  test("search by place, family and kind; garment siblings are hidden_sellable; nothing merged across stores", () => {
    expect(searchProducts(index, { uf: "SC", kind: "city_design" }).map((e) => e.productId)).toEqual(["102", "101"]);
    expect(searchProducts(index, { text: "joinville oversized" }).map((e) => [e.productId, e.visibility])).toEqual([["150", "hidden_sellable"]]);
    expect(searchProducts(index, { city: "goiania" }).map((e) => `${e.store}:${e.productId}`)).toEqual(["use-centro:201"]);
    expect(index.stores.find((s) => s.store === "use-sul")).toMatchObject({ excluded: 1, cityDesigns: 2, merch: 1, garmentVariants: 1 });
  });

  test("a cursor only continues the query it came from", () => {
    const c = encodeCursor(20, { uf: "SC" });
    expect(decodeCursor(c, { uf: "SC" })).toBe(20);
    expect(() => decodeCursor(c, { uf: "PR" })).toThrow(McpToolError);
    expect(() => decodeCursor("lixo", { uf: "SC" })).toThrow(McpToolError);
  });
});

// ── Tools through the MCP protocol, with fake INK ──
function fakeDeps(over: Partial<AllDeps> = {}): AllDeps & { calls: OrderQuery[] } {
  const calls: OrderQuery[] = [];
  const byStore: Record<string, McpOrder[]> = { "use-sul": parse(rawSul, "use-sul"), "use-centro": parse(rawCentro, "use-centro"), "use-norte": [] };
  return {
    calls,
    now: () => NOW,
    stores: ["use-sul", "use-norte", "use-centro"],
    hasCredential: (s) => s !== "use-norte",
    catalog: () => ({ index, ctx }),
    categories: () => categories,
    promotions: () => promotions,
    newBudget: (): Budget => ({ maxRequests: 45, used: 0, deadline: Date.now() + 50_000 }),
    storeOrders: async (store, q, budget) => {
      calls.push(q);
      budget.used++;
      const list = byStore[store].filter((o) => (!q.paymentStatus || q.paymentStatus !== "paid" || o.paymentStatusLabel === "Pago") && (!q.orderStatus || o.orderStatus === q.orderStatus));
      return { store, orders: list, unreadable: 0, fetchedAt: new Date("2026-10-14T14:59:00Z"), fromCache: false, requests: 1 };
    },
    storeOrder: async (store, id) => {
      const o = byStore[store].find((x) => x.orderId === id);
      if (!o) throw new McpToolError("NOT_FOUND", "A INK não encontrou o registro pedido nesta loja.");
      return { order: o, fetchedAt: new Date("2026-10-14T14:59:00Z") };
    },
    storeProduct: async () => {
      throw new McpToolError("UPSTREAM_UNAVAILABLE", "fora do ar");
    },
    write: fakeWrite(),
    ...over,
  };
}

const GRANT = { subject: "01J00000000000000000000000", email: "dono@example.com", clientId: "mcp_testclient000000000000", scopes: ["origens.read"], expiresAt: 2_000_000_000, resource: "https://www.useorigens.com.br/api/mcp" };

async function connect(deps: AllDeps, log: (l: Record<string, unknown>) => void = () => undefined) {
  const server = createUseOrigensMcpServer(GRANT, deps, log);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(b);
  return client;
}

describe("MCP server", () => {
  test("a read-only grant lists the twelve read tools, all annotated read-only, idempotent and non-destructive, each with an output schema", async () => {
    const client = await connect(fakeDeps());
    const { tools: listed } = await client.listTools();
    expect(listed.map((t) => t.name).sort()).toEqual(["origens_capabilities", "origens_catalog_status", "origens_get_exchange", "origens_get_order", "origens_get_product", "origens_list_categories", "origens_list_exchanges", "origens_list_orders", "origens_promotions", "origens_sales_ranking", "origens_sales_summary", "origens_search_products"]);
    for (const t of listed) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
      expect(t.outputSchema).toBeTruthy();
    }
  });

  test("sales summary: meta carries period, date basis, coverage (a store without credential is declared, not silently dropped)", async () => {
    const deps = fakeDeps();
    const client = await connect(deps);
    const r = await client.callTool({ name: "origens_sales_summary", arguments: { start_date: "2026-09-15", end_date: "2026-10-13", design_uf: "sc" } });
    expect(r.isError).toBeFalsy();
    const out = r.structuredContent as tools.ToolResult;
    expect(out.meta).toMatchObject({ source: "ink_api+use_origens_index", period: { start_date: "2026-09-15", end_date: "2026-10-13", time_zone: "America/Sao_Paulo" }, coverage: { status: "partial" }, data_as_of: "2026-10-14T14:59:00.000Z" });
    expect(out.meta.coverage.reason).toContain("use-norte");
    expect(out.data).toMatchObject({ units_net: 3 });
    expect(deps.calls.every((q) => q.paymentStatus === "paid" && q.beginDate === "2026-09-14" && q.endDate === "2026-10-14")).toBe(true);
  });

  test("errors are tool results with a stable code, and are logged without inputs", async () => {
    const lines: Record<string, unknown>[] = [];
    const client = await connect(fakeDeps(), (l) => lines.push(l));
    const r = await client.callTool({ name: "origens_sales_summary", arguments: { stores: ["use-norte"] } });
    expect(r.isError).toBe(true);
    expect(JSON.parse((r.content as { text: string }[])[0].text).error.code).toBe("MISSING_CREDENTIAL");
    const city = await client.callTool({ name: "origens_sales_summary", arguments: { design_city: "Joinville" } });
    expect(JSON.parse((city.content as { text: string }[])[0].text).error.code).toBe("INVALID_INPUT");
    expect(lines.map((l) => [l.tool, l.outcome, l.code])).toEqual([["origens_sales_summary", "error", "MISSING_CREDENTIAL"], ["origens_sales_summary", "error", "INVALID_INPUT"]]);
    expect(JSON.stringify(lines)).not.toContain("Joinville");
  });

  test("list and get orders: INK's own delay flags, totals by status, and still no personal data", async () => {
    const client = await connect(fakeDeps());
    const list = (await client.callTool({ name: "origens_list_orders", arguments: { start_date: "2026-09-01", end_date: "2026-10-14", production_delayed: true } })).structuredContent as tools.ToolResult;
    expect(list.data).toMatchObject({ total_orders: 1, production_delayed: 1, by_order_status: { awaiting_production: 1 } });
    const one = await client.callTool({ name: "origens_get_order", arguments: { store: "use-sul", order_id: "1" } });
    const text = JSON.stringify(one);
    for (const secret of ["Fulana", "fulana@example.com", "Rua Privada", "12345678900", "PIXSECRETO"]) expect(text).not.toContain(secret);
    const data = (one.structuredContent as tools.ToolResult).data as { items: { design?: unknown }[]; totals: { total: { cents: number } } };
    expect(data.totals.total.cents).toBe(37470);
    expect(data.items.map((i) => i.design)).toEqual([{ design_uf: "SC", design_city: "Joinville", family: "Ponto de Origem" }, { design_uf: "GO", design_city: "Goiânia", family: "Ponto de Origem" }, { unclassified: "not-a-city-design" }]);
    const missing = await client.callTool({ name: "origens_get_order", arguments: { store: "use-sul", order_id: "424242" } });
    expect(JSON.parse((missing.content as { text: string }[])[0].text).error.code).toBe("NOT_FOUND");
  });

  test("get product: when INK is down, the index answer comes back marked partial instead of failing", async () => {
    const client = await connect(fakeDeps());
    const r = (await client.callTool({ name: "origens_get_product", arguments: { store: "use-sul", product_id: "101" } })).structuredContent as tools.ToolResult;
    expect(r.meta.coverage.status).toBe("partial");
    expect(r.meta.source).toBe("use_origens_index");
    expect(r.data).toMatchObject({ in_index: true, classification: { status: "classified", design_uf: "SC" } });
  });

  test("catalog status lists the products left unclassified, with their reason", async () => {
    const client = await connect(fakeDeps());
    const r = (await client.callTool({ name: "origens_catalog_status", arguments: { include_unclassified: true } })).structuredContent as tools.ToolResult;
    expect(r.meta.unclassified_count).toBe(1);
    expect((r.data.unclassified_products as { items: { product_id: string }[] }).items.map((i) => i.product_id)).toEqual(["104"]);
    expect(r.meta.coverage).toMatchObject({ status: "partial" }); // use-norte has no snapshot here
  });

  test("invalid input is refused by the schema before any INK read", async () => {
    const deps = fakeDeps();
    const client = await connect(deps);
    const r = await client.callTool({ name: "origens_sales_ranking", arguments: { dimension: "cpf_do_cliente" } });
    expect(r.isError).toBe(true);
    expect(deps.calls).toHaveLength(0);
  });
});

// ── Categories (INK collections) and promotions ──
type Rows = Record<string, unknown>[];
const structured = (r: unknown) => (r as { structuredContent: tools.ToolResult }).structuredContent;
const errorCode = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text).error.code as string;
const PERIOD = { start_date: "2026-09-15", end_date: "2026-10-13" };

describe("categories", () => {
  test("a slug or name may name a category in several stores, an id names one; an unknown one is an error, never a guess", () => {
    expect(resolveCategories(categories, "territorio").map((c) => `${c.store}:${c.id}`)).toEqual(["use-sul:1001", "use-centro:2001"]);
    expect(resolveCategories(categories, "Território", ["use-centro"]).map((c) => c.id)).toEqual([2001]);
    expect(resolveCategories(categories, "1003").map((c) => c.visibility)).toEqual(["internal"]);
    expect(() => resolveCategories(categories, "inexistente")).toThrow(McpToolError);
    expect(categories.entries.find((c) => c.id === 1001)?.url).toBe("https://www.usesul.com.br/usesul/collections/territorio");
    expect(categories.entries.find((c) => c.id === 1003)?.url).toBeNull();
  });

  test("ranking by category: a product counts in each of its categories, shares are over the lines, unknown membership is reported apart", async () => {
    const r = await tools.salesRankingTool(fakeDeps(), { ...PERIOD, dimension: "category" });
    const data = r.data as { rows: Rows; not_placed: unknown; overlapping: boolean; category_coverage: unknown };
    expect(data.rows.map((x) => [x.key, x.label, x.units_net, x.share_of_metric])).toEqual([["use-sul:1001", "Território · use-sul", 2, 0.4], ["use-sul:1002", "Canecas · use-sul", 1, 0.2]]);
    // Goiânia sold by the Sul (999) and the Centro's 777 are not in the catalog: their category is unknown, not "none".
    expect(data.not_placed).toMatchObject({ reason: "category_membership_unknown", units_net: 2 });
    expect(data.overlapping).toBe(true);
    expect(data.category_coverage).toMatchObject({ units_in_some_category: 3, units_without_category: 0, units_membership_unknown: 2 });
    expect(r.meta.coverage.status).toBe("partial");
    expect(r.meta.coverage.reason).toContain("fora do snapshot de categorias");
    const all = (await tools.salesRankingTool(fakeDeps(), { ...PERIOD, dimension: "category", category_visibility: "all" })).data as { rows: Rows };
    expect(all.rows.map((x) => [x.key, x.units_net])).toEqual([["use-sul:1003", 3], ["use-sul:1001", 2], ["use-sul:1002", 1]]);
  });

  test("summary filtered by a category that exists in two stores", async () => {
    const r = await tools.salesSummaryTool(fakeDeps(), { ...PERIOD, category: "territorio" });
    expect(r.data).toMatchObject({ scope: "items", units_net: 2, orders_with_matching_items: 1, category_coverage: { units_membership_unknown: 2 } });
    expect(r.meta.filters_applied).toMatchObject({ category: "territorio" });
    expect(r.meta.coverage.reason).toContain("use-norte");
    expect(r.meta.coverage.reason).toContain("categoria");
  });

  test("search by category and on sale; a product shows its categories, and a garment sibling's are unknown", async () => {
    const client = await connect(fakeDeps());
    const byCat = structured(await client.callTool({ name: "origens_search_products", arguments: { category: "territorio" } })).data.products as Rows;
    expect(byCat.map((p) => `${p.store}:${p.product_id}`).sort()).toEqual(["use-centro:201", "use-sul:101", "use-sul:102"]);
    const onSale = structured(await client.callTool({ name: "origens_search_products", arguments: { on_sale: true } })).data.products as Rows;
    expect(onSale).toEqual([expect.objectContaining({ product_id: "103", on_sale: true, discount_percent: 20, price: { cents: 4000, brl: "40.00" }, list_price: { cents: 5000, brl: "50.00" } })]);
    const one = structured(await client.callTool({ name: "origens_get_product", arguments: { store: "use-sul", product_id: "101" } }));
    expect(one.data.categories).toEqual([{ category_id: 1001, name: "Território", slug: "territorio", visibility: "public" }, { category_id: 1003, name: "SUL - SC", slug: "sul-sc", visibility: "internal" }]);
    const sibling = structured(await client.callTool({ name: "origens_get_product", arguments: { store: "use-sul", product_id: "150" } }));
    expect(sibling.data.categories).toMatch(/^desconhecida/);
  });

  test("list: every category of the synced stores, filters, and a store without categories declared", async () => {
    const client = await connect(fakeDeps());
    const all = structured(await client.callTool({ name: "origens_list_categories", arguments: {} }));
    expect((all.data.categories as Rows).map((c) => `${c.store}:${c.category_id}`)).toEqual(["use-centro:2001", "use-sul:1001", "use-sul:1002", "use-sul:1003"]);
    expect(all.meta.coverage).toMatchObject({ status: "partial" });
    expect(all.meta.coverage.reason).toContain("use-norte");
    const pub = structured(await client.callTool({ name: "origens_list_categories", arguments: { store: "use-sul", visibility: "public", include_empty: true } }));
    expect((pub.data.categories as Rows).map((c) => c.category_id)).toEqual([1001, 1002, 1004]);
    expect((pub.data.categories as Rows)[0]).toMatchObject({ products_in_catalog: 2, city_designs: 2, reported_by_ink: 5, url: "https://www.usesul.com.br/usesul/collections/territorio" });
  });

  test("without a categories snapshot, the category tools say so and the others never read it", async () => {
    const deps = fakeDeps({
      categories: () => {
        throw new McpToolError("CATALOG_UNAVAILABLE", "As categorias da INK ainda não foram sincronizadas neste servidor.");
      },
    });
    const client = await connect(deps);
    expect(errorCode(await client.callTool({ name: "origens_list_categories", arguments: {} }))).toBe("CATALOG_UNAVAILABLE");
    expect(errorCode(await client.callTool({ name: "origens_sales_ranking", arguments: { ...PERIOD, dimension: "category" } }))).toBe("CATALOG_UNAVAILABLE");
    expect((await client.callTool({ name: "origens_sales_summary", arguments: PERIOD })).isError).toBeFalsy();
    expect(structured(await client.callTool({ name: "origens_capabilities", arguments: {} })).data.categories).toBeNull();
  });
});

describe("single store (the storefront's COMMERCE_MODE=single-store)", () => {
  const single = () => fakeDeps({ stores: servedStores(true), singleStore: true });

  test("only the Use Origens store is offered and described; the old Norte and Centro-Oeste stores are gone", async () => {
    expect(servedStores(true)).toEqual(["use-sul"]);
    const client = await connect(single());
    expect(client.getInstructions()).toContain("loja Use Origens");
    const { tools: listed } = await client.listTools();
    const product = listed.find((t) => t.name === "origens_get_product")!;
    expect((product.inputSchema.properties as Record<string, { enum?: string[] }>).store.enum).toEqual(["use-sul"]);
    expect(JSON.stringify(listed)).not.toMatch(/use-norte|use-centro/);
    const caps = structured(await client.callTool({ name: "origens_capabilities", arguments: {} }));
    expect(caps.data).toMatchObject({ commerce_mode: "single-store", stores: [{ store: "use-sul", name: "Use Origens", regions: ["sul", "norte", "centro-oeste"] }] });
    expect((await client.callTool({ name: "origens_get_order", arguments: { store: "use-norte", order_id: "1" } })).isError).toBe(true);
  });

  test("a region reads the single store's orders and narrows only the panel's coupons", async () => {
    const r = await tools.promotionsTool(single(), { ...PERIOD, region: "norte" });
    expect(r.meta.filters_applied).toMatchObject({ region: "norte", stores: ["use-sul"] });
    expect(r.meta.coverage.status).toBe("complete");
    expect((r.data.usage as { configured_coupons_without_orders: unknown[] }).configured_coupons_without_orders).toEqual([]);
  });
});

describe("promotions", () => {
  test("without a period: the panel's items with their status now, and no INK read", async () => {
    const deps = fakeDeps();
    const client = await connect(deps);
    const r = structured(await client.callTool({ name: "origens_promotions", arguments: {} }));
    expect(r.meta).toMatchObject({ source: "use_origens_panel", data_as_of: "2026-10-14T10:00:00.000Z", period: null });
    expect((r.data.configured as Rows).map((i) => [i.id, i.code ?? null, i.status])).toEqual([["primeira", "PRIMEIRACOMPRA", "ended"], ["leve-mais", "LEVEMAIS", "live"], ["frete", null, "scheduled"]]);
    expect(r.data.usage).toBeNull();
    expect(deps.calls).toHaveLength(0);
  });

  test("with a period: usage per code (case ignored) tied to the panel's coupon; orders without code and unused coupons apart", async () => {
    const r = await tools.promotionsTool(fakeDeps(), PERIOD);
    const u = r.data.usage as { by_code: Rows; without_code: unknown; configured_coupons_without_orders: unknown };
    expect(u).toMatchObject({ orders_in_period: 2, orders_with_code: 1, share_of_orders_with_code: 0.5, promotion_discount_total: { cents: 1000 } });
    expect(u.by_code).toEqual([
      expect.objectContaining({ code: "LEVEMAIS", stores: ["use-sul"], orders: 1, units_net: 4, order_total: { cents: 37470, brl: "374.70" }, promotion_discount: { cents: 1000, brl: "10.00" }, configured_in_panel: [{ region: "sul", id: "leve-mais", title: "LEVE MAIS", status: "live" }] }),
    ]);
    expect(u.without_code).toMatchObject({ orders: 1, units_net: 1, order_total: { cents: 20980 }, orders_with_promotion_discount: 0 });
    expect(u.configured_coupons_without_orders).toEqual([{ code: "PRIMEIRACOMPRA", region: "sul", id: "primeira", title: "PRIMEIRA COMPRA", status: "ended" }]);
    expect(r.meta).toMatchObject({ source: "ink_api+use_origens_panel", date_basis: tools.SALES_DATE_BASIS, coverage: { status: "partial" } });
  });

  test("a region narrows the usage to its own store", async () => {
    const deps = fakeDeps();
    const r = await tools.promotionsTool(deps, { ...PERIOD, region: "sul" });
    expect(r.meta.filters_applied).toEqual({ region: "sul", stores: ["use-sul"] });
    expect(r.data.usage).toMatchObject({ orders_in_period: 1, orders_with_code: 1 });
    expect(r.meta.coverage.status).toBe("complete");
  });

  test("ranking with a coupon code, and by the variant's size", async () => {
    const withCode = (await tools.salesRankingTool(fakeDeps(), { ...PERIOD, dimension: "design_uf", promotion_code: "LEVEMAIS" })).data as { rows: Rows };
    expect(withCode.rows.map((x) => [x.key, x.units_net])).toEqual([["SC", 2], ["GO", 1]]);
    const none = (await tools.salesSummaryTool(fakeDeps(), { ...PERIOD, promotion_code: "OUTRO" })).data;
    expect(none).toMatchObject({ scope: "items", units_net: 0, orders_with_matching_items: 0 });
    const bySize = (await tools.salesRankingTool(fakeDeps(), { ...PERIOD, dimension: "size" })).data as { rows: Rows; not_placed: unknown };
    expect(bySize.rows.map((x) => [x.key, x.label, x.units_net])).toEqual([["m", "M", 5]]);
    expect(bySize.not_placed).toMatchObject({ reason: "unknown_variant", units_net: 0 });
  });
});
