// Checks the curated city profiles of "Meu Pequeno Mundo" (data/mundo/perfis-cidades.json) before they reach the experience. Read-only.
//
//   npm run mundo:validar                       structure: exit 0 = every profile can be published; 1 = at least one FAIL
//   npm run mundo:validar -- --exigir-editorial also fails while a profile is not editorially approved (gate for turning entries on)
//   npm run mundo:validar -- --arquivo <json>   checks another file (a new profile drafted from data/mundo/modelo-perfil.json)
//
// Two approvals, never mixed: STRUCTURE is what this script proves (IDs that exist in the catalog, every fact pointing to a declared source,
// scene modules the 3D scene knows, landmarks tied to a text, required fields, the lengths the experience shows without cutting).
// EDITORIAL is a person's decision recorded in `revisao` (status "aprovado", with `por` and `em`); the script only reports it.
/* eslint-disable @typescript-eslint/no-explicit-any -- arbitrary JSON under validation: every field is checked before it is used */
import { readFileSync } from "node:fs";
import path from "node:path";
import { indiceDoMundo } from "../src/lib/mundo/catalogo";
import { REGION_SLUGS } from "../src/lib/geo/regions";
// The experience's own lists: the scene ignores anything else, so a name outside them would silently vanish.
import { AMBIENTES, MODULOS, PAISAGENS, TEXTOS } from "../src/components/mundo/experiencia/config.js";

const args = process.argv.slice(2);
const valor = (nome: string) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
const arquivo = path.resolve(valor("--arquivo") ?? path.join(process.cwd(), "data", "mundo", "perfis-cidades.json"));
const exigirEditorial = args.includes("--exigir-editorial");

let falhas = 0;
let avisos = 0;
const ok = (msg: string) => console.log(`  OK    ${msg}`);
const bad = (msg: string) => { falhas++; console.log(`  FAIL  ${msg}`); };
const warn = (msg: string) => { avisos++; console.log(`  WARN  ${msg}`); };

// --- duplicated keys: JSON.parse keeps the last one silently, so the raw text is scanned first ---
function chavesDuplicadas(texto: string): string[] {
  const achadas: string[] = [];
  let i = 0;
  const espaco = () => { while (/\s/.test(texto[i] ?? "")) i++; };
  const cadeia = () => { let s = ""; i++; while (texto[i] !== '"') { if (texto[i] === "\\") { s += texto[i] + texto[i + 1]; i += 2; } else s += texto[i++]; } i++; return s; };
  const valorJson = (caminho: string): void => {
    espaco();
    const c = texto[i];
    if (c === "{") {
      i++;
      const vistas = new Set<string>();
      espaco();
      if (texto[i] === "}") { i++; return; }
      for (;;) {
        espaco();
        const k = cadeia();
        if (vistas.has(k)) achadas.push(`${caminho}.${k}`);
        vistas.add(k);
        espaco(); i++; // :
        valorJson(`${caminho}.${k}`);
        espaco();
        if (texto[i++] === "}") return;
      }
    }
    if (c === "[") {
      i++;
      espaco();
      if (texto[i] === "]") { i++; return; }
      for (let n = 0; ; n++) { valorJson(`${caminho}[${n}]`); espaco(); if (texto[i++] === "]") return; }
    }
    if (c === '"') { cadeia(); return; }
    while (i < texto.length && !/[,\]}\s]/.test(texto[i])) i++;
  };
  valorJson("$");
  return achadas;
}

const bruto = readFileSync(arquivo, "utf8");
console.log(`Meu Pequeno Mundo — perfis: ${path.relative(process.cwd(), arquivo)}`);

console.log("\n[1] Formato do arquivo");
let d: { v?: number; fontes?: Record<string, Record<string, unknown>>; cidades?: Record<string, Record<string, any>> };
try { d = JSON.parse(bruto); } catch (e) { bad(`JSON inválido: ${(e as Error).message}`); process.exit(1); }
const duplicadas = chavesDuplicadas(bruto);
if (duplicadas.length) bad(`chaves repetidas (o JSON guardaria só a última): ${duplicadas.join(", ")}`);
else ok("nenhuma chave repetida");
if (d.v !== 1 || typeof d.fontes !== "object" || typeof d.cidades !== "object") { bad('esperado { "v": 1, "fontes": {…}, "cidades": {…} }'); process.exit(1); }
ok(`${Object.keys(d.cidades!).length} perfis, ${Object.keys(d.fontes!).length} fontes`);

console.log("\n[2] Fontes");
const fontes = d.fontes!;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
for (const [chave, f] of Object.entries(fontes)) {
  const faltam = ["titulo", "publicador", "url", "referencia", "consultadoEm"].filter((k) => typeof f[k] !== "string" || !(f[k] as string).trim());
  if (/PREENCHER/.test(chave + JSON.stringify(f))) bad(`fonte ${chave}: ainda com PREENCHER`);
  if (faltam.length) bad(`fonte ${chave}: falta ${faltam.join(", ")}`);
  else if (!/^https:\/\//.test(f.url as string)) bad(`fonte ${chave}: a URL precisa ser https`);
  else if (!DATA.test(f.consultadoEm as string)) bad(`fonte ${chave}: consultadoEm deve ser AAAA-MM-DD`);
}
const usadas = new Set<string>();

console.log("\n[3] Perfis");
// IDs and names come from the same builder the storefront and the export use (src/lib/mundo/catalogo.ts): no second list of places.
let indice: Map<string, { n: string; u: string; r: string }> | null = null;
try {
  indice = new Map(indiceDoMundo(REGION_SLUGS).map((l) => [l.i, l]));
  ok(`catálogo carregado: ${indice.size} lugares`);
} catch (e) {
  warn(`sem o catálogo local (${(e as Error).message.split("\n")[0]}): IDs conferidos só pelo formato`);
}
const ID_VALIDO = /^(\d{7}|df-ra:[a-z0-9-]{1,60})$/;
const COR = /^#[0-9a-f]{6}$/i;
const LIMITES = { frase: 160, resumo: 600, texto: 420, curto: 200, curiosidade: 400, titulo: 80, rotulo: 90, nota: 140 };
const MARCO_PEDE: Record<string, (v: any) => boolean> = {
  "ponte-urbana": (v) => ["rio", "rio-largo", "vereda"].includes(v.agua?.modulo),
  "encontro-aguas": (v) => ["rio", "rio-largo", "vereda"].includes(v.agua?.modulo),
  baleia: (v) => v.agua?.modulo === "mar",
  dunas: (v) => v.relevo?.modulo === "costa-dunas",
  "pico-cruz": (v) => v.relevo?.modulo === "vale-montes",
  farol: (v) => ["mar", "costa"].includes(v.agua?.modulo),
  "ponte-pensil": (v) => ["rio", "rio-largo", "mar", "costa"].includes(v.agua?.modulo),
  trapiche: (v) => ["mar", "costa", "rio", "rio-largo", "lago", "lagoas", "lagoas-muitas"].includes(v.agua?.modulo),
};
const STATUS = ["curadoria inicial", "revisão externa", "aprovado"];
const editorial: { id: string; nome: string; estrutura: boolean; status: string; em: string; obs: string }[] = [];

for (const [id, c] of Object.entries(d.cidades!)) {
  const antes = falhas;
  const nome = c?.identidade?.nome ?? id;
  const erro = (msg: string) => bad(`${nome} (${id}): ${msg}`);
  const aviso = (msg: string) => warn(`${nome} (${id}): ${msg}`);
  const fontesDe = (lista: unknown, onde: string, minimo = 1) => {
    if (!Array.isArray(lista) || lista.length < minimo) { erro(`${onde} sem fonte`); return; }
    for (const f of lista) { if (typeof f !== "string" || !fontes[f]) erro(`${onde} cita a fonte "${f}", que não está em "fontes"`); else usadas.add(f); }
  };
  const tamanho = (t: unknown, lim: number, onde: string, obrigatorio = true) => {
    if (typeof t !== "string" || !t.trim()) { if (obrigatorio) erro(`${onde} em branco`); return; }
    if (t.length > lim) erro(`${onde} com ${t.length} caracteres (a experiência mostra até ${lim})`);
  };

  const pendentes = (JSON.stringify(c).match(/PREENCHER/g) ?? []).length;
  if (pendentes) erro(`${pendentes} campo(s) ainda com PREENCHER (modelo não preenchido)`);

  // identidade
  if (!ID_VALIDO.test(id)) erro("ID fora do formato (7 dígitos do IBGE ou df-ra:<região>)");
  const ident = c?.identidade ?? {};
  if (ident.id !== id) erro(`identidade.id (${ident.id}) diferente da chave`);
  if (!ident.nome || !ident.uf) erro("identidade sem nome ou UF");
  if (!REGION_SLUGS.includes(ident.regiaoLoja)) erro(`regiaoLoja "${ident.regiaoLoja}" não é uma loja (${REGION_SLUGS.join(", ")})`);
  if (indice) {
    const lugar = indice.get(id);
    if (!lugar) erro("ID não existe no catálogo do mundo (sem página de cidade na loja)");
    else {
      if (lugar.n !== ident.nome) aviso(`nome "${ident.nome}" difere do catálogo ("${lugar.n}")`);
      if (lugar.u !== ident.uf) erro(`UF ${ident.uf} difere do catálogo (${lugar.u})`);
      if (lugar.r !== ident.regiaoLoja) erro(`regiaoLoja ${ident.regiaoLoja} difere do catálogo (${lugar.r})`);
    }
  }
  if (c?.cobertura !== "completo") aviso(`cobertura "${c?.cobertura}" (a experiência trata como parcial)`);

  // conteúdo
  const ct = c?.conteudo ?? {};
  tamanho(ct.frase, LIMITES.frase, "frase");
  tamanho(ct.resumo, LIMITES.resumo, "resumo");
  const frases = (ct.resumo ?? "").split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).filter(Boolean).length;
  if (frases < 3 || frases > 5) aviso(`resumo com ${frases} frases (o guia pede de 3 a 5)`);
  fontesDe(ct.fontesResumo, "resumo");
  const refs = Array.isArray(ct.referencias) ? ct.referencias : [];
  if (refs.length < 2 || refs.length > 3) erro(`${refs.length} referências (o guia pede de 2 a 3; a experiência mostra até 3)`);
  const idsRef = new Set<string>();
  for (const r of refs) {
    const onde = `referência "${r?.id}"`;
    if (!r?.id) erro("referência sem id");
    else if (idsRef.has(r.id)) erro(`${onde} repetida`);
    idsRef.add(r?.id);
    if (!(TEXTOS.tiposReferencia as Record<string, string>)[r?.tipo]) erro(`${onde}: tipo "${r?.tipo}" desconhecido (${Object.keys(TEXTOS.tiposReferencia).join(", ")})`);
    tamanho(r?.titulo, LIMITES.titulo, `${onde}: titulo`);
    tamanho(r?.texto, LIMITES.texto, `${onde}: texto`);
    tamanho(r?.curto, LIMITES.curto, `${onde}: curto`, !!r?.descoberta); // o curto aparece no balão do marco
    fontesDe(r?.fontes, onde);
    if (r?.descoberta) {
      if (!MODULOS.marcos.includes(r.descoberta.modulo)) erro(`${onde}: descoberta com módulo desconhecido "${r.descoberta.modulo}"`);
      tamanho(r.descoberta.nota, LIMITES.nota, `${onde}: nota da descoberta`);
    }
  }
  const curiosidades = Array.isArray(ct.curiosidades) ? ct.curiosidades : [];
  if (curiosidades.length > 2) aviso(`${curiosidades.length} curiosidades (a experiência mostra 2)`);
  curiosidades.forEach((x: any, k: number) => { tamanho(x?.texto, LIMITES.curiosidade, `curiosidade ${k + 1}`); fontesDe(x?.fontes, `curiosidade ${k + 1}`); });
  if (ct.gentilico) { if (!ct.gentilico.oficial) erro("gentílico sem forma oficial"); fontesDe(ct.gentilico.fontes, "gentílico"); }

  // geografia
  const g = c?.geografia ?? {};
  if (g.sede) {
    if (typeof g.sede.lat !== "number" || typeof g.sede.lon !== "number") erro("sede sem lat/lon numéricos");
    fontesDe(g.sede.fontes, "sede");
  } else aviso("sem ponto de referência (sede): a experiência não mostra distância para este lugar");
  if (!Number.isInteger(g.populacao?.censo?.valor) || !Number.isInteger(g.populacao?.censo?.ano)) erro("população do censo sem valor ou ano");
  else fontesDe(g.populacao.censo.fontes, "população");
  if (typeof g.area?.km2 !== "number" || !Number.isInteger(g.area?.ano)) erro("área sem km² ou ano");
  else fontesDe(g.area.fontes, "área");
  if (!g.regioes) erro("sem regiões do IBGE"); else fontesDe(g.regioes.fontes, "regiões");

  // visual: só o que a cena conhece
  const v = c?.visual ?? {};
  const desconhecido = (tipo: string, nome: unknown, lista: readonly string[]) => { if (!lista.includes(nome as string)) erro(`${tipo} "${nome}" não existe na cena (${lista.join(", ")})`); };
  (v.ambientes ?? []).forEach((a: string) => desconhecido("ambiente", a, Object.keys(AMBIENTES)));
  if (!(v.ambientes ?? []).length) aviso("sem ambientes (o resumo do mundo não cita a paisagem)");
  tamanho(v.rotulo, LIMITES.rotulo, "rótulo da paisagem");
  desconhecido("base", v.base, Object.keys(PAISAGENS));
  if (v.relevo) desconhecido("relevo", v.relevo.modulo, MODULOS.relevo);
  if (v.agua) desconhecido("água", v.agua.modulo, MODULOS.agua);
  (v.vegetacao ?? []).forEach(([t, q]: [string, number]) => { desconhecido("vegetação", t, MODULOS.vegetacao); if (!Number.isInteger(q) || q < 0 || q > 40) erro(`vegetação "${t}" com quantidade ${q} (0 a 40)`); });
  if (v.construcoes) desconhecido("construções", v.construcoes.estilo, MODULOS.construcoes);
  (v.extras ?? []).forEach((x: string) => desconhecido("extra", x, MODULOS.extras));
  for (const [k, cor] of Object.entries(v.cores ?? {})) if (![cor].flat().every((x) => COR.test(x as string))) erro(`cor "${k}" inválida`);
  const marcos = Array.isArray(v.marcos) ? v.marcos : [];
  if (marcos.length > 2) erro(`${marcos.length} marcos (no máximo 2 interativos)`);
  for (const m of marcos) {
    desconhecido("marco", m?.modulo, MODULOS.marcos);
    const r = refs.find((x: any) => x?.id === m?.referencia);
    if (!r) erro(`marco "${m?.modulo}" aponta para a referência "${m?.referencia}", que não existe`);
    else if (r.descoberta?.modulo !== m.modulo) erro(`marco "${m.modulo}" e a descoberta da referência "${r.id}" (${r.descoberta?.modulo ?? "nenhuma"}) não batem`);
    if (MARCO_PEDE[m?.modulo] && !MARCO_PEDE[m.modulo](v)) erro(`marco "${m.modulo}" precisa de outro relevo ou água neste perfil`);
  }
  for (const r of refs) if (r?.descoberta && !marcos.some((m: any) => m?.referencia === r.id)) aviso(`referência "${r.id}" tem descoberta, mas nenhum marco a usa`);

  // revisão
  const rev = c?.revisao ?? {};
  if (!STATUS.includes(rev.status)) erro(`revisao.status "${rev.status}" (use: ${STATUS.join(", ")})`);
  if (!DATA.test(rev.em ?? "")) erro("revisao.em deve ser AAAA-MM-DD");
  if (rev.status === "aprovado" && !rev.por) erro('revisão "aprovado" sem "por" (quem aprovou)');
  editorial.push({ id, nome, estrutura: falhas === antes, status: rev.status ?? "—", em: rev.em ?? "—", obs: rev.observacao ?? "" });
}

const naoUsadas = Object.keys(fontes).filter((k) => !usadas.has(k));
if (naoUsadas.length) warn(`fontes declaradas e não citadas: ${naoUsadas.join(", ")}`);

console.log("\n[4] Aprovação estrutural × editorial");
for (const e of editorial) {
  console.log(`  ${e.estrutura ? "estrutura OK  " : "estrutura FAIL"}  editorial: ${e.status.padEnd(17)} ${e.em}  ${e.nome} (${e.id})`);
  if (exigirEditorial && e.status !== "aprovado") bad(`${e.nome}: sem aprovação editorial (revisao.status = "${e.status}")`);
}

console.log(`\n${falhas ? `${falhas} falha(s)` : "Nenhuma falha"}${avisos ? `, ${avisos} aviso(s)` : ""}.`);
process.exit(falhas ? 1 : 0);
