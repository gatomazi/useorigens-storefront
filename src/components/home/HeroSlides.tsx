"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/** How long a product stays before the next one slides in. */
const SLIDE_MS = 6000;

/**
 * Picks one product before the first paint: runs while the HTML is parsed (the page is static, so the draw can only happen in the browser), so the
 * visitor never sees the first product swap for another. The slides are already in the page; nothing is fetched.
 */
const PICK = "(function(s){var w=s.parentNode,k=w.querySelectorAll(':scope>[data-slide]'),i=Math.floor(Math.random()*k.length);for(var j=0;j<k.length;j++)k[j].hidden=j!==i;w.dataset.picked=String(i)})(document.currentScript)";

/**
 * The products of the "feature" opening, one at a time (CMS `featuredRotation`). `children` are the product halves, already drawn on the server.
 *
 * "random": one of them, drawn at each visit (the others stay hidden, so their pictures are never downloaded). A client-side navigation does not run
 * the inline draw, so the effect draws there instead.
 * "slide": they pass sideways by themselves, every few seconds, in a loop; swipe and the dots work, the pointer over it or the focus inside it holds
 * it, and a pause button stops it for good (WCAG 2.2.2). With reduced motion it never moves by itself.
 */
export function HeroSlides({ mode, labels, children }: { mode: "random" | "slide"; labels: string[]; children: ReactNode[] }) {
  return mode === "random" ? <RandomSlide>{children}</RandomSlide> : <SlidingSlides labels={labels}>{children}</SlidingSlides>;
}

function RandomSlide({ children }: { children: ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrapper = ref.current;
    if (!wrapper || wrapper.dataset.picked) return;
    const slides = wrapper.querySelectorAll<HTMLElement>(":scope > [data-slide]");
    const pick = Math.floor(Math.random() * slides.length);
    slides.forEach((slide, i) => (slide.hidden = i !== pick));
    wrapper.dataset.picked = String(pick);
  }, []);
  return (
    // The draw changes `hidden` and `data-picked` before React hydrates: those differences are expected, never "fixed" back to the first product.
    <div ref={ref} className="flex h-full flex-col" suppressHydrationWarning>
      {children.map((slide, i) => (
        <div key={i} data-slide hidden={i !== 0} className="flex flex-1 flex-col" suppressHydrationWarning>
          {slide}
        </div>
      ))}
      <script dangerouslySetInnerHTML={{ __html: PICK }} />
    </div>
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

function SlidingSlides({ labels, children }: { labels: string[]; children: ReactNode[] }) {
  const [viewport, embla] = useEmblaCarousel({ loop: true, align: "start" });
  const [selected, setSelected] = useState(0);
  // `paused`: the visitor paused it (or dragged it), for good; `held`: the pointer is over it or the focus is inside it, for now. With reduced motion
  // it never moves by itself, until the visitor presses play.
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
  const [paused, setPaused] = useState<boolean | null>(null);
  const stopped = paused ?? reducedMotion;
  const [held, setHeld] = useState(false);
  const count = children.length;
  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setSelected(embla.selectedScrollSnap());
    // Someone dragging it took control: it stops moving by itself.
    const onDrag = () => setPaused(true);
    embla.on("select", onSelect).on("reInit", onSelect).on("pointerDown", onDrag);
    return () => {
      embla.off("select", onSelect).off("reInit", onSelect).off("pointerDown", onDrag);
    };
  }, [embla]);
  useEffect(() => {
    if (!embla || stopped || held) return;
    const timer = window.setInterval(() => embla.scrollNext(), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [embla, stopped, held]);
  const go = useCallback((i: number) => embla?.scrollTo(i), [embla]);

  return (
    <div
      className="relative flex h-full min-w-0 flex-col"
      role="region"
      aria-roledescription="carrossel"
      aria-label="Produtos em destaque"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHeld(false)}
    >
      <div ref={viewport} className="flex-1 overflow-hidden">
        <div className="flex h-full touch-pan-y">
          {children.map((slide, i) => (
            <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} de ${count}: ${labels[i]}`} className="flex min-w-0 shrink-0 grow-0 basis-full flex-col">
              {slide}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-full bg-white/90 px-1.5 py-1 text-ink shadow-sm lg:right-6 lg:top-6">
        <button type="button" onClick={() => setPaused(!stopped)} aria-label={stopped ? "Continuar a passagem dos produtos" : "Pausar a passagem dos produtos"} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            {stopped ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
          </svg>
        </button>
        {children.map((_, i) => (
          <button key={i} type="button" onClick={() => go(i)} aria-label={`Mostrar ${labels[i]}`} aria-current={i === selected ? "true" : undefined} className="group/dot inline-flex h-8 w-6 items-center justify-center">
            <span aria-hidden="true" className={`block h-2 rounded-full transition-all ${i === selected ? "w-5 bg-ink" : "w-2 bg-ink/35 group-hover/dot:bg-ink/60"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
