import { CustomizerCardLink, ProductCardLink, ProductSectionHeading } from "./ProductCard";
import type { CarouselItem, LeadingCard } from "./ProductCarousel";

/** Width of one card: four columns from 1024px, three from 768px, two on phones (the same steps as FamilyGrid and the search results). */
const CARD_SIZES = "(min-width: 1024px) 23vw, (min-width: 768px) 30vw, 46vw";
/** From this many cards the "Ver todos" link is repeated as a button under the grid: it is a long way back up to the heading. */
const FOOTER_LINK_FROM = 8;

/**
 * The "grid" display of a CMS product section: every card on the page at once, like a category page, instead of a row that scrolls. Same heading, same
 * cards, same click tracking as ProductCarousel; the reserved first card ("personalize yours") stays the first cell.
 */
export function ProductGrid({
  items,
  labelledBy,
  title,
  intro,
  poster = false,
  tone = "light",
  viewAllHref,
  viewAllLabel = "Ver todos",
  sourceSection,
  leading,
  buyLabel,
}: {
  leading?: LeadingCard;
  items: CarouselItem[];
  labelledBy: string;
  title: string;
  intro?: string;
  poster?: boolean;
  /** "dark" is for a section on a dark ground (white text). */
  tone?: "light" | "dark";
  viewAllHref?: string;
  viewAllLabel?: string;
  sourceSection: string;
  /** The section's buy button ("Comprar") under every product card; absent = none. */
  buyLabel?: string;
}) {
  const dark = tone === "dark";
  const cards = items.length + (leading ? 1 : 0);
  return (
    <div role="region" aria-labelledby={labelledBy}>
      <ProductSectionHeading labelledBy={labelledBy} title={title} intro={intro} dark={dark} viewAllHref={viewAllHref} viewAllLabel={viewAllLabel} />
      {/* Bordered cards carry their own separation: one even gap on both axes, no taller rows of air between them. */}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
        {leading && (
          <li key="customizer-card" data-customizer-card>
            <CustomizerCardLink card={leading} poster={poster} dark={dark} sizes={CARD_SIZES} asButton={Boolean(buyLabel)} />
          </li>
        )}
        {items.map((item, i) => (
          <li key={item.id}>
            <ProductCardLink item={item} poster={poster} dark={dark} sizes={CARD_SIZES} priority={i < 2} sourceSection={sourceSection} buyLabel={buyLabel} />
          </li>
        ))}
      </ul>
      {viewAllHref && cards >= FOOTER_LINK_FROM && (
        <div className="mt-10 flex justify-center lg:mt-14">
          {/* Secondary next to the cards' own buttons: outlined on a light ground, so "see the whole collection" never competes with a product. */}
          <a href={viewAllHref} className={dark ? "btn btn-light" : "btn btn-ghost"}>
            {viewAllLabel}
          </a>
        </div>
      )}
    </div>
  );
}
