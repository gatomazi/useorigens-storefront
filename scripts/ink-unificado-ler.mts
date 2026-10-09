// Leitura em MODO SOMBRA das lojas INK (visíveis + ocultos), só GET, retomável por página.
// Doc: docs/migracao-ink/origens-ink-reconciliacao.md
//
//   npm run unificado:ler                                  # as três lojas, em paralelo (orçamentos separados por loja)
//   npm run unificado:ler -- use-sul                       # só a Sul (base da loja unificada)
//   npm run unificado:ler -- --max-paginas=50              # para depois de 50 páginas por loja; rodar de novo retoma
//   npm run unificado:ler -- --dir=/caminho/absoluto       # outro diretório (recusado se for o de produção)
//   npm run unificado:ler -- --so-colecoes                 # só as coleções (1–2 GET por loja), sem reler os produtos
//
// Grava em data/unificado/leitura/<loja>.jsonl (+ colecoes-<loja>.json). Nunca toca data/generated/ (catálogo servido, índice de
// peças, coleções, last-known-good). Sem flag de escrita: este script não sabe escrever na INK.
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { CommerceStoreKey } from "../src/lib/geo/regions";
import { assertForaDaProducao, diretorioSombraPadrao } from "../src/lib/catalog/unificado/destino";
import { lerColecoes, lerLojaInteira } from "../src/lib/catalog/unificado/leitura";

const argv = process.argv.slice(2);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const lojas = (argv.filter((a) => !a.startsWith("--")) as CommerceStoreKey[]);
const alvo: CommerceStoreKey[] = lojas.length ? lojas : ["use-sul", "use-norte", "use-centro"];
const dir = path.join(opt("dir") ?? diretorioSombraPadrao(), "leitura");
const maxPaginas = opt("max-paginas") ? Number(opt("max-paginas")) : undefined;
assertForaDaProducao(dir);
mkdirSync(dir, { recursive: true });

const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

// Coleções primeiro (poucas requisições): segmentação regional (ZZ - CO, ZZ - NO, SUL…) com os product_ids, inclusive de ocultos.
for (const loja of alvo) {
  if (argv.includes("--sem-colecoes")) break;
  const lidoEm = new Date().toISOString();
  const { todas, membros, paginas } = await lerColecoes(loja, (nome) => /^(ZZ|SUL|NORTE|CENTRO|CO|NO)\b/i.test(nome) || nome === "Seu Lugar");
  // Com --so-colecoes a segmentação já gravada (a que casa com a leitura de produtos) é preservada: só as páginas brutas são acrescentadas.
  if (!argv.includes("--so-colecoes")) writeFileSync(path.join(dir, `colecoes-${loja}.json`), JSON.stringify({ lidoEm, todas, membros }));
  // Páginas brutas: a geração da loja única (unificado:gerar) monta collections-snapshot.json a partir delas.
  writeFileSync(path.join(dir, `colecoes-paginas-${loja}.json`), JSON.stringify({ lidoEm, paginas }));
  log(`${loja}: ${todas.length} coleções, ${membros.length} de segmentação gravadas com product_ids`);
}
if (argv.includes("--so-colecoes")) process.exit(0);

const resultados = await Promise.allSettled(alvo.map((loja) => lerLojaInteira(loja, dir, { maxPaginas, log })));
resultados.forEach((r, i) => {
  if (r.status === "rejected") log(`${alvo[i]}: PAROU — ${String(r.reason)} (rode de novo para retomar)`);
  else log(`${alvo[i]}: ${r.value.paginasLidas} página(s) nesta rodada, ${r.value.ultimaPagina}/${r.value.totalPages}${r.value.completo ? " — COMPLETA" : " — incompleta, rode de novo"}`);
});
