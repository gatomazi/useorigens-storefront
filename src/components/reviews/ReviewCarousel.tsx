"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useRef, useState } from "react";
import { ProductSectionHeading } from "@/components/catalog/ProductCard";
import { Arrow } from "@/components/catalog/ProductCarousel";
import type { InkReview } from "@/lib/reviews/parse";
import { AllReviewsModal } from "./AllReviewsModal";
import { Stars } from "./Stars";
import { useEmblaArrows } from "./useEmblaArrows";

function ReviewCard({ review }: { review: InkReview }) {
  return (
    <article className="flex h-full flex-col gap-4 border-2 border-ink bg-ground p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Stars rating={review.rating} />
        {review.verified && <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-ink-mute">Compra verificada</span>}
      </div>
      {/* Six lines at most: a longer story is told in full on INK ("Ver todas as avaliações"). */}
      <p className="t-body line-clamp-6 text-ink-soft">“{review.text}”</p>
      <footer className="mt-auto text-[0.9375rem] leading-snug">
        <p className="font-bold">{review.author}</p>
        {review.date && <p className="text-ink-mute">{review.date}</p>}
      </footer>
    </article>
  );
}

/**
 * "O que nossos clientes dizem": the store's own reviews (src/lib/reviews), as touch-first as ProductCarousel (drag, swipe, real arrow buttons, no
 * autoplay). "Ver todas as avaliações" opens the whole list, unfiltered, in a modal (no redirect). `viewAllHref` is the same list on INK: what a middle
 * click, a Cmd/Ctrl click or a browser without JavaScript follows, and what the modal offers when it cannot load.
 */
export function ReviewCarousel({ reviews, intro, viewAllHref }: { reviews: InkReview[]; intro?: string; viewAllHref: string }) {
  const [viewport, embla] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", dragFree: true });
  const { canPrev, canNext } = useEmblaArrows(embla);
  const [allOpen, setAllOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  return (
    <div role="region" aria-roledescription="carrossel" aria-labelledby="avaliacoes-titulo">
      <ProductSectionHeading
        labelledBy="avaliacoes-titulo"
        title="O que nossos clientes dizem"
        intro={intro}
        dark={false}
        viewAllHref={viewAllHref}
        viewAllLabel="Ver todas as avaliações"
        onViewAllClick={(event) => {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          opener.current = event.currentTarget;
          setAllOpen(true);
        }}
      >
        <div className="ml-auto flex shrink-0 gap-2">
          <Arrow dark={false} direction="prev" disabled={!canPrev} onClick={() => embla?.scrollPrev()} />
          <Arrow dark={false} direction="next" disabled={!canNext} onClick={() => embla?.scrollNext()} />
        </div>
      </ProductSectionHeading>
      <div ref={viewport} className="-mr-4 overflow-hidden sm:mr-0">
        <ul className="-ml-3 flex touch-pan-y sm:-ml-4 lg:-ml-6">
          {reviews.map((review, i) => (
            // The position is part of the key: one person can leave two different reviews on the same day (the parser tells them apart by their text).
            <li key={`${review.author}|${review.date}|${i}`} className="min-w-0 shrink-0 grow-0 basis-[84%] pl-3 sm:basis-[48%] sm:pl-4 lg:basis-[32%] lg:pl-6 xl:basis-[24%]">
              <ReviewCard review={review} />
            </li>
          ))}
        </ul>
      </div>
      <AllReviewsModal open={allOpen} onClose={() => setAllOpen(false)} returnFocus={opener} fallbackHref={viewAllHref} />
    </div>
  );
}
