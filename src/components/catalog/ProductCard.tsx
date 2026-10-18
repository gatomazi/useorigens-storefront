"use client";

import type { ReactNode } from "react";
import { trackGoToInk, trackGoToUmaPenca } from "@/lib/analytics/track";
import type { ProductTags } from "@/lib/site-config/schema";
import type { CarouselItem, LeadingCard } from "./ProductCarousel";
import type { CardBuy } from "@/lib/site-config/cards-schema";
import { CardButton, CardCall, CardFab } from "./CardButton";
import { ProductPhoto } from "./ProductPhoto";
import { PriceText } from "./PriceText";

/**
 * The pieces a product section is made of, shared by its two displays (ProductCarousel: one row that scrolls; ProductGrid: every card on the page),
 * so a card looks, links and reports the click exactly the same in both.
 */

/**
 * Title, intro and the "Ver todos" button (outlined, quieter than the cards' own) of a product section, on one row with `children` (the carousel's arrows). `viewAllHref` is a real store
 * URL, verified live (never guessed — see editorial/collections.ts); if the title is too long to share the row, the link wraps to its own line underneath.
 */
export function ProductSectionHeading({ labelledBy, title, intro, dark, viewAllHref, viewAllLabel, children }: { labelledBy: string; title: string; intro?: string; dark: boolean; viewAllHref?: string; viewAllLabel: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-6 sm:pb-8">
      <div className="max-w-2xl">
        <h2 id={labelledBy} className="t-h2">
          {title}
        </h2>
        {intro && <p className={`t-body mt-3 ${dark ? "text-white/85" : "text-ink-soft"}`}>{intro}</p>}
      </div>
      {/* Phones: its own row under the title, "Ver todos" at the start and the carousel arrows (`children`, pushed by `ml-auto`) at the end. */}
      <div className="flex w-full shrink-0 items-center gap-4 sm:w-auto">
        {viewAllHref && (
          // An outlined button in the store's CTA shape (and the carousel arrows' height), quieter than the cards' filled buttons: it reads as a
          // control, not as a line of text, and fills only under the pointer.
          <a
            href={viewAllHref}
            className={`group inline-flex h-11 items-center gap-2 border-2 px-4 text-[0.8125rem] font-bold uppercase tracking-[0.04em] transition-colors sm:h-12 ${dark ? "border-white/40 text-white hover:border-white hover:bg-white hover:text-ink" : "border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-white"}`}
          >
            {viewAllLabel}
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * The frame every product card shares (the style cards of a city too, FamilyCardView.tsx): ONE bordered block (picture on top, edge to edge; name, price and the optional button under it), so a product
 * reads as one thing instead of a picture and two loose lines on the page ground. Elevation is the border alone (no shadow, no gradient). The block
 * has no tint of its own: it shows the ground the grid sits on (`--card-fill`, transparent unless a themed page fills it to hide its pattern), and
 * the picture keeps the photo frame of the store (`.photo`, the INK grey), so a mockup with a grey of its own never sits on a white box.
 * The whole block is the card's single link: no nested links, and the global focus ring outlines it for keyboard users.
 */
/**
 * Cards with a ground of their own, for a section on a photo (a see-through card would show the picture behind its text): the INK grey, the
 * same as the mockups, so picture and text read as one piece, and dark text even when the section's heading is white (`on-light`).
 */
export const SOLID_CARDS = "on-light [--card-fill:var(--ground)]";

export const cardFrame = (dark: boolean) =>
  `group relative flex h-full flex-col overflow-hidden rounded-lg border bg-[var(--card-fill)] transition-colors ${dark ? "border-white/25 hover:border-white/55" : "border-black/15 hover:border-black/35"}`;
const frame = cardFrame;
/** Name, price and button: 12px of padding on phones, 16px from tablets up. */
export const CARD_INFO = "flex grow flex-col p-3 md:p-4";
const INFO = CARD_INFO;
/** Up to two lines (the full name stays in the DOM). No room is reserved under a short name: see `FOOT`. */
export const CARD_NAME = "line-clamp-2 text-[0.9375rem] font-medium leading-[1.3] md:text-base";
const NAME = CARD_NAME;
/**
 * Price and button, pinned to the foot of the card. The cards of a row share one height, so prices and buttons line up whatever the length of
 * the names above them; and when every name of the row fits one line, the price sits right under the name (the room appears only next to a
 * neighbour whose name takes two lines).
 */
export const CARD_FOOT = "mt-auto pt-1";
const FOOT = CARD_FOOT;
/** The price line of a card. */
export const CARD_PRICE = "text-base font-semibold leading-tight tabular-nums md:text-lg";
const PRICE = CARD_PRICE;

/** A notch smaller on phones, so a discount and a short own tag share one line instead of stacking over the print. */
const TAG = "px-1.5 py-0.5 text-[0.625rem] font-bold uppercase leading-[1.15] tracking-[0.04em] text-white sm:px-2 sm:py-1 sm:text-[0.6875rem] sm:tracking-[0.08em]";

/**
 * The section's tags over the top-left corner of the picture (`layout.tags`): the "% OFF" of a product on promotion first, in the region's colour,
 * then the section's own text in ink, the same family as the "Personalizável" tag. Inside the card's link, so a screen reader hears them with
 * the product; never zoomed with the photo.
 */
export function CardTags({ discount, text }: { discount?: number; text?: string }) {
  if (!discount && !text) return null;
  return (
    <span className="pointer-events-none absolute left-2 top-2 z-[1] flex max-w-[calc(100%-1rem)] flex-wrap items-start gap-1">
      {discount !== undefined && <span className={`${TAG} bg-region-primary`}>{discount}% OFF</span>}
      {text && <span className={`${TAG} bg-ink`}>{text}</span>}
    </span>
  );
}

/**
 * The reserved first card ("personalize yours on this model"): a link inside the region, never a checkout. `asButton`: the section shows buy buttons, so
 * this card's own call ("Personalizar") takes the same button shape, at the same height as theirs.
 */
export function CustomizerCardLink({ card, poster, dark, sizes, asButton = false }: { card: LeadingCard; poster: boolean; dark: boolean; sizes: string; asButton?: boolean }) {
  return (
    <a href={card.href} className={frame(dark)} draggable={false} aria-label={`${card.title}. Personalize: você escolhe as palavras (não é uma camiseta pronta da loja).`}>
      <span className={`photo ${poster ? "photo-poster" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a CMS upload served pre-sized from the media origin (never through the image optimizer) */}
        <img
          src={card.image.variants?.[Math.min(1, card.image.variants.length - 1)]?.src ?? card.image.src}
          srcSet={card.image.variants?.map((v) => `${v.src} ${v.w}w`).join(", ")}
          sizes={sizes}
          width={card.image.width}
          height={card.image.height}
          alt={card.image.alt}
          loading="eager"
          className="absolute inset-0 h-full w-full object-contain"
        />
        <span className="absolute left-2 top-2 bg-ink px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-white">Personalizável</span>
      </span>
      <div className={INFO}>
        <h3 className={NAME}>{card.title}</h3>
        {card.description && <p className={`t-place mt-1 text-[0.95rem] ${dark ? "text-white/80" : "text-ink-mute"}`}>{card.description}</p>}
        <div className={FOOT}>{asButton ? <CardButton label={card.button} dark={dark} /> : <p className="t-small font-semibold underline decoration-region-accent decoration-2 underline-offset-4">{card.button} →</p>}</div>
      </div>
    </a>
  );
}

/**
 * One product: photo, name and price, opening the real store page (INK or Uma Penca) and reporting the click with the section's `sourceSection`.
 * `buy`: the section's buy button ("Ver produto", or the text the owner set) at the foot of the card, or as a cart on the picture (`CardFab`). The picture is contained, never cropped:
 * INK mockups (800×820) fill the frame exactly; a photo of another shape keeps its proportions on the frame's grey.
 */
export function ProductCardLink({ item, poster, dark, sizes, priority, sourceSection, buy, tags }: { item: CarouselItem; poster: boolean; dark: boolean; sizes: string; priority: boolean; sourceSection: string; buy?: CardBuy; tags?: ProductTags }) {
  return (
    <a
      href={item.href}
      className={frame(dark)}
      draggable={false}
      onClick={() =>
        item.umaPenca
          ? trackGoToUmaPenca({ productId: item.id, productName: item.name, kind: item.umaPenca.kind, region: item.umaPenca.region, sourceSection, value: item.rawPrice ?? undefined, destinationUrl: item.href })
          : trackGoToInk({ productId: item.id, sourceSection, state: item.state, value: item.rawPrice ?? undefined, productName: item.name, destinationUrl: item.href })
      }
    >
      <ProductPhoto
        poster={poster}
        src={item.imageUrl}
        hoverSrc={item.hoverImageUrl}
        alt={`${item.eyebrow ? `${item.eyebrow}, ` : ""}${item.name}${item.context ? `, ${item.context}` : ""}`}
        sizes={sizes}
        priority={priority}
        className="photo-contain"
      >
        {buy?.style === "fab" && <CardFab label={buy.label} />}
      </ProductPhoto>
      <CardTags discount={tags?.discount ? item.discount : undefined} text={tags?.text} />
      <div className={INFO}>
        {item.eyebrow && <p className="mb-1 font-display text-[1.6rem] font-extrabold leading-none">{item.eyebrow}</p>}
        <h3 className={NAME}>{item.name}</h3>
        {item.context && <p className={`t-place mt-1 text-[0.95rem] ${dark ? "text-white/80" : "text-ink-mute"}`}>{item.context}</p>}
        <div className={FOOT}>
          {buy?.style === "link" ? (
            <CardCall label={buy.label} dark={dark} price={item.price ? <p className={PRICE}><PriceText price={item.price} listPrice={item.listPrice} /></p> : undefined} />
          ) : (
            item.price && <p className={PRICE}><PriceText price={item.price} listPrice={item.listPrice} /></p>
          )}
          {buy?.style === "button" && <CardButton label={buy.label} dark={dark} />}
        </div>
      </div>
    </a>
  );
}

/**
 * The last card of a carousel ("Ver todas as 128 peças dessa coleção", Aparência → Card no fim dos carrosséis): the same address as the section's "Ver
 * todos", for whoever scrolled to the end without seeing the button above. Same frame and height as the products of the row, filled with the region's
 * colour (white on a section that already sits on it) so it never reads as one more product.
 */
export function ViewAllCardLink({ href, label, dark }: { href: string; label: string; dark: boolean }) {
  return (
    <a
      href={href}
      draggable={false}
      data-carousel-end
      className={`group flex h-full min-h-56 flex-col justify-between gap-6 overflow-hidden rounded-lg border p-4 transition-colors md:p-5 ${dark ? "border-white bg-white text-ink hover:bg-white/90" : "border-region-primary bg-region-primary text-white hover:bg-[rgb(var(--region-primary-rgb)/0.9)]"}`}
    >
      <span aria-hidden="true" className={`inline-flex h-12 w-12 items-center justify-center rounded-full border-2 transition-transform group-hover:translate-x-1 ${dark ? "border-ink" : "border-white"}`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
      <span className="text-[1.25rem] font-bold leading-[1.2] md:text-[1.375rem]">{label}</span>
    </a>
  );
}
