import "server-only";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { INK_API_BASE_URL, tokenFor } from "../../ink/config";
import type { CommerceStoreKey } from "../../geo/regions";
import { assertForaDaProducao } from "./destino";
import { reduzirProdutoBruto, type ProdutoBruto } from "./produto-bruto";

/**
 * Leitura em MODO SOMBRA da loja INK unificada (docs/migracao-ink/origens-ink-reconciliacao.md): todos os produtos de uma loja, visíveis
 * E ocultos, sem o filtro `visible_in_store=true` do sync de produção. Só GET. Grava em diretório próprio (nunca no `catalogSnapshotDir`),
 * página a página, para retomar depois de queda de rede sem reler o que já veio — uma loja inteira são ~1.600 páginas.
 *
 * Mesmo orçamento do resto da integração: 100 req/min por loja, compartilhado; aqui 1 requisição a cada 1,5 s, nunca em paralelo dentro
 * da loja. 429/5xx/rede repetem com backoff; a página só é gravada depois de lida inteira.
 */
const PACE_MS = 1500;
const BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const;
const PER_PAGE = 100;
const TIMEOUT_MS = 60_000;

/** Prazo total da requisição INCLUINDO o corpo: medido em 05/10, a INK às vezes trava no meio da resposta e o fetch fica 15 min parado. */
async function comPrazo<T>(ms: number, trabalho: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<never>((_, rej) => {
    timer = setTimeout(() => {
      ctrl.abort();
      rej(new Error(`sem resposta completa em ${ms / 1000}s`));
    }, ms);
  });
  try {
    return await Promise.race([trabalho(ctrl.signal), prazo]);
  } finally {
    clearTimeout(timer);
  }
}

export type LinhaPagina = { page: number; totalPages: number; totalCount: number; lidoEm: string; products: ProdutoBruto[] };

export function arquivoDaLoja(dir: string, storeKey: CommerceStoreKey): string {
  return path.join(dir, `${storeKey}.jsonl`);
}

/** Última página já gravada (0 = nada lido). */
export function ultimaPaginaGravada(arquivo: string): { page: number; totalPages: number } {
  if (!existsSync(arquivo)) return { page: 0, totalPages: 0 };
  let ultima = { page: 0, totalPages: 0 };
  for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
    if (!linha.trim()) continue;
    try {
      const l = JSON.parse(linha) as LinhaPagina;
      if (l.page > ultima.page) ultima = { page: l.page, totalPages: l.totalPages };
    } catch {
      // Linha cortada no meio por queda do processo: ignorada; a página é relida.
    }
  }
  return ultima;
}

/** Produtos lidos de uma loja, deduplicados por id (a paginação anda enquanto a loja recebe produtos novos: repetição é esperada). */
export function carregarLeitura(arquivo: string): { produtos: ProdutoBruto[]; paginas: number; totalPages: number; totalCount: number; repetidos: number } {
  const porId = new Map<string, ProdutoBruto>();
  let paginas = 0;
  let totalPages = 0;
  let totalCount = 0;
  let repetidos = 0;
  const vistas = new Set<number>();
  for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
    if (!linha.trim()) continue;
    let l: LinhaPagina;
    try {
      l = JSON.parse(linha) as LinhaPagina;
    } catch {
      continue;
    }
    if (!vistas.has(l.page)) paginas++;
    vistas.add(l.page);
    totalPages = Math.max(totalPages, l.totalPages);
    totalCount = Math.max(totalCount, l.totalCount);
    for (const p of l.products) {
      if (porId.has(p.id)) repetidos++;
      porId.set(p.id, p);
    }
  }
  return { produtos: [...porId.values()], paginas, totalPages, totalCount, repetidos };
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function lerLojaInteira(
  storeKey: CommerceStoreKey,
  dir: string,
  opts: { maxPaginas?: number; log?: (msg: string) => void } = {},
): Promise<{ paginasLidas: number; ultimaPagina: number; totalPages: number; completo: boolean }> {
  assertForaDaProducao(dir);
  const token = tokenFor(storeKey);
  if (!token) throw new Error(`sem credencial para ${storeKey}`);
  const log = opts.log ?? (() => {});
  mkdirSync(dir, { recursive: true });
  const arquivo = arquivoDaLoja(dir, storeKey);
  if (!existsSync(arquivo)) writeFileSync(arquivo, "");

  const retomada = ultimaPaginaGravada(arquivo);
  let page = retomada.page + 1;
  let totalPages = retomada.totalPages || page;
  let lidas = 0;
  if (retomada.page) log(`${storeKey}: retomando na página ${page}/${totalPages}`);

  while (page <= totalPages) {
    if (opts.maxPaginas !== undefined && lidas >= opts.maxPaginas) break;
    const url = `${INK_API_BASE_URL}/v1/stores/products?per_page=${PER_PAGE}&page=${page}`;
    let body: { products?: unknown; total_pages?: unknown; total_count?: unknown } | undefined;
    for (let tentativa = 0; ; tentativa++) {
      let status = 0;
      let erro = "";
      try {
        // Somente leitura: GET, credencial só no cabeçalho, nunca impressa.
        const r = await comPrazo(TIMEOUT_MS, async (signal) => {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
          return { status: res.status, body: res.ok ? ((await res.json()) as typeof body) : (await res.text().catch(() => ""), undefined) };
        });
        status = r.status;
        if (r.body) {
          body = r.body;
          break;
        }
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
      const transitorio = status === 0 || status === 429 || status >= 500;
      if (!transitorio || tentativa >= BACKOFF_MS.length) {
        throw new Error(`${storeKey} página ${page}: ${status ? `INK respondeu ${status}` : `falha de rede (${erro})`}`);
      }
      log(`${storeKey}: página ${page} ${status || erro} — nova tentativa em ${BACKOFF_MS[tentativa] / 1000}s`);
      await dormir(BACKOFF_MS[tentativa]);
    }
    if (!body || !Array.isArray(body.products) || typeof body.total_pages !== "number") {
      throw new Error(`${storeKey} página ${page}: resposta da INK em formato inesperado`);
    }
    totalPages = body.total_pages;
    const linha: LinhaPagina = {
      page,
      totalPages,
      totalCount: typeof body.total_count === "number" ? body.total_count : 0,
      lidoEm: new Date().toISOString(),
      products: body.products.map((raw) => reduzirProdutoBruto(raw)).filter((p): p is ProdutoBruto => p !== null),
    };
    appendFileSync(arquivo, `${JSON.stringify(linha)}\n`);
    lidas++;
    if (page % 25 === 0 || page === totalPages) log(`${storeKey}: página ${page}/${totalPages}`);
    page++;
    if (page <= totalPages) await dormir(PACE_MS);
  }
  return { paginasLidas: lidas, ultimaPagina: page - 1, totalPages, completo: page > totalPages };
}

/** Coleções (categorias) de uma loja COM os `product_ids` — só as que a reconciliação usa (segmentação regional), filtradas por `quer`. */
export async function lerColecoes(
  storeKey: CommerceStoreKey,
  quer: (nome: string) => boolean,
): Promise<{ todas: { id: number; name: string; isAvailable: boolean; reported: number }[]; membros: { id: number; name: string; productIds: string[] }[] }> {
  const token = tokenFor(storeKey);
  if (!token) throw new Error(`sem credencial para ${storeKey}`);
  const todas: { id: number; name: string; isAvailable: boolean; reported: number }[] = [];
  const membros: { id: number; name: string; productIds: string[] }[] = [];
  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    let body: { collections?: unknown; total_pages?: unknown } | undefined;
    for (let tentativa = 0; ; tentativa++) {
      const res = await fetch(`${INK_API_BASE_URL}/v1/stores/collections?per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch(() => null);
      if (res?.ok) {
        body = (await res.json()) as typeof body;
        break;
      }
      if (tentativa >= BACKOFF_MS.length) throw new Error(`${storeKey} coleções página ${page}: ${res ? res.status : "rede"}`);
      await dormir(BACKOFF_MS[tentativa]);
    }
    if (!body || !Array.isArray(body.collections) || typeof body.total_pages !== "number") throw new Error(`${storeKey} coleções: formato inesperado`);
    totalPages = body.total_pages;
    for (const c of body.collections as Record<string, unknown>[]) {
      const ids = Array.isArray(c.product_ids) ? (c.product_ids as unknown[]).map(String) : [];
      const item = { id: Number(c.id), name: String(c.name ?? ""), isAvailable: c.is_available === true, reported: ids.length };
      todas.push(item);
      if (quer(item.name)) membros.push({ id: item.id, name: item.name, productIds: ids });
    }
    if (page < totalPages) await dormir(PACE_MS);
  }
  return { todas, membros };
}
