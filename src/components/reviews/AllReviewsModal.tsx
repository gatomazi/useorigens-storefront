"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { SheetDialog, SheetHeader } from "@/components/layout/SheetDialog";
import { reviewKey } from "@/lib/reviews/key";
import type { InkReview, InkReviewsPage } from "@/lib/reviews/parse";
import { srcOf } from "./photoSrc";
import { Stars } from "./Stars";
import { summaryLine } from "./summaryLine";

type ListPage = Pick<InkReviewsPage, "score" | "count" | "nextPage" | "reviews">;

function ListItem({ review }: { review: InkReview }) {
  return (
    <li className="py-5 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Stars rating={review.rating} />
        {review.verified && <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-ink-mute">Compra verificada</span>}
      </div>
      {review.text && <p className="t-body mt-3 text-ink-soft">{review.text}</p>}
      {review.photos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {review.photos.map((photo) => (
            <li key={photo.thumb} className="relative h-28 w-24 overflow-hidden bg-ground">
              <Image {...srcOf(photo)} alt="Foto enviada por um cliente" fill sizes="96px" quality={70} className="object-cover" />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[0.9375rem] leading-snug">
        <span className="font-bold">{review.author}</span>
        {review.date && <span className="text-ink-mute"> · {review.date}</span>}
      </p>
    </li>
  );
}

const MORE_BUTTON = "inline-flex h-12 items-center justify-center border-2 border-ink px-5 text-[0.8125rem] font-bold uppercase tracking-[0.04em] transition-colors enabled:hover:bg-ink enabled:hover:text-white disabled:opacity-50";

/**
 * The store's whole list, newest first and unfiltered, read a page at a time from /api/avaliacoes. The next page loads by itself when the end of the
 * list comes near; the "Ver mais avaliações" button is the same step done by hand (and what a failed page asks to try again).
 */
function AllReviewsList({ fallbackHref }: { fallbackHref: string }) {
  const [reviews, setReviews] = useState<InkReview[]>([]);
  const [summary, setSummary] = useState<Pick<ListPage, "score" | "count"> | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const more = useRef<HTMLButtonElement>(null);

  // Reads a page into the list. The caller has already put the list in "loading" (it starts there: the first page is asked for on opening).
  const load = useCallback((page: number, signal?: AbortSignal) => {
    fetch(`/api/avaliacoes?page=${page}`, { signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ListPage>;
      })
      .then((data) => {
        // A review posted while the visitor scrolls shifts the pages by one: the one already shown is not shown twice.
        setReviews((current) => {
          const seen = new Set(current.map(reviewKey));
          return [...current, ...data.reviews.filter((r) => !seen.has(reviewKey(r)))];
        });
        if (page === 1) setSummary({ score: data.score, count: data.count });
        setNextPage(data.nextPage);
        setStatus("idle");
      })
      .catch(() => {
        if (!signal?.aborted) setStatus("error");
      });
  }, []);

  const ask = useCallback(
    (page: number) => {
      setStatus("loading");
      load(page);
    },
    [load],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(1, controller.signal);
    return () => controller.abort();
  }, [load]);

  // The end of the list coming into view asks for the next page (only while nothing is loading and nothing failed).
  useEffect(() => {
    const button = more.current;
    if (!button || nextPage === null || status !== "idle" || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && ask(nextPage), { rootMargin: "300px" });
    observer.observe(button);
    return () => observer.disconnect();
  }, [ask, nextPage, status, reviews.length]);

  const line = summary ? summaryLine(summary) : undefined;
  return (
    <div>
      {line && <p className="t-body mb-5 text-ink-soft">{line}</p>}
      {reviews.length > 0 && (
        <ul className="divide-y-2 divide-ink/15">
          {reviews.map((review, i) => (
            // The list only grows at its end, so the position is stable; it also keeps two look-alike stars-only reviews (same person, same day) apart.
            <ListItem key={`${reviewKey(review)}|${i}`} review={review} />
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-col items-start gap-3 pb-1">
        {status === "loading" && (
          <p role="status" className="text-[0.9375rem] text-ink-mute">
            Carregando avaliações…
          </p>
        )}
        {status === "error" && (
          <>
            <p role="alert" className="text-[0.9375rem]">
              Não foi possível carregar as avaliações agora.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" className={MORE_BUTTON} onClick={() => ask(nextPage ?? 1)}>
                Tentar de novo
              </button>
              <a href={fallbackHref} className="link-line font-semibold">
                Ver na loja
              </a>
            </div>
          </>
        )}
        {status === "idle" && nextPage !== null && (
          <button ref={more} type="button" className={MORE_BUTTON} onClick={() => ask(nextPage)}>
            Ver mais avaliações
          </button>
        )}
        {status === "idle" && nextPage === null && reviews.length > 0 && <p className="text-[0.9375rem] text-ink-mute">Essas são todas as avaliações.</p>}
      </div>
    </div>
  );
}

/** "Ver todas as avaliações" without leaving the storefront: the store's complete list in the store's own sheet (a bottom sheet on a phone). */
export function AllReviewsModal({ open, onClose, returnFocus, fallbackHref }: { open: boolean; onClose: () => void; returnFocus: RefObject<HTMLElement | null>; fallbackHref: string }) {
  return (
    <SheetDialog open={open} onClose={onClose} labelledBy="todas-avaliacoes-titulo" returnFocus={returnFocus} wide>
      <SheetHeader id="todas-avaliacoes-titulo" title="Todas as avaliações" onClose={onClose} />
      <AllReviewsList fallbackHref={fallbackHref} />
    </SheetDialog>
  );
}
