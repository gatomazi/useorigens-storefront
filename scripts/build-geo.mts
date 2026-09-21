// Builds data/geo/municipios.json from the public IBGE localities API.
// Only municipalities of the three storefront regions are kept.
// Grouping uses the current IBGE division (2017): Região Geográfica Intermediária. The old mesoregions
// and microregions were discontinued by IBGE and are not used.
import { mkdir, writeFile } from "node:fs/promises";
import { UF_TO_REGION } from "../src/lib/geo/regions";

type IbgeMunicipio = {
  id: number;
  nome: string;
  "regiao-imediata"?: { "regiao-intermediaria"?: { nome?: string; UF?: { sigla: string } } } | null;
};

const res = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios");
if (!res.ok) throw new Error(`IBGE responded ${res.status}`);
const raw = (await res.json()) as IbgeMunicipio[];

// [ibge id, name, uf, IBGE intermediate region name ("Chapecó")]
const rows: [number, string, string, string][] = [];
const missing: string[] = [];
for (const m of raw) {
  const intermediate = m["regiao-imediata"]?.["regiao-intermediaria"];
  const uf = intermediate?.UF?.sigla;
  if (!uf || !(uf in UF_TO_REGION)) continue;
  // Never guess: a municipality IBGE has not placed yet keeps an empty name and the UI omits it.
  if (!intermediate?.nome) missing.push(`${m.nome}/${uf}`);
  rows.push([m.id, m.nome, uf, intermediate?.nome ?? ""]);
}
rows.sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1], "pt-BR"));

await mkdir("data/geo", { recursive: true });
await writeFile("data/geo/municipios.json", JSON.stringify(rows));
console.log(`municipios written: ${rows.length}`);
if (missing.length) console.warn(`without IBGE intermediate region (left empty): ${missing.join(", ")}`);
