import { writeFileSync } from "node:fs";
import path from "node:path";
import { compareIds } from "../catalog/ranking";
import type { CommerceStoreKey } from "../geo/regions";
import type { BuildResult, DebugEntry } from "./build";
import type { RecommendationDocument } from "./documents";

/**
 * Human-review sample (MD §28): a deterministic selection of city and editorial pages per store with every recommendation, its score and
 * the named parts of that score. No model judges anything here — the file is for people.
 */
const NAMED_CITY_CASES: Partial<Record<CommerceStoreKey, string[]>> = {
  "use-sul": ["Florianópolis · Ponto de Origem", "Tijucas · Coordenadas", "Bagé · Traço", "Porto Alegre · Ponto de Origem", "Curitiba · Feito em", "Torres · Ponto de Origem"],
  "use-norte": ["Belém · Ponto de Origem", "Manaus · Coordenadas"],
  "use-centro": ["Goiânia · Ponto de Origem", "Cuiabá · Feito em", "Taguatinga · Ponto de Origem"],
};
const CITY_PER_STORE: Record<string, number> = { "use-sul": 12, "use-norte": 10, "use-centro": 10 };
const EDITORIAL_PER_STORE: Record<string, number> = { "use-sul": 24, "use-norte": 10, "use-centro": 12 };

function pickCities(store: CommerceStoreKey, docs: readonly RecommendationDocument[]): RecommendationDocument[] {
  const city = docs.filter((d) => d.kind === "city");
  const named = (NAMED_CITY_CASES[store] ?? []).flatMap((title) => city.filter((d) => d.representative.title === title).slice(0, 1));
  const out = [...named];
  // Then the best sellers among primaries, one per place, then one variant and one sub-locality product as edge cases.
  const seenPlace = new Set(out.map((d) => d.locality?.key));
  for (const d of [...city].filter((d) => d.primary).sort((a, b) => b.sales - a.sales || compareIds(a.representative.id, b.representative.id))) {
    if (out.length >= CITY_PER_STORE[store] - 2) break;
    if (seenPlace.has(d.locality?.key)) continue;
    seenPlace.add(d.locality?.key);
    out.push(d);
  }
  const variant = city.find((d) => !d.primary && !d.editorialSignals.includes("sub-locality"));
  const sub = city.find((d) => d.editorialSignals.includes("sub-locality"));
  return [...out, ...(variant ? [variant] : []), ...(sub ? [sub] : [])];
}

function pickEditorial(store: CommerceStoreKey, docs: readonly RecommendationDocument[]): RecommendationDocument[] {
  const editorial = docs.filter((d) => d.kind === "editorial").sort((a, b) => b.sales - a.sales || compareIds(a.representative.id, b.representative.id));
  // Round-robin over main collections so every editorial line is represented, then two "no context" designs.
  const byCollection = new Map<string, RecommendationDocument[]>();
  for (const d of editorial) {
    const key = d.mainCollection?.slug ?? "(sem coleção)";
    byCollection.set(key, [...(byCollection.get(key) ?? []), d]);
  }
  const out: RecommendationDocument[] = [];
  const queues = [...byCollection.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, list]) => [...list]);
  while (out.length < EDITORIAL_PER_STORE[store] && queues.some((q) => q.length)) for (const q of queues) if (q.length && out.length < EDITORIAL_PER_STORE[store]) out.push(q.shift()!);
  return out;
}

const esc = (s: string) => s.replace(/\|/g, "\\|");
const csv = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;

export function writeAudit(result: BuildResult, dir: string): string[] {
  const md: string[] = ["# Amostra de qualidade — recomendador automático (PDP INK)", "", `Índice gerado de: ${result.index.generatedAt}. Seleção determinística (casos nomeados, mais vendidos por lugar, variante, sublocalidade, e rodízio por coleção editorial).`, ""];
  const rows: string[] = [["store", "kind", "source_product_id", "source", "signals", "position", "recommended_product_id", "recommendation", "score", "reason", "parts"].map(csv).join(",")];
  const files: string[] = [];
  const counts = { city: 0, editorial: 0 };
  for (const [store, built] of Object.entries(result.built) as [CommerceStoreKey, NonNullable<BuildResult["built"][CommerceStoreKey]>][]) {
    const debug = result.debug[store] ?? new Map<string, DebugEntry>();
    for (const [kind, list] of [["city", pickCities(store, built.documents)], ["editorial", pickEditorial(store, built.documents)]] as const) {
      md.push(`## ${store} — ${kind === "city" ? "produtos de cidade" : "produtos editoriais"} (${list.length})`, "");
      md.push("| Produto atual | Sinais | # | Recomendação | Score | Reason |", "|---|---|---|---|---|---|");
      for (const doc of list) {
        counts[kind]++;
        const entry = debug.get(doc.representative.id) ?? debug.get(doc.memberIds[0]);
        const picks = entry?.picks ?? [];
        const signals = doc.editorialSignals.join(", ");
        if (picks.length === 0) {
          md.push(`| ${esc(doc.representative.title)} (${doc.representative.id}) | ${esc(signals)} | — | *(sem recomendações: bloco escondido)* | | |`);
          rows.push([store, kind, doc.representative.id, doc.representative.title, signals, "", "", "", "", "", ""].map(csv).join(","));
        }
        picks.forEach((p, i) => {
          md.push(`| ${i === 0 ? `${esc(doc.representative.title)} (${doc.representative.id})` : ""} | ${i === 0 ? esc(signals) : ""} | ${i + 1} | ${esc(p.title)} | ${p.score} | \`${p.reason}\` |`);
          rows.push([store, kind, doc.representative.id, doc.representative.title, signals, i + 1, p.productId, p.title, p.score, p.reason, p.parts.join("; ")].map(csv).join(","));
        });
      }
      md.push("");
    }
  }
  md.splice(3, 0, `Total: ${counts.city} produtos de cidade e ${counts.editorial} editoriais. O CSV ao lado traz também a decomposição do score de cada linha (\`parts\`).`, "");
  const mdFile = path.join(dir, "ink-auto-recommendations-sample.md");
  const csvFile = path.join(dir, "ink-auto-recommendations-sample.csv");
  writeFileSync(mdFile, md.join("\n") + "\n");
  writeFileSync(csvFile, rows.join("\n") + "\n");
  files.push(mdFile, csvFile);
  return files;
}
