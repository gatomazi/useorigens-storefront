import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CollectionRecord } from "@/lib/catalog/collections";
import type { MerchProduct, UnrankedBinding } from "@/lib/catalog/types";
import type { DesignFamilyId } from "@/lib/catalog/families";
import { citiesByName } from "@/lib/geo/cities";
import { buildRecommendationsIndex, lookupRecommendations, serializeIndex, validateRecommendationsText, type StoreBuildInput } from "@/lib/recommendations/build";
import { buildDocuments } from "@/lib/recommendations/documents";
import { prepareStore, recommend, scorePair, MAX_SAME_LOCALITY } from "@/lib/recommendations/rank";
import { geoOfName, lineKey } from "@/lib/recommendations/signals";
import { featuredCollectionIds } from "@/lib/recommendations/cms";
import { writeAndPromote } from "@/lib/recommendations/index-file";

const BASE = "https://www.usesul.com.br/usesul/product";
const IMG = "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/";
const at = "2026-10-04T00:00:00.000Z";
const cityId = (name: string, uf: string) => citiesByName(name, [uf])[0].id;
const FLORIPA = cityId("Florianópolis", "SC");
const TIJUCAS = cityId("Tijucas", "SC");
const BAGE = cityId("Bagé", "RS");

let nextId = 5_000_000;
function binding(city: string, family: DesignFamilyId, extra: Partial<UnrankedBinding> = {}): UnrankedBinding {
  const id = String(nextId++);
  const slug = `${family}-${id}`;
  return { cityId: city, designFamily: family, designVariant: "base", commerceStoreKey: "use-sul", inkProductId: id, slug, storeProductUrl: `${BASE}/${slug}`, imageUrl: `${IMG}${id}.jpg`, price: 109.9, syncedAt: at, totalSalesCount: 1, ...extra };
}
function merch(name: string, extra: Partial<MerchProduct> = {}): MerchProduct {
  const id = String(nextId++);
  const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + id;
  return { inkProductId: id, commerceStoreKey: "use-sul", regionSlug: "sul", name, slug, storeProductUrl: `${BASE}/${slug}`, imageUrl: `${IMG}${id}.jpg`, price: 109.9, totalSalesCount: 1, syncedAt: at, ...extra };
}
function collection(id: number, slug: string, members: readonly { inkProductId: string }[], opts: Partial<CollectionRecord> = {}): CollectionRecord {
  const ids = members.map((m) => m.inkProductId);
  return { id, name: slug, slug, position: id, isAvailable: true, reportedProductCount: ids.length, matchedCount: ids.length, merchCount: ids.length, cityDesignCount: 0, memberIds: ids, allMemberIds: ids, ...opts };
}

/** A small but realistic Sul store: two SC cities with several families, Bagé, and editorial lines. */
function fixture() {
  const floripa = {
    origem: binding(FLORIPA, "ponto-de-origem", { productClusterId: "c-floripa-origem", totalSalesCount: 50 }),
    origemRegional: binding(FLORIPA, "ponto-de-origem", { designVariant: "regional", variantLabel: "Regional" }),
    feito: binding(FLORIPA, "feito-em"),
    coord: binding(FLORIPA, "coordenadas"),
    legado: binding(FLORIPA, "legado"),
    traco: binding(FLORIPA, "traco"),
  };
  const tijucas = { coord: binding(TIJUCAS, "coordenadas"), legado: binding(TIJUCAS, "legado"), origem: binding(TIJUCAS, "ponto-de-origem") };
  const bage = { traco: binding(BAGE, "traco"), feito: binding(BAGE, "feito-em"), coord: binding(BAGE, "coordenadas") };
  const ed = {
    scClean: merch("Santa Catarina | Clean", { totalSalesCount: 36 }),
    madeInSc: merch("Made in Santa Catarina", { totalSalesCount: 32 }),
    scMinimal: merch("SC | Minimal"),
    scMinimalLong: merch("Santa Catarina | Minimal"),
    grandeFloripa: merch("Grande Florianópolis | 048"),
    dazumbanho: merch("Dazumbanho | Florianópolis"),
    rsClean: merch("Rio Grande do Sul | Clean"),
    bah: merch("Bah | Dizeres"),
    tche: merch("Tchê | Dizeres"),
    baita: merch("Baita | Dizeres"),
    bagual: merch("Bagual | Dizeres"),
    capaz: merch("Capaz | Dizeres"),
    paiPr: merch("Pai Paranaense Churrasqueiro | Lenda", { productClusterId: "c-pai-pr" }),
    // the same design printed on another piece: same cluster, other INK product (Oversized), visible
    paiPrOversized: merch("Pai Paranaense Churrasqueiro | Lenda", { productClusterId: "c-pai-pr", garmentTypeId: 178, totalSalesCount: 99 }),
    paiRs: merch("Pai Gaúcho Pescador Churrasqueiro | Lenda"),
    maePr: merch("Mãe Paranaense Corredora | Lenda"),
    paiMate: merch("Pai | Mate de Origem"),
    churrasqueiro: merch("Churrasqueiro Raiz | Meu Pai"),
    treinoA: merch("Bretzel e Chopp | Treino"),
    treinoApb: merch("Bretzel e Chopp | Treino P&B"),
    treinoB: merch("Marreco e Chopp | Treino"),
    treinoC: merch("Tainha e Cerveja | Treino"),
    treinoD: merch("Pirão e Cerveja | Treino"),
    treinoE: merch("Churrasco e Cerveja | Treino"),
    personal: merch("Laura | Meu Pai"),
    orphan: merch("Peleza | @piadalambari"),
  };
  const collections = [
    collection(1, "seu-lugar", [...Object.values(floripa), ...Object.values(tijucas), ...Object.values(bage)], { merchCount: 0, cityDesignCount: 12 }),
    collection(2, "fala-daqui", [ed.bah, ed.tche, ed.baita, ed.bagual, ed.capaz, ed.grandeFloripa]),
    collection(3, "da-nossa-terra", [ed.scClean, ed.madeInSc, ed.scMinimal, ed.scMinimalLong, ed.rsClean]),
    collection(4, "feito-para-voce", [ed.paiPr, ed.paiPrOversized, ed.paiRs, ed.maePr]),
    collection(5, "dia-dos-pais", [ed.paiMate, ed.churrasqueiro, ed.personal], { isAvailable: false }),
    collection(6, "pre-treino-raiz", [ed.treinoA, ed.treinoApb, ed.treinoB, ed.treinoC, ed.treinoD, ed.treinoE]),
    collection(7, "santa-catarina", [ed.dazumbanho]),
    collection(8, "personalizados", [ed.personal]),
    collection(9, "novidades", [ed.bah, ed.scClean, ed.treinoA]),
  ];
  const input: StoreBuildInput = { store: "use-sul", syncedAt: at, bindings: [...Object.values(floripa), ...Object.values(tijucas), ...Object.values(bage)], merch: Object.values(ed), collections };
  return { floripa, tijucas, bage, ed, input };
}

function listFor(input: StoreBuildInput, productId: string) {
  const { index } = buildRecommendationsIndex([input]);
  return lookupRecommendations(index, "sul", productId);
}

describe("recommendations — signals read from names", () => {
  it("finds state, locality, line and state identity without guessing", () => {
    expect(geoOfName("Santa Catarina | Clean", ["PR", "SC", "RS"])).toMatchObject({ uf: "SC", stateIdentity: true, line: "clean" });
    expect(geoOfName("Dazumbanho | Florianópolis", ["PR", "SC", "RS"])).toMatchObject({ uf: "SC", ufSource: "locality" });
    expect(geoOfName("Grande Florianópolis | 048", ["PR", "SC", "RS"])).toMatchObject({ uf: "SC", ufSource: "ddd", line: "ddd" });
    expect(geoOfName("Pai Paranaense Churrasqueiro | Lenda", ["PR", "SC", "RS"])).toMatchObject({ uf: "PR", ufSource: "demonym", line: "lenda" });
    expect(geoOfName("Made in Mato Grosso do Sul", ["DF", "GO", "MS", "MT"])).toMatchObject({ uf: "MS", line: "made in", stateIdentity: true });
    // two states named ⇒ unknown, never one of them
    expect(geoOfName("Vida no Sul — Litoral Edition", ["PR", "SC", "RS"]).uf).toBeNull();
    expect(geoOfName("Gaúcho e Catarinense", ["PR", "SC", "RS"]).uf).toBeNull();
    expect(lineKey("Treino P&B")).toBe("treino");
  });
});

describe("recommendations — city pages", () => {
  it("1. never shows the current product, 4. Feito em first, 5. Coordenadas second, 6. state editorial after", () => {
    const { floripa, ed, input } = fixture();
    const list = listFor(input, floripa.origem.inkProductId);
    expect(list.map((i) => i.productId)).not.toContain(floripa.origem.inkProductId);
    expect(list[0]).toMatchObject({ productId: floripa.feito.inkProductId, reason: "same-locality:feito-em", title: "Florianópolis · Feito em" });
    expect(list[1]).toMatchObject({ productId: floripa.coord.inkProductId, reason: "same-locality:coordinates" });
    const rest = list.slice(2).map((i) => i.productId);
    expect(rest.length).toBe(2);
    // positions 3–4 are the state/region editorial context, never another Florianópolis design
    expect(rest).toContain(ed.scClean.inkProductId);
    expect(rest.every((id) => ![floripa.legado, floripa.traco, ed.dazumbanho].some((p) => p.inkProductId === id))).toBe(true);
  });

  it("3. at most two items about the same place, even when the place has more families and editorial products", () => {
    const { floripa, ed, input } = fixture();
    for (const source of [floripa.origem, floripa.legado, floripa.traco, floripa.origemRegional]) {
      const list = listFor(input, source.inkProductId);
      const sameCity = list.filter((i) => Object.values(floripa).some((b) => b.inkProductId === i.productId) || i.productId === ed.dazumbanho.inkProductId);
      expect(sameCity.length).toBeLessThanOrEqual(MAX_SAME_LOCALITY);
    }
  });

  it("falls back to the best other families of the place when Feito em does not exist, never the source's own family", () => {
    const { tijucas, input } = fixture();
    const list = listFor(input, tijucas.coord.inkProductId);
    expect(list[0].reason).toBe("same-locality:family");
    expect(list[0].productId).toBe(tijucas.origem.inkProductId); // Ponto de Origem is the next family after Feito em/Coordenadas
    expect(list.map((i) => i.productId)).not.toContain(tijucas.coord.inkProductId);
  });

  it("a variant page (Origem Regional) never recommends its own family's primary", () => {
    const { floripa, input } = fixture();
    const list = listFor(input, floripa.origemRegional.inkProductId);
    expect(list.map((i) => i.productId)).not.toContain(floripa.origem.inkProductId);
    expect(list[0].productId).toBe(floripa.feito.inkProductId);
  });
});

describe("recommendations — editorial pages", () => {
  it("uses collection, line, state and themes, with a diversity pass", () => {
    const { ed, input } = fixture();
    const list = listFor(input, ed.paiPr.inkProductId);
    expect(list[0].reason).toBe("same-collection");
    expect(list.map((i) => i.productId)).toContain(ed.maePr.inkProductId);
    // at most 2 from the same main collection while relevant alternatives exist
    const fromCollection = list.filter((i) => [ed.paiRs, ed.maePr].some((p) => p.inkProductId === i.productId));
    expect(fromCollection.length).toBeLessThanOrEqual(2);
  });

  it("2./7. another piece of the same design (same product_cluster_id) never appears and shares the design's list", () => {
    const { ed, input } = fixture();
    const fromClassic = listFor(input, ed.paiPr.inkProductId);
    const fromOversized = listFor(input, ed.paiPrOversized.inkProductId);
    expect(fromClassic.map((i) => i.productId)).not.toContain(ed.paiPrOversized.inkProductId);
    expect(fromOversized.map((i) => i.productId)).not.toContain(ed.paiPr.inkProductId);
    expect(fromOversized).toEqual(fromClassic);
    // and the design appears ONCE on other pages, represented by the classic shirt even though the Oversized sold more
    const fromMae = listFor(input, ed.maePr.inkProductId).map((i) => i.productId);
    expect(fromMae.filter((id) => id === ed.paiPr.inkProductId || id === ed.paiPrOversized.inkProductId)).toEqual([ed.paiPr.inkProductId]);
  });

  it("equivalent designs never stand side by side (P&B print, SC|Minimal vs Santa Catarina|Minimal)", () => {
    const { ed, input } = fixture();
    const list = listFor(input, ed.treinoB.inkProductId).map((i) => i.productId);
    expect(list.includes(ed.treinoA.inkProductId) && list.includes(ed.treinoApb.inkProductId)).toBe(false);
    const fromScClean = listFor(input, ed.scClean.inkProductId).map((i) => i.productId);
    expect(fromScClean.includes(ed.scMinimal.inkProductId) && fromScClean.includes(ed.scMinimalLong.inkProductId)).toBe(false);
  });

  it("9. never four of the same line: shows three rather than filling with noise", () => {
    const { ed, input } = fixture();
    const list = listFor(input, ed.treinoE.inkProductId);
    expect(list.length).toBe(3);
  });

  it("personal orders are never recommended (but still receive a list)", () => {
    const { ed, input } = fixture();
    for (const source of [ed.churrasqueiro, ed.paiMate]) expect(listFor(input, source.inkProductId).map((i) => i.productId)).not.toContain(ed.personal.inkProductId);
    expect(listFor(input, ed.personal.inkProductId).length).toBeGreaterThan(0);
  });

  it("a rare design without context gets 0–2 results (the block hides below 2)", () => {
    const { ed, input } = fixture();
    expect(listFor(input, ed.orphan.inkProductId).length).toBeLessThanOrEqual(2);
  });
});

describe("recommendations — determinism, index and validation", () => {
  it("8. the score and the whole file are deterministic (input order does not matter)", () => {
    const { input } = fixture();
    const shuffled: StoreBuildInput = { ...input, bindings: [...input.bindings].reverse(), merch: [...input.merch].reverse(), collections: [...input.collections].reverse() };
    expect(serializeIndex(buildRecommendationsIndex([input]).index)).toBe(serializeIndex(buildRecommendationsIndex([shuffled]).index));
    const docs = buildDocuments(input).documents;
    const a = docs.find((d) => d.representative.title.startsWith("Bah"))!;
    const b = docs.find((d) => d.representative.title.startsWith("Tchê"))!;
    expect(scorePair(a, b)).toEqual(scorePair(a, b));
    expect(scorePair(a, b)!.parts.join("|")).toContain("same-collection:fala-daqui");
  });

  it("10. an empty or missing index means no recommendations, never an error", () => {
    expect(lookupRecommendations(null, "sul", "123")).toEqual([]);
    const { index } = buildRecommendationsIndex([]);
    expect(lookupRecommendations(index, "sul", "123")).toEqual([]);
    expect(lookupRecommendations(index, "sul", "../etc")).toEqual([]);
  });

  it("11–13. invalid link, image or price never becomes a card", () => {
    const { ed, input } = fixture();
    const broken: StoreBuildInput = {
      ...input,
      merch: input.merch.map((m) =>
        m.inkProductId === ed.tche.inkProductId ? { ...m, storeProductUrl: "https://evil.example/usesul/product/x" }
          : m.inkProductId === ed.baita.inkProductId ? { ...m, imageUrl: "http://insecure.example/x.jpg" }
            : m.inkProductId === ed.bagual.inkProductId ? { ...m, price: null }
              : m,
      ),
    };
    const ids = listFor(broken, ed.bah.inkProductId).map((i) => i.productId);
    for (const bad of [ed.tche, ed.baita, ed.bagual]) expect(ids).not.toContain(bad.inkProductId);
    const { built } = buildRecommendationsIndex([broken]);
    expect(built["use-sul"]!.discarded.map((d) => d.reason).sort()).toEqual(["invalid-image", "invalid-price", "invalid-url"]);
  });

  it("14. another store's products never enter a store's lists, and every href is rebuilt on the store's own host", () => {
    const { ed, input } = fixture();
    const foreign = { ...merch("Bah | Dizeres"), commerceStoreKey: "use-norte" as const };
    const mixed: StoreBuildInput = { ...input, merch: [...input.merch, foreign], collections: input.collections.map((c) => (c.slug === "fala-daqui" ? { ...c, memberIds: [...c.memberIds, foreign.inkProductId], allMemberIds: [...(c.allMemberIds ?? []), foreign.inkProductId] } : c)) };
    const list = listFor(mixed, ed.tche.inkProductId);
    expect(list.map((i) => i.productId)).not.toContain(foreign.inkProductId);
    for (const item of list) expect(item.href.startsWith(`${BASE}/`)).toBe(true);
    // a Sul product id asked on another region's route finds nothing
    const { index } = buildRecommendationsIndex([input]);
    expect(lookupRecommendations(index, "norte", ed.tche.inkProductId)).toEqual([]);
  });

  it("validation refuses a broken candidate and keeps the live file (with .prev) on promotion", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "reco-"));
    try {
      const target = path.join(dir, "recommendations-index.json");
      const { input } = fixture();
      const good = serializeIndex(buildRecommendationsIndex([input]).index);
      await writeAndPromote(good, { expectStores: ["use-sul"], target });
      expect(readFileSync(target, "utf8")).toBe(good);
      const bad = JSON.stringify({ ...JSON.parse(good), version: 99 });
      await expect(writeAndPromote(bad, { expectStores: ["use-sul"], target })).rejects.toThrow(/failed validation/);
      expect(readFileSync(target, "utf8")).toBe(good); // untouched
      await writeAndPromote(good, { expectStores: ["use-sul"], target });
      expect(existsSync(`${target}.prev`)).toBe(true);
      // a list pointing at its own product is rejected
      const selfRef = JSON.parse(good);
      const [pid, list] = Object.entries(selfRef.stores["use-sul"].recs)[0] as [string, number[][]];
      selfRef.stores["use-sul"].items[list[0][0]][0] = pid;
      expect(validateRecommendationsText(JSON.stringify(selfRef), { expectStores: ["use-sul"] }).ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hidden garment pieces of a city design (garment index) map to that design's list", () => {
    const { floripa, input } = fixture();
    const withPieces: StoreBuildInput = { ...input, garmentClusters: { "c-floripa-origem": ["9900001", "9900002"] } };
    const { index } = buildRecommendationsIndex([withPieces]);
    const classic = lookupRecommendations(index, "sul", floripa.origem.inkProductId);
    expect(lookupRecommendations(index, "sul", "9900001")).toEqual(classic);
    expect(classic.length).toBeGreaterThanOrEqual(2);
  });

  it("only the PUBLISHED CMS can mark a collection as featured (archived pages ignored)", () => {
    const bundle = {
      schemaVersion: 1, releaseId: "r", media: {},
      docs: {
        sul: {
          schemaVersion: 1, scope: "sul", tracking: {},
          home: { sections: [{ source: { kind: "ink-category", store: "use-sul", collectionId: 2 } }] },
          pages: [{ archived: true, sections: [{ source: { kind: "ink-category", store: "use-sul", collectionId: 77 } }] }, { sections: [{ cta: { dest: { kind: "ink-collection", store: "use-sul", collectionId: 4 } } }] }],
          collections: { navbarGroups: { top: [{ store: "use-sul", collectionId: 3 }], more: [{ store: "use-norte", collectionId: 5 }] } },
        },
      },
    } as never;
    expect([...featuredCollectionIds(bundle, "use-sul")].sort()).toEqual([2, 3, 4]);
    expect(featuredCollectionIds(null, "use-sul").size).toBe(0);
  });

  it("recommend() is a pure function of the prepared store", () => {
    const { floripa, input } = fixture();
    const docs = buildDocuments(input).documents;
    const store = prepareStore(docs);
    const source = docs.find((d) => d.representative.id === floripa.origem.inkProductId)!;
    expect(recommend(source, store)).toEqual(recommend(source, store));
  });
});
