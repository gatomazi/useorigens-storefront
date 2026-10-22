import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { lerEstadoMigracao } from "@/lib/catalog/unificado/estado-migracao";
import type { ProdutoBruto } from "@/lib/catalog/unificado/produto-bruto";
import { classificarDesenhosSul, classificarRegioesSul, COLECAO_SUL, COLECAO_ZZ_CO, COLECAO_ZZ_NO } from "@/lib/catalog/unificado/reconciliar";
import { montarColecoes, montarLojaUnica } from "@/lib/catalog/unificado/loja-unica";
import { syncColecoesLojaUnica, syncLojaUnica, IDENTITY_FILE } from "@/lib/catalog/unificado/sync-loja-unica";
import { categoryLookup, collectionsForRegion } from "@/lib/catalog/collection-source";
import type { CollectionRecord } from "@/lib/catalog/collections";
import type { StoreProducts } from "@/lib/catalog/repository";
import { SINGLE_STORE_DIR } from "@/lib/catalog/commerce-mode";
import { getCatalog } from "@/lib/catalog/repository";
import { writeCollectionsFile, collectionsPath } from "@/lib/catalog/collections-file";
import type { InkProductNormalized, MerchProduct } from "@/lib/catalog/types";

let seq = 7000;
function produto(name: string, extra: Partial<ProdutoBruto> = {}): ProdutoBruto {
  const id = extra.id ?? String(seq++);
  return {
    id,
    name,
    slug: `p-${id}`,
    url: `https://www.usesul.com.br/usesul/product/p-${id}`,
    image: `https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/${id}.jpg`,
    price: "109.9",
    promotionalPrice: null,
    clusterId: null,
    typeId: 1,
    typeName: "Camiseta",
    status: "published",
    visible: true,
    approval: "approved",
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: null,
    sales: 0,
    variants: { total: 18, available: 18, colors: ["Preta"], models: ["Clássica Masculina"] },
    ...extra,
  };
}
const oculto = { visible: false, status: "not_published" } as const;

// Sul publicado (com peça Oversized oculta no mesmo cluster), Norte migrado OCULTO com cópia, CO migrado sem imagem, um Sul sem região.
const curitiba = produto("Curitiba | Origem PR", { clusterId: "c1" });
const curitibaOversized = produto("Curitiba | Origem PR", { ...oculto, clusterId: "c1", typeId: 178, typeName: "Camiseta Oversized" });
const belem = produto("Belém | Origem PA", { ...oculto, clusterId: "n1" });
const belemRegata = produto("Belém | Origem PA", { ...oculto, clusterId: "n1", typeId: 8, typeName: "Regata" });
const cuiaba = produto("Cuiabá | Origem MT", { ...oculto, image: null, clusterId: "o1" });
const semRegiao = produto("Paranaense | Pé Vermelho", { createdAt: "2026-10-04T00:00:00Z", id: "9900001" });
const herdado = produto("Votouro | Origem Localidade RS", { tags: ["Camiseta Regional com Identidade"], clusterId: "c9" });
const herdadoIrmao = produto("Votouro | Origem Localidade RS", { ...oculto, tags: ["Ronda Alta"], clusterId: "c9", typeId: 178 });
const TODOS = [curitiba, curitibaOversized, belem, belemRegata, cuiaba, semRegiao, herdado, herdadoIrmao];

const ESTADO = [
  { chave: "origem/PA/belem", fase: "criado", produtoId: Number(belem.id), em: "2026-09-12T14:00:00Z" },
  { chave: "origem/PA/belem", fase: "copia", tipo: 8, id: Number(belemRegata.id), em: "2026-09-12T14:01:00Z" },
  { chave: "origem/MT/cuiaba", fase: "criado", produtoId: Number(cuiaba.id), em: "2026-09-12T14:02:00Z" },
]
  .map((l) => JSON.stringify(l))
  .join("\n");
const colecoes = { sul: new Set([curitiba.id, curitibaOversized.id, herdado.id, herdadoIrmao.id]), co: new Set([cuiaba.id]), no: new Set([belem.id, belemRegata.id]) };

function classificar(produtos = TODOS) {
  const estado = lerEstadoMigracao(ESTADO);
  const sul = classificarRegioesSul(produtos, colecoes, estado);
  classificarDesenhosSul(sul, estado);
  return sul;
}
const FONTE = { runId: "r", generatedAt: "t", mapVersion: 1, identitySha256: "x" };

describe("montarLojaUnica — produção", () => {
  const r = montarLojaUnica(classificar(), { modo: "producao", syncedAt: "t", fonte: FONTE });
  const loja = r.catalogo.stores["use-sul"]!;
  const situacao = (p: ProdutoBruto) => r.situacoes.find((l) => l.id === p.id)?.situacao;

  test("then only what INK already sells enters, and the file declares a production single-store source", () => {
    expect(r.catalogo.source).toMatchObject({ mode: "single-store", storeKey: "use-sul", simulation: false });
    expect(loja.bindings.map((b) => b.inkProductId)).toEqual([curitiba.id]);
    expect(loja.bindings.some((b) => b.simulated)).toBe(false);
  });
  test("then a hidden migrated base stays out (listed), and so do its pieces", () => {
    expect(situacao(belem)).toBe("oculto");
    expect(situacao(cuiaba)).toBe("sem-imagem");
    expect(Object.keys(r.pecas.stores["use-sul"]!.clusters)).toEqual(["c1"]);
  });
  test("then the hidden-but-sellable piece of a published classic is linked by cluster (production rule)", () => {
    expect(r.pecas.stores["use-sul"]!.clusters.c1.map((t) => t[1])).toEqual([curitibaOversized.id]);
  });
  test("then a product without a trusted region is listed, never made Sul because it is in the Sul store", () => {
    expect(situacao(semRegiao)).toBe("regiao-pendente");
    expect(loja.merch.map((m) => m.inkProductId)).not.toContain(semRegiao.id);
    expect(loja.unscopedProducts?.find((m) => m.inkProductId === semRegiao.id)).toMatchObject({ name: semRegiao.name, storeProductUrl: semRegiao.url });
    expect(loja.unscopedProducts?.find((m) => m.inkProductId === semRegiao.id)).not.toHaveProperty("regionSlug");
  });
  test("then a city found only through a cluster sibling is excluded, like the production indexer does", () => {
    expect(situacao(herdado)).toBe("excluido-indexador");
    expect(loja.bindings.map((b) => b.inkProductId)).not.toContain(herdado.id);
    expect(loja.unscopedProducts?.map((p) => p.inkProductId)).toContain(herdado.id);
  });
  test("the general catalog also excludes hidden products and products without a usable image", () => {
    const candidates = [produto("Sem região oculta", { ...oculto }), produto("Sem região sem imagem", { image: null })];
    const catalog = montarLojaUnica(classificar(candidates), { modo: "producao", syncedAt: "t", fonte: FONTE }).catalogo.stores["use-sul"]!;
    expect(catalog.unscopedProducts ?? []).toEqual([]);
  });
});

describe("montarLojaUnica — simulação", () => {
  const r = montarLojaUnica(classificar(), { modo: "simulacao", syncedAt: "t", fonte: FONTE });
  const loja = r.catalogo.stores["use-sul"]!;

  test("then the hidden Norte base enters marked simulated, with its pieces; the base without image stays out (no substitute mockup)", () => {
    expect(r.catalogo.source).toMatchObject({ simulation: true });
    const b = loja.bindings.find((x) => x.inkProductId === belem.id)!;
    expect(b).toMatchObject({ simulated: true, cityId: "1501402", commerceStoreKey: "use-sul" });
    expect(r.pecas.stores["use-sul"]!.clusters.n1.map((t) => t[1])).toEqual([belemRegata.id]);
    expect(loja.bindings.map((x) => x.inkProductId)).not.toContain(cuiaba.id);
    expect(r.situacoes.find((l) => l.id === cuiaba.id)?.situacao).toBe("sem-imagem");
  });
  test("then the Sul part is identical to production", () => {
    const prod = montarLojaUnica(classificar(), { modo: "producao", syncedAt: "t", fonte: FONTE }).catalogo.stores["use-sul"]!;
    const sulDe = (bs: typeof loja.bindings) => bs.filter((b) => !b.simulated).map((b) => b.inkProductId);
    expect(sulDe(loja.bindings)).toEqual(sulDe(prod.bindings));
  });
});

describe("coleções da loja única", () => {
  const paginas = (ids: Record<string, string[]>) => [
    {
      page: 1,
      total_pages: 1,
      total_count: Object.keys(ids).length,
      collections: Object.entries(ids).map(([name, productIds], i) => ({ id: 500 + i, name, slug: name.toLowerCase().replace(/\s+/g, "-"), position: i, is_available: true, product_ids: productIds.map(Number) })),
    },
  ];
  test("given the INK pages, then they are matched against the single-store catalog by the production parser", () => {
    const loja = montarLojaUnica(classificar(), { modo: "simulacao", syncedAt: "t", fonte: FONTE }).catalogo.stores["use-sul"]!;
    const c = montarColecoes("use-sul", paginas({ Mista: [curitiba.id, belem.id, "123"] }), loja, "t");
    expect(c.collections[0]).toMatchObject({ matchedCount: 2, allMemberIds: [curitiba.id, belem.id] });
  });

  describe("collectionsForRegion (single-store)", () => {
    let dir = "";
    const saved: Record<string, string | undefined> = {};
    beforeEach(() => {
      for (const k of ["CATALOG_SNAPSHOT_DIR", "COMMERCE_MODE", "COMMERCE_SIMULATION"]) saved[k] = process.env[k];
      dir = mkdtempSync(path.join(tmpdir(), "loja-unica-col-"));
      Object.assign(process.env, { CATALOG_SNAPSHOT_DIR: dir, COMMERCE_MODE: "single-store", COMMERCE_SIMULATION: "on" });
    });
    afterEach(() => {
      for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
    test("then a collection is a region's when it has at least 3 of its products, and the region counts only those: a mixed thematic one serves every region it has enough of", async () => {
      const r = montarLojaUnica(classificar(), { modo: "simulacao", syncedAt: "t", fonte: FONTE });
      const d = path.join(dir, SINGLE_STORE_DIR);
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, "catalog-snapshot.json"), JSON.stringify(r.catalogo)); // makes single-store effective
      const merch = (id: string, regionSlug: "sul" | "norte"): MerchProduct => ({ inkProductId: id, commerceStoreKey: "use-sul", regionSlug, name: id, slug: id, storeProductUrl: `https://www.usesul.com.br/usesul/product/${id}`, imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/x.jpg", price: 109.9, totalSalesCount: 0, syncedAt: "t" });
      const fake: StoreProducts = { merch: new Map([...["s1", "s2", "s3"].map((id) => [id, merch(id, "sul")] as const), ...["n1", "n2", "n3", "n4"].map((id) => [id, merch(id, "norte")] as const)]), cityDesigns: new Map() };
      const rec = (id: number, name: string, ids: string[]): CollectionRecord => ({ id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), position: id, isAvailable: true, reportedProductCount: ids.length, matchedCount: ids.length, merchCount: ids.length, cityDesignCount: 0, memberIds: ids, allMemberIds: ids });
      await writeCollectionsFile({ version: 2, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 3, collections: [rec(1, "Sul Puro", ["s1", "s2", "s3"]), rec(2, "Da Nossa Terra", ["s1", "n1", "s2", "n2", "s3", "n3"]), rec(3, "Pouco Norte", ["s1", "s2", "s3", "n4"])] } } }, collectionsPath(d));
      const of = (reg: "sul" | "norte" | "centro-oeste") => collectionsForRegion(reg, () => fake).map((x) => [x.name, x.matchedCount]);
      expect(of("sul")).toEqual([["Sul Puro", 3], ["Da Nossa Terra", 3], ["Pouco Norte", 3]]);
      expect(of("norte")).toEqual([["Da Nossa Terra", 3]]); // "Pouco Norte" has one Norte product: below the minimum
      expect(of("centro-oeste")).toEqual([]);
    });

    test("then a ref to a store that does not sell in the region resolves to nothing", async () => {
      const r = montarLojaUnica(classificar(), { modo: "simulacao", syncedAt: "t", fonte: FONTE });
      const d = path.join(dir, SINGLE_STORE_DIR);
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, "catalog-snapshot.json"), JSON.stringify(r.catalogo));
      const c = getCatalog();
      // A Norte document still pointing at the old regional store: the single store sells Norte now, so that section has nothing to show.
      const lookup = categoryLookup((s) => c.productsOfStore(s), () => new Set(), undefined, undefined, "norte");
      expect(lookup({ kind: "ink-category", store: "use-norte", collectionId: 141902, order: "category", limit: 6 })).toEqual({ status: "unavailable", reason: "collection-not-found" });
    });
  });
});

describe("syncLojaUnica — o sync real da loja única", () => {
  let dir = "";
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.CATALOG_SNAPSHOT_DIR;
    dir = mkdtempSync(path.join(tmpdir(), "loja-unica-sync-"));
    process.env.CATALOG_SNAPSHOT_DIR = dir;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CATALOG_SNAPSHOT_DIR;
    else process.env.CATALOG_SNAPSHOT_DIR = saved;
  });
  const visivel = (p: ProdutoBruto): InkProductNormalized => ({ id: p.id, storeKey: "use-sul", name: p.name, slug: p.slug, storeProductUrl: p.url!, imageUrl: p.image!, price: 109.9, tags: p.tags, clusterId: p.clusterId, garmentTypeId: p.typeId, totalSalesCount: 0, createdAt: p.createdAt });
  const deps = {
    // The production read is visible+published only: hidden products never even reach the sync.
    fetchProducts: async () => ({ products: [curitiba, herdado].map(visivel), requests: 1 }),
    fetchCollections: async () => ({
      membros: [
        { id: COLECAO_SUL, productIds: [...colecoes.sul] },
        { id: COLECAO_ZZ_CO, productIds: [...colecoes.co] },
        { id: COLECAO_ZZ_NO, productIds: [...colecoes.no] },
      ],
      paginas: [{ page: 1, total_pages: 1, total_count: 1, collections: [{ id: 1, name: "Da Nossa Terra", slug: "da-nossa-terra", position: 1, is_available: true, product_ids: [Number(curitiba.id)] }] }],
    }),
  };

  test("given no identity file, then it refuses and writes nothing", async () => {
    const r = await syncLojaUnica({ deps });
    expect(r).toMatchObject({ ok: false });
    expect(existsSync(path.join(dir, SINGLE_STORE_DIR, "catalog-snapshot.json"))).toBe(false);
  });
  test("given the identity, then it writes a production single-store catalog + collections ONLY under loja-unica/, the regional files untouched", async () => {
    const root = path.join(dir, "catalog-snapshot.json");
    writeFileSync(root, JSON.stringify({ version: 1, stores: {} }));
    const before = createHash("sha256").update(readFileSync(root)).digest("hex");
    mkdirSync(path.join(dir, SINGLE_STORE_DIR), { recursive: true });
    writeFileSync(path.join(dir, SINGLE_STORE_DIR, IDENTITY_FILE), ESTADO);
    const r = await syncLojaUnica({ deps });
    expect(r).toMatchObject({ ok: true, bindingCount: 1, collections: 1 });
    const written = JSON.parse(readFileSync(path.join(dir, SINGLE_STORE_DIR, "catalog-snapshot.json"), "utf8"));
    expect(written.source).toMatchObject({ mode: "single-store", simulation: false });
    expect(createHash("sha256").update(readFileSync(root)).digest("hex")).toBe(before);
    expect(existsSync(path.join(dir, "collections-snapshot.json"))).toBe(false);
  });
  test("given the identity, then the same pages also leave the Google Merchant source (cover, type, variants) next to the catalog", async () => {
    mkdirSync(path.join(dir, SINGLE_STORE_DIR), { recursive: true });
    writeFileSync(path.join(dir, SINGLE_STORE_DIR, IDENTITY_FILE), ESTADO);
    const raw = { id: Number(curitiba.id), name: curitiba.name, main_image_url: "https://img.example/capa.jpg", product_type: { id: 1, name: "Camiseta" }, product_variants: [{ color: "Preta", hex_color: "000000", model: "Masculino", size: "M", is_available: true }] };
    const fetchProducts = async (_p?: unknown, _m?: unknown, onRaw?: (raw: unknown) => void) => {
      onRaw?.(raw);
      return { products: [curitiba, herdado].map(visivel), requests: 1 };
    };
    expect(await syncLojaUnica({ deps: { ...deps, fetchProducts } })).toMatchObject({ ok: true });
    const source = JSON.parse(readFileSync(path.join(dir, SINGLE_STORE_DIR, "merchant-source.json"), "utf8"));
    expect(source.products).toEqual([expect.objectContaining({ id: curitiba.id, cover: "https://img.example/capa.jpg", typeName: "Camiseta", colors: [{ name: "Preta", hex: "000000", models: ["Masculino"], sizes: ["M"] }] })]);
  });
  test("given a later read that collapses, then the previous single-store catalog is kept (last-known-good)", async () => {
    mkdirSync(path.join(dir, SINGLE_STORE_DIR), { recursive: true });
    writeFileSync(path.join(dir, SINGLE_STORE_DIR, IDENTITY_FILE), ESTADO);
    const many = Array.from({ length: 20 }, (_, i) => produto(`Curitiba | Origem PR`, { id: String(8000 + i) }));
    for (const p of many) colecoes.sul.add(p.id);
    expect(await syncLojaUnica({ deps: { ...deps, fetchProducts: async () => ({ products: many.map(visivel) }) } })).toMatchObject({ ok: true });
    const file = path.join(dir, SINGLE_STORE_DIR, "catalog-snapshot.json");
    const before = readFileSync(file, "utf8");
    expect(await syncLojaUnica({ deps: { ...deps, fetchProducts: async () => ({ products: many.slice(0, 2).map(visivel) }) } })).toMatchObject({ ok: false });
    expect(readFileSync(file, "utf8")).toBe(before);
  });
  test("given no single-store catalog yet, then the collections-only sync refuses and writes nothing", async () => {
    expect(await syncColecoesLojaUnica({ deps })).toMatchObject({ ok: false });
    expect(existsSync(path.join(dir, SINGLE_STORE_DIR, "collections-snapshot.json"))).toBe(false);
  });
  test("given a collection that got products on INK after the daily sync, then the collections-only sync writes it under loja-unica/ only", async () => {
    mkdirSync(path.join(dir, SINGLE_STORE_DIR), { recursive: true });
    writeFileSync(path.join(dir, SINGLE_STORE_DIR, IDENTITY_FILE), ESTADO);
    expect(await syncLojaUnica({ deps })).toMatchObject({ ok: true, collections: 1 });
    const pagina = { page: 1, total_pages: 1, total_count: 2, collections: [
      { id: 1, name: "Da Nossa Terra", slug: "da-nossa-terra", position: 1, is_available: true, product_ids: [Number(curitiba.id)] },
      { id: 2, name: "Fala de Onde", slug: "fala-de-onde", position: 2, is_available: true, product_ids: [Number(curitiba.id)] },
    ] };
    const r = await syncColecoesLojaUnica({ deps: { fetchCollections: async () => ({ membros: [], paginas: [pagina] }) } });
    expect(r).toMatchObject({ ok: true, changed: true, collections: 2, requests: 1 });
    const written = JSON.parse(readFileSync(path.join(dir, SINGLE_STORE_DIR, "collections-snapshot.json"), "utf8"));
    expect(written.stores["use-sul"].collections.find((c: CollectionRecord) => c.name === "Fala de Onde")).toMatchObject({ matchedCount: 1 });
    expect(existsSync(path.join(dir, "collections-snapshot.json"))).toBe(false);
    expect(await syncColecoesLojaUnica({ deps: { fetchCollections: async () => ({ membros: [], paginas: [pagina] }) } })).toMatchObject({ ok: true, changed: false });
  });
});
