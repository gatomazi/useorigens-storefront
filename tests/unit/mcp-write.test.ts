import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { buildCategoryIndex } from "@/lib/mcp/categories";
import { buildCatalogContext } from "@/lib/mcp/classify";
import { buildProductIndex } from "@/lib/mcp/catalog-index";
import { CHANGE_TTL_MS, buildExchangePlan, buildOrderItemEditPlan, buildProductPlan, changeHash, checkProductChangeInput, nextCategories, nextTags, pickVariant } from "@/lib/mcp/changes";
import { McpToolError } from "@/lib/mcp/errors";
import { parseExchange } from "@/lib/mcp/exchanges-model";
import type { Budget, InkLiveProduct } from "@/lib/mcp/ink-live";
import type { LiveCategory } from "@/lib/mcp/ink-write";
import { parseMcpOrder, type McpOrder } from "@/lib/mcp/orders-model";
import { withWriteChoice, parseScope } from "@/lib/mcp/auth/oauth";
import { createUseOrigensMcpServer } from "@/lib/mcp/server";
import type * as tools from "@/lib/mcp/tools";
import type { AllDeps, WriteDeps } from "@/lib/mcp/write-tools";
import { fakeWrite } from "./mcp-write-fakes";

// ── Synthetic INK state ──
const v = (id: string, model: string, color: string, size: string, isAvailable = true) => ({ id, model, color, size, sku: `S${id}`, isAvailable, availableQuantity: null });
const prod = (id: string, over: Partial<InkLiveProduct> = {}): InkLiveProduct => ({
  id,
  name: `Produto ${id}`,
  slug: null,
  status: "active",
  approvalStatus: "approved",
  visibleInStore: true,
  priceCents: 10990,
  promotionalPriceCents: null,
  productType: "Camiseta",
  clusterId: null,
  storeProductUrl: null,
  imageUrl: null,
  tags: ["sul", "Origem"],
  description: "Texto antigo",
  updatedAt: null,
  variants: [v("11", "Camiseta", "Preta", "M"), v("12", "Camiseta", "Preta", "G"), v("13", "Camiseta", "Branca", "M"), v("14", "Camiseta", "Branca", "G", false)],
  ...over,
});
const PRODUCTS: Record<string, InkLiveProduct> = {
  "101": prod("101"),
  "102": prod("102", { priceCents: 9990, promotionalPriceCents: 8990, approvalStatus: "waiting", visibleInStore: false, tags: [] }),
  "201": prod("201", { name: "Outra estampa", variants: [v("21", "Camiseta", "Preta", "M"), v("22", "Camiseta", "Preta", "G")] }),
  "301": prod("301", { priceCents: 14990, variants: [v("31", "Moletom", "Preta", "G"), v("32", "Moletom", "Cinza", "G")] }),
};
const cat = (id: number, name: string, members: string[], visibility: "public" | "internal" = "public"): LiveCategory => ({ id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), visibility, position: id, members: new Set(members) });
const CATEGORIES = [cat(1, "Território", ["101"]), cat(2, "Novidades", []), cat(3, "ZZ - SU - SC", ["101", "102"], "internal")];

const BUYER = { buyer: { first_name: "Fulana", email: "fulana@example.com", document: "12345678900" }, shipping_address: { street: "Rua Privada", number: "77", city: "Joinville", state: "SC" } };
const rawOrder = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  created_at: "2026-10-10T12:00:00-03:00",
  order_status: "awaiting_production",
  payment_status: "Pago",
  total_value: "219.80",
  items: [
    { id: 501, quantity: 2, refunded_quantity: 0, free_quantity: 0, unit_value: "109.90", total_value: "219.80", product_v2: { id: 101, name: "Produto 101" }, product_variant: { id: 11, model: "Camiseta", color: "Preta", size: "M" } },
    { id: 502, quantity: 1, refunded_quantity: 1, free_quantity: 0, unit_value: "109.90", total_value: "109.90", product_v2: { id: 101, name: "Produto 101" }, product_variant: { id: 13, model: "Camiseta", color: "Branca", size: "M" } },
  ],
  delivery: {},
  ...BUYER,
  ...over,
});
const ORDERS: Record<string, McpOrder> = {
  "1": parseMcpOrder(rawOrder(1, { items_editable: true, exchangeable: false }), "use-sul")!,
  "2": parseMcpOrder(rawOrder(2, { items_editable: false, exchangeable: true, order_status: "delivered", delivery: { delivered_at: "2026-10-12T10:00:00-03:00" } }), "use-sul")!,
  "3": parseMcpOrder(rawOrder(3, { items_editable: false, exchangeable: false, order_status: "sent" }), "use-sul")!,
};
const products = new Map(Object.entries(PRODUCTS));

describe("product changes (pure)", () => {
  test("input is checked before any INK read", () => {
    expect(() => checkProductChangeInput({ product_ids: ["101"] })).toThrow(/Nada a alterar/);
    expect(() => checkProductChangeInput({ product_ids: ["101", "102"], name: "Novo" })).toThrow(/um produto por vez/);
    expect(() => checkProductChangeInput({ product_ids: ["101"], price: "0.00" })).toThrow(McpToolError);
    expect(() => checkProductChangeInput({ product_ids: ["101"], price: "109,90" })).toThrow(McpToolError);
    expect(() => checkProductChangeInput({ product_ids: ["101"], tags_add: ["a"], tags_remove: ["A"] })).toThrow(/incluída e removida/);
    expect(() => checkProductChangeInput({ product_ids: Array.from({ length: 26 }, (_, i) => String(i + 1)), visible_in_store: false })).toThrow(/25/);
  });

  test("whole-list fields keep everything nobody named", () => {
    expect(nextTags(["sul", "Origem"], ["Novo", "SUL"], ["origem"])).toEqual(["sul", "Novo"]);
    expect(nextCategories([3, 1], [2], [1])).toEqual([3, 2]);
  });

  test("a plan shows before → after, skips what would not change and flags what deserves a look", () => {
    const plan = buildProductPlan("use-sul", { product_ids: ["101", "102"], price: "109.90", visible_in_store: true, tags_add: ["Natal"], categories_add: ["novidades"], categories_remove: ["1"] }, [PRODUCTS["101"], PRODUCTS["102"]], CATEGORIES);
    const p101 = plan.items.find((i) => i.product_id === "101")!;
    // 101 already costs 109.90 and is visible: only tags and categories change; its internal segmentation stays.
    expect(p101.patch).toEqual({});
    expect(p101.after).toEqual({ tags: ["sul", "Origem", "Natal"], categories: ["ZZ - SU - SC", "Novidades"] });
    const p102 = plan.items.find((i) => i.product_id === "102")!;
    expect(p102.patch).toEqual({ price: "109.90", visible_in_store: true });
    expect(p102.before).toMatchObject({ price: { cents: 9990 }, visible_in_store: false, categories: ["ZZ - SU - SC"] });
    expect(plan.warnings.join(" ")).toMatch(/promocional ativo/);
    expect(plan.warnings.join(" ")).toMatch(/curadoria/);
    const none = buildProductPlan("use-sul", { product_ids: ["101"], visible_in_store: true }, [PRODUCTS["101"]], null);
    expect(none.items).toHaveLength(0);
    expect(none.unchanged).toEqual([{ product_id: "101", name: "Produto 101" }]);
    expect(() => buildProductPlan("use-sul", { product_ids: ["101"], categories_add: ["inexistente"] }, [PRODUCTS["101"]], CATEGORIES)).toThrow(/não existe/);
  });

  test("a large price move is flagged", () => {
    expect(buildProductPlan("use-sul", { product_ids: ["101"], price: "49.90" }, [PRODUCTS["101"]], null).warnings.join(" ")).toMatch(/mais de 30%/);
  });
});

describe("order items and exchanges (pure)", () => {
  test("a variant by size alone keeps model and color; ambiguity and unavailability are errors that list the options", () => {
    expect(pickVariant(PRODUCTS["101"], { model: "Camiseta", color: "Preta", size: "M" }, { size: "g" }).id).toBe("12");
    expect(() => pickVariant(PRODUCTS["101"], { model: "Camiseta", color: "Branca", size: "M" }, { size: "G" })).toThrow(/indisponível/);
    expect(() => pickVariant(PRODUCTS["301"], null, { size: "G" })).toThrow(/Mais de uma variante/);
    expect(() => pickVariant(PRODUCTS["101"], null, { size: "XG" })).toThrow(/Disponíveis/);
  });

  test("item edit only inside INK's window, swapping the whole line; outside it points to the exchange", () => {
    const plan = buildOrderItemEditPlan(ORDERS["1"], products, [{ item_id: "501", size: "G" }]);
    expect(plan.body).toEqual({ items: [{ id: 501, product_v2_id: 101, product_variant_id: 12 }] });
    expect(plan.lines[0]).toMatchObject({ quantity: 2, from: { size: "M" }, to: { size: "G", variant_id: "12" } });
    expect(() => buildOrderItemEditPlan(ORDERS["1"], products, [{ item_id: "501", size: "M" }])).toThrow(/nada muda/);
    expect(() => buildOrderItemEditPlan(ORDERS["2"], products, [{ item_id: "501", size: "G" }])).toThrow(/origens_preview_exchange/);
    const pricier = buildOrderItemEditPlan(ORDERS["1"], products, [{ item_id: "501", product_id: "301", model: "Moletom", color: "Preta", size: "G" }]);
    expect(pricier.warnings.join(" ")).toMatch(/mesmo preço/);
  });

  test("exchange: eligibility, support reasons need text and photos, quantity limited to what is still the buyer's", () => {
    expect(() => buildExchangePlan(ORDERS["1"], products, { reason: "larger_size", items: [{ item_id: "501", size: "G" }] })).toThrow(/origens_preview_order_item_edit/);
    expect(() => buildExchangePlan(ORDERS["3"], products, { reason: "larger_size", items: [{ item_id: "501", size: "G" }] })).toThrow(/não aceita troca/);
    expect(() => buildExchangePlan(ORDERS["2"], products, { reason: "defect_in_product", items: [{ item_id: "501" }] })).toThrow(/problem_description/);
    expect(() => buildExchangePlan(ORDERS["2"], products, { reason: "defect_in_product", items: [{ item_id: "501" }], problem_description: "Furo", photo_urls: ["http://x.com/a.jpg"] })).toThrow(/https/);
    // 502 had 1 unit, refunded: nothing left to exchange.
    expect(() => buildExchangePlan(ORDERS["2"], products, { reason: "change_color", items: [{ item_id: "502", color: "Preta" }] })).toThrow(/quantity vai de 1 a 0/);
    const plan = buildExchangePlan(ORDERS["2"], products, { reason: "defect_in_product", items: [{ item_id: "501", quantity: 1 }], problem_description: "Estampa descascou", photo_urls: ["https://fotos.example.com/a.jpg"] });
    expect(plan.body).toEqual({ original_order_id: 2, exchange_reason: "defect_in_product", items: [{ old_item_id: 501, product_v2_id: 101, product_variant_id: 11, quantity: 1 }], problem_description: "Estampa descascou", photos: [{ photo_url: "https://fotos.example.com/a.jpg" }] });
    expect(plan.expected_effect).toMatch(/CONSUMIR/);
    expect(plan.needs_support_review).toBe(true);
  });

  test("an exchange read keeps only ids of the linked orders", () => {
    const e = parseExchange({ id: 7, status: "waiting", old_order: { id: 2, buyer: BUYER.buyer, shipping_address: BUYER.shipping_address }, new_order: null, problem_description: "Furo" }, "use-sul")!;
    expect(JSON.stringify(e)).not.toMatch(/Fulana|fulana@|Rua Privada|12345678900/);
    expect(e).toMatchObject({ exchangeId: "7", oldOrderId: "2", newOrderId: null });
  });
});

describe("the write scope", () => {
  test("is only granted when asked or ticked, and unticking removes it", () => {
    expect(parseScope("origens.read origens.write")).toEqual(["origens.read", "origens.write"]);
    expect(withWriteChoice(["origens.read", "offline_access"], true)).toEqual(["origens.read", "origens.write", "offline_access"]);
    expect(withWriteChoice(["origens.read", "origens.write"], false)).toEqual(["origens.read"]);
  });
});

// ── Through the MCP protocol ──
const NOW = new Date("2026-10-14T12:00:00-03:00");
const READ_GRANT = { subject: "01J00000000000000000000000", email: "dono@example.com", clientId: "mcp_testclient000000000000", scopes: ["origens.read"], expiresAt: 2_000_000_000, resource: "https://www.useorigens.com.br/api/mcp" };
const WRITE_GRANT = { ...READ_GRANT, scopes: ["origens.read", "origens.write"] };
const emptySnapshot: CatalogSnapshot = { version: 1, stores: {} };

function deps(writeOver: Partial<WriteDeps> = {}, now: () => Date = () => NOW) {
  const tags: Record<string, string[]> = {};
  const write = fakeWrite({
    product: async (_s, id) => {
      const p = PRODUCTS[id];
      if (!p) throw new McpToolError("NOT_FOUND", "A INK não encontrou o registro pedido nesta loja.");
      return { ...p, tags: tags[id] ?? p.tags };
    },
    order: async (_s, id) => {
      const o = ORDERS[id];
      if (!o) throw new McpToolError("NOT_FOUND", "A INK não encontrou o registro pedido nesta loja.");
      return o;
    },
    categoriesLive: async () => CATEGORIES,
    ...writeOver,
  });
  const all: AllDeps = {
    now,
    stores: ["use-sul", "use-norte", "use-centro"],
    hasCredential: () => true,
    catalog: () => ({ index: buildProductIndex(emptySnapshot, null), ctx: buildCatalogContext(emptySnapshot, null) }),
    categories: () => buildCategoryIndex({ version: 2, stores: {} }),
    promotions: () => ({ source: "seed", asOf: null, regions: [] }),
    newBudget: (): Budget => ({ maxRequests: 45, used: 0, deadline: Date.now() + 50_000 }),
    storeOrders: async () => {
      throw new Error("not used");
    },
    storeOrder: async () => {
      throw new Error("not used");
    },
    storeProduct: async () => {
      throw new Error("not used");
    },
    write,
  };
  return { all, write, tags };
}

async function connect(all: AllDeps, grant = WRITE_GRANT) {
  const server = createUseOrigensMcpServer(grant, all, () => undefined);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(b);
  return client;
}
const out = (r: unknown) => (r as { structuredContent: tools.ToolResult }).structuredContent;
const errorOf = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text).error as { code: string; message: string };

describe("confirmed changes through MCP", () => {
  test("a read-only grant sees no write tool; a write grant sees five more, only the confirmation is destructive", async () => {
    const read = await (await connect(deps().all, READ_GRANT)).listTools();
    expect(read.tools.some((t) => t.name.includes("preview") || t.name.includes("confirm"))).toBe(false);
    const write = await (await connect(deps().all)).listTools();
    const extra = write.tools.filter((t) => !read.tools.some((r) => r.name === t.name));
    expect(extra.map((t) => t.name).sort()).toEqual(["origens_change_status", "origens_confirm_change", "origens_preview_exchange", "origens_preview_order_item_edit", "origens_preview_product_changes"]);
    for (const t of write.tools) expect(t.annotations?.destructiveHint).toBe(t.name === "origens_confirm_change");
  });

  test("instructions and capabilities describe the connection as it is: a write grant is never told it is read-only", async () => {
    const readClient = await connect(deps().all, READ_GRANT);
    expect(readClient.getInstructions()).toContain("somente leitura");
    const readCaps = out(await readClient.callTool({ name: "origens_capabilities", arguments: {} }));
    expect(readCaps.data.access).toMatch(/^Somente leitura/);
    expect(readCaps.data.write_tools).toMatchObject({ enabled: false });

    const writeClient = await connect(deps().all);
    expect(writeClient.getInstructions()).not.toContain("somente leitura");
    expect(writeClient.getInstructions()).toContain("origens_confirm_change");
    const writeCaps = out(await writeClient.callTool({ name: "origens_capabilities", arguments: {} }));
    expect(writeCaps.data.access).toMatch(/^Leitura e alteração/);
    expect(writeCaps.data.access).toContain("use-sul");
    expect(writeCaps.data.write_tools).toMatchObject({ enabled: true, stores_with_write_credential: ["use-sul"] });
  });

  test("preview changes nothing; confirm sends exactly the plan, once, with tags and categories recomputed from INK's state of now", async () => {
    const { all, write, tags } = deps();
    const client = await connect(all);
    const preview = out(await client.callTool({ name: "origens_preview_product_changes", arguments: { store: "use-sul", product_ids: ["101", "102"], price: "119.90", tags_add: ["Natal"], categories_add: ["Novidades"] } }));
    const code = preview.data.confirmation_code as string;
    expect(code).toMatch(/^chg_/);
    expect(write.sent).toHaveLength(0);
    // Someone adds a tag on INK between the preview and the confirmation: it must survive.
    tags["101"] = ["sul", "Origem", "Promo"];
    const done = out(await client.callTool({ name: "origens_confirm_change", arguments: { confirmation_code: code } }));
    expect(done.data).toMatchObject({ status: "applied", applied: 2, total: 2 });
    expect(write.sent.map((s) => [s.target, s.body])).toEqual([
      ["101", { price: "119.90", tags: ["sul", "Origem", "Promo", "Natal"], collections: [1, 3, 2] }],
      ["102", { price: "119.90", tags: ["Natal"], collections: [3, 2] }],
    ]);
    expect(new Set(write.sent.map((s) => s.key)).size).toBe(2);
    expect(write.sent[0].key.startsWith(changeHash(code).slice(0, 32))).toBe(true);
    expect(write.audits).toHaveLength(1);
    expect(write.audits[0]).toMatchObject({ actor: WRITE_GRANT.subject, target: "use-sul:product" });
    const again = await client.callTool({ name: "origens_confirm_change", arguments: { confirmation_code: code } });
    expect(errorOf(again)).toMatchObject({ code: "CONFLICT" });
    expect(write.sent).toHaveLength(2);
    const status = out(await client.callTool({ name: "origens_change_status", arguments: { confirmation_code: code } }));
    expect(status.data).toMatchObject({ status: "applied", result: { applied: 2 } });
  });

  test("an expired code, a code of another account and a made-up code are refused without sending anything", async () => {
    let clock = NOW;
    const { all, write } = deps({}, () => clock);
    const client = await connect(all);
    const code = out(await client.callTool({ name: "origens_preview_product_changes", arguments: { store: "use-sul", product_ids: ["101"], visible_in_store: false } })).data.confirmation_code as string;
    const other = await connect(all, { ...WRITE_GRANT, subject: "01J99999999999999999999999" });
    expect(errorOf(await other.callTool({ name: "origens_confirm_change", arguments: { confirmation_code: code } }))).toMatchObject({ code: "CONFLICT" });
    clock = new Date(NOW.getTime() + CHANGE_TTL_MS + 1);
    expect(errorOf(await client.callTool({ name: "origens_confirm_change", arguments: { confirmation_code: code } })).message).toMatch(/expirou/);
    expect(errorOf(await client.callTool({ name: "origens_confirm_change", arguments: { confirmation_code: "chg_AAAAAAAAAAAAAAAA" } }))).toMatchObject({ code: "NOT_FOUND" });
    expect(write.sent).toHaveLength(0);
  });

  test("partial results say, item by item, what INK refused and what may or may not have happened", async () => {
    const { all } = deps({
      patchProduct: async (_s, id) => {
        if (id === "101") throw new McpToolError("INK_REJECTED", "A INK recusou (loja use-sul): produto não é sob demanda");
        throw new McpToolError("UPSTREAM_UNAVAILABLE", "A INK não respondeu (loja use-sul): a alteração pode ou não ter sido feita.");
      },
    });
    const client = await connect(all);
    const code = out(await client.callTool({ name: "origens_preview_product_changes", arguments: { store: "use-sul", product_ids: ["101", "102"], price: "89.90" } })).data.confirmation_code as string;
    const done = out(await client.callTool({ name: "origens_confirm_change", arguments: { confirmation_code: code } }));
    expect(done.data).toMatchObject({ status: "partial", applied: 0 });
    expect((done.data.outcomes as { target: string; outcome: string }[]).map((o) => [o.target, o.outcome])).toEqual([["101", "rejected"], ["102", "unknown"]]);
    expect(done.meta.coverage.status).toBe("partial");
  });

  test("a store without write credential and a read-only grant cannot even preview", async () => {
    const client = await connect(deps().all);
    expect(errorOf(await client.callTool({ name: "origens_preview_product_changes", arguments: { store: "use-centro", product_ids: ["101"], visible_in_store: false } }))).toMatchObject({ code: "MISSING_CREDENTIAL" });
    const { all } = deps();
    const preview = out(await (await connect(all)).callTool({ name: "origens_preview_product_changes", arguments: { store: "use-sul", product_ids: ["101"], visible_in_store: false } }));
    const readOnly = await connect(all, READ_GRANT);
    const r = await readOnly.callTool({ name: "origens_confirm_change", arguments: { confirmation_code: preview.data.confirmation_code } });
    expect(r.isError).toBe(true);
  });

  test("order item edit and exchange go through the same preview → confirmation", async () => {
    const { all, write } = deps();
    const client = await connect(all);
    const edit = out(await client.callTool({ name: "origens_preview_order_item_edit", arguments: { store: "use-sul", order_id: "1", items: [{ item_id: "501", size: "G" }] } }));
    await client.callTool({ name: "origens_confirm_change", arguments: { confirmation_code: edit.data.confirmation_code } });
    const ex = out(await client.callTool({ name: "origens_preview_exchange", arguments: { store: "use-sul", order_id: "2", reason: "larger_size", items: [{ item_id: "501", size: "G", quantity: 1 }] } }));
    expect(JSON.stringify(ex)).not.toMatch(/Fulana|Rua Privada/);
    const done = out(await client.callTool({ name: "origens_confirm_change", arguments: { confirmation_code: ex.data.confirmation_code } }));
    expect(write.sent.map((s) => [s.op, s.target, s.body])).toEqual([
      ["patchOrderItems", "1", [{ id: 501, product_v2_id: 101, product_variant_id: 12 }]],
      ["createExchange", "2", { original_order_id: 2, exchange_reason: "larger_size", items: [{ old_item_id: 501, product_v2_id: 101, product_variant_id: 12, quantity: 1 }] }],
    ]);
    expect((done.data.outcomes as { ink: { exchange_id: string } }[])[0].ink.exchange_id).toBe("9001");
    const notEditable = await client.callTool({ name: "origens_preview_order_item_edit", arguments: { store: "use-sul", order_id: "3", items: [{ item_id: "501", size: "G" }] } });
    expect(errorOf(notEditable)).toMatchObject({ code: "CONFLICT" });
  });

  test("exchanges are listed with ids only, and the free-text description only in the detail", async () => {
    const raw = { id: 7, status: "waiting", support_review_status: "pending", exchange_reason: "defect_in_product", old_order: { id: 2, ...BUYER }, problem_description: "Furo na manga" };
    const { all } = deps({
      storeExchanges: async () => ({ exchanges: [parseExchange(raw, "use-sul")!], unreadable: 0, fetchedAt: NOW }),
      storeExchange: async () => parseExchange(raw, "use-sul")!,
    });
    const client = await connect(all, READ_GRANT);
    const list = out(await client.callTool({ name: "origens_list_exchanges", arguments: { stores: ["use-sul"] } }));
    expect(list.data).toMatchObject({ total: 1, by_status: { waiting: 1 }, by_support_review_status: { pending: 1 } });
    expect(JSON.stringify(list)).not.toMatch(/Fulana|Furo/);
    const one = out(await client.callTool({ name: "origens_get_exchange", arguments: { store: "use-sul", exchange_id: "7" } }));
    expect(one.data).toMatchObject({ exchange_id: "7", old_order_id: "2", problem_description: "Furo na manga" });
  });
});
