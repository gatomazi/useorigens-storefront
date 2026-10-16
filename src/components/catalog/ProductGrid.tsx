import type { ReactNode } from "react";
import type { ProductTags } from "@/lib/site-config/schema";
import type { CardBuy } from "@/lib/site-config/cards-schema";
import { CustomizerCardLink, ProductCardLink, ProductSectionHeading, SOLID_CARDS } from "./ProductCard";
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
  buy,
  tags,
  solidCards = false,
  aside,
  toolbar,
  footer,
  compact = false,
  eager = true,
}: {
  /** The automatic collection page: the page header already names the collection, so the grid's heading is a quiet line (still the section's name for assistive tech). */
  compact?: boolean;
  /** Next to the heading, where "Ver todos" goes (a paged grid shows its product count there). */
  aside?: ReactNode;
  /** Between the heading and the cards (a collection page's mini search). */
  toolbar?: ReactNode;
  /** Under the grid (a paged grid's page links). */
  footer?: ReactNode;
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
  /** The section's buy button ("Comprar") on every product card, under the price or as a cart on the picture; absent = none. */
  buy?: CardBuy;
  /** The section's tags on the product pictures (`layout.tags`); absent = none. */
  tags?: ProductTags;
  /** Opaque light cards (`SOLID_CARDS`), for a section on a photo. */
  solidCards?: boolean;
  /** The first two pictures load right away (a section near the top); false = every picture loads lazily (a section below the fold). */
  eager?: boolean;
}) {
  const dark = tone === "dark";
  const cardDark = dark && !solidCards;
  const cards = items.length + (leading ? 1 : 0);
  return (
    <div role="region" aria-labelledby={labelledBy}>
      {compact ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-4">
          <h2 id={labelledBy} className="text-[1.125rem] font-extrabold tracking-tight">
            {title}
          </h2>
          {aside}
        </div>
      ) : (
        <ProductSectionHeading labelledBy={labelledBy} title={title} intro={intro} dark={dark} viewAllHref={viewAllHref} viewAllLabel={viewAllLabel}>
          {aside}
        </ProductSectionHeading>
      )}
      {toolbar}
      {/* Bordered cards carry their own separation: one even gap on both axes, no taller rows of air between them. */}
      <ul className={`grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5 ${solidCards ? SOLID_CARDS : ""}`}>
        {leading && (
          <li key="customizer-card" data-customizer-card>
            <CustomizerCardLink card={leading} poster={poster} dark={cardDark} sizes={CARD_SIZES} asButton={buy?.style === "button"} />
          </li>
        )}
        {items.map((item, i) => (
          <li key={item.id}>
            <ProductCardLink item={item} poster={poster} dark={cardDark} sizes={CARD_SIZES} priority={eager && i < 2} sourceSection={sourceSection} buy={buy} tags={tags} />
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
      {footer}
    </div>
  );
}
