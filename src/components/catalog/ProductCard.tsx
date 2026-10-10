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

/** The reserved first card ("personalize yours on this model"): a link inside the region, never a checkout. */
export function CustomizerCardLink({ card, poster, dark, sizes }: { card: LeadingCard; poster: boolean; dark: boolean; sizes: string }) {
  return (
    <a href={card.href} className="group block" draggable={false} aria-label={`${card.title}. Personalize: você escolhe as palavras (não é uma camiseta pronta da loja).`}>
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
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute left-2 top-2 bg-ink px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-white">Personalizável</span>
      </span>
      <div className="mt-3">
        <h3 className="t-h3 link-line inline">{card.title}</h3>
        {card.description && <p className={`t-place mt-1 text-[0.95rem] ${dark ? "text-white/80" : "text-ink-mute"}`}>{card.description}</p>}
        <p className="t-small mt-1 font-semibold underline decoration-region-accent decoration-2 underline-offset-4">{card.button} →</p>
      </div>
    </a>
  );
}

/** One product: photo, name and price, opening the real store page (INK or Uma Penca) and reporting the click with the section's `sourceSection`. */
export function ProductCardLink({ item, poster, dark, sizes, priority, sourceSection }: { item: CarouselItem; poster: boolean; dark: boolean; sizes: string; priority: boolean; sourceSection: string }) {
  return (
    <a
      href={item.href}
      className="group block"
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
      />
      <div className="mt-3">
        {item.eyebrow && <p className="font-display text-[1.6rem] font-extrabold leading-none">{item.eyebrow}</p>}
        <h3 className="t-h3 link-line mt-1 inline">{item.name}</h3>
        {item.context && <p className={`t-place mt-1 text-[0.95rem] ${dark ? "text-white/80" : "text-ink-mute"}`}>{item.context}</p>}
        {item.price && <p className="t-small mt-1 font-semibold">{item.price}</p>}
      </div>
    </a>
  );
}
