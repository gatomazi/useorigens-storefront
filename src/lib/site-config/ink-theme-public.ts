import "server-only";
import type { RegionSlug } from "../geo/regions";
import { inkThemePayload, type PublicInkTheme } from "./ink-theme";
import { readPublished } from "./published";

/**
 * The PUBLISHED "Tema da INK" of one region. Only the published document counts (a draft never reaches the INK) and only this region's own document is
 * read. Nothing published = every surface off: the INK stays exactly as it is. Local file only (cached by mtime): no database, no INK, nothing per request.
 */
export function publicInkTheme(region: RegionSlug): PublicInkTheme {
  const state = readPublished();
  const doc = state.source === "published" ? state.bundle.docs[region] : undefined;
  return inkThemePayload(region, doc?.inkTheme);
}
