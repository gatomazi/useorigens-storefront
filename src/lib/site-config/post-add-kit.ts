/**
 * "Monte seu kit": the public payload. Pure (no I/O, no `server-only`): the public API, the CMS editor and the tests run the very same rules. The Worker of the
 * INK keeps its own check of the payload (`use-origens-workers/src/kit-gateway.js`): the contract between the two is `v: 1` below.
 *
 * The region's document says IF and WHICH promotion; INK says WHAT it is (code, tiers, window). With no live promotion behind the choice the payload says
 * `kit: null` and the modal stays exactly as INK draws it.
 */
import { kitPromotionLive, shownKitTiers, type InkProgressivePromotion, type KitDiscountKind, type KitTier } from "../ink/progressive-promotions";
import { kitTexts, type PostAddKitConfig } from "./post-add-kit-schema";

export * from "./post-add-kit-schema";

export type PublicKit = {
  /** INK's id (analytics only). */
  id: number;
  /** What the customer types in INK's cart ("Copiar"). */
  code: string;
  /** INK applies it by itself (no code to type). */
  auto: boolean;
  kind: KitDiscountKind;
  tiers: KitTier[];
  /** When the promotion ends, if it does (a client drops the block once it is over, even from its cache). */
  endsAt?: string;
  eyebrow: string;
  title: string;
  lead: string;
};
export type PublicPostAddKit = { v: 1; region: string; kit: PublicKit | null };

/** The payload of a region at `now`, from its published choice and the promotion INK returned for it (null = none, or INK could not say). */
export function postAddKitPayload(region: string, config: PostAddKitConfig | undefined, promotion: InkProgressivePromotion | null, now: number): PublicPostAddKit {
  if (!config?.enabled || config.promotionId === undefined || !promotion || promotion.id !== config.promotionId || !kitPromotionLive(promotion, now)) return { v: 1, region, kit: null };
  const kit: PublicKit = { id: promotion.id, code: promotion.code, auto: promotion.applyAutomatically, kind: promotion.kind, tiers: shownKitTiers(promotion.tiers), ...kitTexts(config) };
  if (promotion.expiresAt) kit.endsAt = new Date(promotion.expiresAt).toISOString();
  return { v: 1, region, kit };
}
