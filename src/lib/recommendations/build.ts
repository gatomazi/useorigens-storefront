import { createHash } from "node:crypto";
import type { CommerceStoreKey, RegionSlug } from "../geo/regions";
import { REGIONS } from "../geo/regions";
import { STORE_PRODUCT_URL_BASE } from "../ink/config";
import { buildDocuments, type BuiltDocuments, type StoreInput } from "./documents";
import { MAX_ITEMS, prepareStore, REASONS, recommend, type Reason } from "./rank";

/**
 * The served artifact (`recommendations-index.json`): for each store, ONLY the final lists (MD §15), never the intermediate documents.
 * Compact on purpose: every recommended card is stored once in `items` and each product page points at it by position.
 *
 *   items[i] = [inkProductId, title, image (common INK image prefix stripped), price, slug]
 *   recs[productId] = [[itemIndex, reasonIndex, score], ...]   (≤ 4, in display order; reasonIndex into `reasons`)
 *   alias[productId] = productId   (another piece/twin of the same design: it shows that design's list)
 */
export const RECOMMENDATIONS_VERSION = 1;
export const IMAGE_PREFIX = "https://gcp-images.majestic.ink.rsvcloud.com/";

export type ItemTuple = [productId: string, title: string, image: string, price: number, slug: string];
export type RecTuple = [item: number, reason: number, score: number];

export type StoreRecommendations = {
  syncedAt: string;
  items: ItemTuple[];
  recs: Record<string, RecTuple[]>;
  alias: Record<string, string>;
};

export type RecommendationsIndex = {
  version: typeof RECOMMENDATIONS_VERSION;
  /** Derived from the inputs (latest catalog/collections sync), never the wall clock: same inputs ⇒ byte-identical file. */
  generatedAt: string;
  reasons: readonly Reason[];
  stores: Partial<Record<CommerceStoreKey, StoreRecommendations>>;
};

export type StoreBuildInput = StoreInput & { syncedAt: string };

export type StoreBuildStats = {
  documents: number;
  cityDocuments: number;
  editorialDocuments: number;
  eligibleDocuments: number;
  productsIndexed: number;
  productsWithList: number;
  productsWithoutList: number;
  items: number;
  distribution: Record<string, number>;
  discarded: Record<string, number>;
};

export type DebugEntry = { productId: string; source: string; picks: { productId: string; title: string; score: number; reason: Reason; parts: string[] }[] };

export type BuildResult = { index: RecommendationsIndex; stats: Partial<Record<CommerceStoreKey, StoreBuildStats>>; built: Partial<Record<CommerceStoreKey, BuiltDocuments>>; debug: Partial<Record<CommerceStoreKey, Map<string, DebugEntry>>> };

const stripImage = (url: string) => (url.startsWith(IMAGE_PREFIX) ? url.slice(IMAGE_PREFIX.length) : url);

export function buildRecommendationsIndex(inputs: readonly StoreBuildInput[], options: { generatedAt?: string; debug?: boolean } = {}): BuildResult {
  const index: RecommendationsIndex = { version: RECOMMENDATIONS_VERSION, generatedAt: "", reasons: REASONS, stores: {} };
  const stats: BuildResult["stats"] = {};
  const built: BuildResult["built"] = {};
  const debug: BuildResult["debug"] = {};
  const reasonIndex = new Map(REASONS.map((r, i) => [r, i]));
  let latest = options.generatedAt ?? "";

  for (const input of [...inputs].sort((a, b) => a.store.localeCompare(b.store))) {
    if (!options.generatedAt && input.syncedAt > latest) latest = input.syncedAt;
    const docs = buildDocuments(input);
    built[input.store] = docs;
    const prepared = prepareStore(docs.documents);
    const items: ItemTuple[] = [];
    const itemAt = new Map<string, number>();
    const recs: Record<string, RecTuple[]> = {};
    const alias: Record<string, string> = {};
    const distribution: Record<string, number> = {};
    const storeDebug = new Map<string, DebugEntry>();

    for (const doc of docs.documents) {
      const picks = recommend(doc, prepared, MAX_ITEMS);
      // Every product of the design shows the design's list; the representative (or first member) carries it, the rest alias it.
      const owner = doc.memberIds.includes(doc.representative.id) ? doc.representative.id : doc.memberIds[0];
      distribution[String(picks.length)] = (distribution[String(picks.length)] ?? 0) + 1;
      if (picks.length > 0) {
        recs[owner] = picks.map((p) => {
          const rep = p.doc.representative;
          let at = itemAt.get(rep.id);
          if (at === undefined) {
            at = items.length;
            items.push([rep.id, rep.title, stripImage(rep.image), rep.price, rep.slug]);
            itemAt.set(rep.id, at);
          }
          return [at, reasonIndex.get(p.reason)!, p.score] as RecTuple;
        });
        for (const id of doc.memberIds) if (id !== owner) alias[id] = owner;
      }
      if (options.debug) {
        const entry: DebugEntry = { productId: owner, source: doc.representative.title, picks: picks.map((p) => ({ productId: p.doc.representative.id, title: p.doc.representative.title, score: p.score, reason: p.reason, parts: p.parts })) };
        for (const id of doc.memberIds) storeDebug.set(id, entry);
      }
    }

    index.stores[input.store] = { syncedAt: input.syncedAt, items, recs, alias };
    const productsIndexed = docs.byProduct.size;
    const productsWithList = Object.keys(recs).length + Object.keys(alias).length;
    const discarded: Record<string, number> = {};
    for (const d of docs.discarded) discarded[d.reason] = (discarded[d.reason] ?? 0) + 1;
    stats[input.store] = {
      documents: docs.documents.length,
      cityDocuments: docs.documents.filter((d) => d.kind === "city").length,
      editorialDocuments: docs.documents.filter((d) => d.kind === "editorial").length,
      eligibleDocuments: docs.documents.filter((d) => d.eligible).length,
      productsIndexed,
      productsWithList,
      productsWithoutList: productsIndexed - productsWithList,
      items: items.length,
      distribution,
      discarded,
    };
    if (options.debug) debug[input.store] = storeDebug;
  }
  index.generatedAt = latest || new Date(0).toISOString();
  return { index, stats, built, debug };
}

export const serializeIndex = (index: RecommendationsIndex): string => JSON.stringify(index);

// ── Validation (before promotion) and read-side expansion ────────────────────────────────────────────────────────────

const KNOWN_STORES: readonly CommerceStoreKey[] = ["use-sul", "use-norte", "use-centro"];
const MAX_BYTES = 40 * 1024 * 1024;
const PRODUCT_ID = /^[1-9][0-9]{0,15}$/;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/;

export type IndexValidation =
  | { ok: true; bytes: number; sha256: string; stores: Partial<Record<CommerceStoreKey, { items: number; lists: number; aliases: number }>> }
  | { ok: false; errors: string[] };

function validItem(tuple: unknown): tuple is ItemTuple {
  if (!Array.isArray(tuple) || tuple.length !== 5) return false;
  const [id, title, image, price, slug] = tuple as unknown[];
  return (
    typeof id === "string" && PRODUCT_ID.test(id) &&
    typeof title === "string" && title.length > 0 && title.length <= 120 &&
    typeof image === "string" && image.length > 0 && (image.startsWith("https://") || !/^[a-z]+:/i.test(image)) &&
    typeof price === "number" && Number.isFinite(price) && price > 0 && price < 10_000 &&
    typeof slug === "string" && SLUG.test(slug)
  );
}

/**
 * Checks a candidate index BEFORE it may replace the live one (MD §14): JSON, version, known stores only, every expected store present
 * with a plausible number of lists, every list ≤ 4 entries pointing at well-formed items, never at the page's own product.
 */
export function validateRecommendationsText(text: string, options: { expectStores: readonly CommerceStoreKey[]; minListsPerStore?: number }): IndexValidation {
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_BYTES) return { ok: false, errors: [`file is ${bytes} bytes, above ${MAX_BYTES}`] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["not valid JSON"] };
  }
  const index = parsed as Partial<RecommendationsIndex>;
  const errors: string[] = [];
  if (!index || typeof index !== "object" || index.version !== RECOMMENDATIONS_VERSION) return { ok: false, errors: [`version must be ${RECOMMENDATIONS_VERSION}`] };
  if (!Array.isArray(index.reasons) || index.reasons.some((r) => typeof r !== "string")) errors.push("reasons must be a list of strings");
  if (!index.stores || typeof index.stores !== "object") return { ok: false, errors: ["stores must be an object"] };
  const summary: Partial<Record<CommerceStoreKey, { items: number; lists: number; aliases: number }>> = {};
  for (const [key, store] of Object.entries(index.stores)) {
    if (!KNOWN_STORES.includes(key as CommerceStoreKey)) {
      errors.push(`unknown store "${key}"`);
      continue;
    }
    const s = store as Partial<StoreRecommendations>;
    if (!Array.isArray(s.items) || !s.recs || typeof s.recs !== "object" || !s.alias || typeof s.alias !== "object") {
      errors.push(`store "${key}" is malformed`);
      continue;
    }
    const badItems = s.items.filter((t) => !validItem(t)).length;
    if (badItems) errors.push(`store "${key}" has ${badItems} malformed items`);
    let badLists = 0;
    for (const [pid, list] of Object.entries(s.recs)) {
      if (!PRODUCT_ID.test(pid) || !Array.isArray(list) || list.length === 0 || list.length > MAX_ITEMS) badLists++;
      else if (list.some((r) => !Array.isArray(r) || !Number.isInteger(r[0]) || !s.items![r[0]] || s.items![r[0]][0] === pid || !Number.isInteger(r[1]) || r[1] < 0 || r[1] >= (index.reasons?.length ?? 0))) badLists++;
    }
    if (badLists) errors.push(`store "${key}" has ${badLists} malformed lists`);
    const badAlias = Object.entries(s.alias).filter(([a, b]) => !PRODUCT_ID.test(a) || typeof b !== "string" || !s.recs![b]).length;
    if (badAlias) errors.push(`store "${key}" has ${badAlias} dangling aliases`);
    summary[key as CommerceStoreKey] = { items: s.items.length, lists: Object.keys(s.recs).length, aliases: Object.keys(s.alias).length };
  }
  for (const expected of options.expectStores) {
    if ((summary[expected]?.lists ?? 0) < (options.minListsPerStore ?? 1)) errors.push(`expected store "${expected}" is missing or has fewer than ${options.minListsPerStore ?? 1} lists`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, bytes, sha256: createHash("sha256").update(text).digest("hex"), stores: summary };
}

export type PublicRecommendation = { productId: string; title: string; image: string; price: number; href: string; reason: string };

/**
 * One product page's list, as the public route and the Worker see it. Rebuilds every URL from the store's own base (an item never carries
 * a host) and drops anything that does not rebuild cleanly. O(1): one object lookup plus at most four array reads.
 */
/** `storeKey` is the region's store under the effective commerce mode (the route passes `storeForRegion`); defaults to the regional one. */
export function lookupRecommendations(index: RecommendationsIndex | null, region: RegionSlug, productId: string, storeKey: CommerceStoreKey | undefined = REGIONS[region]?.storeKey): PublicRecommendation[] {
  if (!index || !PRODUCT_ID.test(productId)) return [];
  const store = storeKey ? index.stores[storeKey] : undefined;
  const base = storeKey ? STORE_PRODUCT_URL_BASE[storeKey] : undefined;
  if (!store || !base) return [];
  const owner = store.recs[productId] ? productId : store.alias[productId];
  const list = owner ? store.recs[owner] : undefined;
  if (!list) return [];
  const out: PublicRecommendation[] = [];
  for (const [at, reason] of list) {
    const item = store.items[at];
    if (!validItem(item) || item[0] === productId) continue;
    const [id, title, image, price, slug] = item;
    out.push({ productId: id, title, image: image.startsWith("https://") ? image : IMAGE_PREFIX + image, price, href: `${base}/${slug}`, reason: index.reasons[reason] ?? "same-uf" });
  }
  return out;
}
