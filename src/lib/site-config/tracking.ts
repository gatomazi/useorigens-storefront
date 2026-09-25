import "server-only";
import type { EffectiveTracking } from "./resolve";
import type { Scope } from "./schema";
import { siteConfigHomeEnabled } from "./flag";
import { readPublished } from "./published";
import { resolveTracking } from "./resolve";

/** The build-time IDs the storefront used before the CMS existed ("legacy"). Only Sul may ever use them. */
export const legacyIds = () => ({ metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || null, ga4MeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || null });

/**
 * The tracking IDs a region's pages use, resolved on the SERVER from the PUBLISHED configuration (global + regional, each tool
 * independently: inherit / own / off), read from the local published.json (cached by mtime: no database, no network, nothing per PageView).
 *
 * Without a usable published configuration (flag off, no file, corrupt file) the answer is the legacy one: Sul keeps its build-time IDs,
 * exactly as before the CMS; Norte and Centro-Oeste get NOTHING, never Sul's IDs. The IDs reach the client components as props, so a
 * published change reaches new visitors without a build or deploy (the layout is invalidated on publish).
 */
export function effectiveTracking(region: Scope): EffectiveTracking {
  const state = siteConfigHomeEnabled() ? readPublished() : null;
  return resolveTracking(state?.source === "published" ? state.bundle : null, region, legacyIds());
}

export function publishedTracking(region: Scope): { metaPixelId: string | null; ga4MeasurementId: string | null } {
  const t = effectiveTracking(region);
  return { metaPixelId: t.metaPixelId, ga4MeasurementId: t.ga4MeasurementId };
}
