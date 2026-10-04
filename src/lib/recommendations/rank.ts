import { compareIds } from "../catalog/ranking";
import { SAME_PLACE_FAMILY_ORDER, type RecommendationDocument } from "./documents";

/**
 * Deterministic, explainable scoring (MD §9). Every point has a named reason; the same inputs always give the same list.
 * Weights are a first cut, to be tuned after the human audit (docs/worker/ink-auto-recommendations-round.md).
 */
export const WEIGHTS = {
  sameMainCollection: 120,
  sameLine: 90,
  sameUf: 80,
  sameMeso: 60,
  sharedCollection: 50,
  sharedTheme: 50,
  /** Raised from the MD's first cut (40) after the audit: the state's own identity line must beat a merely nearby editorial for a city page. */
  complementaryFamily: 60,
  sharedTokens: 30,
  sameLocalityComplement: 20,
  featuredCollection: 15,
  popularityMax: 10,
  nearDuplicate: -150,
  sameDesign: -500,
  currentProduct: -1000,
} as const;

/** A candidate below this is never shown, whatever the slot count (MD §12: "nunca preencher com lixo"). Same state alone reaches it. */
export const MIN_SCORE = 80;
export const MAX_ITEMS = 4;
/** MD §10/§12: at most two designs about the same place in one list. */
export const MAX_SAME_LOCALITY = 2;
/** Soft caps (bend only when no relevant alternative exists) and hard caps (never bend: a 4th "Treino" is noise, the list shows 3). */
export const MAX_SAME_COLLECTION = 2;
export const MAX_SAME_LINE = 2;
export const HARD_MAX_SAME_COLLECTION = 3;
export const HARD_MAX_SAME_LINE = 3;

/** Closed vocabulary of reasons (the Worker validates against the same list). */
export const REASONS = [
  "same-locality:feito-em",
  "same-locality:coordinates",
  "same-locality:family",
  "same-collection",
  "same-line",
  "same-theme",
  "same-uf",
  "same-region",
  "shared-collection",
  "shared-tokens",
  "nearby-city",
] as const;
export type Reason = (typeof REASONS)[number];
const REASON_SPECIFICITY: readonly Reason[] = ["same-collection", "same-line", "same-region", "same-theme", "shared-collection", "same-uf", "shared-tokens"];

export type Scored = { doc: RecommendationDocument; score: number; reason: Reason; parts: string[] };

const popularity = (sales: number): number => Math.min(WEIGHTS.popularityMax, Math.round(Math.log2(1 + Math.max(0, sales)) * 2));

/**
 * Score of `candidate` as a suggestion on `source`'s page. Same product / same design are hard exclusions (null) — they are listed in
 * the weights only to make the rule explicit. Returns null too when nothing meaningful connects the two.
 */
export function scorePair(source: RecommendationDocument, candidate: RecommendationDocument): Scored | null {
  if (candidate.key === source.key || candidate.memberIds.includes(source.representative.id)) return null; // currentProduct
  if (candidate.clusterIds.some((c) => source.clusterIds.includes(c))) return null; // sameDesign (product_cluster_id = dedupe only)

  let score = 0;
  const parts: string[] = [];
  const add = (points: number, label: string) => {
    score += points;
    parts.push(`${points > 0 ? "+" : ""}${points} ${label}`);
  };
  const candidateCollections = new Set(candidate.collections.map((c) => c.id));
  // The reason shown is the MOST SPECIFIC signal present (not the one worth most points): a DDD product of the city's own
  // mesoregion is "same-region" even though the shared state is worth more points.
  const found = new Set<Reason>();
  const because = (r: Reason) => found.add(r);

  if (source.mainCollection && candidateCollections.has(source.mainCollection.id)) {
    add(WEIGHTS.sameMainCollection, `same-collection:${source.mainCollection.slug}`);
    because("same-collection");
    if (source.mainCollection.featured) add(WEIGHTS.featuredCollection, "cms-featured");
  } else {
    const shared = source.collections.find((c) => candidateCollections.has(c.id));
    if (shared) {
      add(WEIGHTS.sharedCollection, `shared-collection:${shared.slug}`);
      because("shared-collection");
      if (shared.featured) add(WEIGHTS.featuredCollection, "cms-featured");
    }
  }
  if (source.kind === "editorial" && candidate.kind === "editorial" && source.line && source.line === candidate.line) {
    add(WEIGHTS.sameLine, `same-line:${source.line}`);
    because("same-line");
  }
  if (source.uf && source.uf === candidate.uf) {
    add(WEIGHTS.sameUf, `same-uf:${source.uf}`);
    because("same-uf"); // a state alone is the weakest of the strong reasons
  }
  if (source.meso && source.meso === candidate.meso) {
    add(WEIGHTS.sameMeso, `same-region:${source.meso}`);
    because("same-region");
  }
  const theme = source.themes.find((t) => candidate.themes.includes(t));
  if (theme) {
    add(WEIGHTS.sharedTheme, `same-theme:${theme}`);
    because("same-theme");
  }
  // A state's own identity line next to a city of that state ("Florianópolis · Origem" → "Santa Catarina · Clean").
  if (source.kind === "city" && candidate.stateIdentity && source.uf === candidate.uf) add(WEIGHTS.complementaryFamily, "complementary-family:state-identity");
  const tokens = source.tokens.filter((t) => candidate.tokens.includes(t) && !(theme && candidate.themes.includes(theme) && t === theme));
  if (tokens.length > 0) {
    add(WEIGHTS.sharedTokens, `shared-tokens:${tokens.slice(0, 3).join(",")}`);
    because("shared-tokens");
  }
  if (source.locality && candidate.locality && source.locality.key === candidate.locality.key) add(WEIGHTS.sameLocalityComplement, "same-locality");
  if (candidate.equivalence === source.equivalence) add(WEIGHTS.nearDuplicate, "near-duplicate");
  const pop = popularity(candidate.sales);
  if (pop > 0) add(pop, "popularity");

  const reason = REASON_SPECIFICITY.find((r) => found.has(r));
  if (!reason) return null;
  return { doc: candidate, score, reason, parts };
}

const byScore = (a: Scored, b: Scored): number => b.score - a.score || b.doc.sales - a.doc.sales || compareIds(a.doc.representative.id, b.doc.representative.id);

type Picked = Scored & { position: number };

/**
 * Diversity pass (MD §12). Greedy over the score order with hard rules (one per design, no equivalent title, ≤2 per place) and soft
 * ones (≤2 per main collection, ≤2 per line) that only bend when there is no relevant alternative left. Finally, when the list
 * would rest on a single kind of reason and a decent alternative exists, the weakest pick is swapped for it.
 */
export function diversify(ranked: readonly Scored[], startWith: readonly Scored[], max = MAX_ITEMS): Scored[] {
  const picked: Scored[] = [...startWith];
  const locality = (s: Scored) => s.doc.locality?.key ?? null;
  const count = (list: Scored[], pred: (s: Scored) => boolean) => list.filter(pred).length;
  const hardOk = (s: Scored, list: Scored[]) =>
    !list.some((p) => p.doc.key === s.doc.key || p.doc.equivalence === s.doc.equivalence || p.doc.clusterIds.some((c) => s.doc.clusterIds.includes(c))) &&
    (locality(s) === null || count(list, (p) => locality(p) === locality(s)) < MAX_SAME_LOCALITY) &&
    (!s.doc.mainCollection || count(list, (p) => p.doc.mainCollection?.id === s.doc.mainCollection?.id) < HARD_MAX_SAME_COLLECTION) &&
    (!s.doc.line || count(list, (p) => p.doc.line === s.doc.line) < HARD_MAX_SAME_LINE) &&
    // "Made in Santa Catarina" and "Santa Catarina | Clean" are the same idea (the state itself): one per state per list.
    (!s.doc.stateIdentity || !list.some((p) => p.doc.stateIdentity && p.doc.uf === s.doc.uf));
  const softOk = (s: Scored, list: Scored[]) =>
    (!s.doc.mainCollection || count(list, (p) => p.doc.mainCollection?.id === s.doc.mainCollection?.id) < MAX_SAME_COLLECTION) &&
    (!s.doc.line || count(list, (p) => p.doc.line === s.doc.line) < MAX_SAME_LINE);

  const deferred: Scored[] = [];
  for (const s of ranked) {
    if (picked.length >= max) break;
    if (!hardOk(s, picked)) continue;
    if (!softOk(s, picked)) {
      deferred.push(s);
      continue;
    }
    picked.push(s);
  }
  for (const s of deferred) {
    if (picked.length >= max) break;
    if (hardOk(s, picked)) picked.push(s);
  }

  // Mix at least two context sources when the catalog allows it (only among the free positions).
  const free = picked.slice(startWith.length);
  if (picked.length >= 3 && free.length >= 2 && new Set(picked.map((p) => p.reason)).size === 1) {
    const last = picked[picked.length - 1];
    const others = picked.slice(0, -1);
    const alt = ranked.find((s) => s.reason !== last.reason && s.score >= last.score * 0.6 && hardOk(s, others) && !others.includes(s));
    if (alt) picked[picked.length - 1] = alt;
  }
  return picked;
}

export type StoreDocuments = {
  documents: readonly RecommendationDocument[];
  /** Eligible city primaries per place key and family. */
  placeFamilies: ReadonlyMap<string, ReadonlyMap<string, RecommendationDocument>>;
  /** Eligible city primaries per mesoregion (for the "nearby city" fallback), best sellers first. */
  mesoCities: ReadonlyMap<string, readonly RecommendationDocument[]>;
  editorial: readonly RecommendationDocument[];
};

export function prepareStore(documents: readonly RecommendationDocument[]): StoreDocuments {
  const placeFamilies = new Map<string, Map<string, RecommendationDocument>>();
  const mesoCities = new Map<string, RecommendationDocument[]>();
  for (const doc of documents) {
    if (doc.kind !== "city" || !doc.eligible || !doc.locality || !doc.family) continue;
    const families = placeFamilies.get(doc.locality.key) ?? new Map<string, RecommendationDocument>();
    if (!families.has(doc.family)) families.set(doc.family, doc);
    placeFamilies.set(doc.locality.key, families);
    if (doc.meso) mesoCities.set(`${doc.uf}:${doc.meso}`, [...(mesoCities.get(`${doc.uf}:${doc.meso}`) ?? []), doc]);
  }
  for (const list of mesoCities.values()) list.sort((a, b) => b.sales - a.sales || compareIds(a.representative.id, b.representative.id));
  return { documents, placeFamilies, mesoCities, editorial: documents.filter((d) => d.kind === "editorial" && d.eligible) };
}

const placeReason = (family: string): Reason => (family === "feito-em" ? "same-locality:feito-em" : family === "coordenadas" ? "same-locality:coordinates" : "same-locality:family");

/** Up to 4 recommendations for one design's page. Empty when nothing good enough exists (the block then hides). */
export function recommend(source: RecommendationDocument, store: StoreDocuments, max = MAX_ITEMS): Picked[] {
  const fixed: Scored[] = [];

  if (source.kind === "city" && source.locality) {
    // Positions 1–2: the same place's Feito em, then Coordenadas, else its best other families (never the source's own family:
    // another variant of the same family for the same place is the same idea).
    const families = store.placeFamilies.get(source.locality.key);
    for (const family of SAME_PLACE_FAMILY_ORDER) {
      if (fixed.length >= MAX_SAME_LOCALITY) break;
      const doc = families?.get(family);
      if (!doc || family === source.family || doc.key === source.key) continue;
      fixed.push({ doc, score: 1000 - fixed.length, reason: placeReason(family), parts: [`same-locality:${family}`] });
    }
  }

  const pool: Scored[] = [];
  for (const candidate of store.editorial) {
    const scored = scorePair(source, candidate);
    if (scored && scored.score >= MIN_SCORE) pool.push(scored);
  }
  // An editorial design about one place ("Dazumbanho | Florianópolis") may suggest that place's own city designs.
  if (source.kind === "editorial" && source.locality) {
    const families = store.placeFamilies.get(source.locality.key);
    for (const family of SAME_PLACE_FAMILY_ORDER.slice(0, MAX_SAME_LOCALITY)) {
      const doc = families?.get(family);
      const scored = doc ? scorePair(source, doc) : null;
      if (scored && scored.score >= MIN_SCORE) pool.push({ ...scored, reason: placeReason(family) });
    }
  }
  pool.sort(byScore);

  let picked = diversify(pool, fixed, max);
  // Last resort for a city with few editorial neighbours: ONE best-selling design of the same family from another city of the same region.
  if (picked.length < max && source.kind === "city" && source.meso && source.family) {
    const near = (store.mesoCities.get(`${source.uf}:${source.meso}`) ?? []).find((d) => d.family === source.family && d.locality?.key !== source.locality?.key);
    if (near) picked = [...picked, { doc: near, score: WEIGHTS.sameUf + WEIGHTS.sameMeso, reason: "nearby-city", parts: [`+${WEIGHTS.sameUf} same-uf`, `+${WEIGHTS.sameMeso} same-region:${source.meso}`] }];
  }
  return picked.slice(0, max).map((p, i) => ({ ...p, position: i + 1 }));
}
