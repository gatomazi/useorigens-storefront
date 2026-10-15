import perfisCidades from "../../../data/mundo/perfis-cidades.json";
import { fileKey } from "./catalogo";

/**
 * Curated city profiles of "Meu Pequeno Mundo" (data/mundo/perfis-cidades.json, versioned and reviewed by people — never generated),
 * served one city at a time: the experience fetches only the profiles of the places in the world, so the page cost does not grow with
 * the curation. Each record carries only the sources that city cites. The experience validates every field again on load.
 */
type Arquivo = { v: number; fontes: Record<string, unknown>; cidades: Record<string, unknown> };
const ARQUIVO = perfisCidades as unknown as Arquivo;
const PORCHAVE = new Map(Object.keys(ARQUIVO.cidades).map((id) => [fileKey(id), id]));

function fontesCitadas(x: unknown, achadas = new Set<string>()): Set<string> {
  if (Array.isArray(x)) for (const v of x) fontesCitadas(v, achadas);
  else if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) {
      if ((k === "fontes" || k === "fontesResumo") && Array.isArray(v)) {
        for (const f of v) if (typeof f === "string") achadas.add(f);
      } else fontesCitadas(v, achadas);
    }
  }
  return achadas;
}

/** IDs with a curated profile. */
export const idsComPerfil = () => Object.keys(ARQUIVO.cidades);

/** `{ v, fontes, cidades: { id } }` for one place, by its file key (same rule as the catalog records), or null when it has no profile. */
export function perfilDoMundo(chave: string) {
  const id = PORCHAVE.get(chave);
  if (!id) return null;
  const cidade = ARQUIVO.cidades[id];
  const citadas = fontesCitadas(cidade);
  return { v: ARQUIVO.v, fontes: Object.fromEntries(Object.entries(ARQUIVO.fontes).filter(([k]) => citadas.has(k))), cidades: { [id]: cidade } };
}
