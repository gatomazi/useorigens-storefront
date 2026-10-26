import "server-only";
import { storeForRegion } from "../catalog/commerce-mode";
import type { RegionSlug } from "../geo/regions";
import { carouselGuideItem, guideCity, guideCollection, type GuideItem } from "../guide/pdp-guide";
import { collectionMenuEntries, offMenuEntries, type MenuEntry } from "../catalog/collection-menu";
import { categoryProps } from "../catalog/collection-source";
import { getCatalog } from "../catalog/repository";
import { STORE_PRODUCT_URL_BASE } from "../ink/config";
import { rankGlobal, type GlobalDoc, type PreparedGlobalDoc } from "../search/global";
import { globalSearchIndex } from "../search/global-index";
import { SITE_URL } from "../site";
import { assistantLabel, assistantTopics, DEFAULT_ASSISTANT_GREETING, liveAnswers, type AssistantConfig } from "../site-config/assistant-schema";
import { homeBundle, siteConfigHomeEnabled } from "../site-config/flag";
import { readPublished } from "../site-config/published";
import { searchShowsDesigns } from "../site-config/search-schema";
import { ASSISTANT_ITEMS, fold, greetingReply, replyTo, searchAttempts, whatsappUrl, type AssistantItem, type AssistantLink, type AssistantReply, type AssistantSources, type DesignFind } from "./engine";

/**
 * The assistant's data, server-side: the PUBLISHED configuration of the region (or a draft, for the panel's preview) and the storefront's own search
 * index (places with their nicknames, designs, collections), built from the synced snapshots. Never INK at request time, never a database.
 */

const site = () => SITE_URL.replace(/\/$/, "");
const absolute = (href: string) => (href.startsWith("/") ? `${site()}${href}` : href);
/** Score class of a hit (rankGlobal's `class * 10 + kind order`): 6 = the exact name or a nickname, 5 = a name prefix, 4 = whole words… */
const classOf = (score: number) => Math.floor(score / 10);
const PLACE_PATH = /^\/[a-z-]+\/([a-z]{2})\/([a-z0-9-]+)$/;
const COLLECTION_PATH = /^\/[a-z-]+\/colecoes\/([a-z0-9-]+)$/;

/** INK's base of the region's store (`https://loja.useorigens.com.br/useorigens`): its order pages live under it. */
export function inkStoreBase(region: RegionSlug): string | null {
  const product = STORE_PRODUCT_URL_BASE[storeForRegion(region)];
  return product ? product.replace(/\/product$/, "") : null;
}

const guideToItem = (item: GuideItem): AssistantItem => ({ title: item.title, ...(item.context ? { context: item.context } : {}), image: item.image, price: item.price, href: item.href, productId: item.productId });

function designItems(hits: readonly { doc: GlobalDoc }[]): AssistantItem[] {
  const seen = new Set<string>();
  const out: AssistantItem[] = [];
  for (const { doc } of hits) {
    if (!doc.image || seen.has(doc.title)) continue;
    seen.add(doc.title);
    out.push({ title: doc.title, image: doc.image, ...(typeof doc.minPrice === "number" && doc.minPrice > 0 ? { price: doc.minPrice } : {}), href: absolute(doc.href), ...(doc.inkProductId ? { productId: doc.inkProductId } : {}) });
    if (out.length === ASSISTANT_ITEMS) break;
  }
  return out;
}

/** One search: a place by its exact name or nickname, then a collection by its exact name, then designs whose words all match. */
export function findIn(region: RegionSlug, docs: readonly PreparedGlobalDoc[], phrase: string): DesignFind | null {
  const hits = rankGlobal(docs, phrase);
  if (hits.length === 0) return null;
  // Whole words ("pai" is not "Painel"); a word prefix only when every word is long enough to mean something ("abelh" → "Abelhinhas", never "pet" → "Petrolândia").
  // Classes 6 and 4 are exact names and whole words; 5 and 3 are prefixes (of the name, of a word).
  // A name that merely starts with the words counts only if they are whole words of it ("Mãe do piazinho" for "mae", never "Painel" for "pai").
  const words = phrase.split(" ");
  const longWords = words.every((w) => w.length >= 5);
  const wholeIn = (doc: GlobalDoc) => {
    const own = new Set(fold([doc.title, ...doc.names].join(" ")).split(/[^a-z0-9]+/));
    return words.every((w) => own.has(w));
  };
  const designs = hits.filter((h) => h.doc.kind === "design" && (classOf(h.score) === 6 || classOf(h.score) === 4 || longWords || wholeIn(h.doc)) && classOf(h.score) >= 3);
  const searchLink = (total: number): AssistantLink => ({ kind: "search", label: total > ASSISTANT_ITEMS ? `Ver as ${total} estampas` : "Ver na busca", href: `${site()}/${region}/busca?q=${encodeURIComponent(phrase)}` });

  // A place by its exact name or nickname, or by the start of its name when only ONE place starts so ("joinvile" → Joinville, never "balneario").
  const placeHits = hits.filter((h) => h.doc.kind === "locality" || h.doc.kind === "state");
  const prefixed = placeHits.filter((h) => classOf(h.score) === 5);
  const place = placeHits.find((h) => classOf(h.score) >= 6) ?? (phrase.length >= 5 && prefixed.length === 1 ? prefixed[0] : undefined);
  if (place) {
    const m = PLACE_PATH.exec(place.doc.href);
    const city = place.doc.kind === "locality" && m ? guideCity(region, m[1], m[2], null) : null;
    if (city) {
      const items = city.items.map(guideToItem);
      return { match: "place", title: items.length > 0 ? `Estampas de ${city.city.name}:` : `Veja a página de ${city.city.name}:`, items, links: [{ kind: "page", label: city.total > items.length ? `Ver as ${city.total} estampas de ${city.city.name}` : `Ver ${city.city.name}`, href: city.city.url }] };
    }
    const own = designItems(designs);
    return { match: "place", title: own.length > 0 ? `Estampas de ${place.doc.title}:` : `Veja a página de ${place.doc.title}:`, items: own, links: [{ kind: "page", label: `Ver ${place.doc.title}`, href: absolute(place.doc.href) }] };
  }

  // A page by its exact name, or a collection by the start of its name ("pré-treino" → "Pré-treino Raiz").
  const page = hits.find((h) => h.doc.kind === "page" && (classOf(h.score) >= 6 || (classOf(h.score) === 5 && h.doc.key.startsWith("col:") && phrase.length >= 4)));
  const collection = page && page.doc.key.startsWith("col:") ? COLLECTION_PATH.exec(page.doc.href) : null;
  if (page && collection) {
    const found = guideCollection(region, collection[1]);
    if (found) return { match: "collection", title: found.items.length > 0 ? `Da coleção ${found.collection.name}:` : `Veja a coleção ${found.collection.name}:`, items: found.items.map(guideToItem), links: [{ kind: "page", label: `Ver a coleção ${found.collection.name}`, href: found.collection.url }] };
  }
  const category = findCategory(region, phrase);
  if (category) return category;
  if (designs.length > 0) return { match: "designs", title: "Encontrei estas estampas:", items: designItems(designs), links: [searchLink(designs.length)] };
  if (page) return { match: "page", title: `Veja ${page.doc.title}:`, items: [], links: [{ kind: "page", label: page.doc.title, href: absolute(page.doc.href) }] };
  return null;
}

/** Edit distance (insert, delete, replace, swap of two neighbours), stopping early above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      low = Math.min(low, d);
    }
    if (low > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

/** The one place whose name (or nickname) is a small typo away from `phrase`: 1 letter up to 6 letters, 2 from 7. Two equally close = no guess. */
export function closestPlace(places: readonly PreparedGlobalDoc[], phrase: string): { name: string; title: string } | null {
  if (phrase.length < 4 || phrase.length > 40) return null;
  const max = phrase.length <= 6 ? 1 : 2;
  let best: { name: string; title: string; d: number } | null = null;
  let tie = false;
  for (const p of places) {
    for (const name of p.names) {
      const d = editDistance(phrase, name, max);
      if (d > max || d === 0) continue;
      if (!best || d < best.d) { best = { name, title: p.doc.title, d }; tie = false; }
      else if (d === best.d && best.title !== p.doc.title) tie = true;
    }
  }
  return best && !tie ? { name: best.name, title: best.title } : null;
}

/** Words of a name, each also in the singular ("Dia dos Pais" → dia, dos, pais, pai). */
const nameWords = (name: string): Set<string> => {
  const words = fold(name).split(/[^a-z0-9]+/).filter(Boolean);
  return new Set(words.flatMap((w) => (w.length > 3 && w.endsWith("s") ? [w, w.slice(0, -1)] : [w])));
};

/**
 * Every category of the region's store that links somewhere (a storefront page, or its INK page when it is public with products), in the menu or not
 * ("Mascotes Club", "Fé de Origem", "Dia dos Pais"): the menu shows a few, the assistant knows them all. Internal ones (ZZ - …) never.
 */
export function regionCategories(region: RegionSlug): Omit<MenuEntry, "position">[] {
  const doc = readPublished().bundle.docs[region];
  const { top, more } = collectionMenuEntries(region, doc);
  const seen = new Set<number>();
  return [...top, ...more, ...offMenuEntries(region, doc)].filter((e) => (e.pagePath !== null || e.inkUrl !== null) && !/^zz\b/i.test(e.record.name.trim()) && e.record.matchedCount > 0 && !seen.has(e.record.id) && (seen.add(e.record.id), true));
}

/** A category whose name has every word of the search (whole words, singular or plural): a few of its real products and its page. */
export function findCategory(region: RegionSlug, phrase: string): DesignFind | null {
  const words = phrase.split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const entry = regionCategories(region).find((e) => {
    const own = nameWords(e.record.name);
    return words.every((w) => own.has(w) || own.has(w.replace(/s$/, "")));
  });
  if (!entry) return null;
  const doc = readPublished().bundle.docs[region];
  const catalog = getCatalog();
  const { categories } = categoryProps((s) => catalog.productsOfStore(s), doc);
  const found = categories({ kind: "ink-category", store: entry.ref.store, collectionId: entry.record.id, order: "category", limit: ASSISTANT_ITEMS });
  const items = found.status === "ok" ? found.items.map(carouselGuideItem).filter((i): i is GuideItem => i !== null).map(guideToItem) : [];
  const name = entry.record.name.replace(/\s+/g, " ").trim();
  const link: AssistantLink = entry.pagePath ? { kind: "page", label: `Ver a coleção ${name}`, href: absolute(entry.pagePath) } : { kind: "collection", label: `Ver ${name} na loja`, href: entry.inkUrl as string };
  return { match: "category", title: items.length > 0 ? `Da coleção ${name}:` : `Veja a coleção ${name}:`, items, links: [link] };
}

/** The designs for a message's words: each attempt (as typed, synonyms, single words) until one finds something. */
export function regionDesignFinder(region: RegionSlug): (terms: readonly string[]) => DesignFind | null {
  const hideCityDesigns = siteConfigHomeEnabled() && !searchShowsDesigns(homeBundle());
  const all = globalSearchIndex().byRegion.get(region) ?? [];
  const docs = hideCityDesigns ? all.filter((d) => !d.doc.cityCollection) : all;
  // A place or a collection ends the search. Loose designs: the attempt with the most of them ("mães" finds one design, "mae" thirteen).
  const places = docs.filter((d) => d.doc.kind === "locality" || d.doc.kind === "state");
  return (terms) => {
    let best: DesignFind | null = null;
    for (const attempt of searchAttempts(terms)) {
      const found = findIn(region, docs, attempt.join(" "));
      if (!found) continue;
      if (found.match === "place" || found.match === "collection" || found.match === "category") return found;
      if (!best || found.items.length > best.items.length) best = found;
      if (best.items.length >= ASSISTANT_ITEMS) break;
    }
    if (best) return best;
    // Nothing at all: maybe a place typed wrong ("curitiva", "florianopoles"). Only one clear candidate, never a guess between two.
    const guess = closestPlace(places, terms.join(" "));
    const found = guess ? findIn(region, docs, guess.name) : null;
    return found && guess ? { ...found, title: `Você quis dizer ${guess.title}? ${found.title}` } : null;
  };
}

export function publishedAssistant(region: RegionSlug): AssistantConfig | undefined {
  const state = readPublished();
  return state.source === "published" ? state.bundle.docs[region]?.assistant : undefined;
}

export function assistantSources(region: RegionSlug, config: AssistantConfig | undefined): AssistantSources | null {
  const base = inkStoreBase(region);
  if (!base) return null;
  return { findDesigns: regionDesignFinder(region), ordersUrl: `${base}/orders`, trackingUrl: `${base}/orders/trackings`, whatsapp: config?.whatsapp ?? null };
}

/** The answer to one message with `config` (the published one on the store; the draft in the panel's preview). Null = the region has no INK store. */
export function assistantReply(region: RegionSlug, config: AssistantConfig | undefined, message: string): AssistantReply | null {
  const sources = assistantSources(region, config);
  return sources ? replyTo(message, liveAnswers(config), sources, config?.greeting ?? DEFAULT_ASSISTANT_GREETING) : null;
}

/** What a chat needs to open (`v: 1`): whether it exists, its opening message and whether there is a WhatsApp. */
/** `whatsapp`: the shortcut always at hand in the chat's header (the store's number, a greeting already written). Absent = no number. */
/** `label`: the button's text and the chat's title. `topics`: the shortcuts always above the field ([] = none). Both are new in v1, optional for
 * the reader: a Worker that does not know them keeps "Ajuda", no shortcuts and the opening's chips. The opening keeps its chips here; a chat that
 * shows the topics hides them itself (they would repeat the topics), so an older reader never loses them. */
export type AssistantBoot = { v: 1; region: RegionSlug; enabled: boolean; opening?: AssistantReply; whatsapp?: string; label?: string; topics?: string[] };
export function assistantBoot(region: RegionSlug, config: AssistantConfig | undefined = publishedAssistant(region)): AssistantBoot {
  if (!config?.enabled || !inkStoreBase(region)) return { v: 1, region, enabled: false };
  return {
    v: 1,
    region,
    enabled: true,
    opening: greetingReply(config.greeting ?? DEFAULT_ASSISTANT_GREETING, liveAnswers(config)),
    ...(config.whatsapp ? { whatsapp: whatsappUrl(config.whatsapp, "") } : {}),
    label: assistantLabel(config),
    topics: assistantTopics(config),
  };
}
