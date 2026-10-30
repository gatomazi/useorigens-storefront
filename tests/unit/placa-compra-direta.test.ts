import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { ProductJobStore } from "@/lib/customization/ink-products";
import type { PrintProject } from "@/lib/print-studio/model";
import type { Customizer } from "@/lib/site-config/schema";

const state = vi.hoisted(() => ({ model: null as Customizer | null, base: null as PrintProject | null, products: null as ProductJobStore | null, updates: [] as { id: string; body: Record<string, unknown> }[] }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "127.0.0.9" }) }));
vi.mock("@/lib/admin/auth/rate-limit", () => ({ allow: () => true }));
vi.mock("@/lib/pages/public", () => ({ publishedFor: (region: string) => region === "sul" ? { region: "sul", bundle: { docs: { sul: { customizers: [state.model] } } } } : null }));
// The real server check (the city against IBGE's list) on a base held in memory.
vi.mock("@/lib/customization/artwork-server", async () => {
  const { validateArtworkInput } = await import("@/lib/customization/artwork");
  const { brazilCityExists } = await import("@/lib/geo/brazil-cities-server");
  return { loadArtworkBase: async () => state.base, checkArtworkInput: (base: PrintProject, id: string, input: object) => validateArtworkInput(base, id, input, { cityExists: brazilCityExists }) };
});
vi.mock("@/lib/customization/products-server", async () => ({
  productStoreOrNull: () => state.products,
  inkProductClientFor: () => ({ live: false, updateProduct: async (id: string, body: Record<string, unknown>) => { state.updates.push({ id, body }); } }),
  startProductJob: () => undefined,
  missingProductTable: () => false,
}));

import { startProductsAction } from "@/app/[region]/personalizar/actions";
import { fileProductJobStore } from "@/lib/customization/product-store";
import { needsReview } from "@/lib/customization/review-words";
import { parseProjectFile } from "@/lib/print-studio/model";

const TEMPLATE = "1793300715844-02b539b5-caf7-4e18-b9cf-0a245d34827c";
const FONT = `data:font/ttf;base64,${readFileSync(path.join(process.cwd(), "assets", "print-studio", "fonts", "OrigensPlaca-Regular.ttf")).toString("base64")}`;
const layer = (id: string, slot: object) => ({ kind: "text", id, name: id, visible: true, x: 100, y: 100, text: "X", fontId: "font-origens-placa", fontSize: 120, weight: 400, color: "#b6bab5", letterSpacing: 4, lineHeight: 1.1, align: "center", boxWidth: 1800, slot });
const BASE = parseProjectFile(JSON.stringify({ version: 1, name: "Placa · UF e cidade", width: 2000, height: 600, dpi: 300, background: null, reference: null,
  fonts: [{ id: "font-origens-placa", name: "Origens Placa", weight: 400, dataUrl: FONT }],
  layers: [
    layer("cidade", { field: "cidade", label: "Cidade", template: "{cidade}", textCase: "upper", maxLength: 60, example: "Santa Terezinha de Itaipu/PR", input: "city" }),
    layer("placa", { field: "placa", label: "Placa", template: "{placa}", textCase: "upper", maxLength: 8, example: "TOM-1996", input: "plate" }),
  ] }));
const buy = (fields: Record<string, string>) => startProductsAction({ region: "sul", slug: "placa", artwork: { templateId: TEMPLATE, fields } });

describe("direct purchase of the plate", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "uo-placa-"));
    state.base = BASE;
    state.model = { id: "cz-placa", slug: "placa", name: "Placa da sua cidade", source: { store: "use-sul", collectionId: 1 }, fields: [], studioArts: [{ label: "Placa", versions: [{ templateId: TEMPLATE }] }], directPurchase: { enabled: true, price: "109.90" }, previewMode: "mockupWithTextSummary", active: true, version: 1 };
  });
  beforeEach(() => { state.products = fileProductJobStore(path.join(dir, `products-${Math.random()}.json`)); state.updates = []; });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  test("queues the product with the canonical answers and a readable name", async () => {
    const result = await buy({ cidade: "Belém/PA", placa: "bel 1616" });
    expect(result).toMatchObject({ ok: true, items: [{ status: "queued" }] });
    const { rows } = await state.products!.list({}, 10, 0);
    expect(rows[0]).toMatchObject({ name: "Belém (PA) BEL-1616 | Placa da sua cidade Placa", fields: { cidade: "Belém/PA", placa: "BEL-1616" } });
  });
  test("a real city is never sent to the team for its name; an offensive plate is", async () => {
    expect(needsReview("Pau dos Ferros")).toBe(true); // "pau" is on the list: only the skip lets the city through
    expect(await buy({ cidade: "Pau dos Ferros/RN", placa: "TOM-1996" })).toMatchObject({ ok: true });
    expect(await buy({ cidade: "Belém/PA", placa: "FDP-1234" })).toMatchObject({ ok: false, fallback: true });
  });
  test("a city outside IBGE's list is refused on the server", async () => {
    expect(await buy({ cidade: "Cidade Inventada/PR", placa: "TOM-1996" })).toMatchObject({ ok: false, errors: [{ key: "artwork.cidade" }] });
    expect((await state.products!.list({}, 10, 0)).total).toBe(0);
  });

  test("the same plate again, after a promo started: the product already at INK gets the promo by PATCH, never a second product", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-30T15:00:00Z"));
      state.model = { ...state.model!, directPurchase: { enabled: true, price: "109.90", promoPrice: "89.90", promoStartsAt: "2026-11-01T00:00", promoEndsAt: "2026-12-01T00:00" } };
      await buy({ cidade: "Belém/PA", placa: "BEL-1616" });
      const [job] = (await state.products!.list({}, 10, 0)).rows;
      await state.products!.update(job.id, { status: "ready", inkProductId: "5143876" });
      expect(state.updates).toEqual([]);
      vi.setSystemTime(new Date("2026-11-15T15:00:00Z"));
      expect(await buy({ cidade: "Belém/PA", placa: "BEL-1616" })).toMatchObject({ ok: true, items: [{ status: "ready" }] });
      expect(state.updates).toEqual([{ id: "5143876", body: { price: "109.90", promotional_price: "89.90" } }]);
      vi.setSystemTime(new Date("2026-12-02T15:00:00Z"));
      await buy({ cidade: "Belém/PA", placa: "BEL-1616" });
      expect(state.updates[1]).toEqual({ id: "5143876", body: { price: "109.90", promotional_price: null } });
      expect((await state.products!.list({}, 10, 0)).total).toBe(1);
    } finally {
      vi.useRealTimers();
      state.model = { ...state.model!, directPurchase: { enabled: true, price: "109.90" } };
    }
  });
});
