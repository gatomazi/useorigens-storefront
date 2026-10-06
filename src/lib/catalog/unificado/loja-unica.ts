import { REGIONS, type CommerceStoreKey, type RegionSlug } from "../../geo/regions";
import type { GarmentSourceProduct } from "../../ink/normalize";
import { buildStoreIndex } from "../indexer";
import { matcherForStore, parseCollectionsPage, sortCollections, type CollectionRecord, type StoreCollections } from "../collections";
import { emptyGarmentIndex, upsertPieces, type GarmentIndex, type GarmentTuple } from "../garment-index-file";
import { linkGarmentBindings, type GarmentLinkStats } from "../garments-link";
import type { CatalogSnapshot, CatalogSource, InkProductNormalized, StoreIndex } from "../types";
import { paraProdutoIndexavel, type ProdutoSul } from "./reconciliar";
import type { ProdutoBruto } from "./produto-bruto";

/**
 * Montagem dos TRÊS arquivos que o storefront consome (catálogo, índice de peças, coleções) a partir de UMA loja INK servindo as três
 * regiões. Puro: recebe o que foi lido e classificado (classificarRegioesSul + classificarDesenhosSul) e devolve os arquivos; quem grava
 * é o chamador (geração offline `unificado:gerar` ou o sync `catalog:sync -- --loja-unica`). Docs:
 * docs/migracao-ink/origens-storefront-unificado-preparacao.md.
 *
 * Reaproveita, sem cópia, o que a produção já usa: o indexador (`buildStoreIndex` com `IndexScope` por região), o ligador de peças por
 * `product_cluster_id` (`linkGarmentBindings` + `upsertPieces`) e o parser/casador de coleções (`parseCollectionsPage` + `matcherForStore`).
 *
 * Dois modos, nunca misturados num mesmo arquivo:
 *   - `producao`: só o que a INK já vende — o mesmo portão do sync de produção (visível + publicado + imagem https + URL). Produto oculto
 *     NÃO entra no catálogo por construção (as peças ocultas-mas-vendáveis de tipo de peça seguem a regra de produção: só ligam a um
 *     clássico que já está no catálogo).
 *   - `simulacao`: o anterior MAIS a Camiseta base Norte/CO ainda oculta (com imagem), marcada `simulated: true`, como se a ativação já
 *     tivesse acontecido. Só para prévia local: o arquivo sai com `source.simulation = true`, que o storefront recusa sem a liberação
 *     explícita de simulação (src/lib/catalog/commerce-mode.ts), e o link de compra de um item simulado é sempre nulo (commerce.ts).
 */

export const LOJA_UNICA: CommerceStoreKey = "use-sul";
export type ModoGeracao = "producao" | "simulacao";

/** Por que um produto da loja única não está no catálogo servido. Cada um é contado e listado, nunca descartado em silêncio. */
export type Situacao =
  | "publicado"
  | "simulado"
  | "oculto"
  | "sem-imagem"
  | "regiao-pendente"
  | "excluido-indexador";

export type LinhaSituacao = {
  id: string;
  nome: string;
  tipo: number | null;
  regiao: RegionSlug | "desconhecida" | "conflito";
  situacao: Situacao;
  classe: "desenho" | "merch" | "excluido" | null;
  detalhe?: string;
};

export type ResultadoLojaUnica = {
  catalogo: CatalogSnapshot;
  pecas: GarmentIndex;
  statsPecas: GarmentLinkStats;
  /** Uma linha por produto lido da loja única que NÃO é peça de tipo de peça ligada: o que entrou, o que ficou de fora e por quê. */
  situacoes: LinhaSituacao[];
};

const publicado = (p: ProdutoBruto) => p.visible && p.status === "published";
const servivel = (p: ProdutoBruto) => Boolean(p.image?.startsWith("https://") && p.url?.startsWith("https://") && p.slug);

/** Peça que a vitrine pode simular como ativada: Camiseta base de um desenho Norte/CO hoje oculto. Merch e Sul nunca são simulados. */
function candidataSimulacao(s: ProdutoSul): boolean {
  return (s.regiao === "norte" || s.regiao === "centro-oeste") && s.produto.typeId === 1 && s.classificado?.tipo === "desenho" && !publicado(s.produto);
}

export function montarLojaUnica(sul: ReadonlyMap<string, ProdutoSul>, opts: { modo: ModoGeracao; syncedAt: string; fonte: Omit<Extract<CatalogSource, { mode: "single-store" }>, "mode" | "storeKey" | "simulation"> }): ResultadoLojaUnica {
  const { modo, syncedAt } = opts;
  const loja: StoreIndex = { commerceStoreKey: LOJA_UNICA, syncedAt, productCount: 0, bindings: [], merch: [], excluded: [] };
  const situacoes: LinhaSituacao[] = [];
  const noCatalogo = new Set<string>();

  for (const regiao of Object.keys(REGIONS) as RegionSlug[]) {
    for (const s of sul.values()) {
      if (s.regiao !== regiao || !s.classificado) continue;
      const p = s.produto;
      const linha = (situacao: Situacao, detalhe?: string): LinhaSituacao => ({ id: p.id, nome: p.name, tipo: p.typeId, regiao, situacao, classe: s.classificado?.tipo ?? null, ...(detalhe ? { detalhe } : {}) });
      const ePublicado = publicado(p);
      const simular = modo === "simulacao" && candidataSimulacao(s);
      if (!ePublicado && !simular) {
        // Oculto: só entra (como peça) se for tipo de peça ligado a um clássico do catálogo — decidido abaixo, pelo ligador.
        if (candidataSimulacao(s)) situacoes.push(linha(servivel(p) ? "oculto" : "sem-imagem", servivel(p) ? "Camiseta base oculta: entra só na simulação" : "Camiseta base oculta e sem imagem de vitrine"));
        continue;
      }
      if (!servivel(p)) {
        situacoes.push(linha("sem-imagem", "sem imagem https ou URL de compra: não vira card (nenhum mockup substituto)"));
        continue;
      }
      const c = s.classificado;
      // Cidade herdada de outra peça do cluster é recurso da RECONCILIAÇÃO (achar a peça nova), não regra do catálogo servido: o indexador de
      // produção exclui esses produtos (ex.: "Votouro | Origem Localidade RS" com a tag "Camiseta Regional com Identidade"). Mantém a mesma
      // decisão aqui, para a região servir exatamente o que serve hoje.
      if (c.tipo === "desenho" && c.viaCluster) {
        loja.excluded.push({ inkProductId: p.id, commerceStoreKey: LOJA_UNICA, name: p.name, reason: "city-not-found", detail: `cidade só pelo cluster ${c.viaCluster}` });
        loja.productCount++;
        situacoes.push(linha("excluido-indexador", `cidade só pelo cluster ${c.viaCluster} (o indexador de produção não aceita)`));
        continue;
      }
      if (c.tipo === "excluido") {
        loja.excluded.push({ inkProductId: p.id, commerceStoreKey: LOJA_UNICA, name: p.name, reason: (c.motivoExclusao?.split(" ")[0] ?? "city-not-found") as never, detail: c.motivoExclusao?.split(" ").slice(1).join(" ") || undefined });
        loja.productCount++;
        situacoes.push(linha("excluido-indexador", c.motivoExclusao));
        continue;
      }
      loja.productCount++;
      noCatalogo.add(p.id);
      const marca = simular ? ({ simulated: true } as const) : {};
      if (c.tipo === "desenho") loja.bindings.push({ ...c.vinculo!, syncedAt, totalSalesCount: p.sales, ...marca });
      else
        loja.merch.push({
          inkProductId: p.id,
          commerceStoreKey: LOJA_UNICA,
          regionSlug: regiao,
          name: p.name.replace(/\s+/g, " ").trim(),
          slug: p.slug,
          storeProductUrl: p.url!,
          imageUrl: p.image!,
          price: p.price === null ? null : Number(p.price),
          totalSalesCount: p.sales,
          ...(p.clusterId ? { productClusterId: p.clusterId } : {}),
          ...(p.typeId !== null ? { garmentTypeId: p.typeId } : {}),
          syncedAt,
          ...marca,
        });
      situacoes.push(linha(simular ? "simulado" : "publicado"));
    }
  }

  // Sem região confiável: listados, nunca atribuídos ao Sul por estarem na loja Sul.
  for (const s of sul.values()) {
    if (s.regiao === "desconhecida" || s.regiao === "conflito") {
      situacoes.push({ id: s.produto.id, nome: s.produto.name, tipo: s.produto.typeId, regiao: s.regiao, situacao: "regiao-pendente", classe: null, detalhe: s.diagnostico });
    }
  }

  // Peças por tipo: o MESMO ligador do sync de peças de produção, contra os clássicos que acabaram de entrar no catálogo. Só peças de
  // região confirmada; oculto-mas-vendável é a regra de produção para tipo de peça, e o clássico simulado arrasta só as peças do seu cluster.
  const candidatas: GarmentSourceProduct[] = [];
  for (const s of sul.values()) {
    if (s.regiao === "desconhecida" || s.regiao === "conflito" || noCatalogo.has(s.produto.id)) continue;
    const p = s.produto;
    if (!servivel(p)) continue;
    candidatas.push({ id: p.id, storeKey: LOJA_UNICA, name: p.name, slug: p.slug, storeProductUrl: p.url!, imageUrl: p.image!, price: p.price === null ? null : Number(p.price), clusterId: p.clusterId, garmentTypeId: p.typeId, createdAt: p.createdAt });
  }
  const { bindings: pecasLigadas, stats } = linkGarmentBindings(candidatas, loja.bindings, syncedAt);
  const pecas = emptyGarmentIndex();
  const clusters: Record<string, GarmentTuple[]> = {};
  upsertPieces(clusters, pecasLigadas);
  pecas.stores[LOJA_UNICA] = { syncedAt, clusters };

  return {
    catalogo: { version: 1, source: { mode: "single-store", storeKey: LOJA_UNICA, simulation: modo === "simulacao", ...opts.fonte }, stores: { [LOJA_UNICA]: loja } },
    pecas,
    statsPecas: stats,
    situacoes,
  };
}

// ─── Legado (três lojas), montado da MESMA leitura: a base de comparação de cobertura e o modo atual da prévia ─────────────────────────

/** O portão do sync de produção (`normalizeInkProduct`): publicado, visível, imagem e URL https. */
export function brutoParaProducao(p: ProdutoBruto, storeKey: CommerceStoreKey): InkProductNormalized | null {
  if (!publicado(p) || !servivel(p)) return null;
  return { ...paraProdutoIndexavel(p, storeKey), garmentTypeId: p.typeId };
}

/** O que `catalog:sync` + `garments:sync` gravariam hoje para uma loja regional, a partir da leitura bruta. */
export function montarLojaLegado(storeKey: CommerceStoreKey, produtos: readonly ProdutoBruto[], syncedAt: string): { indice: StoreIndex; clusters: Record<string, GarmentTuple[]>; stats: GarmentLinkStats } {
  const indice = buildStoreIndex(storeKey, produtos.map((p) => brutoParaProducao(p, storeKey)).filter((p): p is InkProductNormalized => p !== null), syncedAt);
  const candidatas: GarmentSourceProduct[] = produtos
    .filter(servivel)
    .map((p) => ({ id: p.id, storeKey, name: p.name, slug: p.slug, storeProductUrl: p.url!, imageUrl: p.image!, price: p.price === null ? null : Number(p.price), clusterId: p.clusterId, garmentTypeId: p.typeId, createdAt: p.createdAt }));
  const { bindings, stats } = linkGarmentBindings(candidatas, indice.bindings, syncedAt);
  const clusters: Record<string, GarmentTuple[]> = {};
  upsertPieces(clusters, bindings);
  return { indice, clusters, stats };
}

// ─── Coleções ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Coleções de uma loja casadas com o catálogo gerado, pelo MESMO parser do sync de coleções. As páginas são as respostas da INK como
 * vieram (`unificado:ler` grava em colecoes-paginas-<loja>.json). Lança se uma página estiver fora do formato: meia coleção não vira arquivo.
 */
export function montarColecoes(storeKey: CommerceStoreKey, paginas: readonly unknown[], indice: StoreIndex, syncedAt: string): StoreCollections {
  const match = matcherForStore(indice);
  const todas: CollectionRecord[] = [];
  let totalCount = 0;
  for (const pagina of paginas) {
    const parsed = parseCollectionsPage(pagina, match);
    if (!parsed.ok) throw new Error(`coleções de ${storeKey}: ${parsed.error}`);
    totalCount = parsed.value.totalCount;
    todas.push(...parsed.value.collections);
  }
  if (todas.length !== totalCount) throw new Error(`coleções de ${storeKey}: ${todas.length} lidas, a INK informa ${totalCount}`);
  return { commerceStoreKey: storeKey, syncedAt, catalogSyncedAt: indice.syncedAt, totalCount, collections: sortCollections(todas) };
}
