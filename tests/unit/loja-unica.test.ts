import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { lerEstadoMigracao } from "@/lib/catalog/unificado/estado-migracao";
import type { ProdutoBruto } from "@/lib/catalog/unificado/produto-bruto";
import { classificarDesenhosSul, classificarRegioesSul, COLECAO_SUL, COLECAO_ZZ_CO, COLECAO_ZZ_NO } from "@/lib/catalog/unificado/reconciliar";
import { montarColecoes, montarLojaUnica } from "@/lib/catalog/unificado/loja-unica";
import { syncLojaUnica, IDENTITY_FILE } from "@/lib/catalog/unificado/sync-loja-unica";
import { collectionsForRegion } from "@/lib/catalog/collection-source";
import { SINGLE_STORE_DIR } from "@/lib/catalog/commerce-mode";
import { getCatalog } from "@/lib/catalog/repository";
import { writeCollectionsFile, collectionsPath } from "@/lib/catalog/collections-file";
import type { InkProductNormalized } from "@/lib/catalog/types";

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
  });
  test("then a city found only through a cluster sibling is excluded, like the production indexer does", () => {
    expect(situacao(herdado)).toBe("excluido-indexador");
    expect(loja.bindings.map((b) => b.inkProductId)).not.toContain(herdado.id);
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
    expect(c.collections[0]).toMatchObject({ matchedCount: 2, searchMemberIds: [curitiba.id, belem.id] });
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
    test("then a collection belongs to a region only when every member is of that region; a mixed one is shown nowhere", async () => {
      const r = montarLojaUnica(classificar(), { modo: "simulacao", syncedAt: "t", fonte: FONTE });
      const d = path.join(dir, SINGLE_STORE_DIR);
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, "catalog-snapshot.json"), JSON.stringify(r.catalogo));
      await writeCollectionsFile({ version: 2, stores: { "use-sul": montarColecoes("use-sul", paginas({ "Sul Puro": [curitiba.id], "Norte Puro": [belem.id], Mista: [curitiba.id, belem.id] }), r.catalogo.stores["use-sul"]!, "t") } }, collectionsPath(d));
      const c = getCatalog();
      const nomes = (reg: "sul" | "norte" | "centro-oeste") => collectionsForRegion(reg, (s) => c.productsOfStore(s)).map((x) => x.name);
      expect(nomes("sul")).toEqual(["Sul Puro"]);
      expect(nomes("norte")).toEqual(["Norte Puro"]);
      expect(nomes("centro-oeste")).toEqual([]);
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
});
