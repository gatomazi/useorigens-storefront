import "server-only";
import { storeForRegion } from "../catalog/commerce-mode";
import type { RegionSlug } from "../geo/regions";
import { cachedProgressivePromotion } from "../ink/promotions-client";
import { regionPalette } from "./chrome";
import { offerPopupPayload, type PublicOfferPopup } from "./offer-popup";
import type { OfferPopupConfig } from "./offer-popup-schema";
import { readPublished } from "./published";

/** The PUBLISHED "Popup da oferta" of one region (only this region's own document; a draft never reaches the public). */
export function publishedOfferPopup(region: RegionSlug): OfferPopupConfig | undefined {
  const state = readPublished();
  return state.source === "published" ? state.bundle.docs[region]?.offerPopup : undefined;
}

/**
 * The popup of a region at `now` (`v: 1`, see site-config/offer-popup.ts). Off = no INK read at all; on = the chosen promotion as INK has it now (the same
 * per-process cache as "Monte seu kit", see ink/promotions-client.ts), so an edit or an end inside INK reaches the page within minutes.
 */
export async function publicOfferPopup(region: RegionSlug, now: number = Date.now()): Promise<PublicOfferPopup> {
  const config = publishedOfferPopup(region);
  if (!config?.enabled || config.promotionId === undefined) return offerPopupPayload(region, config, null, now);
  const promotion = await cachedProgressivePromotion(storeForRegion(region), config.promotionId, now);
  const palette = regionPalette(region);
  return offerPopupPayload(region, config, promotion, now, { primary: palette.headerBackground, onPrimary: palette.headerText });
}
