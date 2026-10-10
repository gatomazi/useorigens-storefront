"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { ProductTags } from "@/lib/site-config/schema";
import { CustomizerCardLink, ProductCardLink, ProductSectionHeading, SOLID_CARDS } from "./ProductCard";

export type CarouselItem = {
  id: string;
  name: string;
  /** Large short label above the name (an area code, for instance). */
  eyebrow?: string;
  /** Where it comes from: "Curitiba · PR". Always shown for regional voice items. */
  context?: string;
  price: string | null;
  /** INK's regular price, formatted, only while a promotion is on: struck through before `price` (src/components/catalog/PriceText.tsx). */
  listPrice?: string;
  /** The "% OFF" during a promotion, as INK shows it (`discountPercent`); shown as a tag only where the section turns discount tags on. */
  discount?: number;
  /** Exactly what INK returned — the GoToInk `value` param. Omitted (not guessed) when not cleanly known for
   * this item (e.g. a state-wide editorial pick with no single city). */
  rawPrice?: number | null;
  /** UF, when this item is genuinely tied to one state — the GoToInk `state` param. Never guessed. */
  state?: string;
  imageUrl: string;
  /** Second photo, shown under the pointer. Only Uma Penca articles have one (fetched on demand, src/lib/umapenca/hover.ts). */
  hoverImageUrl?: string;
  /** Verified purchase URL: the INK store, or the Uma Penca store when `umaPenca` is set. */
  href: string;
  /** Set only for an Uma Penca article (canecas, ecobags): the click then fires GoToPenca / go_to_umapenca instead of GoToInk. */
  umaPenca?: { kind: string; region: string };
};

/** The reserved first card of a section: "personalize yours on this model". A link inside the region (never a checkout); the picture is a CMS upload. */
export type LeadingCard = { href: string; title: string; description?: string; button: string; image: { src: string; width: number; height: number; variants?: { w: number; src: string }[]; alt: string } };

function Arrow({ direction, disabled, onClick, dark }: { direction: "prev" | "next"; disabled: boolean; onClick: () => void; dark: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Anteriores" : "Próximos"}
      className={`inline-flex h-11 w-11 items-center justify-center border-2 transition-colors disabled:opacity-30 sm:h-12 sm:w-12 ${dark ? "border-white enabled:hover:bg-white enabled:hover:text-ink" : "border-ink enabled:hover:bg-ink enabled:hover:text-white"}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 ${direction === "prev" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/** Width of one card at each breakpoint (the `basis-*` of the row below). */
const CARD_SIZES = "(min-width: 1280px) 19vw, (min-width: 1024px) 22vw, (min-width: 768px) 27vw, (min-width: 640px) 34vw, 62vw";

/**
 * Touch-first carousel. No autoplay; drag and swipe work, and the arrows are real buttons on every width: on a phone they are
 * the visible cue that more products wait to the side (next to the next card's edge peeking in), not only a mouse affordance. The title lives here so arrows and heading share one row on every width.
 *
 * `viewAllHref`, when given, is a real store collection URL, verified live (never guessed — see
 * editorial/collections.ts). It renders as an outlined "Ver todos" button next to the title, on every width (quieter than
 * the cards' filled buttons, the arrows' height); if the title is too long to share the row, it wraps to its own line underneath.
 */
export function ProductCarousel({
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
  tags,
  toolbar,
  resetKey,
  solidCards = false,
}: {
  /** When set, this card is ALWAYS the first one; `items` are the ordinary products after it. */
  leading?: LeadingCard;
  items: CarouselItem[];
  labelledBy: string;
  title: string;
  intro?: string;
  poster?: boolean;
  /** "dark" is for a section on the regional primary colour (white text). */
  tone?: "light" | "dark";
  /** Real store collection URL for "Ver todos". Omit when there is no single real destination. */
  viewAllHref?: string;
  viewAllLabel?: string;
  /** GoToInk `source_section` — one value for the whole carousel instance, e.g. "home_terra". This is the one
   * shared click point behind five of the home's sections (Da Nossa Terra, Redesenhos, Feito Para Você, Fala
   * daqui, DDD) — CLAUDE_ADENDO_4_EVENTOS_META_STOREFRONT.md §2. */
  /** Controls between the heading and the cards (the style chips of a state page). */
  toolbar?: ReactNode;
  /** Changing it scrolls the row back to the first card (the items were swapped in place, e.g. another style chosen). */
  resetKey?: string;
  sourceSection: string;
  /** The section's buy button ("Comprar") under every product card; absent = none. */
  buyLabel?: string;
  /** The section's tags on the product pictures (`layout.tags`); absent = none. */
  tags?: ProductTags;
  /** Opaque light cards (`SOLID_CARDS`), for a section on a photo: the picture behind would show through the cards otherwise. */
  solidCards?: boolean;
}) {
  const dark = tone === "dark";
  const cardDark = dark && !solidCards;
  const [viewport, embla] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", dragFree: true });

  // Arrow state mirrors Embla's own scroll position (an external system), so subscribe to it.
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!embla) return () => {};
      embla.on("select", notify).on("reInit", notify).on("scroll", notify);
      return () => {
        embla.off("select", notify).off("reInit", notify).off("scroll", notify);
      };
    },
    [embla],
  );
  useEffect(() => {
    embla?.scrollTo(0, true);
  }, [embla, resetKey]);

  const canPrev = useSyncExternalStore(subscribe, () => embla?.canScrollPrev() ?? false, () => false);
  const canNext = useSyncExternalStore(subscribe, () => embla?.canScrollNext() ?? true, () => true);

  return (
    <div role="region" aria-roledescription="carrossel" aria-labelledby={labelledBy}>
      <ProductSectionHeading labelledBy={labelledBy} title={title} intro={intro} dark={dark} viewAllHref={viewAllHref} viewAllLabel={viewAllLabel}>
        <div className="ml-auto flex shrink-0 gap-2">
          <Arrow dark={dark} direction="prev" disabled={!canPrev} onClick={() => embla?.scrollPrev()} />
          <Arrow dark={dark} direction="next" disabled={!canNext} onClick={() => embla?.scrollNext()} />
        </div>
      </ProductSectionHeading>
      {toolbar && <div className="-mt-2 pb-6 sm:-mt-4 sm:pb-8">{toolbar}</div>}
      <div ref={viewport} className="-mr-4 overflow-hidden sm:mr-0">
        <ul className={`-ml-3 flex touch-pan-y sm:-ml-4 lg:-ml-6 ${solidCards ? SOLID_CARDS : ""}`}>
          {leading && (
            <li key="customizer-card" data-customizer-card className="min-w-0 shrink-0 grow-0 basis-[62%] pl-3 sm:basis-[34%] sm:pl-4 md:basis-[27%] lg:basis-[22%] lg:pl-6 xl:basis-[19%]">
              <CustomizerCardLink card={leading} poster={poster} dark={cardDark} sizes={CARD_SIZES} asButton={Boolean(buyLabel)} />
            </li>
          )}
          {items.map((item, i) => (
            <li key={item.id} className="min-w-0 shrink-0 grow-0 basis-[62%] pl-3 sm:basis-[34%] sm:pl-4 md:basis-[27%] lg:basis-[22%] lg:pl-6 xl:basis-[19%]">
              <ProductCardLink item={item} poster={poster} dark={cardDark} sizes={CARD_SIZES} priority={i < 2} sourceSection={sourceSection} buyLabel={buyLabel} tags={tags} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
