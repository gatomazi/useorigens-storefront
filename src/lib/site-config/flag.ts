import "server-only";
import { buildSeedBundle } from "./seed";
import type { PublishedBundle } from "./schema";

/**
 * Feature flag for the config-driven home. OFF unless the literal string "on" — production stays on the original,
 * hard-coded home until the CMS is deliberately activated. Read at render time (runtime env), never inlined at build.
 */
export function siteConfigHomeEnabled(): boolean {
  return process.env.SITE_CONFIG_HOME === "on";
}

/**
 * The bundle the config-driven home renders. Today: the immutable seed only (no published file reader yet — that is a
 * later step and needs the Volume namespace decided in docs/admin/cms-v1-round2.md §5). Tracking IDs are taken from the current env
 * exactly as the trackers read them, so a bundle resolved from this seed matches today's behaviour.
 */
export function homeBundle(): PublishedBundle {
  return buildSeedBundle({
    metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || null,
    ga4MeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || null,
  });
}
