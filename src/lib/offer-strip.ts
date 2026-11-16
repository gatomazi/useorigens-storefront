/**
 * The offer line under a design page's buy button ("Frete grátis a partir de 2 peças · Leve 3 e ganhe R$ 25 OFF (até R$ 100 OFF em 6)"). Pure: every
 * number comes from a rule the store already runs — the cart's free-shipping incentive (Tema da INK, only when the owner confirmed it) and the
 * "Monte seu kit" promotion (INK's own tiers, only while live). Nothing is written by hand: when a rule changes or ends the line changes or goes away.
 */
import { kitDiscountLabel, type KitDiscountKind, type KitTier } from "./ink/progressive-promotions";

export type OfferStripInput = {
  /** Pieces for free shipping (the confirmed incentive), when it reaches the page's state. */
  freeShippingItems?: number | null;
  kit?: { kind: KitDiscountKind; tiers: readonly KitTier[] } | null;
};

export function offerStripText({ freeShippingItems, kit }: OfferStripInput): string | null {
  const parts: string[] = [];
  if (freeShippingItems && freeShippingItems >= 2) parts.push(`Frete grátis a partir de ${freeShippingItems} peças`);
  const tiers = kit?.tiers ?? [];
  if (kit && tiers.length > 0) {
    const first = tiers[0];
    const last = tiers[tiers.length - 1];
    const lead = `Leve ${first.items} e ganhe ${kitDiscountLabel(kit.kind, first.discount)}`;
    parts.push(tiers.length > 1 ? `${lead} (até ${kitDiscountLabel(kit.kind, last.discount)} em ${last.items})` : lead);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
