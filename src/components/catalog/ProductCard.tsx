"use client";

import type { ReactNode } from "react";
import { trackGoToInk, trackGoToUmaPenca } from "@/lib/analytics/track";
import type { CarouselItem, LeadingCard } from "./ProductCarousel";
import { ProductPhoto } from "./ProductPhoto";

/**
 * The pieces a product section is made of, shared by its two displays (ProductCarousel: one row that scrolls; ProductGrid: every card on the page),
 * so a card looks, links and reports the click exactly the same in both.
 */

/**
 * Title, intro and the small "Ver todos" link of a product section, on one row with `children` (the carousel's arrows). `viewAllHref` is a real store
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
      <div className="flex shrink-0 items-center gap-4">
        {viewAllHref && (
          <a
            href={viewAllHref}
            className={`group inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-semibold transition-colors ${dark ? "text-white hover:text-region-accent" : "text-ink hover:text-region-primary"}`}
          >
            <span className="link-line inline">{viewAllLabel}</span>
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
 * The frame every product card shares: ONE bordered block (picture on top, edge to edge; name, price and the optional button under it), so a product
 * reads as one thing instead of a picture and two loose lines on the page ground. Elevation is the border alone (no shadow, no gradient). The block
 * has no tint of its own: it shows the ground the grid sits on (`--card-fill`, transparent unless a themed page fills it to hide its pattern), and
 * the picture keeps the photo frame of the store (`.photo`, the INK grey), so a mockup with a grey of its own never sits on a white box.
 * The whole block is the card's single link: no nested links, and the global focus ring outlines it for keyboard users.
 */
const frame = (dark: boolean) =>
  `group flex h-full flex-col overflow-hidden rounded-lg border bg-[var(--card-fill)] transition-colors ${dark ? "border-white/25 hover:border-white/55" : "border-black/15 hover:border-black/35"}`;
/** Name, price and button: 12px of padding on phones, 16px from tablets up. */
const INFO = "flex grow flex-col p-3 md:p-4";
/** Up to two lines, and always the room of two (a short name never lifts the price or the button above its neighbours'); the full name stays in the DOM. */
const NAME = "line-clamp-2 min-h-[2.6em] text-[0.9375rem] font-medium leading-[1.3] md:text-base";

/**
 * The section's buy button at the foot of a card, in the store's own CTA shape (`.btn`: rectangular, solid, uppercase). It is NOT a second link: it sits
 * inside the card's own link, so it opens the same product page and the click is reported once, exactly as before. Pushed to the bottom of the card,
 * so the buttons of a row line up whatever the length of the names above them.
 */
function CardButton({ label, dark }: { label: string; dark: boolean }) {
  return (
    <span className="mt-auto block pt-3">
      <span
        className={`flex min-h-11 w-full items-center justify-center border-2 px-3 text-center text-[0.8125rem] font-bold uppercase leading-tight tracking-[0.04em] transition-colors ${dark ? "border-white bg-white text-black group-hover:bg-transparent group-hover:text-white" : "border-ink bg-ink text-white group-hover:bg-transparent group-hover:text-ink"}`}
      >
        {label}
      </span>
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
        {asButton ? <CardButton label={card.button} dark={dark} /> : <p className="t-small mt-1.5 font-semibold underline decoration-region-accent decoration-2 underline-offset-4">{card.button} →</p>}
      </div>
    </a>
  );
}

/**
 * One product: photo, name and price, opening the real store page (INK or Uma Penca) and reporting the click with the section's `sourceSection`.
 * `buyLabel`: the section's buy button ("Ver produto", or the text the owner set) at the foot of the card. The picture is contained, never cropped:
 * INK mockups (800×820) fill the frame exactly; a photo of another shape keeps its proportions on the frame's grey.
 */
export function ProductCardLink({ item, poster, dark, sizes, priority, sourceSection, buyLabel }: { item: CarouselItem; poster: boolean; dark: boolean; sizes: string; priority: boolean; sourceSection: string; buyLabel?: string }) {
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
      />
      <div className={INFO}>
        {item.eyebrow && <p className="mb-1 font-display text-[1.6rem] font-extrabold leading-none">{item.eyebrow}</p>}
        <h3 className={NAME}>{item.name}</h3>
        {item.context && <p className={`t-place mt-1 text-[0.95rem] ${dark ? "text-white/80" : "text-ink-mute"}`}>{item.context}</p>}
        {item.price && <p className="mt-1.5 text-base font-semibold leading-tight tabular-nums md:text-lg">{item.price}</p>}
        {buyLabel && <CardButton label={buyLabel} dark={dark} />}
      </div>
    </a>
  );
}
