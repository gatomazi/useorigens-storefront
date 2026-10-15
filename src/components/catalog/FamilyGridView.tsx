"use client";

import type { FamilyCardModel } from "@/lib/catalog/family-card";
import { FamilyCardView } from "./FamilyCardView";

/** Width of one style card: four columns from 1024px, three from 768px, two on phones (the same steps as ProductGrid and the search results). */
export const FAMILY_CARD_SIZES = "(min-width: 1024px) 23vw, (min-width: 768px) 30vw, 46vw";

/**
 * The style cards of a city as one consistent grid: every card the same size, in commercial order, 2 columns on phones, 3 from 768px, 4 from
 * 1024px. Drawn from plain card models, so the city page's garment tabs can mount a piece's grid on the client only when that piece is chosen.
 */
export function FamilyGridView({ cards, buyLabel }: { cards: FamilyCardModel[]; buyLabel?: string }) {
  if (cards.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
      {cards.map((card, i) => (
        <li key={card.familyId}>
          <FamilyCardView card={card} sizes={FAMILY_CARD_SIZES} priority={i < 2} buyLabel={buyLabel} />
        </li>
      ))}
    </ul>
  );
}
