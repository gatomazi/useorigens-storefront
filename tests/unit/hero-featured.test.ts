import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { parseFeaturedFields } from "@/lib/admin/section-form";
import { cityBySlug } from "@/lib/geo/cities";
import { validateScopeDoc, validateSection } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const belem = cityBySlug("PA", "belem")!;
const goiania = cityBySlug("GO", "goiania")!;
const floripa = cityBySlug("SC", "florianopolis")!;
const NOW = "2026-09-25T00:00:00.000Z";
const binding = (store: string, cityId: string, family: string, id: string, extra: Record<string, unknown> = {}) => ({
  cityId, designFamily: family, designVariant: "base", commerceStoreKey: store, inkProductId: id, slug: `p-${id}`,
  storeProductUrl: `https://www.${store === "use-norte" ? "usenorte" : store === "use-centro" ? "usecentro" : "usesul"}.com.br/x/product/p-${id}`,
  imageUrl: `https://img.example/${id}.jpg`, price: 109.9, syncedAt: NOW, ...extra,
});
const store = (key: string, bindings: unknown[]) => ({ commerceStoreKey: key, syncedAt: NOW, productCount: bindings.length, bindings, merch: [], excluded: [] });

let dir: string;
let mod: typeof import("@/lib/hero-featured");
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "uo-hero-"));
  const snapshot = {
    version: 1,
    stores: {
      "use-sul": store("use-sul", [binding("use-sul", floripa.id, "ponto-de-origem", "9001")]),
      "use-norte": store("use-norte", [
        binding("use-norte", belem.id, "ponto-de-origem", "7001"),
        binding("use-norte", belem.id, "coordenadas", "7002"),
        binding("use-norte", belem.id, "feito-em", "7003", { imageUrl: "" }), // no photo: not eligible
        binding("use-norte", belem.id, "legado", "7004", { localityLabel: "Icoaraci", parentCityId: belem.id }), // a locality, not a city style
      ]),
      "use-centro": store("use-centro", [binding("use-centro", goiania.id, "ponto-de-origem", "8001")]),
    },
  };
  await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(snapshot));
  vi.stubEnv("CATALOG_SNAPSHOT_DIR", dir);
  vi.resetModules();
  mod = await import("@/lib/hero-featured");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("hero featured products resolve against the region's own catalog snapshot", () => {
  test("given a Norte product, when resolved, then the card comes from the snapshot (photo, price, in-region link) and nothing is copied into the document", () => {
    const [slot] = mod.resolveFeatured("norte", [{ store: "use-norte", productId: "7001" }]);
    expect(slot.ok).toBe(true);
    expect(slot.card).toMatchObject({ familyName: "Ponto de Origem", cityName: "Belém", uf: "PA", price: expect.stringContaining("109,90"), imageUrl: "https://img.example/7001.jpg", href: "/norte/pa/belem/ponto-de-origem" });
  });

  test("given a Sul product id or a Sul store reference on Norte, when resolved, then it is rejected (never a foreign product)", () => {
    const [byStore, byId] = mod.resolveFeatured("norte", [{ store: "use-sul", productId: "9001" }, { store: "use-norte", productId: "9001" }]);
    expect(byStore).toMatchObject({ ok: false, reason: "produto de outra loja da INK", card: null });
    expect(byId).toMatchObject({ ok: false, card: null });
  });

  test("given a product missing from the snapshot, without a photo, or a locality product, when resolved, then each is ineligible with its own reason", () => {
    const slots = mod.resolveFeatured("norte", [{ store: "use-norte", productId: "1" }, { store: "use-norte", productId: "7003" }, { store: "use-norte", productId: "7004" }]);
    expect(slots.map((s) => s.ok)).toEqual([false, false, false]);
    expect(slots[0].reason).toContain("não existe mais");
    expect(slots[1].reason).toContain("sem foto");
    expect(slots[2].reason).toContain("localidade");
  });

  test("given a configured list with one ineligible product, when the public cards are built, then only that card is omitted and the order is kept", () => {
    const cards = mod.heroCards("norte", [{ store: "use-norte", productId: "7002" }, { store: "use-norte", productId: "1" }, { store: "use-norte", productId: "7001" }], []);
    expect(cards.map((c) => c.familyName)).toEqual(["Coordenadas", "Ponto de Origem"]);
  });

  test("given no customisation, when the cards are built, then Sul keeps its original cards and Norte/Centro-Oeste show none (never Sul's)", () => {
    const legacy = [{ familyId: "ponto-de-origem", familyName: "Ponto de Origem", cityName: "Porto Alegre", uf: "RS", imageUrl: "x", price: "R$ 1", href: "/sul/rs/porto-alegre/ponto-de-origem" }];
    expect(mod.heroCards("sul", undefined, legacy)).toBe(legacy);
    expect(mod.heroCards("norte", undefined, legacy)).toEqual([]);
    expect(mod.heroCards("centro-oeste", undefined, legacy)).toEqual([]);
    expect(mod.heroCards("norte", [], legacy)).toEqual([]);
  });
});

describe("hero product search", () => {
  test("given a query, when searched in Norte, then only eligible Norte products match by city, UF, style or id, and the other stores never appear", () => {
    expect(mod.searchFeaturedCandidates("norte", "belem").results.map((r) => r.productId).sort()).toEqual(["7001", "7002"]);
    expect(mod.searchFeaturedCandidates("norte", "pa coordenadas").results.map((r) => r.productId)).toEqual(["7002"]);
    expect(mod.searchFeaturedCandidates("norte", "7001").results.map((r) => r.productId)).toEqual(["7001"]);
    expect(mod.searchFeaturedCandidates("norte", "florianopolis").total).toBe(0);
    expect(mod.searchFeaturedCandidates("norte", "9001").total).toBe(0);
    expect(mod.searchFeaturedCandidates("centro-oeste", "goiania").results.map((r) => r.store)).toEqual(["use-centro"]);
  });

  test("given a too-short query, when searched, then nothing is returned (the catalog is never dumped) and results are capped", () => {
    expect(mod.searchFeaturedCandidates("norte", "a")).toEqual({ results: [], total: 0 });
    expect(mod.searchFeaturedCandidates("norte", "belem", 1).results).toHaveLength(1);
  });

  test("given the Sul hero, when its original references are read, then they are Sul store products only, and other regions have none", () => {
    expect(mod.legacyFeaturedRefs("norte")).toEqual([]);
    expect(mod.legacyFeaturedRefs("centro-oeste")).toEqual([]);
    for (const ref of mod.legacyFeaturedRefs("sul")) expect(ref.store).toBe("use-sul");
  });
});

describe("the hero's featured references in the document", () => {
  const seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
  const norteHome = () => {
    const s = seed.docs.sul.home!.sections;
    return { ...structuredClone(seed.docs.norte), home: { sections: [structuredClone(s[0]), structuredClone(s[s.length - 1])] } };
  };
  const set = (featured: unknown) => {
    const doc = norteHome();
    const hero = doc.home.sections[0];
    return applyOp(doc, { type: "update", id: hero.id, patch: { featured: featured as never } }, { newId: () => "x" });
  };

  test("given up to three own-store references, when saved, then they are stored in order; clearing keeps `[]` (customised, no cards)", () => {
    const three = [{ store: "use-norte", productId: "7001" }, { store: "use-norte", productId: "7002" }, { store: "use-norte", productId: "7003" }];
    const ok = set(three);
    expect(ok.ok && ok.doc.home!.sections[0].featured).toEqual(three);
    const none = set([]);
    expect(none.ok && none.doc.home!.sections[0].featured).toEqual([]);
  });

  test("given a reference of another region's store, four cards, a duplicate or a bad id, when saved, then it is rejected and nothing changes", () => {
    expect(set([{ store: "use-sul", productId: "9001" }]).ok).toBe(false);
    expect(set([1, 2, 3, 4].map((n) => ({ store: "use-norte", productId: `70${n}` }))).ok).toBe(false);
    expect(set([{ store: "use-norte", productId: "7001" }, { store: "use-norte", productId: "7001" }]).ok).toBe(false);
    expect(set([{ store: "use-norte", productId: "abc" }]).ok).toBe(false);
  });

  test("given featured on a section that is not the hero, when validated, then it is rejected; a hero saved before this field (no `featured`) is still valid", () => {
    const sul = seed.docs.sul.home!.sections;
    expect(validateSection({ ...sul[1], featured: [] }).ok).toBe(false);
    expect(validateScopeDoc(seed.docs.sul).ok).toBe(true);
    expect(sul[0].featured).toBeUndefined();
  });

  test("given the hero form fields, when parsed, then empty positions are closed up and a malformed value is reported", () => {
    const f = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });
    expect(parseFeaturedFields(f({ featured_1: "", featured_2: "use-norte:7001", featured_3: "use-norte:7002" })).refs).toEqual([{ store: "use-norte", productId: "7001" }, { store: "use-norte", productId: "7002" }]);
    expect(parseFeaturedFields(f({ featured_1: "use-outra:1" })).invalid).toEqual(["posição 1"]);
  });
});
