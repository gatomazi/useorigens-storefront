import "server-only";
import { REGION_SLUGS } from "../geo/regions";
import { readPublished } from "../site-config/published";
import type { ConfiguredPromotions } from "./promotions";

/**
 * The coupons and promotions as PUBLISHED in the panel ("Cupons e promoções", one list per region), every item with its window and switch:
 * the MCP shows the owner what is live, scheduled, ended or switched off. A draft never counts. Local file only (cached by mtime upstream).
 */
export function loadPromotions(): ConfiguredPromotions {
  const state = readPublished();
  if (state.source !== "published") return { source: "seed", asOf: null, regions: [] };
  return {
    source: "published",
    asOf: new Date(state.mtimeMs).toISOString(),
    regions: REGION_SLUGS.flatMap((region) => {
      const items = state.bundle.docs[region]?.promotions?.items ?? [];
      return items.length ? [{ region, items }] : [];
    }),
  };
}
