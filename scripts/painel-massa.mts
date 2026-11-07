// Prepara e confere a EDIÇÃO EM MASSA do painel INK (o executor roda no navegador: scripts/painel-edicao-em-massa/executor.js).
// Este script só LÊ a INK (GET com o token de leitura); quem escreve é o painel. Doc: docs/ink/painel-manual.md
//
//   npm run painel:massa -- ler                                   # catálogo visível da loja única → data/unificado/painel/visiveis-<data>.jsonl
//   npm run painel:massa -- tags-cidade --leitura=<jsonl> [--mapa=<mapa-antigo-novo.jsonl>] [--todos]
//                                                                 # fila do executor: tags de cidade por cidade + UF (só grupos que ainda
//                                                                 # não estão com as tags certas, a menos que --todos)
//   npm run painel:massa -- conferir --antes=<jsonl> --depois=<jsonl> --fila=<json>
//                                                                 # tags planejadas presentes; nome, preço, promoção, descrição, status e
//                                                                 # visibilidade iguais; nenhum produto fora da fila com tags mudadas
//   npm run painel:massa -- progresso --fila=<json>               # até onde a fila chegou (busca binária por GET; a fila roda em ordem)
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchStoreProducts } from "../src/lib/ink/client";
import { INK_API_BASE_URL, tokenFor } from "../src/lib/ink/config";
import { parseProductName, resolveCity } from "../src/lib/catalog/parse";
import { allAdministrativeRegions } from "../src/lib/geo/administrative-regions";
import { citiesOfRegion } from "../src/lib/geo/cities";
import { REGIONS, STATE_NAMES } from "../src/lib/geo/regions";

type Bruto = { id: number | string; name: string; tags?: string[]; product_type?: { id: number } | null; total_sales_count?: number } & Record<string, unknown>;
type Lugar = { id: string; name: string; slug: string; uf: string };
type Grupo = { key: string; ids: string[]; tags: string[]; campos: Record<string, string>; vendas: number };

const DIR = path.join(process.cwd(), "data", "unificado", "painel");
const [cmd, ...resto] = process.argv.slice(2);
const opt = (n: string) => resto.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const flag = (n: string) => resto.includes(`--${n}`);
const precisa = (n: string) => opt(n) ?? fail(`falta --${n}=`);
function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
const lerJsonl = (f: string): Bruto[] => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Bruto);
const hoje = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

/** Tipo 1 = Camiseta (a clássica). Cropped, Infantil, Oversized etc. são outros tipos e ficam fora. */
const CAMISETA = 1;
const TODAS_UFS = Object.values(REGIONS).flatMap((r) => r.ufs);
/**
 * "Feito em <Cidade>" do Sul não tem UF no nome. Quando o nome existe em dois estados do Sul (Turvo, Bom Jesus, Palmeira…), o estado sai
 * do lote de criação: os "Feito em" foram criados em 02–03/07/2026 um estado por vez, em faixas de ID que não se cruzam (conferido com os
 * vizinhos de cidade única em 06/11).
 */
const LOTES_FEITO_EM: { de: number; ate: number; uf: string }[] = [
  { de: 4_702_000, ate: 4_705_999, uf: "PR" },
  { de: 4_706_000, ate: 4_712_999, uf: "RS" },
  { de: 4_713_000, ate: 4_717_999, uf: "SC" },
];

/**
 * Tags do Order Bump "Por Tags". A 1ª TEM de ser o nome da cidade: o site lê tags[0] para achar a cidade do Gentílico e da Origem
 * Localidade. Sem repetição, como a INK grava (a cidade Goiás-GO daria "camiseta goiás" duas vezes).
 */
function tagsDoLugar(l: Lugar): string[] {
  const nome = l.name.toLowerCase();
  return [...new Set([nome, `cidade-${l.slug}-${l.uf.toLowerCase()}`, `camiseta ${nome}`, `camiseta ${STATE_NAMES[l.uf].toLowerCase()}`])];
}

async function ler() {
  mkdirSync(DIR, { recursive: true });
  const saida = opt("saida") ?? path.join(DIR, `visiveis-${hoje()}.jsonl`);
  const out = createWriteStream(saida);
  const r = await fetchStoreProducts("use-sul", ({ page, totalPages }) => page % 20 === 0 && console.log(`página ${page}/${totalPages}`), undefined, (raw) => out.write(`${JSON.stringify(raw)}\n`));
  await new Promise((res) => out.end(res));
  console.log(`${r.products.length} produtos visíveis (${r.requests} GETs) → ${saida}`);
}

function tagsCidade() {
  const produtos = lerJsonl(precisa("leitura"));
  const mapa = new Map<string, string>();
  const arqMapa = opt("mapa");
  if (arqMapa) {
    // Migrados de Norte/CO: o Gentílico migrado não tem a cidade no nome nem nas tags; o mapa da migração tem (idNovo → cidadeId).
    for (const l of readFileSync(arqMapa, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(l) as { idNovo?: string | null; cidadeId?: string | null };
      if (r.idNovo && r.cidadeId) mapa.set(String(r.idNovo), String(r.cidadeId));
    }
  }
  const cidadePorId = new Map(Object.values(REGIONS).flatMap((r) => citiesOfRegion(r.slug)).map((c) => [c.id, c] as const));
  const ras = allAdministrativeRegions();
  const grupos = new Map<string, { lugar: Lugar; ids: string[]; vendas: number; atuais: string[][] }>();
  const fora: { id: string; nome: string; motivo: string }[] = [];

  for (const p of produtos) {
    if (p.product_type?.id !== CAMISETA) continue;
    const parsed = parseProductName(p.name);
    if (parsed.kind !== "city-design") continue;
    const tags = Array.isArray(p.tags) ? p.tags : [];
    const id = String(p.id);
    // Nome sem UF = produto do próprio Sul ("Feito em Tijucas"); UF no nome limita àquela UF.
    const res = resolveCity(parsed, { tags, storeKey: "use-sul" }, parsed.uf ? TODAS_UFS : REGIONS.sul.ufs);
    // Uma região administrativa do DF é o próprio lugar no bump (Taguatinga sugere Taguatinga, não Ceilândia).
    let lugar: Lugar | undefined = res.ok ? (res.localityId ? ras.find((r) => r.id === res.localityId) : undefined) ?? res.city : undefined;
    if (!lugar && mapa.has(id)) lugar = cidadePorId.get(mapa.get(id)!);
    if (!lugar && !res.ok && res.reason === "ambiguous-city" && parsed.family === "feito-em") {
      const lote = LOTES_FEITO_EM.find((l) => Number(id) >= l.de && Number(id) <= l.ate);
      const cands = lote ? citiesOfRegion("sul").filter((c) => c.uf === lote.uf && c.name.toLowerCase() === parsed.title.toLowerCase()) : [];
      if (cands.length === 1) lugar = cands[0];
    }
    if (!lugar) {
      fora.push({ id, nome: p.name, motivo: res.ok ? "sem lugar" : `${res.reason}${res.detail ? ` ${res.detail}` : ""}` });
      continue;
    }
    const key = `${lugar.slug}-${lugar.uf}`;
    const g = grupos.get(key) ?? { lugar, ids: [], vendas: 0, atuais: [] };
    g.ids.push(id);
    g.vendas += Number(p.total_sales_count ?? 0);
    g.atuais.push(tags);
    grupos.set(key, g);
  }

  const fila: Grupo[] = [];
  let jaCertos = 0;
  for (const [key, g] of [...grupos].sort((a, b) => b[1].vendas - a[1].vendas)) {
    const tags = tagsDoLugar(g.lugar);
    if (!flag("todos") && g.atuais.every((t) => t.join(",") === tags.join(","))) {
      jaCertos++;
      continue;
    }
    // A tela de seleção mostra até 50 por página: grupo maior vai em partes.
    for (let i = 0; i < g.ids.length; i += 50) {
      fila.push({ key: g.ids.length > 50 ? `${key}#${i / 50 + 1}` : key, ids: g.ids.slice(i, i + 50), tags, campos: { "product[tags]": tags.join(","), "product[tags_mode]": "replace" }, vendas: g.vendas });
    }
  }
  mkdirSync(DIR, { recursive: true });
  const saida = opt("saida") ?? path.join(DIR, `fila-tags-cidade-${hoje()}.json`);
  writeFileSync(saida, JSON.stringify(fila));
  writeFileSync(saida.replace(/\.json$/, "-fora.json"), JSON.stringify(fora, null, 1));
  console.log(`${grupos.size} lugares; ${jaCertos} já com as tags certas; fila: ${fila.length} grupos, ${fila.reduce((s, g) => s + g.ids.length, 0)} produtos → ${saida}`);
  console.log(`${fora.length} camisetas de cidade sem lugar certo (lista em ${saida.replace(/\.json$/, "-fora.json")})`);
}

function conferir() {
  const fila = JSON.parse(readFileSync(precisa("fila"), "utf8")) as Grupo[];
  const porId = (f: string) => new Map(lerJsonl(f).map((p) => [String(p.id), p]));
  const antes = porId(precisa("antes"));
  const depois = porId(precisa("depois"));
  const plano = new Map(fila.flatMap((g) => g.ids.map((i) => [i, g] as const)));
  let ok = 0;
  const divergentes: string[] = [];
  for (const [id, g] of plano) {
    const a = antes.get(id);
    const d = depois.get(id);
    if (!a || !d) {
      divergentes.push(`${id} ${g.key}: ${d ? "não estava na leitura de antes" : "não está visível agora"}`);
      continue;
    }
    const tagsOk = JSON.stringify(d.tags) === JSON.stringify(g.tags);
    const mudou = ["name", "price", "promotional_price", "description", "status", "visible_in_store"].filter((f) => JSON.stringify(a[f]) !== JSON.stringify(d[f]));
    if (tagsOk && !mudou.length) ok++;
    else divergentes.push(`${id} ${g.key}: ${tagsOk ? "" : `tags=${JSON.stringify(d.tags)} `}${mudou.length ? `mudou ${mudou.join(",")}` : ""}`);
  }
  const foraMudou = [...depois].filter(([id, d]) => !plano.has(id) && antes.has(id) && JSON.stringify(antes.get(id)!.tags) !== JSON.stringify(d.tags));
  console.log(`planejados ${plano.size} | ok ${ok} | divergentes ${divergentes.length} | fora da fila com tags mudadas ${foraMudou.length}`);
  for (const l of divergentes.slice(0, 30)) console.log(`  ${l}`);
  for (const [id, d] of foraMudou.slice(0, 10)) console.log(`  fora da fila: ${id} ${d.name}`);
  if (divergentes.length || foraMudou.length) process.exitCode = 2;
}

async function progresso() {
  const fila = JSON.parse(readFileSync(precisa("fila"), "utf8")) as Grupo[];
  const token = tokenFor("use-sul") ?? fail("sem INK_TOKEN_SUL");
  const feito = async (i: number) => {
    const res = await fetch(`${INK_API_BASE_URL}/v1/stores/products/${fila[i].ids[0]}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { product?: { tags?: string[] }; tags?: string[] };
    return JSON.stringify((body.product ?? body).tags) === JSON.stringify(fila[i].tags);
  };
  let lo = 0;
  let hi = fila.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (await feito(m)) lo = m + 1;
    else hi = m;
  }
  console.log(`feitos ${lo} de ${fila.length}${lo < fila.length ? ` | próximo: ${fila[lo].key} (índice ${lo})` : " | fila completa"}`);
}

if (cmd === "ler") await ler();
else if (cmd === "tags-cidade") tagsCidade();
else if (cmd === "conferir") conferir();
else if (cmd === "progresso") await progresso();
else fail(`comando desconhecido: ${cmd ?? "(nenhum)"} — ler | tags-cidade | conferir | progresso`);
