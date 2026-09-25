import "server-only";
import { regionReadiness } from "../catalog/readiness";
import { REGION_SLUGS, type RegionSlug } from "../geo/regions";
import { siteConfigHomeEnabled } from "../site-config/flag";
import { readPublished } from "../site-config/published";

/**
 * Which regions are PUBLICLY launched, decided at runtime from the PUBLISHED configuration (published.json: local file, cached by mtime; no
 * database, no network). Sul is always public. Norte / Centro-Oeste are public only when (1) the CMS flag is on, (2) a usable published
 * release marks that region `launched`, and (3) the region's own catalog is actually there (`regionReadiness`), so a launched region can
 * never render as an empty page or as "0 cidades". Anything else — no file, corrupt file, flag off, a recalled region — falls back to Sul
 * only, exactly like the storefront before the CMS. Launching and recalling are ordinary publishes: per region, reversible, audited.
 */
export const BASE_REGIONS: readonly RegionSlug[] = ["sul"];

export function launchedRegions(): RegionSlug[] {
  if (!siteConfigHomeEnabled()) return [...BASE_REGIONS];
  const state = readPublished();
  if (state.source !== "published") return [...BASE_REGIONS];
  return REGION_SLUGS.filter((r) => r === "sul" || (state.bundle.docs[r]?.launched === true && regionReadiness(r).ready));
}

export const isRegionLaunched = (region: RegionSlug): boolean => launchedRegions().includes(region);
