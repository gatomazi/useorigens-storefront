/**
 * Deliberate city nicknames used by search. Key: `<UF>:<slug>`.
 * Only add entries that are widely used and unambiguous; accents/case are normalized at match time.
 */
export const ALIASES: Readonly<Record<string, readonly string[]>> = {
  "SC:florianopolis": ["floripa", "ilha da magia"],
  "SC:balneario-camboriu": ["bc"],
  "SC:joinville": ["cidade dos principes"],
  "RS:porto-alegre": ["poa"],
  "RS:caxias-do-sul": ["caxias"],
  "PR:curitiba": ["ctba"],
  "PR:foz-do-iguacu": ["foz"],
};
