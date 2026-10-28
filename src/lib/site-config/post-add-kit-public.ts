import "server-only";
import { storeForRegion } from "../catalog/commerce-mode";
import type { RegionSlug } from "../geo/regions";
import { cachedProgressivePromotion } from "../ink/promotions-client";
import { postAddKitPayload, type PublicPostAddKit } from "./post-add-kit";
import type { PostAddKitConfig } from "./post-add-kit-schema";
import { readPublished } from "./published";

/** The PUBLISHED "Monte seu kit" of one region (only this region's own document; a draft never reaches the public). */
export function publishedPostAddKit(region: RegionSlug): PostAddKitConfig | undefined {
  const state = readPublished();
  return state.source === "published" ? state.bundle.docs[region]?.postAddKit : undefined;
}

/**
 * The kit of a region at `now` (`v: 1`, see site-config/post-add-kit.ts), for the Worker that draws it in INK's post-add modal. Off = no INK read at all;
 * on = the chosen promotion as INK has it now (cached a few minutes, see ink/promotions-client.ts), so an edit or an end inside INK reaches the page.
 */
export async function publicPostAddKit(region: RegionSlug, now: number = Date.now()): Promise<PublicPostAddKit> {
  const config = publishedPostAddKit(region);
  if (!config?.enabled || config.promotionId === undefined) return postAddKitPayload(region, config, null, now);
  const promotion = await cachedProgressivePromotion(storeForRegion(region), config.promotionId, now);
  return postAddKitPayload(region, config, promotion, now);
}
