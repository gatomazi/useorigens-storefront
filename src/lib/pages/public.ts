import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { REGIONS, isRegionSlug, type RegionSlug } from "../geo/regions";
import { siteConfigHomeEnabled, homeBundle } from "../site-config/flag";
import { livePage, liveCustomizer, pageHref } from "../site-config/pages";
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

export function resolveCustomizer(regionParam: string, slug: string): { region: RegionSlug; bundle: PublishedBundle; model: Customizer } {
  const found = publishedFor(regionParam);
  const model = found ? liveCustomizer(found.bundle.docs[found.region], slug) : undefined;
  if (!found || !model) notFound();
  return { ...found, model };
}

/** Metadata of a page: canonical on this origin; indexable ONLY when the owner turned indexing on (a published page is `noindex` until then). */
export function pageMetadata(region: RegionSlug, page: Page, bundle: PublishedBundle): Metadata {
  const name = REGIONS[region].name;
  const title = page.seo.title ?? `${page.title} · Use Origens ${name}`;
  const description = page.seo.description;
  const og = page.seo.ogImage ? bundle.media[page.seo.ogImage.assetId] : undefined;
  const url = pageHref(region, page);
  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    robots: page.seo.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, ...(description ? { description } : {}), url, ...(og ? { images: [{ url: og.src, width: og.width, height: og.height }] } : {}) },
  };
}
