import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildStoreIndex } from "@/lib/catalog/indexer";
import type { UnrankedBinding } from "@/lib/catalog/types";
import { administrativeRegionByLabel, DF_MUNICIPALITY_ID } from "@/lib/geo/administrative-regions";
import { citiesByName } from "@/lib/geo/cities";
import { localityById } from "@/lib/geo/localities";
import type { CommerceStoreKey, RegionSlug } from "@/lib/geo/regions";
import { computePodioSnapshot } from "@/lib/podio/compute";
import { eligibleLines, netUnits, parseInkOrder } from "@/lib/podio/orders";
import { freshnessOf, MAX_AGE_MS, projectLeaders, projectPodium, type PodioCatalogView } from "@/lib/podio/public";
import { movementOf, orderEntities } from "@/lib/podio/rank";
import { readDatedSnapshot, readLatestSnapshot, readRunState } from "@/lib/podio/snapshot";
import { syncRegionPodio } from "@/lib/podio/sync";
import type { PodioOrder, PodioSnapshot } from "@/lib/podio/types";
import { saoPauloMidnight, windowFor } from "@/lib/podio/window";
import { product } from "./fixtures";

// ── Synthetic fixtures only: no real order, buyer or address ever appears here. ────────────────────────────────────────────────────────

let orderSeq = 1;
let itemSeq = 1;
type RawLine = { productId: string; name: string; tags?: string[]; quantity?: number; refunded?: number; free?: number; itemId?: number };
function rawOrder(lines: RawLine[], opts: { createdAt?: string; status?: string; exchange?: boolean; total?: string; id?: number } = {}) {
  return {
    id: opts.id ?? orderSeq++,
    created_at: opts.createdAt ?? "2026-09-20T12:00:00.000-03:00",
    payment_status: opts.status ?? "Pago",
    is_exchange: opts.exchange ?? false,
    total_value: opts.total ?? "109.90",
    payment_method: "Pix",
    buyer: { first_name: "Fulano", email: "fulano@example.invalid" },
    shipping_address: { city: "Cidade Qualquer", state: "XX", cep: "00000-000" },
    items: lines.map((l) => ({
      id: l.itemId ?? itemSeq++,
      quantity: l.quantity ?? 1,
      refunded_quantity: l.refunded ?? 0,
      free_quantity: l.free ?? 0,
      product_v2: { id: Number(l.productId), name: l.name, tags: l.tags ?? [] },
      product_variant: { size: "M", color: "Preto" },
    })),
  };
}
const orders = (...raw: ReturnType<typeof rawOrder>[]): PodioOrder[] => raw.map((r) => parseInkOrder(r)!);

function bindingsOf(storeKey: CommerceStoreKey, names: { id: string; name: string; tags?: string[] }[]): Map<string, UnrankedBinding> {
  const index = buildStoreIndex(storeKey, names.map((n) => product(n.name, { id: n.id, storeKey, tags: n.tags ?? [] })), "2026-10-01T00:00:00.000Z");
  return new Map(index.bindings.map((b) => [b.inkProductId, b]));
}

const D = "2026-10-04";
const NOW = new Date("2026-10-04T07:00:00.000Z"); // 04:00 in São Paulo
const WINDOW = windowFor(NOW);

const sulCatalog = bindingsOf("use-sul", [
  { id: "101", name: "Joinville | Origem SC" },
  { id: "102", name: "Joinville | Coordenadas SC" },
  { id: "103", name: "Blumenau | Origem SC" },
  { id: "104", name: "Curitiba | Origem PR" },
  { id: "105", name: "Bom Jesus | Origem RS" },
  { id: "106", name: "Bom Jesus | Origem SC" },
  { id: "107", name: "Itajaí | Território SC" },
  { id: "108", name: "Lages | Origem SC" },
]);

function compute(region: RegionSlug, list: PodioOrder[], previous: PodioSnapshot | null = null, bindings = sulCatalog, now = NOW) {
  return computePodioSnapshot({ region, window: windowFor(now), orders: list, bindingsById: bindings, previous, requests: 1, now });
}

const ids = (entries: { id: string }[]) => entries.map((e) => e.id);
const cityId = (name: string, uf: string) => citiesByName(name, [uf])[0].id;

describe("pódio — window (America/Sao_Paulo)", () => {
  it("is the 30 full days before D: start inclusive at 00:00 of D−30, end exclusive at 00:00 of D", () => {
    expect(WINDOW.referenceDate).toBe(D);
    expect(WINDOW.start.toISOString()).toBe("2026-09-04T03:00:00.000Z");
    expect(WINDOW.end.toISOString()).toBe("2026-10-04T03:00:00.000Z");
    expect(saoPauloMidnight("2026-10-04").toISOString()).toBe("2026-10-04T03:00:00.000Z");
  });

  it("counts an order at the very start and drops one at the very end", () => {
    const list = orders(
      rawOrder([{ productId: "101", name: "x" }], { createdAt: "2026-09-04T00:00:00.000-03:00" }),
      rawOrder([{ productId: "101", name: "x" }], { createdAt: "2026-09-03T23:59:59.999-03:00" }),
      rawOrder([{ productId: "101", name: "x" }], { createdAt: "2026-10-03T23:59:59.999-03:00" }),
      rawOrder([{ productId: "101", name: "x" }], { createdAt: "2026-10-04T00:00:00.000-03:00" }),
    );
    const { lines, excluded } = eligibleLines("use-sul", list, WINDOW);
    expect(lines).toHaveLength(2);
    expect(excluded.outsideWindow).toBe(2);
  });
});

describe("pódio — quantities, payment, refunds, dedup", () => {
  it("drops buyer/address data at parse time", () => {
    const parsed = parseInkOrder(rawOrder([{ productId: "101", name: "x" }]));
    const json = JSON.stringify(parsed);
    expect(json).not.toContain("Fulano");
    expect(json).not.toContain("example.invalid");
    expect(json).not.toContain("00000-000");
  });

  it("net units = quantity − refunded − free, never negative", () => {
    expect(netUnits({ quantity: 3, refundedQuantity: 1, freeQuantity: 0 })).toBe(2);
    expect(netUnits({ quantity: 2, refundedQuantity: 1, freeQuantity: 1 })).toBe(0);
    expect(netUnits({ quantity: 1, refundedQuantity: 5, freeQuantity: 0 })).toBe(0);
  });

  it("excludes unpaid, cancelled, refunded, exchanges, zero-value orders and duplicates", () => {
    const dup = rawOrder([{ productId: "101", name: "x", quantity: 2 }], { id: 9001 });
    const list = orders(
      dup,
      dup,
      rawOrder([{ productId: "101", name: "x" }], { status: "Expirado" }),
      rawOrder([{ productId: "101", name: "x" }], { status: "Cancelado" }),
      rawOrder([{ productId: "101", name: "x" }], { status: "Reembolsado" }),
      rawOrder([{ productId: "101", name: "x" }], { exchange: true }),
      rawOrder([{ productId: "101", name: "x" }], { total: "0.00" }),
      rawOrder([{ productId: "103", name: "x", quantity: 3, refunded: 1 }]),
    );
    const { lines, excluded, ordersEligible } = eligibleLines("use-sul", list, WINDOW);
    expect(ordersEligible).toBe(2);
    expect(lines.reduce((s, l) => s + l.units, 0)).toBe(4);
    expect(excluded).toEqual({ notPaid: 3, exchange: 1, zeroValue: 1, outsideWindow: 0, duplicate: 1 });
  });
});

describe("pódio — geography and families", () => {
  it("variants of the same product (sizes/colours) and several products of a city add up to one locality", () => {
    const snap = compute("sul", orders(rawOrder([{ productId: "101", name: "x", quantity: 2 }, { productId: "101", name: "x" }, { productId: "102", name: "x" }])));
    const sc = snap.states.SC;
    expect(sc.localities).toHaveLength(1);
    expect(sc.localities[0]).toMatchObject({ id: cityId("Joinville", "SC"), units: 4, position: 1 });
    expect(ids(sc.families)).toEqual(["ponto-de-origem", "coordenadas"]);
  });

  it("keeps UFs apart and never merges homonyms across states", () => {
    const snap = compute("sul", orders(rawOrder([{ productId: "105", name: "x" }, { productId: "106", name: "x", quantity: 2 }, { productId: "104", name: "x" }])));
    expect(Object.keys(snap.states).sort()).toEqual(["PR", "RS", "SC"]);
    expect(snap.states.RS.localities[0].id).toBe(cityId("Bom Jesus", "RS"));
    expect(snap.states.SC.localities[0].id).toBe(cityId("Bom Jesus", "SC"));
    expect(snap.states.RS.localities[0].id).not.toBe(snap.states.SC.localities[0].id);
  });

  it("maps a product missing from the catalog by the catalog's own name parser, and lists what it cannot map", () => {
    const snap = compute(
      "sul",
      orders(rawOrder([{ productId: "999", name: "Blumenau | Território SC" }, { productId: "998", name: "Made in Santa Catarina" }, { productId: "997", name: "Feito em Bom Jesus" }])),
    );
    expect(snap.states.SC.localities[0].id).toBe(cityId("Blumenau", "SC"));
    expect(snap.states.SC.families[0].id).toBe("territorio");
    expect(snap.unmapped.map((u) => [u.productId, u.reason])).toEqual([
      ["997", "no-unambiguous-uf"],
      ["998", "not-a-city-design"],
    ]);
    expect(snap.sync.unitsEligible).toBe(3);
    expect(snap.sync.unitsMapped).toBe(1);
  });

  it("family with a stated UF but an unknown city counts for families only", () => {
    const snap = compute("sul", orders(rawOrder([{ productId: "996", name: "Cidade Inexistente | Origem SC" }])));
    expect(snap.states.SC.localities).toEqual([]);
    expect(ids(snap.states.SC.families)).toEqual(["ponto-de-origem"]);
  });

  it("Federal District: each administrative region is its own locality, never collapsed into Brasília", () => {
    const centro = bindingsOf("use-centro", [
      { id: "201", name: "Gama | Origem DF" },
      { id: "202", name: "Taguatinga | Origem DF" },
      { id: "203", name: "Brasília | Origem DF" },
    ]);
    const snap = compute("centro-oeste", orders(rawOrder([{ productId: "201", name: "x", quantity: 2 }, { productId: "202", name: "x" }, { productId: "203", name: "x" }])), null, centro);
    const gama = administrativeRegionByLabel("Gama")!.id;
    const taguatinga = administrativeRegionByLabel("Taguatinga")!.id;
    expect(new Set(ids(snap.states.DF.localities))).toEqual(new Set([gama, taguatinga, DF_MUNICIPALITY_ID]));
    expect(snap.states.DF.localities[0]).toMatchObject({ id: gama, units: 2 });
  });
});

describe("pódio — order, ties and movement", () => {
  it("ties keep yesterday's relative order, then fall back to the canonical id", () => {
    const units = new Map([["b", 2], ["a", 2], ["c", 5]]);
    expect(orderEntities(units, null)).toEqual(["c", "a", "b"]);
    expect(orderEntities(units, new Map([["b", 1], ["a", 2]]))).toEqual(["c", "b", "a"]);
    // Ranked yesterday beats unranked yesterday on a tie.
    expect(orderEntities(units, new Map([["b", 7]]))).toEqual(["c", "b", "a"]);
    expect(orderEntities(new Map([["x", 0], ["y", 1]]), null)).toEqual(["y"]);
  });

  it("movement: up/down/same, NOVO when entering the podium, nothing without a previous snapshot", () => {
    expect(movementOf(1, 3, true)).toEqual({ kind: "up", by: 2 });
    expect(movementOf(3, 1, true)).toEqual({ kind: "down", by: 2 });
    expect(movementOf(2, 2, true)).toEqual({ kind: "same" });
    expect(movementOf(3, 5, true)).toEqual({ kind: "new", from: 5 });
    expect(movementOf(2, null, true)).toEqual({ kind: "new", from: null });
    expect(movementOf(5, 7, true)).toEqual({ kind: "up", by: 2 });
    expect(movementOf(1, null, false)).toBeNull();
  });

  it("first snapshot has no movement; the next day compares with D−1 only", () => {
    const day1Now = new Date("2026-10-03T07:00:00.000Z");
    const day1 = compute(
      "sul",
      orders(rawOrder([{ productId: "101", name: "x", quantity: 3 }, { productId: "103", name: "x", quantity: 2 }, { productId: "107", name: "x" }, { productId: "108", name: "x" }])),
      null,
      sulCatalog,
      day1Now,
    );
    expect(day1.comparedWith).toBeNull();
    expect(day1.states.SC.localities.every((l) => l.movement === null)).toBe(true);

    // Day 2: Lages (4th yesterday) jumps to 1st → NOVO; Joinville drops; Blumenau stays.
    const day2 = compute(
      "sul",
      orders(rawOrder([{ productId: "108", name: "x", quantity: 5 }, { productId: "101", name: "x", quantity: 1 }, { productId: "103", name: "x", quantity: 2 }])),
      day1,
    );
    expect(day2.comparedWith).toBe("2026-10-03");
    const byId = new Map(day2.states.SC.localities.map((l) => [l.id, l]));
    expect(byId.get(cityId("Lages", "SC"))!.movement).toEqual({ kind: "new", from: 4 });
    expect(byId.get(cityId("Blumenau", "SC"))!.movement).toEqual({ kind: "same" });
    expect(byId.get(cityId("Joinville", "SC"))!.movement).toEqual({ kind: "down", by: 2 });

    // A snapshot that is not D−1 is never used for movement.
    const stale = { ...day1, referenceDate: "2026-09-30" };
    expect(compute("sul", orders(rawOrder([{ productId: "101", name: "x" }])), stale).comparedWith).toBeNull();
  });
});

// ── Publishing, failures, freshness, public payload ─────────────────────────────────────────────────────────────────────────────────

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tempDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), "podio-"));
  dirs.push(d);
  return d;
};
const sulBindings = async () => [...sulCatalog.values()];

describe("pódio — sync, idempotency and failures", () => {
  it("re-running the same day replaces only D and still compares with D−1", async () => {
    const baseDir = tempDir();
    const day1 = orders(rawOrder([{ productId: "101", name: "x", quantity: 2 }, { productId: "103", name: "x" }], { createdAt: "2026-09-10T10:00:00-03:00" }));
    const r1 = await syncRegionPodio("sul", { baseDir, now: () => new Date("2026-10-03T07:00:00Z"), bindings: sulBindings, fetchOrders: async () => ({ orders: day1, requests: 1 }) });
    expect(r1).toMatchObject({ ok: true, comparedWith: null });

    const day2 = orders(rawOrder([{ productId: "103", name: "x", quantity: 3 }, { productId: "101", name: "x" }], { createdAt: "2026-09-10T10:00:00-03:00" }));
    const deps = { baseDir, bindings: sulBindings, fetchOrders: async () => ({ orders: day2, requests: 1 }) };
    await syncRegionPodio("sul", { ...deps, now: () => new Date("2026-10-04T07:00:00Z") });
    const second = await syncRegionPodio("sul", { ...deps, now: () => new Date("2026-10-04T09:00:00Z") });
    expect(second).toMatchObject({ ok: true, comparedWith: "2026-10-03" });
    const latest = readLatestSnapshot("sul", baseDir)!;
    expect(latest.referenceDate).toBe(D);
    expect(latest.states.SC.localities[0]).toMatchObject({ id: cityId("Blumenau", "SC"), movement: { kind: "up", by: 1 } });
    expect((await readDatedSnapshot("sul", "2026-10-03", baseDir))!.referenceDate).toBe("2026-10-03");
  });

  it("a fetch failure publishes nothing and is recorded; a complete run with zero sales clears the podium", async () => {
    const baseDir = tempDir();
    const ok = orders(rawOrder([{ productId: "101", name: "x" }], { createdAt: "2026-09-10T10:00:00-03:00" }));
    await syncRegionPodio("sul", { baseDir, now: () => NOW, bindings: sulBindings, fetchOrders: async () => ({ orders: ok, requests: 1 }) });
    const before = readFileSync(path.join(baseDir, "podio", "sul", "latest.json"), "utf8");

    const later = new Date(NOW.getTime() + 60 * 60 * 1000);
    const failed = await syncRegionPodio("sul", { baseDir, now: () => later, bindings: sulBindings, fetchOrders: async () => Promise.reject(new Error("INK responded 500")) });
    expect(failed.ok).toBe(false);
    expect(readFileSync(path.join(baseDir, "podio", "sul", "latest.json"), "utf8")).toBe(before);
    expect(readRunState("sul", baseDir)!.lastAttempt).toMatchObject({ ok: false });
    expect(freshnessOf(readLatestSnapshot("sul", baseDir), readRunState("sul", baseDir), later)).toEqual({ visible: true, pending: true });

    const noCatalog = await syncRegionPodio("sul", { baseDir, now: () => later, bindings: async () => null, fetchOrders: async () => ({ orders: ok, requests: 1 }) });
    expect(noCatalog.ok).toBe(false);

    const zero = await syncRegionPodio("sul", { baseDir, now: () => later, bindings: sulBindings, fetchOrders: async () => ({ orders: [], requests: 1 }) });
    expect(zero).toMatchObject({ ok: true, states: [] });
    expect(readLatestSnapshot("sul", baseDir)!.states).toEqual({});
    expect(existsSync(path.join(baseDir, "podio", "sul", "2026-10-04.json"))).toBe(true);
  });
});

const view: PodioCatalogView = {
  locality: (id) => localityById(id),
  hasPage: () => true,
  familyImage: (localityId, family) => (localityId === cityId("Joinville", "SC") ? `https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/${family}.jpg` : null),
};

describe("pódio — public projection (state page and home)", () => {
  const snap = compute(
    "sul",
    orders(rawOrder([{ productId: "101", name: "x", quantity: 5 }, { productId: "103", name: "x", quantity: 3 }, { productId: "107", name: "x", quantity: 2 }, { productId: "108", name: "x" }, { productId: "104", name: "x" }])),
  );

  it("shows the top 3 with links, never a quantity", () => {
    const podium = projectPodium(snap, null, "sul", "SC", view, NOW)!;
    expect(podium.localities.map((l) => l.position)).toEqual([1, 2, 3]);
    expect(podium.localities[0]).toMatchObject({ name: "Joinville", href: "/sul/sc/joinville", movement: null });
    expect(podium.families[0]).toMatchObject({ id: "ponto-de-origem", href: "/sul/sc/joinville/ponto-de-origem", example: { placeName: "Joinville" } });
    // Território's only contributor (Itajaí) has no valid image: discreet fallback, no invented link.
    expect(podium.families.find((f) => f.id === "territorio")).toMatchObject({ example: null, href: null });
    const json = JSON.stringify(podium);
    expect(json).not.toMatch(/units|"quantity"|"5"|revenue/);
  });

  it("only one or two entities → only those positions", () => {
    const pr = projectPodium(snap, null, "sul", "PR", view, NOW)!;
    expect(pr.localities).toHaveLength(1);
    expect(projectPodium(snap, null, "sul", "RS", view, NOW)).toBeNull();
  });

  it("home and state page read the same classification; cards keep the editorial order and link to #podio", () => {
    const leaders = projectLeaders(snap, null, "sul", ["PR", "SC", "RS"], view, NOW);
    expect(leaders.map((l) => l.uf)).toEqual(["PR", "SC"]);
    expect(leaders[1]).toEqual({ uf: "SC", stateName: "Santa Catarina", leaderName: projectPodium(snap, null, "sul", "SC", view, NOW)!.localities[0].name, href: "/sul/sc#podio" });
  });

  it("hides a snapshot older than 72 h, and everything when there is no snapshot", () => {
    const old = new Date(Date.parse(snap.computedAt) + MAX_AGE_MS + 1);
    expect(projectPodium(snap, null, "sul", "SC", view, old)).toBeNull();
    expect(projectLeaders(null, null, "sul", ["SC"], view, NOW)).toEqual([]);
    const fresh = new Date(Date.parse(snap.computedAt) + 60_000);
    expect(projectPodium(snap, null, "sul", "SC", view, fresh)!.pending).toBe(false);
  });
});
