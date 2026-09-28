import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/catalog/repository";
import { localityById } from "@/lib/geo/localities";
import { STATE_NAMES } from "@/lib/geo/regions";
import { launchedRegions } from "@/lib/regions/launched";
import { SITE_URL } from "@/lib/site";
import { siteConfigHomeEnabled, homeBundle } from "@/lib/site-config/flag";
import { pageHref } from "@/lib/site-config/pages";

// Read at request time, never prebuilt: the catalog snapshot lives on the runtime Volume and does not exist at `next build`, so a prerendered
// sitemap would freeze an empty list (same reason no region page is prebuilt, see src/app/[region]/layout.tsx).
export const dynamic = "force-dynamic";

/**
 * Only URLs that answer 200 and are meant to rank: launched regions, states and places with real products (cities, and the Federal District's
 * administrative regions that have products — an RA with none answers 404, so it is never listed), the design-family pages that
 * exist for a place, and CMS pages the owner marked indexable. Left out on purpose: /busca and /personalizar (noindex), request tokens,
 * /admin and /api, and `/` (redirects to /sul).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const catalog = getCatalog();
  const lastModified = catalog.syncedAt ? new Date(catalog.syncedAt) : undefined;
  const entry = (path: string): MetadataRoute.Sitemap[number] => ({ url: `${SITE_URL.replace(/\/$/, "")}${path}`, ...(lastModified ? { lastModified } : {}) });

  const entries: MetadataRoute.Sitemap = [];
  const cmsBundle = siteConfigHomeEnabled() ? homeBundle() : null;

  for (const region of launchedRegions()) {
    entries.push(entry(`/${region}`), entry(`/${region}/privacidade`));

    const cities = [...catalog.coveredLocalityIds(region)].flatMap((id) => {
      const city = localityById(id);
      return city ? [city] : [];
    });

    for (const uf of new Set(cities.map((c) => c.uf))) {
      if (STATE_NAMES[uf]) entries.push(entry(`/${region}/${uf.toLowerCase()}`));
    }

    for (const city of cities) {
      const base = `/${region}/${city.uf.toLowerCase()}/${city.slug}`;
      entries.push(entry(base));
      for (const { family } of catalog.cityFamilies(city.id)) entries.push(entry(`${base}/${family.id}`));
    }

    // Published, not archived, and indexable: a page is noindex until the owner turns indexing on, so it never belongs here before that.
    for (const page of cmsBundle?.docs[region]?.pages ?? []) {
      if (!page.archived && page.seo.indexable) entries.push(entry(pageHref(region, page)));
    }
  }

  return entries;
}
