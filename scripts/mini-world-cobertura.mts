// Rewrites docs/mundo/cobertura-perfis.md from data/mundo/perfis-cidades.json: one row per curated profile and its open points.
// Usage: npm run mundo:cobertura (after npm run mundo:validar).
/* eslint-disable @typescript-eslint/no-explicit-any -- reads the curated JSON as-is; the validator checks its shape */
import { readFileSync, writeFileSync } from "node:fs";

const d = JSON.parse(readFileSync("data/mundo/perfis-cidades.json", "utf8"));
const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const cidades = Object.values(d.cidades) as any[];
cidades.sort((a, b) => a.identidade.regiaoLoja.localeCompare(b.identidade.regiaoLoja) || a.identidade.uf.localeCompare(b.identidade.uf) || a.identidade.nome.localeCompare(b.identidade.nome, "pt"));
const fontesDe = (c: any) => {
  const s = new Set<string>();
  const anda = (x: any): void => {
    if (Array.isArray(x)) x.forEach(anda);
    else if (x && typeof x === "object") {
      for (const [k, v] of Object.entries(x)) {
        if ((k === "fontes" || k === "fontesResumo") && Array.isArray(v)) v.forEach((f) => s.add(f as string));
        else anda(v);
      }
    }
  };
  anda(c);
  return s.size;
};
const porStatus = cidades.reduce((m: Record<string, number>, c) => ({ ...m, [c.revisao.status]: (m[c.revisao.status] ?? 0) + 1 }), {});
const linhas = [
  "# Meu Pequeno Mundo — cobertura dos perfis curados",
  "",
  `Gerado por \`npm run mundo:cobertura\` a partir de \`data/mundo/perfis-cidades.json\` em ${hoje}. Estrutura validada por`,
  `\`npm run mundo:validar\`. ${cidades.length} perfis: ${Object.entries(porStatus).map(([s, n]) => `${n} em ${s}`).join(", ")}.`,
  "",
  "A coluna *Fontes* conta as fontes distintas citadas pelo perfil. *Marcos* são as formas clicáveis na maquete (no máximo 2).",
  "",
  "| Cidade | Loja | Referências | Marcos | Paisagem | Fontes | Revisão |",
  "|---|---|---|---|---|---|---|",
  ...cidades.map((c) => {
    const refs = c.conteudo.referencias.map((r: any) => r.titulo).join(", ");
    const marcos = (c.visual.marcos ?? []).map((m: any) => `\`${m.modulo}\``).join(", ") || "—";
    const amb = `${(c.visual.ambientes ?? []).join(", ")} · base \`${c.visual.base}\``;
    return `| ${c.identidade.nome} (${c.identidade.uf}) | ${c.identidade.regiaoLoja} | ${refs} | ${marcos} | ${amb} | ${fontesDe(c)} | ${c.revisao.status} (${c.revisao.em}) |`;
  }),
  "",
  `Os demais lugares do catálogo não têm perfil e aparecem com o cenário da curadoria regional, o ponto do IBGE quando existe e um aviso`,
  "de cenário ilustrativo.",
  "",
  "## Pendências por perfil (de `revisao.observacao`)",
  "",
  ...cidades.map((c) => `- **${c.identidade.nome} (${c.identidade.uf})**: ${c.revisao.observacao ?? "—"}`),
  "",
];
writeFileSync("docs/mundo/cobertura-perfis.md", linhas.join("\n"));
console.log(`${cidades.length} perfis → docs/mundo/cobertura-perfis.md`);
