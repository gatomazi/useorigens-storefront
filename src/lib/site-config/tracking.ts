import "server-only";
import type { Scope } from "./schema";
import { siteConfigHomeEnabled } from "./flag";
import { readPublished } from "./published";
import { resolveTracking } from "./resolve";

/**
 * The tracking IDs a region's pages use, resolved from the PUBLISHED configuration (`global` + regional override, each vendor
 * independently). Returns `undefined` — meaning "keep using the build-time NEXT_PUBLIC_* values, untouched" — unless BOTH the flag is on
 * (`SITE_CONFIG_HOME=on`) and a published.json exists and is usable. A missing, corrupt or seed-only state therefore changes nothing for
 * paid traffic. Reads a local file (cached by mtime); no database, no network. The consent gate is unchanged: the components still render
 * nothing before the person accepts, and one ID per document means one SDK initialisation per page.
 */
export function publishedTracking(region: Scope): { metaPixelId: string | null; ga4MeasurementId: string | null } | undefined {
  if (!siteConfigHomeEnabled()) return undefined;
  const state = readPublished();
  if (state.source !== "published") return undefined;
  const t = resolveTracking(state.bundle, region, { metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || null, ga4MeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || null });
  return { metaPixelId: t.metaPixelId, ga4MeasurementId: t.ga4MeasurementId };
}
