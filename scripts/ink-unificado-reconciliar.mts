// Reconciliação Centro/Norte → loja Sul unificada + índice em MODO SOMBRA. Offline: lê só o que `unificado:ler` gravou e a cópia
// preservada do estado do migrador. Não fala com a INK, não grava em data/generated/.
// Doc: docs/migracao-ink/origens-ink-reconciliacao.md
//
//   npm run unificado:reconciliar -- --estado=data/unificado/estado/migracao-estado-<hash>.jsonl
//   npm run unificado:reconciliar -- --estado=… --dir=/caminho/absoluto      (mesmo --dir usado na leitura)
//
// Saída em data/unificado/saida/<runId>/:
//   mapa-antigo-novo.csv / .jsonl   uma linha por PEÇA antiga (produto INK de Norte/Centro)
//   sombra/catalog-snapshot.json    formato do snapshot de produção, uma loja (use-sul) servindo as três regiões
//   classificacao-sul.jsonl         região + evidências de cada produto da loja Sul
//   resumo.json                     totais por região e verificações
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REGIONS, type CommerceStoreKey, type RegionSlug } from "../src/lib/geo/regions";
import { assertForaDaProducao, diretorioSombraPadrao } from "../src/lib/catalog/unificado/destino";
import { lerEstadoMigracao } from "../src/lib/catalog/unificado/estado-migracao";
import { arquivoDaLoja, carregarLeitura } from "../src/lib/catalog/unificado/leitura";
import { chaveProduto } from "../src/lib/catalog/unificado/chave";
import {
  classificarDesenhosSul,
  classificarPorIndexador,
  classificarRegioesSul,
  corteDaMigracao,
  COLECAO_SUL,
  COLECAO_ZZ_CO,
  COLECAO_ZZ_NO,
  MAPA_VERSAO,
  problemaDeVariantes,
  reconciliar,
  type LinhaMapa,
} from "../src/lib/catalog/unificado/reconciliar";
import { snapshotPath } from "../src/lib/catalog/snapshot-file";
import { montarLojaUnica } from "../src/lib/catalog/unificado/loja-unica";

const argv = process.argv.slice(2);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const raiz = opt("dir") ?? diretorioSombraPadrao();
const leitura = path.join(raiz, "leitura");
const estadoArq = opt("estado");
if (!estadoArq || !existsSync(estadoArq)) throw new Error("passe --estado=<cópia preservada do .migracao-estado.jsonl> (ver data/unificado/estado/)");
assertForaDaProducao(raiz);

const conteudoEstado = readFileSync(estadoArq, "utf8");
const hashEstado = createHash("sha256").update(conteudoEstado).digest("hex");
const estado = lerEstadoMigracao(conteudoEstado);

const carregar = (k: CommerceStoreKey) => {
  const arq = arquivoDaLoja(leitura, k);
  if (!existsSync(arq)) throw new Error(`falta a leitura de ${k} (${arq}) — rode npm run unificado:ler`);
  return carregarLeitura(arq);
};
const lojas = { "use-sul": carregar("use-sul"), "use-norte": carregar("use-norte"), "use-centro": carregar("use-centro") } as const;
const completude = Object.fromEntries(
  Object.entries(lojas).map(([k, l]) => [k, { paginas: l.paginas, totalPages: l.totalPages, totalCountInk: l.totalCount, produtosUnicos: l.produtos.length, repetidosNaPaginacao: l.repetidos, completa: l.paginas >= l.totalPages }]),
);
for (const [k, c] of Object.entries(completude)) {
  if (!c.completa && !argv.includes("--aceitar-parcial")) throw new Error(`${k}: leitura incompleta (${c.paginas}/${c.totalPages} páginas) — rode unificado:ler de novo ou passe --aceitar-parcial`);
}

const colecoesSul = JSON.parse(readFileSync(path.join(leitura, "colecoes-use-sul.json"), "utf8")) as { lidoEm: string; membros: { id: number; name: string; productIds: string[] }[] };
const membros = (id: number) => {
  const c = colecoesSul.membros.find((m) => m.id === id);
  if (!c) throw new Error(`coleção ${id} não encontrada na leitura da Sul — os ids mudaram? confira colecoes-use-sul.json`);
  return new Set(c.productIds);
};
const colecoes = { sul: membros(COLECAO_SUL), co: membros(COLECAO_ZZ_CO), no: membros(COLECAO_ZZ_NO) };

// 1. Região e desenho de cada produto da loja Sul.
const corte = corteDaMigracao(estado, estado.primeiroRegistro);
const sul = classificarRegioesSul(lojas["use-sul"].produtos, colecoes, estado, corte);
classificarDesenhosSul(sul, estado);

// 2. Mapa antigo → novo.
const mapa = reconciliar({
  antigas: [
    { storeKey: "use-norte", produtos: lojas["use-norte"].produtos },
    { storeKey: "use-centro", produtos: lojas["use-centro"].produtos },
  ],
  sul,
  estado,
});

// 3. Índice sombra.
const agora = new Date().toISOString();
const lojaUnica = montarLojaUnica(sul, { modo: "simulacao", syncedAt: agora, fonte: { runId: "reconciliacao", generatedAt: agora, mapVersion: MAPA_VERSAO, identitySha256: hashEstado } });
const sombra = {
  snapshot: lojaUnica.catalogo as { version: 1; stores: { "use-sul": NonNullable<(typeof lojaUnica.catalogo.stores)["use-sul"]> } },
  simulados: lojaUnica.situacoes.filter((l) => l.situacao === "simulado").map((l) => l.id),
  foraPorImagem: lojaUnica.situacoes.filter((l) => l.situacao === "sem-imagem" && l.tipo === 1 && (l.regiao === "norte" || l.regiao === "centro-oeste")).map((l) => l.id),
};

// ─── Verificações direcionadas ───────────────────────────────────────────────────────────────────────────────────────────────────
const verificacoes: Record<string, unknown> = {};
const ids = new Set<string>();
let duplicadas = 0;
for (const l of mapa) {
  if (ids.has(`${l.lojaAntiga}:${l.idAntigo}`)) duplicadas++;
  ids.add(`${l.lojaAntiga}:${l.idAntigo}`);
}
const totalAntigos = lojas["use-norte"].produtos.length + lojas["use-centro"].produtos.length;
verificacoes.integridade = {
  linhasNoMapa: mapa.length,
  produtosAntigosLidos: totalAntigos,
  umaLinhaPorPecaAntiga: mapa.length === totalAntigos && duplicadas === 0,
  confirmadosSemIdNovo: mapa.filter((l) => l.status === "confirmado" && !l.idNovo).length,
  idNovoInexistenteNaSul: mapa.filter((l) => l.idNovo && !sul.has(l.idNovo)).length,
  confirmadosComTipoDiferente: mapa.filter((l) => l.status === "confirmado" && sul.get(l.idNovo!)?.produto.typeId !== l.tipoPecaId).length,
  confirmadosEmOutraRegiao: mapa.filter((l) => l.status === "confirmado" && sul.get(l.idNovo!)?.regiao !== l.regiao).length,
};
const porNovo = new Map<string, number>();
for (const l of mapa) if (l.idNovo && l.status === "confirmado") porNovo.set(l.idNovo, (porNovo.get(l.idNovo) ?? 0) + 1);
verificacoes.colisoes = {
  confirmadosCompartilhandoIdNovo: [...porNovo.values()].filter((n) => n > 1).length,
  linhasComColisaoNoDestino: mapa.filter((l) => l.candidatos?.startsWith("COLISÃO")).length,
  linhasAmbiguas: mapa.filter((l) => l.status === "ambiguo").length,
};
// Separação entre regiões: nenhum vínculo do índice sombra pode estar numa UF de outra região que não a do produto.
const regiaoDoProduto = new Map([...sul.values()].map((s) => [s.produto.id, s.regiao]));
const ufsDe = (r: RegionSlug) => new Set(REGIONS[r].ufs);
const { cityById } = await import("../src/lib/geo/cities");
const vazamentos = sombra.snapshot.stores["use-sul"].bindings.filter((b) => {
  const r = regiaoDoProduto.get(b.inkProductId) as RegionSlug;
  return !ufsDe(r).has(cityById(b.cityId)?.uf ?? "");
});
verificacoes.separacaoRegional = {
  vinculosNaUfDeOutraRegiao: vazamentos.length,
  merchSemRegiaoConfirmada: sombra.snapshot.stores["use-sul"].merch.filter((m) => !["sul", "norte", "centro-oeste"].includes(regiaoDoProduto.get(m.inkProductId) ?? "")).length,
};
const prod = snapshotPath();
const prodAntes = existsSync(prod) ? createHash("sha256").update(readFileSync(prod)).digest("hex") : null;

// ─── Totais ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Totais = Record<string, number>;
const contar = (ls: LinhaMapa[]): Totais => {
  const t: Totais = { pecasOrigem: ls.length, desenhosOrigem: new Set(ls.filter((l) => l.chaveProduto).map((l) => l.chaveProduto)).size, variantesOrigem: 0 };
  for (const l of ls) {
    t[`status:${l.status}`] = (t[`status:${l.status}`] ?? 0) + 1;
    t.variantesOrigem += Number(l.variantesAntigo.split("/")[1]);
    if (l.status === "confirmado") {
      if (l.visivelNovo === false) t.confirmadosOcultosNoDestino = (t.confirmadosOcultosNoDestino ?? 0) + 1;
      if (l.imagemNova === "pendente") t.confirmadosImagemPendente = (t.confirmadosImagemPendente ?? 0) + 1;
      if (l.problemaVariantes) t.confirmadosProblemaVariantes = (t.confirmadosProblemaVariantes ?? 0) + 1;
      if (l.divergenciaPreco) t.confirmadosPrecoDivergente = (t.confirmadosPrecoDivergente ?? 0) + 1;
      if (l.visivelAntigo) t.confirmadosQueEramVisiveis = (t.confirmadosQueEramVisiveis ?? 0) + 1;
    }
    if (l.visivelAntigo) t.visiveisOrigem = (t.visiveisOrigem ?? 0) + 1;
    if (l.visivelAntigo && l.status !== "confirmado") t[`visiveisOrigemNaoConfirmados:${l.status}`] = (t[`visiveisOrigemNaoConfirmados:${l.status}`] ?? 0) + 1;
  }
  const desenhosConf = new Set(ls.filter((l) => l.status === "confirmado").map((l) => l.chaveProduto));
  t.desenhosComAlgumaPecaConfirmada = desenhosConf.size;
  return t;
};
const porRegiao = {
  norte: contar(mapa.filter((l) => l.regiao === "norte")),
  "centro-oeste": contar(mapa.filter((l) => l.regiao === "centro-oeste")),
};
const motivos = (r: RegionSlug, status: string) => {
  const m = new Map<string, number>();
  for (const l of mapa) {
    if (l.regiao !== r || l.status !== status) continue;
    const k = (l.motivo ?? "").replace(/\d{5,}/g, "#").replace(/item [^ ]+/g, "item <chave>").replace(/"[^"]*"/g, '"…"').slice(0, 140);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
};
const motivosPorRegiao = Object.fromEntries((["norte", "centro-oeste"] as const).map((r) => [r, { ausente: motivos(r, "ausente"), ambiguo: motivos(r, "ambiguo"), semChave: motivos(r, "sem-chave") }]));

// Sul por região da classificação, em peças e em desenhos.
const sulPorRegiao: Record<string, Totais> = {};
for (const s of sul.values()) {
  const t = (sulPorRegiao[s.regiao] ??= { pecas: 0, visiveis: 0, ocultas: 0, semImagem: 0, desenho: 0, merch: 0, excluido: 0, doEstado: 0, problemaVariantes: 0 });
  t.pecas++;
  if (s.produto.visible) t.visiveis++;
  else t.ocultas++;
  if (!s.produto.image) t.semImagem++;
  if (s.classificado) t[s.classificado.tipo]++;
  if (s.chaveMigracao) t.doEstado++;
  if (problemaDeVariantes(s.produto)) t.problemaVariantes++;
}
const diagnosticos = new Map<string, number>();
for (const s of sul.values()) {
  if (s.regiao !== "desconhecida" && s.regiao !== "conflito") continue;
  const k = `${s.regiao}: ${(s.diagnostico ?? "").replace(/\(.*?\)/g, "(…)")}`;
  diagnosticos.set(k, (diagnosticos.get(k) ?? 0) + 1);
}

// Estado do migrador × leitura da Sul.
const idsVigentes = [...estado.donoDoId.keys()];
const estadoVsSul = {
  itens: estado.itens.size,
  itensComBase: [...estado.itens.values()].filter((i) => i.baseId).length,
  itensConcluidos: [...estado.itens.values()].filter((i) => i.concluido).length,
  idsVigentes: idsVigentes.length,
  idsVigentesPresentesNaSul: idsVigentes.filter((id) => sul.has(id)).length,
  idsVigentesAusentesNaSul: idsVigentes.filter((id) => !sul.has(id)),
};

// Sombra × produção regional de hoje: desenhos (cards) visíveis hoje em Norte/Centro que o índice sombra não tem.
const cobertura: Record<string, unknown> = {};
for (const k of ["use-norte", "use-centro"] as const) {
  const r = k === "use-norte" ? "norte" : "centro-oeste";
  const visiveis = lojas[k].produtos.filter((p) => p.visible && p.status === "published" && p.image && p.url);
  const cls = classificarPorIndexador(k, visiveis);
  const hoje = new Set([...cls.values()].filter((c) => c.tipo === "desenho").map((c) => chaveProduto(c.vinculo!)));
  const merchHoje = [...cls.values()].filter((c) => c.tipo === "merch").length;
  const sombraR = new Set(sombra.snapshot.stores["use-sul"].bindings.filter((b) => regiaoDoProduto.get(b.inkProductId) === r).map((b) => chaveProduto(b)));
  const soHoje = [...hoje].filter((x) => !sombraR.has(x));
  const porFamiliaVariante = new Map<string, number>();
  for (const x of soHoje) {
    const [, fam, vari] = x.split("|");
    porFamiliaVariante.set(`${fam}/${vari}`, (porFamiliaVariante.get(`${fam}/${vari}`) ?? 0) + 1);
  }
  cobertura[r] = {
    desenhosVisiveisHoje: hoje.size,
    desenhosNaSombra: sombraR.size,
    emAmbos: [...hoje].filter((x) => sombraR.has(x)).length,
    soHoje: soHoje.length,
    soHojePorFamiliaVariante: Object.fromEntries([...porFamiliaVariante.entries()].sort((a, b) => b[1] - a[1])),
    soNaSombra: [...sombraR].filter((x) => !hoje.has(x)).length,
    merchVisivelHoje: merchHoje,
    merchNaSombra: sombra.snapshot.stores["use-sul"].merch.filter((m) => m.regionSlug === r).length,
  };
}
// Sul: o índice sombra não pode mudar o que a região Sul serve hoje.
{
  const visiveisSul = [...sul.values()].filter((s) => s.produto.visible && s.produto.status === "published" && s.produto.image && s.produto.url).map((s) => s.produto);
  const prodHoje = classificarPorIndexador("use-sul", visiveisSul); // regra de produção: loja Sul = UFs do Sul
  const hoje = new Set([...prodHoje.values()].filter((c) => c.tipo === "desenho").map((c) => `${c.produto.id}|${chaveProduto(c.vinculo!)}`));
  const sombraSul = new Set(sombra.snapshot.stores["use-sul"].bindings.filter((b) => regiaoDoProduto.get(b.inkProductId) === "sul").map((b) => `${b.inkProductId}|${chaveProduto(b)}`));
  cobertura.sul = {
    vinculosProducaoHoje: hoje.size,
    vinculosSombraSul: sombraSul.size,
    soProducao: [...hoje].filter((x) => !sombraSul.has(x)).length,
    soSombra: [...sombraSul].filter((x) => !hoje.has(x)).length,
    exemplosSoProducao: [...hoje].filter((x) => !sombraSul.has(x)).slice(0, 10),
  };
}

// Preço: pares (antigo → novo) entre confirmados. Só mostrado.
const precos = new Map<string, number>();
for (const l of mapa) if (l.status === "confirmado" && l.divergenciaPreco) precos.set(`${l.tipoPeca}: ${l.precoAntigo} → ${l.precoNovo}`, (precos.get(`${l.tipoPeca}: ${l.precoAntigo} → ${l.precoNovo}`) ?? 0) + 1);

// ─── Gravação ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const runId = `${agora.slice(0, 19).replace(/[:T]/g, "").replace(/-/g, "")}-e${hashEstado.slice(0, 8)}`;
const saida = path.join(raiz, "saida", runId);
assertForaDaProducao(saida);
mkdirSync(path.join(saida, "sombra"), { recursive: true });

const colunas = Object.keys(mapa[0] ?? {}) as (keyof LinhaMapa)[];
const csvCampo = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
writeFileSync(path.join(saida, "mapa-antigo-novo.csv"), [colunas.join(","), ...mapa.map((l) => colunas.map((c) => csvCampo(l[c])).join(","))].join("\n") + "\n");
writeFileSync(path.join(saida, "mapa-antigo-novo.jsonl"), mapa.map((l) => JSON.stringify(l)).join("\n") + "\n");
writeFileSync(path.join(saida, "sombra", "catalog-snapshot.json"), JSON.stringify(sombra.snapshot));
writeFileSync(path.join(saida, "sombra", "simulados.json"), JSON.stringify({ simulados: sombra.simulados, foraPorImagem: sombra.foraPorImagem }));
writeFileSync(
  path.join(saida, "classificacao-sul.jsonl"),
  [...sul.values()].map((s) => JSON.stringify({ id: s.produto.id, nome: s.produto.name, tipo: s.produto.typeId, visivel: s.produto.visible, regiao: s.regiao, evidencias: s.evidencias, diagnostico: s.diagnostico ?? null, chaveMigracao: s.chaveMigracao ?? null, classe: s.classificado?.tipo ?? null, chaveProduto: s.classificado?.vinculo ? chaveProduto(s.classificado.vinculo) : null, exclusao: s.classificado?.motivoExclusao ?? null })).join("\n") + "\n",
);
// Estado complementar: peças CO/NO que existem na Sul mas que a cópia do estado não conhece (o migrador seguiu rodando em outra
// máquina). No formato do próprio estado, para ser ANEXADO A UMA CÓPIA e passado ao migrador via MIGRACAO_ESTADO — assim `--plano`
// e `--copias` não recriam o que já existe. Só entra vínculo único por (chave, tipo); repetição vai para a lista de colisões.
{
  const { chaveMigracaoDoVinculo } = await import("../src/lib/catalog/unificado/chave");
  const porChaveTipo = new Map<string, string[]>();
  for (const s of sul.values()) {
    if ((s.regiao !== "norte" && s.regiao !== "centro-oeste") || s.chaveMigracao || s.classificado?.tipo !== "desenho" || s.produto.typeId === null) continue;
    const m = chaveMigracaoDoVinculo(s.classificado.vinculo!);
    if (!m.ok) continue;
    const it = estado.itens.get(m.chave);
    // Não sobrescreve o que o estado já registra para esse tipo.
    if (it && (s.produto.typeId === 1 ? it.baseId : it.copias.get(s.produto.typeId))) continue;
    const k = `${m.chave}|${s.produto.typeId}`;
    porChaveTipo.set(k, [...(porChaveTipo.get(k) ?? []), s.produto.id]);
  }
  const linhas: string[] = [];
  const colisoes: Record<string, string[]> = {};
  const ordenado = [...porChaveTipo.entries()].sort(([a], [b]) => (a.endsWith("|1") === b.endsWith("|1") ? a.localeCompare(b) : a.endsWith("|1") ? -1 : 1));
  for (const [k, ids] of ordenado) {
    const [chave, tipo] = k.split("|");
    if (ids.length > 1) {
      colisoes[k] = ids;
      continue;
    }
    const base = { chave, origem: "reconciliacao-catalogo", runId, em: agora };
    linhas.push(JSON.stringify(tipo === "1" ? { ...base, fase: "criado", produtoId: Number(ids[0]), nome: sul.get(ids[0])!.produto.name } : { ...base, fase: "copia", tipo: Number(tipo), id: Number(ids[0]) }));
  }
  // Item com base + as 9 cópias conhecidas (estado + complemento) e ainda não `concluido` no estado: fecha, como o lote faria.
  const tiposPorChave = new Map<string, Set<number>>();
  for (const it of estado.itens.values()) {
    const t = new Set<number>(it.copias.keys());
    if (it.baseId) t.add(1);
    tiposPorChave.set(it.chave, t);
  }
  for (const l of linhas) {
    const r = JSON.parse(l) as { chave: string; fase: string; tipo?: number };
    const t = tiposPorChave.get(r.chave) ?? new Set<number>();
    t.add(r.fase === "criado" ? 1 : r.tipo!);
    tiposPorChave.set(r.chave, t);
  }
  const DEZ = [1, 165, 72, 2, 178, 23, 28, 119, 8, 120];
  let fechados = 0;
  for (const [chave, t] of tiposPorChave) {
    const it = estado.itens.get(chave);
    if (it?.concluido || !it?.baseId || !DEZ.every((x) => t.has(x))) continue;
    linhas.push(JSON.stringify({ chave, fase: "concluido", produtoId: Number(it.baseId), origem: "reconciliacao-catalogo", runId, em: agora }));
    fechados++;
  }
  verificacoes.itensFechadosPeloComplemento = fechados;
  verificacoes.itensComAs10Pecas = [...tiposPorChave.values()].filter((t) => DEZ.every((x) => t.has(x))).length;
  writeFileSync(path.join(saida, "estado-complementar.jsonl"), linhas.join("\n") + (linhas.length ? "\n" : ""));
  writeFileSync(path.join(saida, "estado-complementar-colisoes.json"), JSON.stringify(colisoes, null, 1));
  verificacoes.estadoComplementar = { linhas: linhas.length, criado: linhas.filter((l) => l.includes('"fase":"criado"')).length, colisoesExcluidas: Object.keys(colisoes).length };
}
// Ativação (só leitura/decisão): Camiseta base de cada desenho CO/NO no destino, pronta ou com o bloqueio que impede ativá-la hoje.
{
  const pronta: unknown[] = [];
  const bloqueada: unknown[] = [];
  for (const s of sul.values()) {
    if ((s.regiao !== "norte" && s.regiao !== "centro-oeste") || s.produto.typeId !== 1 || s.classificado?.tipo !== "desenho") continue;
    const p = s.produto;
    const motivos = [!p.image && "sem imagem (mockup não gerado)", problemaDeVariantes(p), p.visible && "já visível"].filter(Boolean);
    const linha = { id: p.id, nome: p.name, regiao: s.regiao, chaveProduto: chaveProduto(s.classificado.vinculo!), url: p.url, preco: p.price, origem: s.chaveMigracao ? "estado" : "catalogo" };
    (motivos.length ? bloqueada : pronta).push(motivos.length ? { ...linha, motivos } : linha);
  }
  writeFileSync(path.join(saida, "ativacao-pronta.jsonl"), pronta.map((l) => JSON.stringify(l)).join("\n") + "\n");
  writeFileSync(path.join(saida, "ativacao-bloqueada.jsonl"), bloqueada.map((l) => JSON.stringify(l)).join("\n") + "\n");
  verificacoes.ativacaoCamisetaBase = { pronta: pronta.length, bloqueada: bloqueada.length };
}
const prodDepois = existsSync(prod) ? createHash("sha256").update(readFileSync(prod)).digest("hex") : null;
verificacoes.producaoIntocada = { snapshotProducao: prod, sha256Antes: prodAntes, sha256Depois: prodDepois, igual: prodAntes === prodDepois, saidaForaDaProducao: true };

const resumo = {
  mapaVersao: MAPA_VERSAO,
  runId,
  geradoEm: agora,
  corteMigracao: corte,
  estado: { arquivo: estadoArq, sha256: hashEstado, linhas: estado.linhas, linhasInvalidas: estado.linhasInvalidas },
  leitura: completude,
  colecoesLidasEm: colecoesSul.lidoEm,
  estadoVsSul: { ...estadoVsSul, idsVigentesAusentesNaSul: estadoVsSul.idsVigentesAusentesNaSul.length, exemplosAusentes: estadoVsSul.idsVigentesAusentesNaSul.slice(0, 20) },
  sulPorRegiao,
  diagnosticosSemRegiao: Object.fromEntries([...diagnosticos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)),
  mapaPorRegiao: porRegiao,
  motivosPorRegiao,
  precosDivergentes: Object.fromEntries([...precos.entries()].sort((a, b) => b[1] - a[1])),
  sombra: { pecas: sombra.snapshot.stores["use-sul"].productCount, vinculos: sombra.snapshot.stores["use-sul"].bindings.length, merch: sombra.snapshot.stores["use-sul"].merch.length, excluidos: sombra.snapshot.stores["use-sul"].excluded.length, simulados: sombra.simulados.length, foraPorImagem: sombra.foraPorImagem.length },
  cobertura,
  verificacoes,
};
writeFileSync(path.join(saida, "resumo.json"), JSON.stringify(resumo, null, 2));
console.log(JSON.stringify({ saida, ...resumo, motivosPorRegiao: undefined, cobertura: undefined }, null, 2));
