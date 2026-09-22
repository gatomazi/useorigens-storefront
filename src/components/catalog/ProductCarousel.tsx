"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useSyncExternalStore } from "react";
import { ProductPhoto } from "./ProductPhoto";

export type CarouselItem = {
  id: string;
  name: string;
  /** Large short label above the name (an area code, for instance). */
  eyebrow?: string;
  /** Where it comes from: "Curitiba · PR". Always shown for regional voice items. */
  context?: string;
  price: string | null;
  imageUrl: string;
  /** Verified INK purchase URL. */
  href: string;
};

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

/**
 * Touch-first carousel. No autoplay; arrows are real buttons (hidden on phones, where swipe is natural);
 * drag and swipe work. The title lives here so arrows and heading share one row on every width.
 *
 * `viewAllHref`, when given, is a real store collection URL, verified live (never guessed — see
 * editorial/collections.ts). It renders as a small "Ver todos" text link next to the title, on every width
 * (never a big button); if the title is too long to share the row, it wraps to its own line underneath.
 */
export function ProductCarousel({
  items,
  labelledBy,
  title,
  intro,
  poster = false,
  tone = "light",
  viewAllHref,
}: {
  items: CarouselItem[];
  labelledBy: string;
  title: string;
  intro?: string;
  poster?: boolean;
  /** "dark" is for a section on the regional primary colour (white text). */
  tone?: "light" | "dark";
  /** Real store collection URL for "Ver todos". Omit when there is no single real destination. */
  viewAllHref?: string;
}) {
  const dark = tone === "dark";
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
  const canPrev = useSyncExternalStore(subscribe, () => embla?.canScrollPrev() ?? false, () => false);
  const canNext = useSyncExternalStore(subscribe, () => embla?.canScrollNext() ?? true, () => true);

  return (
    <div role="region" aria-roledescription="carrossel" aria-labelledby={labelledBy}>
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
              <span className="link-line inline">Ver todos</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          )}
          <div className="hidden shrink-0 gap-2 sm:flex">
            <Arrow dark={dark} direction="prev" disabled={!canPrev} onClick={() => embla?.scrollPrev()} />
            <Arrow dark={dark} direction="next" disabled={!canNext} onClick={() => embla?.scrollNext()} />
          </div>
        </div>
      </div>
      <div ref={viewport} className="-mr-4 overflow-hidden sm:mr-0">
        <ul className="-ml-3 flex touch-pan-y sm:-ml-4 lg:-ml-6">
          {items.map((item, i) => (
            <li key={item.id} className="min-w-0 shrink-0 grow-0 basis-[62%] pl-3 sm:basis-[34%] sm:pl-4 md:basis-[27%] lg:basis-[22%] lg:pl-6 xl:basis-[19%]">
              <a href={item.href} className="group block" draggable={false}>
                <ProductPhoto
                  poster={poster}
                  src={item.imageUrl}
                  alt={`${item.eyebrow ? `${item.eyebrow}, ` : ""}${item.name}${item.context ? `, ${item.context}` : ""}`}
                  sizes="(min-width: 1280px) 19vw, (min-width: 1024px) 22vw, (min-width: 768px) 27vw, (min-width: 640px) 34vw, 62vw"
                  priority={i < 2}
                />
                <div className="mt-3">
                  {item.eyebrow && <p className="font-display text-[1.6rem] font-extrabold leading-none">{item.eyebrow}</p>}
                  <h3 className="t-h3 link-line mt-1 inline">{item.name}</h3>
                  {item.context && <p className={`t-place mt-1 text-[0.95rem] ${dark ? "text-white/80" : "text-ink-mute"}`}>{item.context}</p>}
                  {item.price && <p className="t-small mt-1 font-semibold">{item.price}</p>}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
