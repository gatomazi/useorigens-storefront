import "server-only";
import { readPublished, seedFromEnv } from "./published";
import type { PublishedBundle } from "./schema";

/**
 * Feature flag for the config-driven home. OFF unless the literal string "on" — production stays on the original,
 * hard-coded home until the CMS is deliberately activated. Read at render time (runtime env), never inlined at build.
 */
export function siteConfigHomeEnabled(): boolean {
  return process.env.SITE_CONFIG_HOME === "on";
}

/**
 * The bundle the config-driven home renders (only reached with the flag on): the published `published.json` when it is present and
 * usable, otherwise the immutable seed. Never null, never empty. Tracking IDs in the seed come from the current env exactly as the
 * trackers read them (the trackers themselves are untouched by this).
 */
export function homeBundle(): PublishedBundle {
  return readPublished().bundle;
}

export { seedFromEnv };
