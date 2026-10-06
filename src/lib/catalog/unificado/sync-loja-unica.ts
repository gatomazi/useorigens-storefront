import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchStoreProducts, type FetchProgress } from "../../ink/client";
import { requireAtLeastOneInkToken } from "../../config/env";
import { tokenFor } from "../../ink/config";
import type { InkProductNormalized } from "../types";
import { shouldPromoteCollections } from "../collections";
import { readCollectionsFile, collectionsPath, writeCollectionsFile } from "../collections-file";
import { singleStoreDataDir } from "../commerce-mode";
import { readSnapshot, snapshotPath } from "../snapshot-file";
import { promoteSnapshot, shouldPromoteStore } from "../sync-service";
import { lerEstadoMigracao } from "./estado-migracao";
import { lerColecoes } from "./leitura";
import { LOJA_UNICA, montarColecoes, montarLojaUnica } from "./loja-unica";
import type { ProdutoBruto } from "./produto-bruto";
import { classificarDesenhosSul, classificarRegioesSul, COLECAO_SUL, COLECAO_ZZ_CO, COLECAO_ZZ_NO, corteDaMigracao, MAPA_VERSAO } from "./reconciliar";

/**
 * The REAL sync of the single store (`npm run catalog:sync -- --loja-unica`), the counterpart of `syncCatalog` for the regional stores.
 * Same INK reads the production sync already makes — `GET /v1/stores/products?visible_in_store=true` (published + visible only, so a
 * hidden product can never enter: there is no simulation here by construction) and `GET /v1/stores/collections` (regional segmentation
 * SUL / ZZ - CO / ZZ - NO, plus every collection for collections-snapshot.json) — classified by the same functions as the reconciliation
 * and assembled by the same `montarLojaUnica`. Writes ONLY inside <snapshot dir>/loja-unica/; the regional files are never touched.
 *
 * Inputs it does not fetch: the migrated products' identity (`identidade-migracao.jsonl`, the migrator state + complement, written by
 * `unificado:gerar`), required because a migrated Gentílico has no city in its name or tags. Without it the sync refuses (no write).
 * Last-known-good: a store index that shrinks suspiciously is not promoted (`shouldPromoteStore`), nor is a partial collections read.
 */
export type LojaUnicaSyncResult =
  | { ok: true; changed: boolean; productCount: number; bindingCount: number; merchCount: number; excludedCount: number; regiaoPendente: number; collections: number | null; requests?: number }
  | { ok: false; error: string };

export type LojaUnicaSyncDeps = {
  fetchProducts?: (onProgress?: FetchProgress, max?: number) => Promise<{ products: InkProductNormalized[]; requests?: number }>;
  fetchCollections?: () => Promise<{ membros: { id: number; productIds: string[] }[]; paginas: unknown[] }>;
  now?: () => Date;
};

export const IDENTITY_FILE = "identidade-migracao.jsonl";

/** A visible+published product as the classification reads it (the fields the regional sync already keeps). */
export function produtoPublicado(p: InkProductNormalized): ProdutoBruto {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    url: p.storeProductUrl,
    image: p.imageUrl,
    price: p.price === null ? null : String(p.price),
    promotionalPrice: null,
    clusterId: p.clusterId,
    typeId: p.garmentTypeId ?? null,
    typeName: null,
    status: "published",
    visible: true,
    approval: null,
    tags: p.tags,
    createdAt: p.createdAt,
    updatedAt: null,
    sales: p.totalSalesCount,
    variants: { total: 0, available: 0, colors: [], models: [] },
  };
}

export async function syncLojaUnica(opts: { dataDir?: string; onProgress?: FetchProgress; maxRequests?: number; deps?: LojaUnicaSyncDeps } = {}): Promise<LojaUnicaSyncResult> {
  const dir = opts.dataDir ?? singleStoreDataDir();
  const deps = opts.deps ?? {};
  if (!deps.fetchProducts) {
    requireAtLeastOneInkToken();
    if (!tokenFor(LOJA_UNICA)) return { ok: false, error: `sem credencial para ${LOJA_UNICA}` };
  }
  let identidade: string;
  try {
    identidade = await readFile(path.join(dir, IDENTITY_FILE), "utf8");
  } catch {
    return { ok: false, error: `falta ${path.join(dir, IDENTITY_FILE)} (identidade dos produtos migrados) — gere com npm run unificado:gerar -- --modo=producao; nada foi gravado` };
  }
  const estado = lerEstadoMigracao(identidade);
  const now = (deps.now ?? (() => new Date()))();
  const syncedAt = now.toISOString();

  try {
    const [{ products, requests }, colecoes] = await Promise.all([
      (deps.fetchProducts ?? ((p, m) => fetchStoreProducts(LOJA_UNICA, p, m)))(opts.onProgress, opts.maxRequests),
      (deps.fetchCollections ?? (() => lerColecoes(LOJA_UNICA, (nome) => /^(ZZ|SUL)\b/i.test(nome))))(),
    ]);
    const membros = (id: number) => {
      const c = colecoes.membros.find((m) => m.id === id);
      if (!c) throw new Error(`coleção regional ${id} não encontrada na loja ${LOJA_UNICA}`);
      return new Set(c.productIds);
    };
    const sul = classificarRegioesSul(products.map(produtoPublicado), { sul: membros(COLECAO_SUL), co: membros(COLECAO_ZZ_CO), no: membros(COLECAO_ZZ_NO) }, estado, corteDaMigracao(estado, estado.primeiroRegistro));
    classificarDesenhosSul(sul, estado);
    const runId = `sync-${syncedAt.slice(0, 19).replace(/[:T-]/g, "")}`;
    const montado = montarLojaUnica(sul, { modo: "producao", syncedAt, fonte: { runId, generatedAt: syncedAt, mapVersion: MAPA_VERSAO, identitySha256: createHash("sha256").update(identidade).digest("hex") } });
    if (montado.catalogo.source?.mode !== "single-store" || montado.catalogo.source.simulation) throw new Error("montagem fora do modo produção — recusada");
    const next = montado.catalogo.stores[LOJA_UNICA]!;

    const file = snapshotPath(dir);
    const previous = await readSnapshot(file);
    const decision = shouldPromoteStore(previous.stores[LOJA_UNICA], next);
    if (!decision.promote) return { ok: false, error: decision.reason };
    const changed = JSON.stringify(previous.stores[LOJA_UNICA]?.bindings ?? null) !== JSON.stringify(next.bindings) || JSON.stringify(previous.stores[LOJA_UNICA]?.merch ?? null) !== JSON.stringify(next.merch);
    await promoteSnapshot(montado.catalogo, file);

    // Collections of the single store, matched against the catalog just promoted (same parser as `collections:sync`).
    let collections: number | null = null;
    const colFile = collectionsPath(dir);
    const candidate = montarColecoes(LOJA_UNICA, colecoes.paginas, next, syncedAt);
    const current = readCollectionsFile(colFile).snapshot;
    if (shouldPromoteCollections(current.stores[LOJA_UNICA], candidate).promote) {
      await writeCollectionsFile({ version: 2, stores: { [LOJA_UNICA]: candidate } }, colFile);
      collections = candidate.collections.length;
    }
    return {
      ok: true,
      changed,
      productCount: next.productCount,
      bindingCount: next.bindings.length,
      merchCount: next.merch.length,
      excludedCount: next.excluded.length,
      regiaoPendente: montado.situacoes.filter((l) => l.situacao === "regiao-pendente").length,
      collections,
      requests,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
