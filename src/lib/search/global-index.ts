import "server-only";
import { statSync } from "node:fs";
import { purchaseUrl } from "../catalog/commerce";
import { categoryLookup, collectionsForRegion } from "../catalog/collection-source";
import { storeForRegion } from "../catalog/commerce-mode";
import { MIN_USABLE_PRODUCTS, type CollectionRecord } from "../catalog/collections";
import { getStoreCollections } from "../catalog/collections-file";
import { enabledInternalIds } from "../site-config/collections-enabled";
import { expandTuple, garmentIndexMtimeMs, type GarmentIndex } from "../catalog/garment-index-file";
import { garmentTypeById, CLASSIC_GARMENT_TYPE_ID } from "../catalog/garments";
import { compareIds } from "../catalog/ranking";
import { getCatalog, getGarmentIndex, type Catalog } from "../catalog/repository";
import type { MerchProduct } from "../catalog/types";
import { formatPrice } from "../format";
import { localitiesOfRegion, localityKindLabel, localitySubtitle } from "../geo/localities";
import { REGIONS, STATE_NAMES, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { normalizeText } from "../geo/text";
import { getRegionHome } from "../home";
import { launchedRegions } from "../regions/launched";
import { siteConfigHomeEnabled } from "../site-config/flag";
import { customizerHref, pageHref, PAGE_KIND_LABEL } from "../site-config/pages";
import { readPublished } from "../site-config/published";
import type { PublishedBundle, ScopeDoc, Source as CarouselSource } from "../site-config/schema";
import { collectionUrl, resolveSource, type EditorialItems, type SourceResult } from "../site-config/sources";
import { umaPencaLookup } from "../umapenca/carousel";
import { readUmaPencaSnapshot, umaPencaSnapshotPath } from "../umapenca/snapshot";
import { prepareGlobalDocs, type GlobalDoc, type PreparedGlobalDoc } from "./global";

/**
 * The global search index, built in process from what the storefront ALREADY renders from — never INK at search time:
 *  - places: the localities (municipalities and Federal District administrative regions) that have products, and their states;
 *  - designs: ONE result per place × design family (`cityFamilies`), its pieces counted from the garment index by the primary's own
 *    `product_cluster_id` (the same association the city page's garment tabs use) — the 9 pieces of a design are never 9 results;
 *  - editorial: published, live pages (hotpages, category landings), active personalization models, the home's own carousels (an anchor on
 *    the home, only when the carousel really renders), public INK collections with a verified public page, and "Outros artigos".
 *  - merchandise designs ("Made in …", "| Essência" lines, expressions): one result per `product_cluster_id` (see `merchDocs`).
 * Only LAUNCHED regions are indexed.
 */
export type GlobalIndexInputs = {
  region: RegionSlug;
  catalog: Catalog;
  garmentIndex: GarmentIndex;
  /** The region's PUBLISHED document, only when the CMS-driven storefront is on (otherwise nothing editorial is public). */
  doc?: ScopeDoc;
  media?: PublishedBundle["media"];
  collections: readonly CollectionRecord[];
  /** Store whose public collection pages the `collections` link to (the region's store under the effective commerce mode). */
  collectionStore?: CommerceStoreKey;
  /** Resolves a home carousel's source the way the home does, so a carousel that renders nothing is never a result. */
  carouselItems?: (source: CarouselSource) => number;
  umaPencaArticles: number;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Pieces of a design: the distinct, known garment types of its cluster, the classic tee always counted (it IS the primary). */
export function clusterPieces(garmentIndex: GarmentIndex, store: Parameters<typeof expandTuple>[0], clusterId: string | null | undefined): { types: Set<number>; prices: number[] } {
  const types = new Set<number>([CLASSIC_GARMENT_TYPE_ID]);
  const prices: number[] = [];
  const tuples = clusterId ? garmentIndex.stores[store]?.clusters[clusterId] : undefined;
  for (const tuple of Array.isArray(tuples) ? tuples : []) {
    const piece = expandTuple(store, tuple);
    if (!piece || !garmentTypeById(piece.garmentTypeId)) continue;
    types.add(piece.garmentTypeId);
    if (typeof piece.price === "number" && piece.price > 0) prices.push(piece.price);
  }
  return { types, prices };
}

export function buildGlobalDocs(input: GlobalIndexInputs): GlobalDoc[] {
  const { region, catalog } = input;
  const docs: GlobalDoc[] = [];
  const covered = catalog.coveredLocalityIds(region);
  const places = localitiesOfRegion(region).filter((p) => covered.has(p.id));

  // States with at least one place.
  for (const uf of REGIONS[region].ufs) {
    const inState = places.filter((p) => p.uf === uf);
    if (inState.length === 0) continue;
    const hasRa = inState.some((p) => p.type === "administrative_region");
    docs.push({
      key: `uf:${uf}`, kind: "state", region, title: STATE_NAMES[uf], subtitle: hasRa ? "Ver as localidades do estado" : "Ver as cidades do estado",
      href: `/${region}/${uf.toLowerCase()}`, tag: "Estado", uf, rank: 1, names: [STATE_NAMES[uf], uf], strong: [], weak: [],
    });
  }

  for (const place of places) {
    const ra = place.type === "administrative_region";
    const href = `/${region}/${place.uf.toLowerCase()}/${place.slug}`;
    docs.push({
      key: `loc:${place.id}`, kind: "locality", region, title: place.name, subtitle: localitySubtitle(place), href, tag: localityKindLabel(place),
      city: place.name, uf: place.uf, ...(ra ? { administrativeRegion: true } : {}),
      // Curated aliases mark the well-known places: they lead among equal prefix matches (the city search's own rule).
      rank: place.aliases.length > 0 ? 0 : 1,
      names: [place.name, ...place.aliases], strong: [], weak: [STATE_NAMES[place.uf] ?? "", place.uf, place.meso ?? ""],
    });

    for (const entry of catalog.cityFamilies(place.id)) {
      const primary = entry.primary;
      // Never a design without a real destination. A simulated one (single-store preview only) links to its storefront page, which shows it is not for sale yet.
      if (!purchaseUrl(primary) && !primary.simulated) continue;
      const { types, prices } = clusterPieces(input.garmentIndex, primary.commerceStoreKey, primary.productClusterId);
      const all = [primary.price, ...prices].filter((p): p is number => typeof p === "number" && p > 0);
      const minPrice = all.length > 0 ? Math.min(...all) : undefined;
      const family = entry.family;
      docs.push({
        key: `design:${place.id}:${family.id}`, kind: "design", region,
        title: `${place.name} · ${family.name}`,
        subtitle: [plural(types.size, "peça disponível", "peças disponíveis"), minPrice !== undefined ? `a partir de ${formatPrice(minPrice)}` : null].filter(Boolean).join(" · "),
        // The storefront's own page of this design (its versions, then the purchase); the pieces are chosen on the place's page tabs.
        href: `${href}/${family.id}`, image: primary.imageUrl, pieces: types.size, ...(minPrice !== undefined ? { minPrice } : {}),
        tag: "Estampa", city: place.name, uf: place.uf, ...(ra ? { administrativeRegion: true } : {}),
        rank: family.sortOrder, sales: primary.totalSalesCount ?? 0,
        names: [`${place.name} ${family.name}`, `${family.name} ${place.name}`],
        strong: [family.name, place.name, ...place.aliases],
        weak: [STATE_NAMES[place.uf] ?? "", place.uf],
      });
    }
  }

  docs.push(...merchDocs(region, catalog.merch(region)));

  const doc = input.doc;
  if (doc && doc.scope === region) {
    for (const page of doc.pages ?? []) {
      if (page.archived) continue;
      const og = page.seo.ogImage ? input.media?.[page.seo.ogImage.assetId] : undefined;
      docs.push({
        key: `page:${page.kind}:${page.slug}`, kind: "page", region, title: page.title, subtitle: page.seo.description ?? PAGE_KIND_LABEL[page.kind],
        href: pageHref(region, page), ...(og ? { image: og.src } : {}), tag: page.kind === "hotpage" ? "Especial" : "Categoria", rank: 0,
        names: [page.title, ...(page.seo.title ? [page.seo.title] : [])], strong: [page.slug.replace(/-/g, " ")],
        weak: [page.seo.description ?? "", ...page.sections.map((s) => s.title ?? "")],
      });
    }
    for (const model of doc.customizers ?? []) {
      if (!model.active || !model.pageMockup) continue;
      const ref = model.cardImage ?? model.pageMockup;
      const img = input.media?.[ref.assetId];
      docs.push({
        key: `cz:${model.id}`, kind: "page", region, title: model.name, subtitle: model.description ?? "Personalize a sua", href: customizerHref(region, model),
        ...(img ? { image: img.src } : {}), tag: "Personalize", rank: 1, names: [model.name], strong: [model.slug.replace(/-/g, " "), "personalizar", "personalizada"], weak: [model.description ?? ""],
      });
    }
    for (const section of doc.home?.sections ?? []) {
      if (!section.active || section.template !== "product-carousel" || !section.title || !section.source) continue;
      if (input.carouselItems && input.carouselItems(section.source) === 0) continue; // the home hides an empty carousel: no dead anchor
      docs.push({
        key: `theme:${section.anchor}`, kind: "page", region, title: section.title.replace(/\s+/g, " ").trim(), subtitle: section.subtitle?.replace(/\{city\}/g, "sua cidade") ?? "Na página inicial",
        href: `/${region}#${section.anchor}`, tag: "Tema", rank: 2, names: [section.title], strong: [section.anchor.replace(/-/g, " ")], weak: [section.subtitle ?? ""],
      });
    }
  }

  if (input.umaPencaArticles > 0) {
    docs.push({
      key: "page:outros-artigos", kind: "page", region, title: "Outros artigos", subtitle: "Canecas e ecobags", href: `/${region}/outros-artigos`,
      tag: "Página", rank: 3, names: ["Outros artigos"], strong: ["canecas", "caneca", "ecobags", "ecobag"], weak: [],
    });
  }

  // Public INK collections with a verified public page and enough real products; an internal collection never becomes a link.
  for (const c of input.collections) {
    if (!c.isAvailable || c.matchedCount < MIN_USABLE_PRODUCTS) continue;
    const url = collectionUrl(input.collectionStore ?? REGIONS[region].storeKey, c.slug);
    if (!url) continue;
    docs.push({
      key: `col:${c.id}`, kind: "page", region, title: c.name.replace(/\s+/g, " ").trim(), subtitle: `${plural(c.matchedCount, "produto", "produtos")} na loja`,
      href: url, external: true, tag: "Coleção", rank: 4 + c.position / 10_000, names: [c.name], strong: [c.slug.replace(/-/g, " ")], weak: [],
    });
  }
  return dedupeEditorial(docs);
}

/**
 * One editorial result per name in a region: the home's "Fala daqui" carousel and the INK collection "Fala Daqui" are the same theme. The lower
 * `rank` wins — a page or carousel inside the storefront before the external INK collection page.
 */
function dedupeEditorial(docs: GlobalDoc[]): GlobalDoc[] {
  const best = new Map<string, GlobalDoc>();
  for (const d of docs) {
    if (d.kind !== "page") continue;
    const k = normalizeText(d.title);
    const current = best.get(k);
    if (!current || d.rank < current.rank) best.set(k, d);
  }
  return docs.filter((d) => d.kind !== "page" || best.get(normalizeText(d.title)) === d);
}

/**
 * Merchandise designs (expressions, "Made in …", lines like "Paranaense | Essência"): ONE result per INK `product_cluster_id` within its store — the
 * pieces of one design share it — and one per product when INK gave no cluster (never grouped by name). Title: the shortest name of the group
 * (the base piece); every piece's name stays searchable. Merchandise has no storefront page, so the result opens the verified INK product page.
 */
export function merchDocs(region: RegionSlug, products: readonly MerchProduct[]): GlobalDoc[] {
  const groups = new Map<string, MerchProduct[]>();
  for (const p of products) {
    if (!purchaseUrl(p)) continue;
    const key = p.productClusterId ? `${p.commerceStoreKey}:c${p.productClusterId}` : `${p.commerceStoreKey}:p${p.inkProductId}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const docs: GlobalDoc[] = [];
  for (const [key, members] of groups) {
    const rep = [...members].sort((a, b) => a.name.length - b.name.length || b.totalSalesCount - a.totalSalesCount || compareIds(a.inkProductId, b.inkProductId))[0];
    const prices = members.map((m) => m.price).filter((x): x is number => typeof x === "number" && x > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : undefined;
    const price = minPrice !== undefined ? formatPrice(minPrice) : null;
    docs.push({
      key: `merch:${key}`, kind: "design", region, title: rep.name,
      subtitle: members.length > 1 ? [plural(members.length, "peça disponível", "peças disponíveis"), price ? `a partir de ${price}` : null].filter(Boolean).join(" · ") : price ?? "Na loja",
      href: purchaseUrl(rep)!, external: true, inkProductId: rep.inkProductId, image: rep.imageUrl, pieces: members.length, ...(minPrice !== undefined ? { minPrice } : {}),
      tag: "Estampa", rank: 9, sales: members.reduce((n, m) => n + m.totalSalesCount, 0),
      names: [rep.name], strong: members.map((m) => m.name), weak: [],
    });
  }
  return docs;
}

export type GlobalIndexStats = { regions: RegionSlug[]; documents: number; byKind: Record<string, number>; approxBytes: number; buildMs: number; builtAt: string };
type Built = { key: string; byRegion: Map<RegionSlug, PreparedGlobalDoc[]>; stats: GlobalIndexStats };
let built: Built | null = null;

const mtime = (path: string): number => {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
};

function editorialItems(region: RegionSlug): EditorialItems {
  const home = getRegionHome(region);
  return { terra: home.terra, recreations: home.recreations, lenda: home.feitoParaVoce, dizeres: home.fala, ddd: home.ddd };
}

/**
 * The prepared index of every launched region, rebuilt only when one of its sources changes: the catalog snapshot (a new `Catalog`), the garment
 * index, the published config, a collections sync, the Uma Penca snapshot, or the set of launched regions. A missing or corrupt source simply
 * contributes nothing (each reader already falls back to empty) — the search never takes a page down.
 */
export function globalSearchIndex(): Built {
  const catalog = getCatalog();
  const regions = launchedRegions();
  const cms = siteConfigHomeEnabled() ? readPublished() : null;
  const published = cms && cms.source === "published" ? cms : null;
  const collectionsKey = regions.map((r) => `${storeForRegion(r)}:${getStoreCollections(storeForRegion(r))?.syncedAt ?? "-"}`).join("|");
  const key = [catalog.syncedAt, garmentIndexMtimeMs(), published?.checksum ?? (cms ? "seed" : "off"), collectionsKey, mtime(umaPencaSnapshotPath()), regions.join(",")].join("#");
  if (built && built.key === key) return built;

  const started = performance.now();
  const garmentIndex = getGarmentIndex();
  const bundle = cms?.bundle;
  const umaPenca = readUmaPencaSnapshot()?.articles.length ?? 0;
  const byRegion = new Map<RegionSlug, PreparedGlobalDoc[]>();
  const byKind: Record<string, number> = {};
  let approxBytes = 0;
  for (const region of regions) {
    const doc = bundle?.docs[region];
    const collectionStore = storeForRegion(region);
    const store = getStoreCollections(collectionStore);
    const categories = categoryLookup((s) => catalog.productsOfStore(s), (s) => enabledInternalIds(doc, s), undefined, region);
    const editorial = doc ? editorialItems(region) : null;
    const carouselItems = (source: CarouselSource): number => {
      if (!editorial) return 0;
      const result: SourceResult = resolveSource(source, editorial, categories, umaPencaLookup(region));
      return result.status === "ok" ? result.items.length : 0;
    };
    const docs = buildGlobalDocs({ region, catalog, garmentIndex, doc, media: bundle?.media, collections: store ? collectionsForRegion(region, (s) => catalog.productsOfStore(s)) : [], collectionStore, carouselItems, umaPencaArticles: umaPenca });
    for (const d of docs) {
      byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
      approxBytes += JSON.stringify(d).length;
    }
    byRegion.set(region, prepareGlobalDocs(docs));
  }
  const stats: GlobalIndexStats = {
    regions,
    documents: Object.values(byKind).reduce((a, b) => a + b, 0),
    byKind,
    approxBytes,
    buildMs: Math.round(performance.now() - started),
    builtAt: new Date().toISOString(),
  };
  built = { key, byRegion, stats };
  return built;
}
