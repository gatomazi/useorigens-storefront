// Builds data/geo/municipios.json from the public IBGE localities API. Run explicitly (`npm run geo:build`),
// never at request time or as part of `next build` — see docs/deploy/railway.md and ADR 0004. Reproducible:
// same public endpoint, deterministic sort, no manual editing of the output.
//
// Only municipalities of the three storefront regions are kept.
//
// Two geographic facts are captured per municipality, deliberately kept apart (see ADR 0004,
// src/lib/geo/cities.ts): the CURRENT administrative division (Região Geográfica Intermediária, 2017 — the
// division IBGE uses today) and the EDITORIAL grouping used for the storefront's own navigation and copy
// (the discontinued mesoregion). Both come from the same IBGE endpoint; neither is guessed or inferred.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { UF_TO_REGION } from "../src/lib/geo/regions";

const OUTPUT_PATH = "data/geo/municipios.json";

type IbgeMunicipio = {
  id: number;
  nome: string;
  microrregiao?: { mesorregiao?: { nome?: string; UF?: { sigla: string } } } | null;
  "regiao-imediata"?: { "regiao-intermediaria"?: { nome?: string; UF?: { sigla: string } } } | null;
};

/** Minimal schema check: the fields this script actually reads, on a sample of the response, not the full IBGE contract. */
function isPlausibleMunicipio(value: unknown): value is IbgeMunicipio {
  return typeof value === "object" && value !== null && typeof (value as IbgeMunicipio).id === "number" && typeof (value as IbgeMunicipio).nome === "string";
}

const res = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios");
if (!res.ok) throw new Error(`IBGE responded ${res.status}`);
const raw = (await res.json()) as unknown;
if (!Array.isArray(raw) || raw.length === 0) throw new Error("IBGE response is not a non-empty array — refusing to write an empty/corrupt dataset");
const badSample = raw.slice(0, 50).filter((m) => !isPlausibleMunicipio(m));
if (badSample.length > 0) throw new Error(`IBGE response shape looks wrong (schema check failed on ${badSample.length}/50 sampled rows) — refusing to write`);

// [ibge id, name, uf, current intermediate region ("Chapecó"), editorial mesoregion ("Oeste Catarinense")]
const rows: [number, string, string, string, string][] = [];
const missingCurrent: string[] = [];
const missingMeso: string[] = [];
for (const m of raw as IbgeMunicipio[]) {
  const intermediate = m["regiao-imediata"]?.["regiao-intermediaria"];
  const meso = m.microrregiao?.mesorregiao;
  const uf = intermediate?.UF?.sigla ?? meso?.UF?.sigla;
  if (!uf || !(uf in UF_TO_REGION)) continue;
  // Never guess: a municipality IBGE has not placed yet keeps an empty name and the UI omits it.
  if (!intermediate?.nome) missingCurrent.push(`${m.nome}/${uf}`);
  if (!meso?.nome) missingMeso.push(`${m.nome}/${uf}`);
  rows.push([m.id, m.nome, uf, intermediate?.nome ?? "", meso?.nome ?? ""]);
}
rows.sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1], "pt-BR"));

// Coverage guard, generic on purpose (no hardcoded municipality count — that is a real fact that can shift
// over the years as IBGE splits/merges municipalities, not a bug to alarm on by a fixed number):
// 1. The Sul — the one region actually live — must have zero municipalities without a mesoregion (ADR 0004
//    requires full coverage for it specifically; Norte/Centro-Oeste are not curated yet and may legitimately
//    have gaps).
// 2. The total row count must not have dropped by more than 1% from whatever is already committed — a
//    generic guard against a partial/broken IBGE response silently shrinking the dataset.
const sulMissingMeso = missingMeso.filter((entry) => entry.endsWith("/PR") || entry.endsWith("/SC") || entry.endsWith("/RS"));
if (sulMissingMeso.length > 0) {
  throw new Error(`Sul municipalities without a mesoregion (ADR 0004 requires full coverage): ${sulMissingMeso.join(", ")}`);
}
try {
  const previous = JSON.parse(await readFile(OUTPUT_PATH, "utf8")) as unknown[];
  const drop = previous.length - rows.length;
  if (drop > previous.length * 0.01) {
    throw new Error(`row count dropped from ${previous.length} to ${rows.length} (>1%) — looks like a partial IBGE response, refusing to overwrite ${OUTPUT_PATH}`);
  }
} catch (err) {
  if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`no previous ${OUTPUT_PATH} to compare against (first run)`);
  } else {
    throw err;
  }
}

await mkdir("data/geo", { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(rows));
console.log(`municipios written: ${rows.length}`);
if (missingCurrent.length) console.warn(`without IBGE intermediate region (left empty): ${missingCurrent.join(", ")}`);
if (missingMeso.length) console.warn(`without IBGE mesoregion (left empty, outside the Sul): ${missingMeso.join(", ")}`);
