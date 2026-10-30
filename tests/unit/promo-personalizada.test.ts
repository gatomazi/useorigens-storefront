import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseCustomizerForm } from "@/lib/admin/customizer-form";
import { personalizationCards } from "@/lib/customization/hub";
import type { InkProductClient } from "@/lib/customization/ink-product-client";
import type { NewProductJob, ProductJobStore } from "@/lib/customization/ink-products";
import { fileProductJobStore } from "@/lib/customization/product-store";
import { runProductJob } from "@/lib/customization/product-worker";
import { directPrices, promoWindowOpen } from "@/lib/customization/promo";
import { syncReusedPrice } from "@/lib/customization/promo-sync";
import { validateCustomizer, type Customizer, type DirectPurchase, type PublishedBundle, type ScopeDoc } from "@/lib/site-config/schema";

const T = "1793300715844-02b539b5-caf7-4e18-b9cf-0a245d34827c";
// Black Month: de 01/11 00:00 a 01/12 00:00, hora de Brasília (UTC−3).
const BLACK: DirectPurchase = { enabled: true, price: "109.90", kidsPrice: "96.00", promoPrice: "89.90", kidsPromoPrice: "79.90", promoStartsAt: "2026-11-01T00:00", promoEndsAt: "2026-12-01T00:00" };
const at = (iso: string) => new Date(iso);
const model: Customizer = {
  id: "cz-1", slug: "sobrenome", name: "Sobrenome", source: { store: "use-sul", collectionId: 1 }, fields: [], previewMode: "mockupWithTextSummary", active: true, version: 1,
  studioArts: [{ label: "A", versions: [{ label: "Adulto", templateId: T }, { label: "Infantil", templateId: "1793300715845-02b539b5-caf7-4e18-b9cf-0a245d34827c", garment: "infantil" }] }],
  pageMockup: { assetId: "img", alt: "Camiseta", decorative: false },
};

describe("promo window (America/Sao_Paulo)", () => {
  test("starts inclusive and ends exclusive, in Brasília time", () => {
    expect(promoWindowOpen(BLACK, at("2026-11-01T02:59:59Z"))).toBe(false); // 31/10 23:59:59 em Brasília
    expect(promoWindowOpen(BLACK, at("2026-11-01T03:00:00Z"))).toBe(true);
    expect(promoWindowOpen(BLACK, at("2026-12-01T02:59:59Z"))).toBe(true);
    expect(promoWindowOpen(BLACK, at("2026-12-01T03:00:00Z"))).toBe(false);
  });
  test("an open start or end", () => {
    expect(promoWindowOpen({}, at("2020-01-01T00:00:00Z"))).toBe(true);
    expect(promoWindowOpen({ promoEndsAt: "2026-12-01T00:00" }, at("2026-10-30T12:00:00Z"))).toBe(true);
    expect(promoWindowOpen({ promoStartsAt: "2026-11-01T00:00" }, at("2027-06-01T00:00:00Z"))).toBe(true);
  });
  test("the price of each garment, with its promo only inside the window", () => {
    const inside = at("2026-11-15T12:00:00Z");
    expect(directPrices(BLACK, "camiseta", inside)).toEqual({ price: "109.90", promotionalPrice: "89.90" });
    expect(directPrices(BLACK, "infantil", inside)).toEqual({ price: "96.00", promotionalPrice: "79.90" });
    expect(directPrices(BLACK, "camiseta", at("2026-10-30T12:00:00Z"))).toEqual({ price: "109.90", promotionalPrice: null });
    expect(directPrices({ ...BLACK, kidsPromoPrice: undefined }, "infantil", inside)).toEqual({ price: "96.00", promotionalPrice: null });
    expect(directPrices({ enabled: true, price: "109.90" }, "infantil", inside)).toBeNull();
  });
});

describe("promo in the published contract", () => {
  const ok = (d: DirectPurchase) => validateCustomizer({ ...model, directPurchase: d }, "sul").ok;
  test("accepts the Black Month promo", () => expect(ok(BLACK)).toBe(true));
  test("every promo ends in .90 and is lower than its regular price", () => {
    expect(ok({ ...BLACK, promoPrice: "89.00" })).toBe(false);
    expect(ok({ ...BLACK, promoPrice: "89,90" })).toBe(false);
    expect(ok({ ...BLACK, promoPrice: "109.90" })).toBe(false);
    expect(ok({ ...BLACK, promoPrice: "119.90" })).toBe(false);
    expect(ok({ ...BLACK, kidsPromoPrice: "96.90" })).toBe(false);
    expect(ok({ ...BLACK, kidsPromoPrice: "79.99" })).toBe(false);
  });
  test("dates are Brasília dates, in order", () => {
    expect(ok({ ...BLACK, promoStartsAt: "2026-11-01" })).toBe(false);
    expect(ok({ ...BLACK, promoEndsAt: "2026-11-01T00:00:00-03:00" })).toBe(false);
    expect(ok({ ...BLACK, promoStartsAt: "2026-12-01T00:00", promoEndsAt: "2026-11-01T00:00" })).toBe(false);
    expect(ok({ ...BLACK, promoStartsAt: undefined, promoEndsAt: undefined })).toBe(true);
  });
});

describe("promo in the model editor", () => {
  const form = (entries: Record<string, string>) => ({ get: (name: string) => (name in entries ? entries[name] : null) });
  const arts = JSON.stringify([{ label: "A", versions: [{ label: "Adulto", templateId: T, lightTemplateId: "", garment: "camiseta" }, { label: "Infantil", templateId: "1793300715845-02b539b5-caf7-4e18-b9cf-0a245d34827c", lightTemplateId: "", garment: "infantil" }] }]);
  const on = { name: "Sobrenome", studio_arts_json: arts, direct_form: "1", direct_enabled: "on", direct_price: "109,90", direct_kids_price: "96,00" };
  const parse = (entries: Record<string, string>) => parseCustomizerForm(form({ ...on, ...entries }), model, { store: "use-sul" }, { slugLocked: false });
  test("keeps the promo as INK takes it", () => {
    const { patch, errors } = parse({ direct_promo_price: "89,90", direct_kids_promo_price: "R$ 79,90", direct_promo_starts: "2026-11-01T00:00", direct_promo_ends: "2026-12-01T00:00" });
    expect(errors).toEqual([]);
    expect(patch.directPurchase).toEqual({ enabled: true, price: "109.90", kidsPrice: "96.00", promoPrice: "89.90", kidsPromoPrice: "79.90", promoStartsAt: "2026-11-01T00:00", promoEndsAt: "2026-12-01T00:00" });
    expect(validateCustomizer({ ...model, directPurchase: patch.directPurchase }, "sul").ok).toBe(true);
  });
  test("empty promo fields leave no promo", () => {
    expect(parse({ direct_promo_price: "", direct_promo_starts: "" }).patch.directPurchase).toEqual({ enabled: true, price: "109.90", kidsPrice: "96.00" });
  });
  test("refuses a promo that does not end in ,90, is not lower, or a window out of order", () => {
    expect(parse({ direct_promo_price: "89,00" }).errors).toEqual(["Preço promocional da camiseta precisa terminar em ,90."]);
    expect(parse({ direct_promo_price: "119,90" }).errors).toEqual(["Preço promocional da camiseta precisa ser menor que o preço normal."]);
    expect(parse({ direct_kids_promo_price: "abc" }).errors).toEqual(["Preço promocional da Camiseta Infantil inválido: use o formato 89,90."]);
    expect(parse({ direct_promo_starts: "2026-12-01T00:00", direct_promo_ends: "2026-11-01T00:00" }).errors).toEqual(["A promoção precisa terminar depois de começar."]);
  });
});

describe("promo on the personalization card", () => {
  const media = { img: { src: "/m/x.webp", width: 800, height: 800 } } as unknown as PublishedBundle["media"];
  const doc = { scope: "sul", customizers: [{ ...model, directPurchase: BLACK }] } as unknown as ScopeDoc;
  test("inside the window: the regular price struck through and the promo", () => {
    expect(personalizationCards(doc, media, "sul", at("2026-11-15T12:00:00Z"))[0]).toMatchObject({ price: "R$ 89,90", fullPrice: "R$ 109,90" });
  });
  test("outside: the regular price only", () => {
    const card = personalizationCards(doc, media, "sul", at("2026-12-01T03:00:00Z"))[0];
    expect(card.price).toBe("R$ 109,90");
    expect(card).not.toHaveProperty("fullPrice");
  });
});

// ── Criação e reaproveitamento ──────────────────────────────────────────────────────────────────────────────────────

const NEW: NewProductJob = { dedupeKey: "b".repeat(64), region: "sul", customizerId: "cz-1", customizerSlug: "sobrenome", name: "Silva | Sobrenome", artLabel: "A", fields: { sobrenome: "Silva" }, templateId: "t", lightTemplateId: null, garment: "camiseta", productTypeId: 1, price: "109.90" };
let dir: string;
let store: ProductJobStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "uo-promo-"));
  store = fileProductJobStore(path.join(dir, "products.json"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function ink(fail = false) {
  const calls = { create: [] as Record<string, unknown>[], update: [] as { id: string; body: Record<string, unknown> }[] };
  const client: InkProductClient = {
    live: false,
    printableAreas: async () => ["Preta", "Branca"].map((name, i) => ({ base_image_id: i, color: { name }, model: "Masculino" })),
    collectionExists: async () => true,
    async createProduct(body) { calls.create.push(body); return { id: "777", url: "https://loja.useorigens.com.br/useorigens/product/silva", imageUrl: "https://img.example/silva.jpg" }; },
    getProduct: async (id) => ({ id, url: "https://loja.useorigens.com.br/useorigens/product/silva", imageUrl: "https://img.example/silva.jpg" }),
    async updateProduct(id, body) { if (fail) throw new Error("INK fora"); calls.update.push({ id, body }); },
  };
  return { client, calls };
}
const PNG = Buffer.from("png");
const deps = (client: InkProductClient) => ({ store, client, render: async () => ({ darkInk: PNG, lightInk: PNG }), now: () => new Date(), sleep: async () => undefined });

describe("a new product carries the promo", () => {
  test("inside the window it is created with promotional_price", async () => {
    const { job } = await store.findOrCreate(NEW);
    const { client, calls } = ink();
    await runProductJob(job.id, deps(client), () => ({ description: "d", tags: [], collections: [], promotionalPrice: "89.90" }));
    expect(calls.create[0]).toMatchObject({ price: "109.90", promotional_price: "89.90" });
  });
  test("outside it is created without one", async () => {
    const { job } = await store.findOrCreate(NEW);
    const { client, calls } = ink();
    await runProductJob(job.id, deps(client), () => ({ description: "d", tags: [], collections: [], promotionalPrice: null }));
    expect(calls.create[0]).not.toHaveProperty("promotional_price");
  });
});

describe("a reused product gets today's price", () => {
  test("already at INK: PATCH price and promo, and the job keeps the new price", async () => {
    const { job } = await store.findOrCreate({ ...NEW, price: "99.90" });
    const held = (await store.update(job.id, { status: "ready", inkProductId: "777" }))!;
    const { client, calls } = ink();
    const out = await syncReusedPrice(store, client, held, { price: "109.90", promotionalPrice: "89.90" });
    expect(calls.update).toEqual([{ id: "777", body: { price: "109.90", promotional_price: "89.90" } }]);
    expect(out.price).toBe("109.90");
    expect((await store.get(job.id))!.price).toBe("109.90");
  });
  test("after the window the promo is taken off (null)", async () => {
    const { job } = await store.findOrCreate(NEW);
    const held = (await store.update(job.id, { status: "ready", inkProductId: "777" }))!;
    const { client, calls } = ink();
    await syncReusedPrice(store, client, held, { price: "109.90", promotionalPrice: null });
    expect(calls.update).toEqual([{ id: "777", body: { price: "109.90", promotional_price: null } }]);
  });
  test("not at INK yet: only the queued job's price changes; the worker reads the promo when it creates", async () => {
    const { job } = await store.findOrCreate({ ...NEW, price: "99.90" });
    const { client, calls } = ink();
    expect((await syncReusedPrice(store, client, job, { price: "109.90", promotionalPrice: "89.90" })).price).toBe("109.90");
    expect(calls.update).toEqual([]);
  });
  test("INK failing on the PATCH never blocks the customer", async () => {
    const { job } = await store.findOrCreate(NEW);
    const held = (await store.update(job.id, { status: "ready", inkProductId: "777" }))!;
    expect(await syncReusedPrice(store, ink(true).client, held, { price: "109.90", promotionalPrice: "89.90" })).toEqual(held);
  });
});
