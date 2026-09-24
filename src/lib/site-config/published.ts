import "server-only";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import { bundleChecksum } from "./checksum";
import { sanitizeBundle } from "./sanitize";
import { buildSeedBundle } from "./seed";
import type { PublishedBundle } from "./schema";

/**
 * Where the published configuration lives. `SITE_CONFIG_DIR` (absolute) wins; otherwise a `site-config/` namespace INSIDE the catalog
 * snapshot directory — on Railway that is the existing Volume, next to (never inside) `catalog-snapshot.json`. The local CMS sandbox
 * points this at `data/admin-dev/published` (see docs/admin/cms-local-usage.md); the production Volume is never written by any code path
 * of the local editor.
 */
export function siteConfigDir(): string {
  const override = process.env.SITE_CONFIG_DIR;
  if (override) {
    if (!path.isAbsolute(override)) throw new Error("SITE_CONFIG_DIR must be an absolute path");
    return override;
  }
  return path.join(catalogSnapshotDir(), "site-config");
}

export const publishedFilePath = (): string => path.join(siteConfigDir(), "published.json");

export type PublishedState =
  | { source: "published"; bundle: PublishedBundle; checksum: string; diagnostics: string[]; mtimeMs: number }
  | { source: "seed"; bundle: PublishedBundle; reason: string; diagnostics: string[] };

export function seedFromEnv(): PublishedBundle {
  return buildSeedBundle({ metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || null, ga4MeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || null });
}

let cache: { file: string; mtimeMs: number; state: PublishedState } | null = null;

/**
 * The bundle the config-driven home renders: the published file when it exists and is usable, otherwise the immutable seed — never
 * nothing. Read from a LOCAL file only (no database, no INK) and cached by mtime, so a publish is picked up on the next render and
 * an unchanged file costs one `stat`. Invalid optional sections are dropped with diagnostics (sanitize.ts); a missing, unreadable,
 * corrupt or version-incompatible file yields the seed with the reason.
 */
export function readPublished(file: string = publishedFilePath()): PublishedState {
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    cache = null;
    return { source: "seed", bundle: seedFromEnv(), reason: "no published.json", diagnostics: [] };
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.state;
  let state: PublishedState;
  const fallback = seedFromEnv();
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    const { bundle, diagnostics } = sanitizeBundle(raw, fallback);
    state = bundle
      ? { source: "published", bundle, checksum: bundleChecksum(raw), diagnostics, mtimeMs }
      : { source: "seed", bundle: fallback, reason: diagnostics[0] ?? "unusable published.json", diagnostics };
  } catch (err) {
    state = { source: "seed", bundle: fallback, reason: `unreadable published.json (${err instanceof Error ? err.message : "error"})`, diagnostics: [] };
  }
  if (state.source === "seed") console.error(`[site-config] using the seed: ${state.reason}`);
  else if (state.diagnostics.length > 0) console.error(`[site-config] published ${state.bundle.releaseId} loaded with ${state.diagnostics.length} diagnostic(s): ${state.diagnostics.join("; ")}`);
  cache = { file, mtimeMs, state };
  return state;
}
