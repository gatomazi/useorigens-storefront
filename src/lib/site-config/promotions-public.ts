import "server-only";
import type { RegionSlug } from "../geo/regions";
import { regionPalette } from "./chrome";
import { promotionsPayload, type PublicPromotions } from "./promotions";
import { readPublished } from "./published";

/**
 * The PUBLISHED coupons and promotions of one region, live at `now`. Only the published document counts (a draft never reaches the public) and only
 * this region's own document is read: one region's coupon can never appear in another. The seed has no promotions, so with nothing published the list
 * is empty and no button is drawn anywhere. Local file only (cached by mtime): no database, no INK, nothing per request but a `stat`.
 */
export function publicPromotions(region: RegionSlug, now: number = Date.now()): PublicPromotions {
  const state = readPublished();
  const doc = state.source === "published" ? state.bundle.docs[region] : undefined;
  const palette = regionPalette(region);
  // The header pair is the one the CMS already checks for contrast (Aparência), so the button is as readable as the header.
  return promotionsPayload(region, doc?.promotions, now, { primary: palette.headerBackground, onPrimary: palette.headerText });
}
