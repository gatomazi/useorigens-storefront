// Gera data/geo/municipios-brasil.json: TODOS os municípios do Brasil (IBGE), só código, nome e UF, para o campo de cidade das estampas
// personalizáveis (placa "UF - CIDADE"). É uma lista à parte de data/geo/municipios.json, que tem só as regiões da loja e alimenta a navegação.
//
//   npx tsx scripts/build-municipios-brasil.mts
import { writeFileSync } from "node:fs";
import path from "node:path";

const URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado";
type Row = { "municipio-id": number; "municipio-nome": string; "UF-sigla": string };

const res = await fetch(URL, { signal: AbortSignal.timeout(60_000) });
if (!res.ok) throw new Error(`IBGE → ${res.status}`);
const rows = (await res.json()) as Row[];
if (rows.length < 5500) throw new Error(`o IBGE devolveu só ${rows.length} municípios`);
const out = rows
  .map((r) => [String(r["municipio-id"]), r["municipio-nome"].normalize("NFC").trim(), r["UF-sigla"]] as const)
  .sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1], "pt-BR"));
const keys = new Set(out.map(([, name, uf]) => `${name}/${uf}`));
if (keys.size !== out.length) throw new Error("dois municípios com o mesmo nome na mesma UF: o valor do campo deixaria de ser único");
// Uma linha por município: [código IBGE, nome, UF].
writeFileSync(path.join(import.meta.dirname, "..", "data", "geo", "municipios-brasil.json"), `[\n${out.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
console.log(`${out.length} municípios, ${new Set(out.map((r) => r[2])).size} UFs`);
