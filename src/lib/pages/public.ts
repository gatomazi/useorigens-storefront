import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { REGIONS, isRegionSlug, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { siteConfigHomeEnabled, homeBundle } from "../site-config/flag";
import { collectionForPage, collectionPageLookup } from "../catalog/collection-source";
import type { CollectionRecord } from "../catalog/collections";
import { getCatalog } from "../catalog/repository";
import { arrangementOf, enabledInternalIds } from "../site-config/collections-enabled";
import { livePage, liveCustomizer, newCollectionLanding, pageHref } from "../site-config/pages";
import type { Customizer, Page, PageKind, PublishedBundle } from "../site-config/schema";

/**
 * The storefront side of pages: everything is read from the PUBLISHED document (published.json through the tolerant reader, cached by mtime),
 * never from the database or INK. A page that is not published, is archived, belongs to another region, or whose region is not launched is a
 * plain 404: previews and drafts have no public URL.
 */
export function publishedFor(regionParam: string): { region: RegionSlug; bundle: PublishedBundle } | null {
  if (!isRegionSlug(regionParam) || !siteConfigHomeEnabled()) return null;
  return { region: regionParam, bundle: homeBundle() };
}

export function resolvePage(regionParam: string, kind: PageKind, slug: string): { region: RegionSlug; bundle: PublishedBundle; page: Page } {
  const found = publishedFor(regionParam);
  const page = found ? livePage(found.bundle.docs[found.region], kind, slug) : undefined;
  if (!found || !page) notFound();
  return { ...found, page };
}

/**
 * The page a collection has when the document has none at its address: the hero with the collection's name and every product of it, paged (the same
 * page "Personalizar página" puts in the draft). Never indexed: a published landing with the same address, with the owner's texts, replaces it.
 */
export function collectionLanding(collection: CollectionRecord, store: CommerceStoreKey): Page {
  return newCollectionLanding({
    id: `colecao-${collection.id}`, heroId: "colecao-topo", gridId: "colecao-produtos", title: collection.name.replace(/\s+/g, " ").trim(), slug: collection.slug,
    ref: { store, collectionId: collection.id },
  });
}

/**
 * What `/<region>/colecoes/<slug>` shows: the published parent-category landing with that address or, when there is none, the page of the region's
 * collection with that slug (a collection the region can use right now). Anything else is a 404.
 */
export function resolveCollectionLanding(regionParam: string, slug: string): { region: RegionSlug; bundle: PublishedBundle; page: Page } {
  const found = publishedFor(regionParam);
  if (!found) notFound();
  const doc = found.bundle.docs[found.region];
  const page = livePage(doc, "categoryLanding", slug);
  if (page) return { ...found, page };
  const collection = collectionForPage(found.region, doc, slug);
  if (!collection) notFound();
  return { ...found, page: collectionLanding(collection, REGIONS[found.region].storeKey) };
}

/** How many pages the page's paged grid has (0: it has none, or its collection shows nothing): a page number past it is a 404. */
export function pagedGridPageCount(region: RegionSlug, bundle: PublishedBundle, page: Page): number {
  const grid = page.sections.find((s) => s.active && s.layout?.display === "paged");
  if (grid?.source?.kind !== "ink-category") return 0;
  const doc = bundle.docs[region];
  const catalog = getCatalog();
  const result = collectionPageLookup((store) => catalog.productsOfStore(store), (store) => enabledInternalIds(doc, store), undefined, (src) => arrangementOf(doc, src.store, src.collectionId, src))(grid.source, 1);
  return result.status === "ok" ? result.pageCount : 0;
}

/** The address of page `n` of a landing's paged grid: the landing itself for the first one, `/<n>` after it. */
export const landingPageHref = (region: RegionSlug, page: Pick<Page, "kind" | "slug">, n: number): string => (n <= 1 ? pageHref(region, page) : `${pageHref(region, page)}/${n}`);

export function resolveCustomizer(regionParam: string, slug: string): { region: RegionSlug; bundle: PublishedBundle; model: Customizer } {
  const found = publishedFor(regionParam);
  const model = found ? liveCustomizer(found.bundle.docs[found.region], slug) : undefined;
  if (!found || !model) notFound();
  return { ...found, model };
}

/**
 * Metadata of a page: canonical on this origin; indexable ONLY when the owner turned indexing on (a published page is `noindex` until then). Page `n` of
 * a paged grid is its own address, with the number in the title.
 */
export function pageMetadata(region: RegionSlug, page: Page, bundle: PublishedBundle, n = 1): Metadata {
  const name = REGIONS[region].name;
  const base = page.seo.title ?? `${page.title} · Use Origens ${name}`;
  const title = n > 1 ? `${base} · página ${n}` : base;
  const description = page.seo.description;
  const og = page.seo.ogImage ? bundle.media[page.seo.ogImage.assetId] : undefined;
  const url = landingPageHref(region, page, n);
  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    robots: page.seo.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, ...(description ? { description } : {}), url, ...(og ? { images: [{ url: og.src, width: og.width, height: og.height }] } : {}) },
  };
}
