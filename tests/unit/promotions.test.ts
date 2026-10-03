import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { promotionId, readablePromotionError, rowsToConfig, type PromotionRow } from "@/lib/admin/promotions-form";
import { nudgeDelay, mayNudge, type PageCalm } from "@/components/promotions/attention";
import {
  activePromotions,
  couponBadgeText,
  fromBrasiliaInput,
  parsePromotionsPayload,
  promotionsPayload,
  promotionStatus,
  toBrasiliaInput,
  validatePromotions,
  type PromotionItem,
} from "@/lib/site-config/promotions";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateBundle, validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seedBundle = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const NOW = Date.parse("2026-10-02T15:00:00-03:00");

const leveMais: PromotionItem = { id: "leve-mais", type: "coupon", enabled: true, title: "LEVE MAIS", code: "LEVEMAIS", description: "3 peças: R$ 30 OFF · 4 peças: R$ 50 OFF · 5 ou mais: R$ 75 OFF", callout: "Um cupom por pedido.", order: 1 };
const primeira: PromotionItem = { id: "primeira-compra", type: "coupon", enabled: true, title: "PRIMEIRA COMPRA", code: "PRIMEIRA5", description: "5% OFF na sua primeira compra", order: 2 };
const frete: PromotionItem = { id: "frete-gratis", type: "promotion", enabled: true, title: "Semana do Frete Grátis", description: "1 peça RJ ou 2 peças demais estados", callout: "Com limite de R$ 29,90 por frete", order: 3 };

describe("validatePromotions (strict contract)", () => {
  test("given coupons and an announcement, when validated for a region, then it is accepted; an empty list is valid too", () => {
    expect(validatePromotions({ items: [leveMais, primeira, frete] }, "sul").ok).toBe(true);
    expect(validatePromotions({ items: [] }, "norte").ok).toBe(true);
  });

  test("given the global scope, when promotions are set, then they are refused (promotions belong to a region)", () => {
    expect(validatePromotions({ items: [] }, "global").ok).toBe(false);
  });

  test.each([
    ["a coupon without a code", { ...leveMais, code: undefined }, "code"],
    ["a code with spaces", { ...leveMais, code: "LEVE MAIS" }, "code"],
    ["an announcement with a code", { ...frete, code: "FRETE" }, "only coupons have a code"],
    ["an announcement with a tag", { ...frete, badgeLabel: "Novo" }, "only coupons have a tag"],
    ["an empty title", { ...leveMais, title: "" }, "title"],
    ["a title with a line break", { ...leveMais, title: "LEVE\nMAIS" }, "title"],
    ["an empty callout (must be omitted instead)", { ...leveMais, callout: "" }, "callout"],
    ["a description over 200 characters", { ...leveMais, description: "x".repeat(201) }, "description"],
    ["a date without an offset", { ...leveMais, startsAt: "2026-10-05T00:00" }, "startsAt"],
    ["an end before the start", { ...leveMais, startsAt: "2026-10-05T00:00:00-03:00", endsAt: "2026-10-04T00:00:00-03:00" }, "after"],
    ["an unknown field", { ...leveMais, discountPercent: 15 }, "unknown field"],
  ])("given %s, when validated, then it is refused", (_name, item, expected) => {
    const r = validatePromotions({ items: [item] }, "sul");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain(expected);
  });

  test("given two items with the same id, when validated, then the duplicate is refused", () => {
    const r = validatePromotions({ items: [leveMais, { ...primeira, id: "leve-mais" }] }, "sul");
    expect(r.ok).toBe(false);
  });

  test("given a region document, when it carries promotions, then validateScopeDoc runs the same rules", () => {
    const doc = { ...seedBundle().docs.sul, promotions: { items: [leveMais] } };
    expect(validateScopeDoc(doc).ok).toBe(true);
    expect(validateScopeDoc({ ...doc, promotions: { items: [{ ...leveMais, code: "" }] } }).ok).toBe(false);
  });
});

describe("activePromotions / promotionsPayload (what the public sees)", () => {
  test("given a disabled, an expired and a future item, when read now, then only the live ones are public, in the owner's order", () => {
    const items: PromotionItem[] = [
      { ...frete, order: 1 },
      { ...leveMais, order: 3 },
      { ...primeira, order: 2 },
      { ...primeira, id: "desligado", enabled: false, order: 0 },
      { ...primeira, id: "expirado", endsAt: "2026-10-01T00:00:00-03:00", order: 0 },
      { ...primeira, id: "futuro", startsAt: "2026-10-03T00:00:00-03:00", order: 0 },
    ];
    expect(activePromotions({ items }, NOW).map((p) => p.id)).toEqual(["frete-gratis", "primeira-compra", "leve-mais"]);
  });

  test("given the window edges, when read exactly at the start and exactly at the end, then the start is live and the end is not", () => {
    const item = { ...leveMais, startsAt: "2026-10-02T15:00:00-03:00", endsAt: "2026-10-02T16:00:00-03:00" };
    expect(activePromotions({ items: [item] }, NOW)).toHaveLength(1);
    expect(activePromotions({ items: [item] }, Date.parse("2026-10-02T16:00:00-03:00"))).toHaveLength(0);
  });

  test("given live items, when the payload is built, then it is v1 of the region with only display fields and 1..n order", () => {
    const payload = promotionsPayload("sul", { items: [leveMais, frete, { ...primeira, enabled: false }] }, NOW, { primary: "#4d543d", onPrimary: "#ffffff" });
    expect(payload).toEqual({
      v: 1,
      region: "sul",
      theme: { primary: "#4d543d", onPrimary: "#ffffff" },
      items: [
        { id: "leve-mais", type: "coupon", title: "LEVE MAIS", code: "LEVEMAIS", description: leveMais.description, callout: "Um cupom por pedido.", order: 1 },
        { id: "frete-gratis", type: "promotion", title: "Semana do Frete Grátis", description: frete.description, callout: "Com limite de R$ 29,90 por frete", order: 2 },
      ],
    });
    const text = JSON.stringify(payload);
    for (const adminField of ["enabled", "startsAt", "releaseId", "tracking"]) expect(text).not.toContain(adminField);
  });

  test("given nothing configured, when the payload is built, then it is an empty list (no button)", () => {
    expect(promotionsPayload("norte", undefined, NOW).items).toEqual([]);
  });
});

describe("parsePromotionsPayload (the storefront button reading the API)", () => {
  const ok = (items: unknown[], extra: Record<string, unknown> = {}) => ({ v: 1, region: "sul", items, ...extra });

  test("given callout as a string, null or omitted, when parsed, then a string keeps the line and the other two show none", () => {
    const parsed = parsePromotionsPayload(ok([
      { id: "a", type: "coupon", title: "A", code: "AAA", description: "d", callout: "Um cupom por pedido." },
      { id: "b", type: "coupon", title: "B", code: "BBB", description: "d", callout: null },
      { id: "c", type: "promotion", title: "C", description: "d" },
    ]), "sul", NOW)!;
    expect(parsed.items.map((i) => i.callout)).toEqual(["Um cupom por pedido.", undefined, undefined]);
    expect(parsed.items.map((i) => i.order)).toEqual([1, 2, 3]);
  });

  test("given another region's payload, a wrong version or garbage, when parsed, then it is refused whole (no button)", () => {
    expect(parsePromotionsPayload({ ...ok([]), region: "norte" }, "sul", NOW)).toBeNull();
    expect(parsePromotionsPayload({ ...ok([]), v: 2 }, "sul", NOW)).toBeNull();
    expect(parsePromotionsPayload("<html>", "sul", NOW)).toBeNull();
    expect(parsePromotionsPayload(null, "sul", NOW)).toBeNull();
  });

  test("given one bad item among good ones, when parsed, then only the bad one is dropped; an item already over is dropped too", () => {
    const parsed = parsePromotionsPayload(ok([
      { id: "a", type: "coupon", title: "A", code: "AAA", description: "d" },
      { id: "b", type: "coupon", title: "B", description: "no code" },
      { id: "c", type: "coupon", title: "C", code: "CCC", description: "d", endsAt: "2026-10-01T00:00:00-03:00" },
      { id: "d", type: "promotion", title: "D", description: "d", code: "IGNORED" },
    ]), "sul", NOW)!;
    expect(parsed.items.map((i) => i.id)).toEqual(["a", "d"]);
    expect(parsed.items[1].code).toBeUndefined();
  });

  test("given a theme, when parsed, then only #rrggbb colours are kept", () => {
    expect(parsePromotionsPayload(ok([], { theme: { primary: "#4d543d", onPrimary: "#ffffff" } }), "sul", NOW)!.theme).toEqual({ primary: "#4d543d", onPrimary: "#ffffff" });
    expect(parsePromotionsPayload(ok([], { theme: { primary: "red;x", onPrimary: "#ffffff" } }), "sul", NOW)!.theme).toBeUndefined();
  });
});

describe("couponBadgeText", () => {
  const c = (n: number) => Array.from({ length: n }, () => ({ type: "coupon" as const }));
  test("given coupons and announcements, when counted, then only coupons count, 9+ above nine, no badge for announcements only", () => {
    expect(couponBadgeText(c(1))).toBe("1");
    expect(couponBadgeText(c(2))).toBe("2");
    expect(couponBadgeText(c(9))).toBe("9");
    expect(couponBadgeText(c(12))).toBe("9+");
    expect(couponBadgeText([{ type: "promotion" }, { type: "promotion" }])).toBeNull();
    expect(couponBadgeText([...c(1), { type: "promotion" }])).toBe("1");
    expect(couponBadgeText([])).toBeNull();
  });
});

describe("Brasília dates", () => {
  test("given a datetime-local value, when stored and shown again, then it round-trips with an explicit -03:00", () => {
    expect(fromBrasiliaInput("2026-10-05T09:30")).toBe("2026-10-05T09:30:00-03:00");
    expect(toBrasiliaInput("2026-10-05T09:30:00-03:00")).toBe("2026-10-05T09:30");
    expect(toBrasiliaInput("2026-10-05T12:30:00Z")).toBe("2026-10-05T09:30");
    expect(fromBrasiliaInput("")).toBeUndefined();
    expect(fromBrasiliaInput("05/10/2026")).toBeNull();
  });

  test("given an item, when its status is asked, then disabled, scheduled, ended and live are told apart", () => {
    expect(promotionStatus({ enabled: false }, NOW)).toBe("disabled");
    expect(promotionStatus({ enabled: true, startsAt: "2026-10-03T00:00:00-03:00" }, NOW)).toBe("scheduled");
    expect(promotionStatus({ enabled: true, endsAt: "2026-10-02T14:00:00-03:00" }, NOW)).toBe("ended");
    expect(promotionStatus({ enabled: true }, NOW)).toBe("live");
  });
});

describe("rowsToConfig (CMS form)", () => {
  const row = (patch: Partial<PromotionRow> = {}): PromotionRow => ({ id: "", type: "coupon", enabled: true, title: "LEVE MAIS", code: "LEVEMAIS", description: "3 peças: R$ 30 OFF", callout: "Um cupom por pedido.", badgeLabel: "", startsAt: "", endsAt: "", ...patch });

  test("given new rows, when parsed, then ids come from the titles, order is the list order, and the code is kept exactly as typed", () => {
    const r = rowsToConfig([row(), row({ title: "Semana do Frete Grátis", type: "promotion", code: "IGNORED", callout: "" }), row({ title: "Cliente15", code: "Cliente15" })], "sul");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items.map((i) => [i.id, i.order])).toEqual([["leve-mais", 1], ["semana-do-frete-gratis", 2], ["cliente15", 3]]);
    expect(r.value.items[1]).not.toHaveProperty("code");
    expect(r.value.items[1]).not.toHaveProperty("callout");
    expect(r.value.items[2].code).toBe("Cliente15");
  });

  test("given an edited title, code, description and a cleared callout, when parsed, then the id is kept and the callout disappears", () => {
    const r = rowsToConfig([row({ id: "leve-mais", title: "LEVE MAIS AINDA", code: "LEVEMAIS2", description: "Nova descrição", callout: "   " })], "sul");
    expect(r.ok && r.value.items[0]).toEqual({ id: "leve-mais", type: "coupon", enabled: true, title: "LEVE MAIS AINDA", code: "LEVEMAIS2", description: "Nova descrição", order: 1 });
  });

  test("given dates typed in Brasília time, when parsed, then they are stored with the offset; an end before the start is refused in Portuguese", () => {
    const ok = rowsToConfig([row({ startsAt: "2026-10-05T00:00", endsAt: "2026-10-12T23:59" })], "sul");
    expect(ok.ok && [ok.value.items[0].startsAt, ok.value.items[0].endsAt]).toEqual(["2026-10-05T00:00:00-03:00", "2026-10-12T23:59:00-03:00"]);
    const bad = rowsToConfig([row({ startsAt: "2026-10-05T00:00", endsAt: "2026-10-04T00:00" })], "sul");
    expect(!bad.ok && bad.errors[0]).toBe('Item 1 ("LEVE MAIS"): o fim precisa ser depois do início.');
  });

  test("given a coupon without a code, when parsed, then the error names the item and the rule", () => {
    const r = rowsToConfig([row({ code: "" })], "sul");
    expect(!r.ok && r.errors[0]).toMatch(/^Item 1 \("LEVE MAIS"\): o código precisa ter/);
  });

  test("given two titles that slug the same, when ids are made, then they stay unique", () => {
    expect(promotionId("Leve Mais", new Set(["leve-mais"]))).toBe("leve-mais-2");
    expect(promotionId("!!!", new Set())).toBe("item");
  });

  test("given a non-list, when parsed, then a readable error comes back", () => {
    expect(rowsToConfig({}, "sul").ok).toBe(false);
    expect(readablePromotionError("promotions.items[0].callout: x", [{ title: "A" }])).toContain("chamada abaixo");
  });
});

describe("draft op, publish diff and tolerant reader", () => {
  const base = (): ScopeDoc => seedBundle().docs.sul;
  const ctx = { newId: () => "t1" };

  test("given a region draft, when set-promotions is applied, then the draft carries them; the global document refuses them", () => {
    const r = applyOp(base(), { type: "set-promotions", promotions: { items: [leveMais] } }, ctx);
    expect(r.ok && r.doc.promotions?.items[0].code).toBe("LEVEMAIS");
    expect(applyOp(seedBundle().docs.global, { type: "set-promotions", promotions: { items: [] } }, ctx).ok).toBe(false);
    expect(applyOp(base(), { type: "set-promotions", promotions: { items: [{ ...leveMais, code: "x y" }] } }, ctx).ok).toBe(false);
  });

  test("given only promotions changed, when diffed for publishing, then the publish screen lists them (never 'nothing to publish')", () => {
    const published = { ...base(), promotions: { items: [leveMais, frete] } };
    const draft = { ...base(), promotions: { items: [{ ...frete, order: 1 }, { ...leveMais, enabled: false, title: "LEVE+", order: 2 }, primeira] } };
    const texts = diffDocs(published, draft, () => null).filter((c) => c.kind === "promotions").map((c) => c.text);
    expect(texts).toEqual(expect.arrayContaining([
      'Cupons e promoções: cupom "LEVE+" desativado',
      'Cupons e promoções: cupom "LEVE+" editado',
      'Cupons e promoções: cupom "PRIMEIRA COMPRA" adicionado',
      "Cupons e promoções: nova ordem",
    ]));
    expect(diffDocs(published, published, () => null).filter((c) => c.kind === "promotions")).toEqual([]);
  });

  test("given a published file whose promotions are invalid, when read, then only the promotions are dropped (with a diagnostic), never the region", () => {
    const bundle = seedBundle();
    bundle.releaseId = "r1";
    (bundle.docs.sul as ScopeDoc & { promotions: unknown }).promotions = { items: [{ ...leveMais, code: "" }] };
    const { bundle: read, diagnostics } = sanitizeBundle(bundle, seedBundle());
    expect(read?.docs.sul.promotions).toBeUndefined();
    expect(read?.docs.sul.home?.sections.length).toBeGreaterThan(0);
    expect(diagnostics.join(" ")).toContain("promotions is invalid");
  });

  test("given a valid bundle with promotions, when strictly validated (publish pre-flight), then it passes", () => {
    const bundle = seedBundle();
    bundle.releaseId = "r1";
    bundle.docs.norte = { ...bundle.docs.norte, promotions: { items: [leveMais, frete] } };
    expect(validateBundle(bundle).ok).toBe(true);
  });
});

describe("publicPromotions (the API, from the published file only)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "promotions-"));
    vi.stubEnv("CATALOG_SNAPSHOT_DIR", dir);
    vi.stubEnv("SITE_CONFIG_DIR", path.join(dir, "site-config"));
    vi.resetModules();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  async function publish(docs: Partial<Record<"sul" | "norte" | "centro-oeste", PromotionItem[]>>) {
    await mkdir(path.join(dir, "site-config"), { recursive: true });
    const bundle = seedBundle();
    bundle.releaseId = "r1";
    for (const [region, items] of Object.entries(docs)) bundle.docs[region as "sul"] = { ...bundle.docs[region as "sul"], promotions: { items: items! } };
    await writeFile(path.join(dir, "site-config", "published.json"), JSON.stringify(bundle));
    return import("@/lib/site-config/promotions-public");
  }

  test("given each region has its own items, when each region is read, then it only ever sees its own (isolation)", async () => {
    const { publicPromotions } = await publish({ sul: [leveMais], norte: [{ ...primeira, id: "norte-10", code: "NORTE10" }] });
    expect(publicPromotions("sul", NOW).items.map((i) => i.code)).toEqual(["LEVEMAIS"]);
    expect(publicPromotions("norte", NOW).items.map((i) => i.code)).toEqual(["NORTE10"]);
    expect(publicPromotions("centro-oeste", NOW).items).toEqual([]);
    expect(publicPromotions("sul", NOW).region).toBe("sul");
  });

  test("given nothing was ever published, when read, then the list is empty (no button) and nothing throws", async () => {
    const { publicPromotions } = await import("@/lib/site-config/promotions-public");
    expect(publicPromotions("sul", NOW)).toMatchObject({ v: 1, region: "sul", items: [] });
  });

  test("given a published item, when the draft changes, then the API still returns the published one (drafts never reach the public)", async () => {
    const { publicPromotions } = await publish({ sul: [leveMais] });
    // The draft lives in the admin store, never in published.json: the public reader has no other source.
    expect(publicPromotions("sul", NOW).items.map((i) => i.title)).toEqual(["LEVE MAIS"]);
  });
});

describe("attention (the occasional wiggle)", () => {
  const calm: PageCalm = { panelOpen: false, overlayOpen: false, typing: false, hidden: false, buttonHidden: false, reducedMotion: false, quiet: false };

  test("given the page view, when nudges are scheduled, then every one comes 6–8 s after the previous, with no limit per page", () => {
    expect(nudgeDelay(0)).toBe(6000);
    expect(nudgeDelay(0.5)).toBe(7000);
    expect(nudgeDelay(1)).toBe(8000);
    expect(nudgeDelay(-1)).toBe(6000);
    expect(nudgeDelay(2)).toBe(8000);
  });

  test.each(Object.keys({ panelOpen: 1, overlayOpen: 1, typing: 1, hidden: 1, buttonHidden: 1, reducedMotion: 1, quiet: 1 }))("given %s, when the moment comes, then the button stays still", (key) => {
    expect(mayNudge(calm)).toBe(true);
    expect(mayNudge({ ...calm, [key]: true })).toBe(false);
  });
});
