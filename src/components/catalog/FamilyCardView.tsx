"use client";

import Link from "next/link";
import { trackGoToInk } from "@/lib/analytics/track";
import type { FamilyCardModel } from "@/lib/catalog/family-card";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { ShareButton } from "@/components/share/ShareButton";
import type { CardBuy } from "@/lib/site-config/cards-schema";
import { CardButton, CardCall, CardFab } from "./CardButton";
import { CARD_FOOT, CARD_INFO, CARD_NAME, CARD_PRICE, cardFrame, CardTags } from "./ProductCard";
import { ProductPhoto } from "./ProductPhoto";
import { PriceText } from "./PriceText";

/**
 * One design family for one city (a style card), drawn from `FamilyCardModel` (src/lib/catalog/family-card.ts). The SAME frame as every
 * product card of the store (`ProductCard.tsx`: one bordered block, picture on top, name, context and price under it), so a style on the
 * city page reads like a product on the home or on a collection page. Every card is the same size — commercial priority comes from order
 * (families.ts), never from a bigger card.
 *
 * The heart and the share button are SIBLINGS of the card's link, over the picture — never nested inside it (a <button> inside an <a> is
 * invalid HTML and would fire both the save and the navigation on one tap). Share sits second: quieter than the heart (translucent), full strength
 * under the pointer or the keyboard, with its 44px target kept.
 *
 * A plain <a> (not next/link) for the INK case: a real cross-origin navigation, same tab, reported once (GoToInk) on the real click.
 */
export function FamilyCardView({ card, sizes, priority = false, buy }: { card: FamilyCardModel; sizes: string; priority?: boolean; buy?: CardBuy }) {
  const content = (
    <>
      <ProductPhoto src={card.imageUrl} alt={card.alt} sizes={sizes} priority={priority} className="photo-contain">
        {buy?.style === "fab" && <CardFab label={buy.label} />}
      </ProductPhoto>
      <CardTags discount={card.discount} />
      <div className={CARD_INFO}>
        <h3 className={CARD_NAME}>{card.familyName}</h3>
        {/* The piece shown (garment tabs) on every width; the family's one-line description only from tablets up: on a phone the picture says it. */}
        <p className={`t-caption mt-1 max-w-[30ch] ${card.pieceLabel ? "" : "hidden sm:block"}`}>{card.description}</p>
        {card.variantsCount > 0 && <p className="t-caption mt-1 font-semibold text-ink">{card.variantsCount === 1 ? "Mais 1 versão" : `Mais ${card.variantsCount} versões`}</p>}
        <div className={CARD_FOOT}>
          {buy?.style === "link" ? (
            <CardCall label={buy.label} price={card.price ? <p className={CARD_PRICE}><PriceText price={card.price} listPrice={card.listPrice} /></p> : undefined} />
          ) : (
            card.price && (
              <p className={CARD_PRICE}>
                <PriceText price={card.price} listPrice={card.listPrice} />
              </p>
            )
          )}
          {buy?.style === "button" && <CardButton label={buy.label} />}
        </div>
      </div>
    </>
  );
  const frame = cardFrame(false);
  return (
    <div className="group relative h-full">
      <FavoriteButton item={card.favorite} className="absolute right-2 top-2 z-10" />
      {card.share && <ShareButton share={card.share} variant="icon" className="absolute right-2 top-[3.25rem] z-10 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100" />}
      {card.direct && card.track ? (
        <a href={card.href} onClick={() => trackGoToInk(card.track!)} className={frame} aria-label={`Comprar ${card.displayName} de ${card.cityName} na loja`}>
          {content}
        </a>
      ) : (
        <Link href={card.href} className={frame}>
          {content}
        </Link>
      )}
    </div>
  );
}
