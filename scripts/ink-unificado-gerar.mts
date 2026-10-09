// Geração do conjunto de dados COMPLETO que o storefront consome, nos dois modos de comércio, a partir de UMA leitura das lojas INK.
// Offline: lê só o que `unificado:ler` gravou e a cópia preservada do estado do migrador. Não fala com a INK, nunca grava no diretório de
// snapshots servido (data/generated/ ou CATALOG_SNAPSHOT_DIR). Doc: docs/migracao-ink/origens-storefront-unificado-preparacao.md
//
//   npm run unificado:gerar -- --estado=data/unificado/estado/migracao-estado-<hash>.jsonl [--complemento=docs/migracao-ink/estado-complementar-*.jsonl.gz]
//                              [--modo=simulacao|producao] [--dir=<raiz da leitura>] [--saida=<dir>] [--site-config=<published.json da prévia>]
//
// Saída: <saida>/<runId>/ é um CATALOG_SNAPSHOT_DIR completo:
//   catalog-snapshot.json, garment-index.json, collections-snapshot.json      modo atual (três lojas), da MESMA leitura — base de comparação
//   loja-unica/catalog-snapshot.json (source.mode=single-store), garment-index.json, collections-snapshot.json, referencias-antigas.json,
//   loja-unica/identidade-migracao.jsonl (estado + complemento: identidade dos produtos migrados, para o sync da loja única)
//   relatorio/cobertura.json, relatorio/situacoes.jsonl, relatorio/pendencias-regiao.jsonl, relatorio/mapa-pendencias.jsonl
//   site-config/published.json (só com --site-config: Norte e Centro-Oeste lançados na PRÉVIA)
//   manifesto.json (gravado por último, com o sha256 de cada arquivo)
// A pasta é montada em <saida>/.tmp-<runId> e só vira <saida>/<runId> inteira; `<saida>/atual` (symlink) troca de forma atômica e só
// depois disso. Uma falha deixa a geração anterior e o `atual` intactos. Nada é apagado: cada execução é uma pasta nova.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { REGIONS, REGION_SLUGS, type CommerceStoreKey, type RegionSlug } from "../src/lib/geo/regions";
import { cityById } from "../src/lib/geo/cities";
import { localityById } from "../src/lib/geo/localities";
import { assertForaDaProducao, diretorioSombraPadrao } from "../src/lib/catalog/unificado/destino";
import { lerEstadoMigracao } from "../src/lib/catalog/unificado/estado-migracao";
import { arquivoDaLoja, carregarLeitura } from "../src/lib/catalog/unificado/leitura";
import { classificarDesenhosSul, classificarRegioesSul, corteDaMigracao, COLECAO_SUL, COLECAO_ZZ_CO, COLECAO_ZZ_NO, MAPA_VERSAO, reconciliar } from "../src/lib/catalog/unificado/reconciliar";
import { LOJA_UNICA, montarColecoes, montarLojaLegado, montarLojaUnica, type ModoGeracao } from "../src/lib/catalog/unificado/loja-unica";
import { collectionState, searchMembers, MIN_USABLE_PRODUCTS, type CollectionsSnapshot, type StoreCollections } from "../src/lib/catalog/collections";
import { DESIGN_FAMILIES } from "../src/lib/catalog/families";
import { isSubLocality, localityKeyOf } from "../src/lib/catalog/locality-binding";
import type { GarmentIndex } from "../src/lib/catalog/garment-index-file";
import type { CatalogSnapshot, StoreIndex, UnrankedBinding } from "../src/lib/catalog/types";
import { REFERENCES_FILE, type OldReferencesFile } from "../src/lib/catalog/references";
import { SINGLE_STORE_DIR } from "../src/lib/catalog/commerce-mode";

const argv = process.argv.slice(2);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const raiz = opt("dir") ?? diretorioSombraPadrao();
const leitura = path.join(raiz, "leitura");
const saidaBase = path.resolve(opt("saida") ?? path.join(raiz, "previa"));
const modo = (opt("modo") ?? "simulacao") as ModoGeracao;
if (modo !== "simulacao" && modo !== "producao") throw new Error(`--modo=${modo} inválido: use simulacao ou producao`);
const estadoArq = opt("estado");
if (!estadoArq || !existsSync(estadoArq)) throw new Error("passe --estado=<cópia preservada do .migracao-estado.jsonl> (ver data/unificado/estado/)");
assertForaDaProducao(saidaBase);

const t0 = Date.now();
const log = (m: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s ${m}`);

// ─── Entradas ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const lerTexto = (arq: string) => (arq.endsWith(".gz") ? gunzipSync(readFileSync(arq)).toString("utf8") : readFileSync(arq, "utf8"));
const complementoArq = opt("complemento");
const conteudoEstado = lerTexto(estadoArq) + (complementoArq ? (lerTexto(estadoArq).endsWith("\n") ? "" : "\n") + lerTexto(complementoArq) : "");
const hashEstado = createHash("sha256").update(conteudoEstado).digest("hex");
const estado = lerEstadoMigracao(conteudoEstado);
log(`estado: ${estado.linhas} linhas (${complementoArq ? "com complemento" : "sem complemento"}), ${estado.itens.size} itens, sha256 ${hashEstado.slice(0, 16)}`);

const carregar = (k: CommerceStoreKey) => {
  const arq = arquivoDaLoja(leitura, k);
  if (!existsSync(arq)) throw new Error(`falta a leitura de ${k} (${arq}) — rode npm run unificado:ler`);
  const l = carregarLeitura(arq);
  if (l.paginas < l.totalPages && !argv.includes("--aceitar-parcial")) throw new Error(`${k}: leitura incompleta (${l.paginas}/${l.totalPages})`);
  return l;
};
const lojas = { "use-sul": carregar("use-sul"), "use-norte": carregar("use-norte"), "use-centro": carregar("use-centro") } as const;
log(`leitura: ${Object.entries(lojas).map(([k, l]) => `${k}=${l.produtos.length}`).join(", ")}`);

const segmentacao = JSON.parse(readFileSync(path.join(leitura, "colecoes-use-sul.json"), "utf8")) as { lidoEm: string; membros: { id: number; productIds: string[] }[] };
const membros = (id: number) => {
  const c = segmentacao.membros.find((m) => m.id === id);
  if (!c) throw new Error(`coleção regional ${id} não está em colecoes-use-sul.json`);
  return new Set(c.productIds);
};
const paginasColecoes = (k: CommerceStoreKey): unknown[] | null => {
  const arq = path.join(leitura, `colecoes-paginas-${k}.json`);
  return existsSync(arq) ? (JSON.parse(readFileSync(arq, "utf8")) as { paginas: unknown[] }).paginas : null;
};

// ─── Classificação e mapa (mesmas funções da reconciliação) ─────────────────────────────────────────────────────────────────────────
const sul = classificarRegioesSul(lojas["use-sul"].produtos, { sul: membros(COLECAO_SUL), co: membros(COLECAO_ZZ_CO), no: membros(COLECAO_ZZ_NO) }, estado, corteDaMigracao(estado, estado.primeiroRegistro));
classificarDesenhosSul(sul, estado);
const mapa = reconciliar({ antigas: [{ storeKey: "use-norte", produtos: lojas["use-norte"].produtos }, { storeKey: "use-centro", produtos: lojas["use-centro"].produtos }], sul, estado });
log(`classificação e mapa: ${sul.size} peças da Sul, ${mapa.length} linhas no mapa`);

// ─── Montagem ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const agora = new Date().toISOString();
const runId = `${agora.slice(0, 19).replace(/[:T-]/g, "")}-${modo === "simulacao" ? "sim" : "prod"}-e${hashEstado.slice(0, 8)}`;
const unica = montarLojaUnica(sul, { modo, syncedAt: agora, fonte: { runId, generatedAt: agora, mapVersion: MAPA_VERSAO, identitySha256: hashEstado } });
const indiceUnico = unica.catalogo.stores[LOJA_UNICA]!;

const legado: CatalogSnapshot = { version: 1, stores: {} };
const pecasLegado: GarmentIndex = { version: 1, stores: {} };
for (const k of ["use-sul", "use-norte", "use-centro"] as const) {
  const { indice, clusters } = montarLojaLegado(k, lojas[k].produtos, agora);
  legado.stores[k] = indice;
  pecasLegado.stores[k] = { syncedAt: agora, clusters };
}

const colecoesUnica: CollectionsSnapshot = { version: 2, stores: {} };
const colecoesLegado: CollectionsSnapshot = { version: 2, stores: {} };
for (const k of ["use-sul", "use-norte", "use-centro"] as const) {
  const paginas = paginasColecoes(k);
  if (!paginas) {
    log(`AVISO: sem colecoes-paginas-${k}.json — rode npm run unificado:ler -- --so-colecoes; coleções de ${k} ficam vazias`);
    continue;
  }
  colecoesLegado.stores[k] = montarColecoes(k, paginas, legado.stores[k]!, agora);
  if (k === LOJA_UNICA) colecoesUnica.stores[k] = montarColecoes(k, paginas, indiceUnico, agora);
}
log(`montado: loja única ${indiceUnico.bindings.length} vínculos / ${indiceUnico.merch.length} merch; legado ${Object.values(legado.stores).map((s) => s!.bindings.length).join("+")} vínculos`);

// Referências antigas → novas: só `confirmado`. Ausente, ambíguo e sem chave não entram (resolvem como indisponível, nunca por título).
const referencias: OldReferencesFile = { version: 1, mapVersion: MAPA_VERSAO, runId, stores: {} };
for (const l of mapa) {
  if (l.status !== "confirmado" || !l.idNovo) continue;
  (referencias.stores[l.lojaAntiga] ??= {})[l.idAntigo] = l.idNovo;
}

// ─── Cobertura por região e família: legado (lojas regionais de hoje) × loja única ─────────────────────────────────────────────────
type Lado = { desenhos: Set<string>; porFamilia: Record<string, number>; cidades: Set<string>; localidades: Set<string>; merch: number; pecas: number; tiposDePeca: Record<string, number>; colecoesUsaveis: string[]; simulados: number };
const regiaoDoVinculo = (b: UnrankedBinding): RegionSlug | undefined => (localityById(localityKeyOf(b)) ?? cityById(b.cityId))?.regionSlug;
function lado(indices: StoreIndex[], pecas: GarmentIndex, colecoes: StoreCollections | undefined, regiao: RegionSlug, filtrarColecaoPorRegiao: boolean): Lado {
  const out: Lado = { desenhos: new Set(), porFamilia: {}, cidades: new Set(), localidades: new Set(), merch: 0, pecas: 0, tiposDePeca: {}, colecoesUsaveis: [], simulados: 0 };
  const clustersDaRegiao = new Map<string, CommerceStoreKey>();
  const regiaoDoId = new Map<string, RegionSlug | undefined>();
  for (const idx of indices) {
    for (const b of idx.bindings) {
      const r = regiaoDoVinculo(b);
      regiaoDoId.set(b.inkProductId, r);
      if (r !== regiao || isSubLocality(b)) continue;
      const k = `${localityKeyOf(b)}|${b.designFamily}`;
      if (!out.desenhos.has(k)) out.porFamilia[b.designFamily] = (out.porFamilia[b.designFamily] ?? 0) + 1;
      out.desenhos.add(k);
      out.localidades.add(localityKeyOf(b));
      if (localityById(localityKeyOf(b))?.type === "municipality") out.cidades.add(localityKeyOf(b));
      if (b.simulated) out.simulados++;
      if (b.productClusterId) clustersDaRegiao.set(b.productClusterId, idx.commerceStoreKey);
    }
    for (const m of idx.merch) {
      regiaoDoId.set(m.inkProductId, m.regionSlug);
      if (m.regionSlug === regiao) out.merch++;
    }
  }
  for (const [cluster, loja] of clustersDaRegiao) {
    for (const t of pecas.stores[loja]?.clusters[cluster] ?? []) {
      out.pecas++;
      out.tiposDePeca[String(t[0])] = (out.tiposDePeca[String(t[0])] ?? 0) + 1;
    }
  }
  for (const c of colecoes?.collections ?? []) {
    if (!collectionState(c, new Set()).selectable || c.matchedCount < MIN_USABLE_PRODUCTS) continue;
    if (filtrarColecaoPorRegiao) {
      const ids = searchMembers(c) ?? c.memberIds;
      if (!ids.length || !ids.every((id) => regiaoDoId.get(id) === regiao)) continue;
    }
    out.colecoesUsaveis.push(c.name);
  }
  return out;
}
const cobertura: Record<string, unknown> = {};
const faltas: unknown[] = [];
for (const regiao of REGION_SLUGS) {
  const lojaRegional = REGIONS[regiao].storeKey;
  const hoje = lado([legado.stores[lojaRegional]!], pecasLegado, colecoesLegado.stores[lojaRegional], regiao, false);
  const futuro = lado([indiceUnico], unica.pecas, colecoesUnica.stores[LOJA_UNICA], regiao, true);
  const soHoje = [...hoje.desenhos].filter((d) => !futuro.desenhos.has(d));
  const porFamiliaSoHoje: Record<string, number> = {};
  for (const d of soHoje) {
    const fam = d.split("|").at(-1)!;
    porFamiliaSoHoje[fam] = (porFamiliaSoHoje[fam] ?? 0) + 1;
    faltas.push({ regiao, desenho: d, familia: fam, lugar: localityById(d.split("|")[0])?.name ?? d.split("|")[0] });
  }
  cobertura[regiao] = {
    legado: { desenhos: hoje.desenhos.size, municipios: hoje.cidades.size, localidades: hoje.localidades.size, merch: hoje.merch, pecasPorTipo: hoje.pecas, colecoesUsaveis: hoje.colecoesUsaveis.length },
    lojaUnica: { desenhos: futuro.desenhos.size, desenhosSimulados: futuro.simulados, municipios: futuro.cidades.size, localidades: futuro.localidades.size, merch: futuro.merch, pecasPorTipo: futuro.pecas, colecoesUsaveis: futuro.colecoesUsaveis.length, colecoes: futuro.colecoesUsaveis },
    desenhosEmAmbos: [...hoje.desenhos].filter((d) => futuro.desenhos.has(d)).length,
    desenhosSoNoLegado: soHoje.length,
    desenhosSoNaLojaUnica: [...futuro.desenhos].filter((d) => !hoje.desenhos.has(d)).length,
    porFamilia: Object.fromEntries(DESIGN_FAMILIES.map((f) => [f.id, { legado: hoje.porFamilia[f.id] ?? 0, lojaUnica: futuro.porFamilia[f.id] ?? 0, soNoLegado: porFamiliaSoHoje[f.id] ?? 0 }])),
    tiposDePeca: { legado: hoje.tiposDePeca, lojaUnica: futuro.tiposDePeca },
  };
}
const contarSituacoes: Record<string, Record<string, number>> = {};
for (const l of unica.situacoes) (contarSituacoes[l.regiao] ??= {})[l.situacao] = ((contarSituacoes[l.regiao] ??= {})[l.situacao] ?? 0) + 1;
const contarMapa: Record<string, Record<string, number>> = {};
for (const l of mapa) (contarMapa[l.lojaAntiga] ??= {})[l.status] = ((contarMapa[l.lojaAntiga] ??= {})[l.status] ?? 0) + 1;

// ─── Gravação: pasta temporária inteira → rename → symlink `atual` ────────────────────────────────────────────────────────────────
const tmp = path.join(saidaBase, `.tmp-${runId}`);
const final = path.join(saidaBase, runId);
assertForaDaProducao(tmp);
mkdirSync(path.join(tmp, SINGLE_STORE_DIR), { recursive: true });
mkdirSync(path.join(tmp, "relatorio"), { recursive: true });
const gravados: Record<string, string> = {};
const gravar = (rel: string, conteudo: string) => {
  writeFileSync(path.join(tmp, rel), conteudo);
  gravados[rel] = createHash("sha256").update(conteudo).digest("hex");
};
try {
  gravar("catalog-snapshot.json", JSON.stringify(legado));
  gravar("garment-index.json", JSON.stringify(pecasLegado));
  gravar("collections-snapshot.json", JSON.stringify(colecoesLegado));
  gravar(`${SINGLE_STORE_DIR}/catalog-snapshot.json`, JSON.stringify(unica.catalogo));
  gravar(`${SINGLE_STORE_DIR}/garment-index.json`, JSON.stringify(unica.pecas));
  gravar(`${SINGLE_STORE_DIR}/collections-snapshot.json`, JSON.stringify(colecoesUnica));
  gravar(`${SINGLE_STORE_DIR}/${REFERENCES_FILE}`, JSON.stringify(referencias));
  gravar(`${SINGLE_STORE_DIR}/identidade-migracao.jsonl`, conteudoEstado);
  gravar("relatorio/situacoes.jsonl", unica.situacoes.map((l) => JSON.stringify(l)).join("\n") + "\n");
  gravar("relatorio/pendencias-regiao.jsonl", unica.situacoes.filter((l) => l.situacao === "regiao-pendente").map((l) => JSON.stringify(l)).join("\n") + "\n");
  gravar("relatorio/mapa-pendencias.jsonl", mapa.filter((l) => l.status !== "confirmado").map((l) => JSON.stringify({ loja: l.lojaAntiga, id: l.idAntigo, nome: l.nomeAntigo, tipo: l.tipoPeca, visivel: l.visivelAntigo, status: l.status, motivo: l.motivo, candidatos: l.candidatos })).join("\n") + "\n");
  gravar("relatorio/desenhos-so-no-legado.jsonl", faltas.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const siteConfig = opt("site-config");
  if (siteConfig) {
    // Só PRÉVIA: Norte e Centro-Oeste marcados como lançados na cópia do published.json; nunca escrito em lugar servido.
    const pub = JSON.parse(readFileSync(siteConfig, "utf8")) as { docs: Record<string, Record<string, unknown>> };
    for (const r of ["norte", "centro-oeste"]) if (pub.docs[r]) pub.docs[r].launched = true;
    mkdirSync(path.join(tmp, "site-config"), { recursive: true });
    gravar("site-config/published.json", JSON.stringify(pub));
  }
  const resumo = {
    runId,
    modo,
    geradoEm: agora,
    entradas: {
      estado: { arquivo: estadoArq, complemento: complementoArq ?? null, sha256: hashEstado, linhas: estado.linhas },
      leitura: Object.fromEntries(Object.entries(lojas).map(([k, l]) => [k, { produtos: l.produtos.length, paginas: l.paginas, totalPages: l.totalPages }])),
      segmentacaoLidaEm: segmentacao.lidoEm,
    },
    lojaUnica: { vinculos: indiceUnico.bindings.length, merch: indiceUnico.merch.length, excluidos: indiceUnico.excluded.length, pecas: Object.values(unica.pecas.stores[LOJA_UNICA]!.clusters).reduce((n, t) => n + t.length, 0), statsPecas: unica.statsPecas, referenciasAntigas: Object.fromEntries(Object.entries(referencias.stores).map(([k, v]) => [k, Object.keys(v!).length])) },
    situacoesPorRegiao: contarSituacoes,
    mapaPorLoja: contarMapa,
    cobertura,
  };
  gravar("relatorio/cobertura.json", JSON.stringify(resumo, null, 2));
  writeFileSync(path.join(tmp, "manifesto.json"), JSON.stringify({ runId, modo, geradoEm: agora, arquivos: gravados }, null, 2));
  renameSync(tmp, final);
} catch (err) {
  rmSync(tmp, { recursive: true, force: true });
  throw err;
}
// Troca atômica do ponteiro: novo symlink ao lado, depois rename por cima do antigo.
const atual = path.join(saidaBase, "atual");
const novo = path.join(saidaBase, `.atual-${runId}`);
symlinkSync(runId, novo);
renameSync(novo, atual);
log(`gerado ${final} (atual → ${runId}); ${readdirSync(saidaBase).filter((d) => !d.startsWith(".") && d !== "atual" && statSync(path.join(saidaBase, d)).isDirectory()).length} geração(ões) preservada(s)`);
console.log(JSON.stringify({ saida: final, ...JSON.parse(readFileSync(path.join(final, "relatorio/cobertura.json"), "utf8")), cobertura: undefined }, null, 1));
