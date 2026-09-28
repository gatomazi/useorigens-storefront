/**
 * Portuguese grammar for the states, in ONE place: titles, descriptions and visible text all read from here, so "do Paraná" is never
 * hand-typed (and mistyped as "de Paraná") in a page. Only the three Sul states carry a demonym: those are the ones the owner approved
 * ("camisetas gaúchas / catarinenses / paranaenses"); the other states fall back to the plain "de cidades do X" wording rather than a
 * demonym nobody reviewed.
 */
import { STATE_NAMES } from "../geo/regions";

type StateGrammar = {
  /** "do Paraná", "de Santa Catarina": the preposition already contracted with the article. */
  of: string;
  /** "no Paraná", "em Santa Catarina". */
  in: string;
  /** Plural feminine adjective for "camisetas ___", when approved. */
  demonym?: string;
};

const GRAMMAR: Readonly<Record<string, StateGrammar>> = {
  AC: { of: "do Acre", in: "no Acre" },
  AM: { of: "do Amazonas", in: "no Amazonas" },
  AP: { of: "do Amapá", in: "no Amapá" },
  DF: { of: "do Distrito Federal", in: "no Distrito Federal" },
  GO: { of: "de Goiás", in: "em Goiás" },
  MS: { of: "de Mato Grosso do Sul", in: "em Mato Grosso do Sul" },
  MT: { of: "de Mato Grosso", in: "em Mato Grosso" },
  PA: { of: "do Pará", in: "no Pará" },
  PR: { of: "do Paraná", in: "no Paraná", demonym: "paranaenses" },
  RO: { of: "de Rondônia", in: "em Rondônia" },
  RR: { of: "de Roraima", in: "em Roraima" },
  RS: { of: "do Rio Grande do Sul", in: "no Rio Grande do Sul", demonym: "gaúchas" },
  SC: { of: "de Santa Catarina", in: "em Santa Catarina", demonym: "catarinenses" },
  TO: { of: "do Tocantins", in: "no Tocantins" },
};

const grammarOf = (uf: string): StateGrammar => {
  const grammar = GRAMMAR[uf.toUpperCase()];
  if (!grammar) throw new Error(`no grammar for state ${uf}`);
  return grammar;
};

/** "do Paraná" */
export const stateOf = (uf: string): string => grammarOf(uf).of;
/** "no Paraná" */
export const stateIn = (uf: string): string => grammarOf(uf).in;
/** "paranaenses", or undefined when no demonym was approved for the state. */
export const stateDemonym = (uf: string): string | undefined => grammarOf(uf).demonym;

/** "do Paraná, de Santa Catarina e do Rio Grande do Sul" (each name keeps its own preposition). */
export function joinStatesOf(ufs: readonly string[]): string {
  const parts = ufs.map(stateOf);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/** Every state the storefront knows must have grammar, and its phrase must end with the state's real name (checked by a test). */
export const GRAMMAR_UFS: readonly string[] = Object.keys(STATE_NAMES);
