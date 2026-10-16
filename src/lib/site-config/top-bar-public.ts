import "server-only";
import type { RegionSlug } from "../geo/regions";
import { readPublished } from "./published";
import { topBarPayload, type PublicTopBar } from "./top-bar";
import type { TopBarConfig } from "./top-bar-schema";

/**
 * The PUBLISHED "Faixa do topo" of one region (only this region's own document; a draft never reaches the public). Local file only (cached by mtime):
 * no database, no INK, nothing per request but a `stat`. With nothing published there is no configuration, and every surface keeps its default strip.
 */
export function publishedTopBar(region: RegionSlug): TopBarConfig | undefined {
  const state = readPublished();
  return state.source === "published" ? state.bundle.docs[region]?.topBar : undefined;
}

/** The live messages of a region at `now`, filled in (`v: 1`, see site-config/top-bar.ts), for the Worker that draws them on the INK pages. */
export function publicTopBar(region: RegionSlug, now: number = Date.now()): PublicTopBar {
  return topBarPayload(region, publishedTopBar(region), now);
}
