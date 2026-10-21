import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { parseSectionForm } from "@/lib/admin/section-form";
import { buildRegionCopy } from "@/lib/admin/region-copy";
import { categoryLookup, collectionPageLookup } from "@/lib/catalog/collection-source";
import { buildStoreIndex } from "@/lib/catalog/indexer";
import { isProductSort, sortProducts } from "@/lib/catalog/product-sort";
import type { StoreProducts } from "@/lib/catalog/repository";
import { pagedGridDefaultSort } from "@/lib/pages/public";
import { collectionQueryString, isCollectionQueryActive, parseCollectionQuery, runCollectionQuery } from "@/lib/search/collection-filter";
import { newCollectionLanding } from "@/lib/site-config/pages";
import { arrangementOf } from "@/lib/site-config/collections-enabled";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { validatePage, validateSection, type Section } from "@/lib/site-config/schema";
import { resolveSource, type EditorialItems, type InkCategorySource } from "@/lib/site-config/sources";
import { product } from "./fixtures";

const items = [
  { id: "a", name: "Camiseta A", createdAt: "2026-01-01T00:00:00Z", totalSalesCount: 10, rawPrice: 100, state: "SC" },
  { id: "b", name: "Camiseta B", createdAt: "2026-10-01T00:00:00Z", totalSalesCount: 100, rawPrice: 90, state: "PR" },
  { id: "c", name: "Camiseta C", createdAt: "2026-10-01T00:00:00Z", totalSalesCount: 100, rawPrice: 120, state: "SC" },
  { id: "d", name: "Camiseta D", createdAt: null, totalSalesCount: 0, rawPrice: null, state: "SC" },
];
const sales = { a: 10, b: 100, c: 100 };
const ids = (list: readonly { id: string }[]) => list.map((item) => item.id);

describe("ordenação comercial compartilhada", () => {
  test("ordena por data, vendas da janela e preço com desempate estável, sem modificar a entrada", () => {
    const before = structuredClone(items);
    expect(ids(sortProducts(items, "newest"))).toEqual(["b", "c", "a", "d"]);
    expect(ids(sortProducts(items, "best-selling", sales))).toEqual(["b", "c", "a", "d"]);
    expect(ids(sortProducts(items, "price-asc"))).toEqual(["b", "a", "c", "d"]);
    expect(ids(sortProducts(items, "price-desc"))).toEqual(["c", "a", "b", "d"]);
    expect(sortProducts(items, "collection")).toEqual(items);
    expect(items).toEqual(before);
  });

  test("datas e preços ausentes ou inválidos ficam no fim; vendas ausentes ou inválidas não ganham popularidade", () => {
    const partial = [{ id: "missing" }, { id: "invalid", createdAt: "nonsense", totalSalesCount: NaN, rawPrice: Infinity }, { id: "real", createdAt: "2026-10-01T00:00:00Z", totalSalesCount: 1, rawPrice: 50 }, { id: "negative", totalSalesCount: -20 }];
    expect(ids(sortProducts(partial, "newest"))).toEqual(["real", "missing", "invalid", "negative"]);
    expect(ids(sortProducts(partial, "best-selling", { real: 1, negative: -20, invalid: NaN }))).toEqual(["real", "missing", "invalid", "negative"]);
    expect(ids(sortProducts(partial, "price-asc"))).toEqual(["real", "missing", "invalid", "negative"]);
    expect(isProductSort("best-selling")).toBe(true);
    expect(isProductSort("invented")).toBe(false);
  });

  test("as vendas da janela prevalecem sobre totais acumulados e a falta de apuração preserva a ordem", () => {
    expect(ids(sortProducts(items, "best-selling", { a: 50, b: 1 }))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortProducts(items, "best-selling", null))).toEqual(ids(items));
    expect(ids(runCollectionQuery(items, { q: "", filters: {}, sort: "best-selling" }).items)).toEqual(ids(items));
  });

  test("filtros e busca continuam combinando com Novidades e Mais vendidas sobre a coleção inteira", () => {
    expect(ids(runCollectionQuery(items, { q: "camiseta", filters: { state: "SC" }, sort: "best-selling" }, sales).items)).toEqual(["c", "a", "d"]);
    expect(ids(runCollectionQuery(items, { q: "", filters: { state: "PR" }, sort: "newest" }).items)).toEqual(["b"]);
  });

  test("o padrão da página não dispara uma segunda busca e o visitante ainda pode escolher explicitamente a ordem original", () => {
    const query = parseCollectionQuery(new URLSearchParams(), "newest");
    expect(query.sort).toBe("newest");
    expect(isCollectionQueryActive(query, "newest")).toBe(false);
    expect(collectionQueryString(query, "newest")).toBe("");
    const original = { ...query, sort: "collection" as const };
    expect(isCollectionQueryActive(original, "newest")).toBe(true);
    expect(collectionQueryString(original, "newest")).toBe("ordem=collection");
    expect(parseCollectionQuery(new URLSearchParams("ordem=collection"), "newest").sort).toBe("collection");
    expect(parseCollectionQuery(new URLSearchParams("ordem=invalid"), "best-selling").sort).toBe("best-selling");
    expect(parseCollectionQuery(new URLSearchParams("uf=SC"), "best-selling").sort).toBe("best-selling");
  });

  test("o indexador preserva datas de cadastro originais e vendas, sem usar a data da sincronização como novidade", () => {
    const createdAt = "2025-01-02T10:00:00Z";
    const index = buildStoreIndex("use-sul", [product("Torres | Legado RS", { createdAt, totalSalesCount: 15 }), product("Minha camiseta", { createdAt, totalSalesCount: 20 })], "2026-10-20T00:00:00Z");
    expect(index.bindings[0]).toMatchObject({ createdAt, totalSalesCount: 15 });
    expect(index.merch[0]).toMatchObject({ createdAt, totalSalesCount: 20 });
    const withoutDate = buildStoreIndex("use-sul", [product("Minha camiseta", { createdAt: null })], "2026-10-20T00:00:00Z");
    expect(withoutDate.merch[0].createdAt).toBeUndefined();
  });

  test("a curadoria editorial ordena o conjunto completo antes de cortar os cards, mantendo o tamanho do carrossel", () => {
    const card = (id: string, totalSalesCount: number) => ({ id, name: id, price: null, imageUrl: "image", href: "/sul", totalSalesCount });
    const base = [card("first", 1), card("second", 2)];
    const all = [...base, card("outside-original-shelf", 100)];
    const editorial = { terra: base, lenda: base, recreations: base, dizeres: base, ddd: base } satisfies EditorialItems;
    const result = resolveSource({ kind: "editorial-module", key: "lenda", sort: "best-selling" }, editorial, undefined, undefined, { ...editorial, lenda: all }, { "outside-original-shelf": 100, second: 2, first: 1 });
    expect(result).toMatchObject({ status: "ok", items: [expect.objectContaining({ id: "outside-original-shelf" }), expect.objectContaining({ id: "second" })] });
    expect(resolveSource({ kind: "editorial-module", key: "lenda" }, editorial)).toEqual({ status: "ok", items: base });
  });
});

describe("ordenação antes do limite de cards e da paginação", () => {
  let directory: string;
  let file: string;
  let products: StoreProducts;
  const source: InkCategorySource = { kind: "ink-category", store: "use-sul", collectionId: 10, order: "category", limit: 3 };
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "origens-sort-"));
    file = path.join(directory, "collections.json");
    const index = buildStoreIndex("use-sul", Array.from({ length: 7 }, (_, i) => product(`Camiseta ${i + 1}`, { id: String(i + 1), createdAt: `2026-10-0${i + 1}T00:00:00Z`, totalSalesCount: i + 1 })), "2026-10-20T00:00:00Z");
    products = { merch: new Map(index.merch.map((m) => [m.inkProductId, m])), cityDesigns: new Map() };
    const memberIds = ["1", "2", "3", "4", "5", "6", "7"];
    await writeFile(file, JSON.stringify({ version: 2, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: index.syncedAt, catalogSyncedAt: index.syncedAt, totalCount: 1, collections: [{ id: 10, name: "Camisetas", slug: "camisetas", position: 1, isAvailable: true, reportedProductCount: 7, matchedCount: 7, merchCount: 7, cityDesignCount: 0, memberIds, allMemberIds: memberIds }] } } }));
  });
  afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

  test("um carrossel pode buscar as novidades e mais vendidas fora dos primeiros cards da INK", () => {
    const lookup = categoryLookup(() => products, () => new Set(), file, undefined, undefined, { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7 });
    for (const sort of ["newest", "best-selling"] as const) {
      const result = lookup({ ...source, sort });
      expect(result.status).toBe("ok");
      if (result.status === "ok") expect(ids(result.items)).toEqual(["7", "6", "5"]);
    }
    const original = lookup(source);
    if (original.status === "ok") expect(ids(original.items)).toEqual(["1", "2", "3"]);
  });

  test("páginas dividem a lista já ordenada, sem repetir nem perder produtos", () => {
    const lookup = collectionPageLookup(() => products, () => new Set(), file);
    const pages = [1, 2, 3].map((page) => lookup({ ...source, sort: "newest" }, page));
    expect(pages.every((p) => p.status === "ok" && p.pageCount === 3 && p.total === 7)).toBe(true);
    expect(pages.flatMap((p) => p.status === "ok" ? ids(p.items) : [])).toEqual(["7", "6", "5", "4", "3", "2", "1"]);
  });

  test("a ordem manual ganha do padrão automático e produtos ocultos permanecem excluídos", () => {
    const arrange = () => ({ productIds: ["2", "1"], hiddenIds: ["7"] });
    const lookup = categoryLookup(() => products, () => new Set(), file, arrange);
    const result = lookup({ ...source, sort: "newest" });
    expect(result).toMatchObject({ status: "ok", items: [expect.objectContaining({ id: "2" }), expect.objectContaining({ id: "1" }), expect.objectContaining({ id: "3" })] });
    const paged = collectionPageLookup(() => products, () => new Set(), file, arrange)({ ...source, sort: "best-selling" }, 1);
    expect(paged).toMatchObject({ status: "ok", items: [expect.objectContaining({ id: "2" }), expect.objectContaining({ id: "1" }), expect.objectContaining({ id: "3" })] });
    const hiddenOnly = categoryLookup(() => products, () => new Set(), file, () => ({ hiddenIds: ["7"] }))({ ...source, sort: "newest" });
    expect(hiddenOnly).toMatchObject({ status: "ok", items: [expect.objectContaining({ id: "6" }), expect.objectContaining({ id: "5" }), expect.objectContaining({ id: "4" })] });
  });

  test("a ordenação automática continua limitada aos produtos da região antes de cortar e paginar", () => {
    const mixed = { ...products, merch: new Map([...products.merch].map(([id, m]) => [id, { ...m, regionSlug: id === "7" ? "norte" as const : "sul" as const }])) };
    const lookup = categoryLookup(() => mixed, () => new Set(), file, undefined, "sul");
    expect(lookup({ ...source, sort: "newest" })).toMatchObject({ status: "ok", items: [expect.objectContaining({ id: "6" }), expect.objectContaining({ id: "5" }), expect.objectContaining({ id: "4" })] });
    const page = collectionPageLookup(() => mixed, () => new Set(), file, undefined, "sul")({ ...source, sort: "newest" }, 1);
    expect(page).toMatchObject({ status: "ok", total: 6, items: [expect.objectContaining({ id: "6" }), expect.objectContaining({ id: "5" }), expect.objectContaining({ id: "4" })] });
  });

  test("copiar a home mantém a ordem e os ocultos legados do destino no lookup real, mesmo com Novidades na origem", () => {
    const b = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
    const destination = structuredClone(b.docs.sul);
    const legacy: Section = { ...newCollectionLanding({ id: "p", heroId: "h", gridId: "g", title: "Camisetas", slug: "camisetas", ref: { store: "use-sul", collectionId: 10 } }).sections[1], layout: { variant: "standard", tone: "light", surface: "plain" }, source: { ...source, order: "manual", productIds: ["2", "1"], hiddenIds: ["7"] } };
    destination.home!.sections.splice(1, 0, legacy);
    const origin = structuredClone(b.docs.norte);
    origin.home = { sections: [structuredClone(b.docs.sul.home!.sections[0]), { ...structuredClone(legacy), source: { ...source, store: "use-norte", collectionId: 20, sort: "newest" } }, structuredClone(b.docs.sul.home!.sections.at(-1)!)] };
    let n = 0;
    const result = buildRegionCopy({ source: origin, destination, part: "home", mappings: { "use-norte:20": "10" }, collections: [{ store: "use-sul", id: 10, name: "Camisetas", slug: "camisetas", isAvailable: true, matchedCount: 7 }], newId: () => String(++n) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const copiedSource = result.doc.home!.sections[1].source as InkCategorySource;
    expect(copiedSource.sort).toBe("newest");
    const lookup = categoryLookup(() => products, () => new Set(), file, (src) => arrangementOf(result.doc, src.store, src.collectionId, src));
    expect(lookup(copiedSource)).toMatchObject({ status: "ok", items: [expect.objectContaining({ id: "2" }), expect.objectContaining({ id: "1" }), expect.objectContaining({ id: "3" })] });
  });
});

describe("padrões no CMS e na cópia regional", () => {
  const bundle = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
  const landing = () => newCollectionLanding({ id: "page-test", heroId: "hero-test", gridId: "grid-test", title: "Camisetas", slug: "camisetas", ref: { store: "use-sul", collectionId: 10 } });
  test("salva e valida o padrão da página, permite removê-lo e conserva a configuração em páginas copiadas", () => {
    const source = bundle().docs.sul;
    source.pages = [landing()];
    const result = applyOp(source, { type: "update-page", id: "page-test", patch: { defaultSort: "newest" } }, { newId: () => "1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.pages![0].defaultSort).toBe("newest");
    expect(validatePage({ ...landing(), defaultSort: "invalid" }, "sul").ok).toBe(false);
    const removed = applyOp(result.doc, { type: "update-page", id: "page-test", patch: { defaultSort: null } }, { newId: () => "1" });
    expect(removed.ok && removed.doc.pages![0].defaultSort).toBeUndefined();
    let n = 0;
    const copied = buildRegionCopy({ source: result.doc, destination: bundle().docs.norte, part: "page", sourceId: "page-test", mappings: { "use-sul:10": "20" }, collections: [{ store: "use-norte", id: 20, name: "Camisetas", slug: "camisetas", isAvailable: true, matchedCount: 7 }], newId: () => String(++n) });
    expect(copied.ok && copied.doc.pages![0].defaultSort).toBe("newest");
  });

  test("prioridade inicial: ordem manual, configuração da seção, padrão da página, ordem original", () => {
    const b = bundle();
    const page = landing();
    page.defaultSort = "newest";
    expect(pagedGridDefaultSort("sul", b, page)).toBe("newest");
    page.sections[1].source!.sort = "price-desc";
    expect(pagedGridDefaultSort("sul", b, page)).toBe("price-desc");
    b.docs.sul.collections = { enabled: [], arrangements: [{ store: "use-sul", collectionId: 10, productIds: ["1"] }] };
    expect(pagedGridDefaultSort("sul", b, page)).toBe("collection");
    expect(pagedGridDefaultSort("sul", bundle(), landing())).toBe("collection");
  });

  test("salvar uma seção preserva o padrão quando o formulário antigo não o envia e permite escolher ou voltar a herdar", () => {
    const section: Section = { ...landing().sections[1], source: { ...landing().sections[1].source!, sort: "newest" } };
    const fd = new FormData();
    expect(parseSectionForm(fd, section).source?.sort).toBe("newest");
    fd.set("source_sort", "best-selling");
    expect(parseSectionForm(fd, section).source?.sort).toBe("best-selling");
    fd.set("source_sort", "");
    expect(parseSectionForm(fd, section).source?.sort).toBeUndefined();
    expect(validateSection({ ...section, source: { ...section.source, sort: "invalid" } }).ok).toBe(false);
  });
});
