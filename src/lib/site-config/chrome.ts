import "server-only";
import { siteCollectionMenu } from "../catalog/collection-menu";
import { getCatalog } from "../catalog/repository";
import { citiesOfRegion } from "../geo/cities";
import { localitiesOfRegion, stateLocalityCounts, stateLocalityLabel } from "../geo/localities";
import type { RegionSlug } from "../geo/regions";
import { launchedRegions } from "../regions/launched";
import { siteConfigHomeEnabled } from "./flag";
import { readPublished } from "./published";
import { homeThemeCssVars, resolveNavigation, resolveTheme, themeCssVars, type ResolvedNavigation, type ResolvedTheme } from "./navigation";
import { homeThemeOf, type HomeThemeName, type ScopeDoc } from "./schema";
import { neutralThemeCssVars } from "./neutral-theme";
import type { CSSProperties } from "react";

/**
 * What the storefront header, the mobile menu and the region wrapper need, resolved on the SERVER from the PUBLISHED configuration (the local
 * published.json, cached by mtime: no database, no network, nothing per page view) and from the data that is really live: the launched
 * regions, the states of the region that have products and the collections of its menu that have a page. With the config-driven home off, or nothing published, the config is empty and the
 * result is the default menu hierarchy in the region's current colours.
 */
/** `homeTheme`: the theme of the region's home ("original" / "editorial"): the footer follows it. */
export type RegionChrome = { navigation: ResolvedNavigation; theme: ResolvedTheme; cssVars: Record<string, string>; homeTheme: HomeThemeName };

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

/** Per UF of the region, how many places with products it has, in the words the home uses ("399 cidades", "36 localidades"). */
function stateDetails(region: RegionSlug): Record<string, string> {
  const covered = getCatalog().coveredLocalityIds(region);
  const localities = localitiesOfRegion(region).filter((l) => covered.has(l.id));
  const out: Record<string, string> = {};
  for (const uf of new Set(localities.map((l) => l.uf))) out[uf] = stateLocalityLabel(stateLocalityCounts(localities.filter((l) => l.uf === uf)));
  return out;
}

export function regionChrome(region: RegionSlug): RegionChrome {
  const { doc, global } = publishedDocs(region);
  const theme = resolveTheme(region, doc, global);
  return {
    navigation: resolveNavigation({ region, doc, launched: launchedRegions(), coveredUfs: coveredUfs(region), collections: siteCollectionMenu(region, doc), stateDetails: stateDetails(region) }),
    theme,
    cssVars: { ...themeCssVars(theme.configured, theme.effective), ...homeThemeCssVars(doc, theme.effective) },
    homeTheme: homeThemeOf(doc),
  };
}

/** The region's resolved palette alone (published configuration, same rules as the chrome): what the promotions button wears on both surfaces. */
export function regionPalette(region: RegionSlug): ResolvedTheme["effective"] {
  const { doc, global } = publishedDocs(region);
  return resolveTheme(region, doc, global).effective;
}

/** Published-only colours of pages outside any region. The regional global palette is deliberately not consulted. */
export function regionlessStyle(): CSSProperties {
  if (!siteConfigHomeEnabled()) return {};
  const state = readPublished();
  return state.source === "published" ? neutralThemeCssVars(state.bundle.docs.global.neutralTheme) as CSSProperties : {};
}
