"use client";

import type { FamilyCardModel } from "@/lib/catalog/family-card";
import type { CardBuy } from "@/lib/site-config/cards-schema";
import { FamilyCardView } from "./FamilyCardView";

/** Width of one style card: four columns from 1024px, three from 768px, two on phones (the same steps as ProductGrid and the search results). */
export const FAMILY_CARD_SIZES = "(min-width: 1024px) 23vw, (min-width: 768px) 30vw, 46vw";

/**
 * The style cards of a city as one consistent grid: every card the same size, in commercial order, 2 columns on phones, 3 from 768px, 4 from
 * 1024px. Drawn from plain card models, so the city page's garment tabs can mount a piece's grid on the client only when that piece is chosen.
 */
/** The split home composition: three columns beside the heading from 768px; on phones a row that scrolls sideways (a third card would sit alone). */
const SPLIT_SIZES = "(min-width: 1024px) 19vw, (min-width: 768px) 30vw, 72vw";

export function FamilyGridView({ cards, buy, layout = "grid" }: { cards: FamilyCardModel[]; buy?: CardBuy; layout?: "grid" | "split" }) {
  if (cards.length === 0) return null;
  if (layout === "split") {
    return (
      <ul className="no-scrollbar -mx-[var(--gutter)] flex snap-x snap-mandatory scroll-pl-[var(--gutter)] gap-3 overflow-x-auto px-[var(--gutter)] pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:gap-5">
        {cards.map((card) => (
          <li key={card.familyId} className="w-[72%] max-w-[18rem] shrink-0 snap-start md:w-auto md:max-w-none">
            {/* Never the first thing on the page (the home's third section): every picture loads lazily. */}
            <FamilyCardView card={card} sizes={SPLIT_SIZES} buy={buy} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
      {cards.map((card, i) => (
        <li key={card.familyId}>
          <FamilyCardView card={card} sizes={FAMILY_CARD_SIZES} priority={i < 2} buy={buy} />
        </li>
      ))}
    </ul>
  );
}
