import { allCities, citiesByName, type City } from "../geo/cities";
import { STATE_NAMES } from "../geo/regions";
import { normalizeText } from "../geo/text";
import { DIZERES_CONTEXT } from "../editorial/sul";

/**
 * Text signals the recommender reads from a product NAME. Deterministic, dictionary-sized and explainable: no NLP, no
 * embeddings, no network. A name only ever yields a fact when it is unambiguous (one municipality, one state); anything
 * else is simply "unknown", never guessed.
 */

/** Words that carry no editorial meaning on their own (articles, prepositions, piece/print words, family labels). */
const STOPWORDS = new Set([
  "a", "o", "as", "os", "e", "de", "da", "do", "das", "dos", "di", "em", "no", "na", "nos", "nas", "um", "uma", "com", "pra", "para", "por", "se",
  "eu", "tu", "me", "mi", "meu", "minha", "the", "of", "is", "it", "you", "all", "need",
  // print/piece words: "Pocket", "Club", "Edition", "P&B" never say what the design is about
  "pocket", "club", "edition", "pb", "p", "b", "colored", "clean", "minimal", "essencia", "dizeres", "lenda", "treino", "regional",
  // the eight city families (a city product is ALWAYS one of them: they say nothing about affinity)
  "origem", "coordenadas", "legado", "traco", "territorio", "tipografia", "gentilico", "feito", "personalizado", "personalizada", "localidade",
]);

/**
 * Small, closed theme lexicon (MD §8.4: "pai, churrasco, gaúcho, chimarrão, mate..."). A token belongs to a theme only by exact
 * normalized match. Themes are a complement: they never make a product eligible on their own (see score.ts thresholds).
 */
const THEMES: Readonly<Record<string, readonly string[]>> = {
  mate: ["mate", "chimarrao", "chimas", "erva", "cuia", "terere", "mateador"],
  churrasco: ["churrasco", "churrasqueiro", "assador", "brasa", "costela", "entrevero"],
  pai: ["pai", "pais", "avo", "papai", "manefather"],
  familia: ["mae", "maes", "nona", "matriarca", "esposa", "marido", "filho", "filha", "familia", "piazinho", "guriazinha"],
  litoral: ["praia", "litoral", "onda", "ondas", "mar", "verao", "surfista", "tainha", "pescador", "pesca", "dazumbanho"],
  serra: ["serra", "serrano", "serrana", "frio", "inverno", "neve"],
  campo: ["campo", "campeiro", "gineteador", "estancia", "galpao", "pampa", "pago", "peao", "fazendeiro", "colono", "truco"],
  cerveja: ["cerveja", "chopp", "chope", "prosit", "cervejeiro", "bretzel"],
  esporte: ["corredor", "corredora", "ciclista", "trilheiro", "trilheira", "nadadora", "caiaqueira", "viajante", "treino"],
  futebol: ["gremista", "colorado", "avaiano"],
  pinhao: ["pinhao", "pinhoes", "araucaria"],
  bergamota: ["berga", "bergas", "bergamota", "gomo"],
  gauchesco: ["bah", "tche", "tri", "bagual", "baita", "guri", "guria", "gaucho", "gaucha", "gauche", "chinelao", "capaz"],
  manezinho: ["mane", "manezinho", "manezitous", "coza", "intizica", "quex"],
  pantanal: ["pantaneiro", "pantaneira", "pantanal", "tuiuiu", "chipa"],
  cerrado: ["pequi", "pequizeiro", "pequizeira", "cerrado", "trem", "uai", "goianidade"],
};
const THEME_OF = new Map<string, string[]>();
for (const [theme, words] of Object.entries(THEMES)) for (const w of words) THEME_OF.set(w, [...(THEME_OF.get(w) ?? []), theme]);

/** Demonyms that name exactly ONE state (MD §8.4 "paranaense, catarinense"). "Pantaneiro" spans MT and MS: deliberately absent. */
const DEMONYM_UF: Readonly<Record<string, string>> = {
  gaucho: "RS", gaucha: "RS", gauche: "RS", gauchos: "RS",
  catarinense: "SC", catarine: "SC",
  paranaense: "PR",
  candango: "DF", candanga: "DF", brasiliense: "DF",
  goiano: "GO", goiana: "GO", goianidade: "GO",
  "mato grossense": "MT",
  "sul mato grossense": "MS",
  amazonense: "AM", paraense: "PA", acreano: "AC", amapaense: "AP", roraimense: "RR", rondoniense: "RO", tocantinense: "TO",
};

/** Brazilian area codes are state-bound (ANATEL). Only the codes of the three regions sold today. */
const DDD_UF: Readonly<Record<string, string>> = {
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  "61": "DF", "62": "GO", "64": "GO", "63": "TO", "65": "MT", "66": "MT", "67": "MS",
  "68": "AC", "69": "RO", "91": "PA", "93": "PA", "94": "PA", "92": "AM", "97": "AM", "95": "RR", "96": "AP",
};

const STATE_BY_NAME = new Map(Object.entries(STATE_NAMES).map(([uf, name]) => [normalizeText(name), uf]));

export const clean = (name: string): string => name.replace(/\s+/g, " ").trim();

/** Segments of an INK product name: "Pai | Mate de Origem" → ["Pai", "Mate de Origem"]; "Ronca e Passa — Pocket" → ["Ronca e Passa", "Pocket"]. */
export function segmentsOf(name: string): string[] {
  return clean(name)
    .split(/\s*\|\s*|\s+[—–]\s+|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The design's own title (first segment): two products with the same base title are the same idea on another piece/print. */
export const baseTitleOf = (name: string): string => normalizeText(segmentsOf(name)[0] ?? name);

/** Card title: INK's " | " separators read as " · " in our block ("Florianópolis | Coordenadas" → "Florianópolis · Coordenadas"). */
export const displayTitle = (name: string): string => clean(name).replace(/\s*\|\s*/g, " · ");

export function tokensOf(name: string): string[] {
  const words = normalizeText(name).split(" ");
  return [...new Set(words.filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w)))].sort();
}

export function themesOf(tokens: readonly string[]): string[] {
  return [...new Set(tokens.flatMap((t) => THEME_OF.get(t) ?? []))].sort();
}

export const ufOfAreaCode = (code: string): string | null => DDD_UF[String(Number(code))] ?? null;

/** The state a whole segment names exactly ("Paraná", "RS", "Mato Grosso do Sul"), else null. */
export function stateOfSegment(segment: string, ufs: readonly string[]): string | null {
  const key = normalizeText(segment);
  const byName = STATE_BY_NAME.get(key);
  if (byName && ufs.includes(byName)) return byName;
  const upper = segment.trim().toUpperCase();
  if (upper.length === 2 && ufs.includes(upper) && segment.trim() === upper) return upper;
  return null;
}

/** Print-colour words never make a different line: "Treino P&B" is the "Treino" line, "Colored" is the plain one. */
const LINE_NOISE = new Set(["p", "b", "pb", "colored", "color", "regional"]);
export const lineKey = (segment: string): string | null => normalizeText(segment).split(" ").filter((w) => !LINE_NOISE.has(w)).join(" ") || null;

export type NameGeo = {
  /** The one state the name points to, or null when it names none or several. */
  uf: string | null;
  /** How the state was found (observability). */
  ufSource: "locality" | "state-name" | "uf-code" | "ddd" | "demonym" | "dizeres" | null;
  /** A municipality named by a WHOLE segment, unique among the store's states. */
  locality: City | null;
  /** True when the design's subject is the state itself ("Paraná | Clean", "Made in Goiás", "Paranaense | Essência"). */
  stateIdentity: boolean;
  /** Line = the segment after the title when it is not a place ("Dizeres", "Lenda", "Treino P&B", "Pocket", "048"); "made in" for Made in X. */
  line: string | null;
};

function demonymUf(normalized: string, ufs: readonly string[]): string[] {
  const found = new Set<string>();
  // Longest first so "sul mato grossense" never also counts as "mato grossense".
  let rest = ` ${normalized} `;
  for (const key of Object.keys(DEMONYM_UF).sort((a, b) => b.length - a.length)) {
    if (rest.includes(` ${key} `)) {
      if (ufs.includes(DEMONYM_UF[key])) found.add(DEMONYM_UF[key]);
      rest = rest.replace(` ${key} `, " ");
    }
  }
  return [...found];
}

function statesInText(normalized: string, ufs: readonly string[]): string[] {
  const found = new Set<string>();
  let rest = ` ${normalized} `;
  for (const [key, uf] of [...STATE_BY_NAME.entries()].sort((a, b) => b[0].length - a[0].length)) {
    if (rest.includes(` ${key} `)) {
      if (ufs.includes(uf)) found.add(uf);
      rest = rest.replace(` ${key} `, " ");
    }
  }
  return [...found];
}

/**
 * Geography and line of an editorial product, read from its name only. Order of trust: a municipality named by a whole segment,
 * then a state named by a whole segment or inside the text, then a two-letter UF segment, an area code, a single-state demonym,
 * and last the existing editorial attribution of "Dizeres" (src/lib/editorial/sul.ts). Two different states ⇒ unknown.
 */
export function geoOfName(name: string, ufs: readonly string[]): NameGeo {
  const segments = segmentsOf(name);
  const normalized = normalizeText(name);
  let locality: City | null = null;
  let line: string | null = null;
  let stateIdentity = false;
  const candidates: { uf: string; source: NameGeo["ufSource"] }[] = [];

  for (const [i, segment] of segments.entries()) {
    const state = stateOfSegment(segment, ufs);
    if (state) {
      candidates.push({ uf: state, source: segment.trim().length === 2 ? "uf-code" : "state-name" });
      if (i === 0) stateIdentity = true;
      continue;
    }
    const ddd = /^0?(\d{2})(?:\s+regional)?$/i.exec(segment);
    if (ddd && i > 0) {
      const uf = ufOfAreaCode(ddd[1]);
      if (uf && ufs.includes(uf)) candidates.push({ uf, source: "ddd" });
      line = "ddd";
      continue;
    }
    const cities = citiesByName(segment.replace(/^sou d[aeo]s?\s+/i, ""), ufs);
    if (cities.length === 1 && !locality) {
      locality = cities[0];
      candidates.push({ uf: cities[0].uf, source: "locality" });
      continue;
    }
    if (i > 0 && line === null) line = lineKey(segment);
  }

  const madeIn = /^made in\s+(.+)$/i.exec(clean(name));
  if (madeIn) {
    line = "made in";
    const state = statesInText(normalizeText(madeIn[1]).replace(/\s+clean$/, ""), ufs);
    if (state.length === 1) {
      candidates.push({ uf: state[0], source: "state-name" });
      stateIdentity = true;
    }
  }
  if (candidates.length === 0) {
    const inText = statesInText(normalized, ufs);
    if (inText.length === 1) candidates.push({ uf: inText[0], source: "state-name" });
  }
  if (candidates.length === 0) {
    const demonyms = demonymUf(normalized, ufs);
    if (demonyms.length === 1) {
      candidates.push({ uf: demonyms[0], source: "demonym" });
      // "Paranaense | Essência", "Gaúcho": the design IS the state's people.
      if (segments.length <= 2 && demonymUf(normalizeText(segments[0] ?? ""), ufs).length === 1 && tokensOf(segments[0] ?? "").length <= 2) stateIdentity = true;
    }
  }
  if (candidates.length === 0 && line === "dizeres") {
    const ctx = DIZERES_CONTEXT[normalizeText(segments[0] ?? "")];
    if (ctx && ufs.includes(ctx.uf)) candidates.push({ uf: ctx.uf, source: "dizeres" });
  }

  const ufsFound = new Set(candidates.map((c) => c.uf));
  if (ufsFound.size !== 1) return { uf: null, ufSource: null, locality: ufsFound.size > 1 ? null : locality, stateIdentity: false, line };
  return { uf: candidates[0].uf, ufSource: candidates[0].source, locality, stateIdentity, line };
}

/** Mesoregion (the storefront's editorial "região", ADR 0004) named by a whole segment of the name, within one state. */
const MESO_BY_UF = (() => {
  const map = new Map<string, Map<string, string>>();
  for (const city of allCities()) {
    if (!city.meso) continue;
    const byName = map.get(city.uf) ?? new Map<string, string>();
    byName.set(normalizeText(city.meso), city.mesoSlug);
    map.set(city.uf, byName);
  }
  return map;
})();

export function mesoOfName(name: string, uf: string | null): string | null {
  if (!uf) return null;
  const mesos = MESO_BY_UF.get(uf);
  if (!mesos) return null;
  for (const segment of segmentsOf(name)) {
    const key = normalizeText(segment).replace(/^regiao\s+/, "");
    const hit = mesos.get(key);
    if (hit) return hit;
  }
  return null;
}
