import "server-only";
import { getCatalog } from "../catalog/repository";
import { citiesOfRegion } from "../geo/cities";
import type { RegionSlug } from "../geo/regions";
import { launchedRegions } from "../regions/launched";
import { siteConfigHomeEnabled } from "./flag";
import { readPublished } from "./published";
import { resolveNavigation, resolveTheme, themeCssVars, type ResolvedNavigation, type ResolvedTheme } from "./navigation";
import type { ScopeDoc } from "./schema";

/**
 * What the storefront header, the mobile menu and the region wrapper need, resolved on the SERVER from the PUBLISHED configuration (the local
 * published.json, cached by mtime: no database, no network, nothing per page view) and from the data that is really live: the launched
 * regions and the states of the region that have products. With the config-driven home off, or nothing published, the config is empty and the
 * result is the default menu hierarchy in the region's current colours.
 */
export type RegionChrome = { navigation: ResolvedNavigation; theme: ResolvedTheme; cssVars: Record<string, string> };

function publishedDocs(region: RegionSlug): { doc: ScopeDoc | undefined; global: ScopeDoc | undefined } {
  if (!siteConfigHomeEnabled()) return { doc: undefined, global: undefined };
  const state = readPublished();
  // The seed is the fallback bundle, not a publication: only a real published release may theme or re-label anything.
  return state.source === "published" ? { doc: state.bundle.docs[region], global: state.bundle.docs.global } : { doc: undefined, global: undefined };
}

/** UFs of the region with at least one product (a state without products has no page worth linking); `null` when nothing is covered at all (no catalog yet). */
export function coveredUfs(region: RegionSlug): string[] | null {
  const covered = getCatalog().coveredCityIds(region);
  if (covered.size === 0) return null;
  return [...new Set(citiesOfRegion(region).filter((c) => covered.has(c.id)).map((c) => c.uf))];
}

export function regionChrome(region: RegionSlug): RegionChrome {
  const { doc, global } = publishedDocs(region);
  const theme = resolveTheme(region, doc, global);
  return {
    navigation: resolveNavigation({ region, doc, launched: launchedRegions(), coveredUfs: coveredUfs(region) }),
    theme,
    cssVars: themeCssVars(theme.configured),
  };
}

/** The region's resolved palette alone (published configuration, same rules as the chrome): what the promotions button wears on both surfaces. */
export function regionPalette(region: RegionSlug): ResolvedTheme["effective"] {
  const { doc, global } = publishedDocs(region);
  return resolveTheme(region, doc, global).effective;
}
