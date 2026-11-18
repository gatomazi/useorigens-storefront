"use client";

import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ProductSectionHeading } from "@/components/catalog/ProductCard";
import { Arrow } from "@/components/catalog/ProductCarousel";
import { SheetDialog, SheetHeader } from "@/components/layout/SheetDialog";
import type { InkReviewPhoto } from "@/lib/reviews/parse";
import { srcOf } from "./photoSrc";
import { useEmblaArrows } from "./useEmblaArrows";

/** The optimizer takes 0.5–2.5 s the first time a photo is asked for (it is cached after), so the viewer says so instead of keeping the previous photo on screen. */
function ViewerPhoto({ photo }: { photo: InkReviewPhoto }) {
  const [loaded, setLoaded] = useState(false);
  const { src, unoptimized } = srcOf(photo);
  return (
    <div className="relative mx-auto h-[min(62dvh,640px)] w-full bg-ground">
      {!loaded && (
        <p aria-hidden="true" className="absolute inset-0 grid place-items-center text-[0.9375rem] text-ink-mute">
          Carregando a foto…
        </p>
      )}
      <Image src={src} unoptimized={unoptimized} alt="Foto enviada por um cliente" fill sizes="(min-width: 768px) 700px, 92vw" quality={80} loading="eager" onLoad={() => setLoaded(true)} className="object-contain" />
    </div>
  );
}

/** The strip starts with this many tiles and opens another batch each time its right end comes near (the store has a few dozen photos in all). */
const BATCH = 12;
/**
 * A tile's picture starts loading when the tile is this close to the visible part of the strip, on either side, and not before: a phone shows two tiles at a
 * time and a desktop six, and every picture is an original INK keeps (1–7 MB) that our optimizer has to fetch and resize. Browsers' own `loading="lazy"`
 * does not do this here: it measures from the page's viewport, which reaches far past the strip's clipped box, so all twelve loaded on arrival.
 */
const NEAR = "0px 40% 0px 40%";

/**
 * "Quem usa, recomenda!": photos customers sent with their reviews. Same touch-first strip as the product carousels (drag, arrows, no autoplay: an
 * auto-moving row would need its own pause control); a tap opens the photo in the viewer, with the arrows and the keyboard to walk through ALL of them.
 * Tiles are added by batches as the right end comes near, and each picture loads only when its tile is near (see `NEAR`).
 */
export function ReviewPhotoStrip({ photos, intro }: { photos: InkReviewPhoto[]; intro?: string }) {
  const [viewport, embla] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", dragFree: true });
  const { canPrev, canNext } = useEmblaArrows(embla);
  const [open, setOpen] = useState<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const count = photos.length;
  const [shown, setShown] = useState(Math.min(BATCH, count));
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set());
  const [active, setActive] = useState(false);
  const tiles = useRef<(HTMLLIElement | null)[]>([]);

  // Nothing loads until the strip itself is within a screen or so of the page's viewport: the tiles below are measured against the strip's own box,
  // which says nothing about the strip being far down the page.
  useEffect(() => {
    if (!embla) return;
    const gate = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setActive(true);
        gate.disconnect();
      },
      { rootMargin: "600px 0px" },
    );
    gate.observe(embla.rootNode());
    return () => gate.disconnect();
  }, [embla]);

  // Watched against the strip itself, not the page: Embla moves the row with a transform inside a clipped box, so the page's viewport says nothing
  // about which tile is near. Once near, a tile stays loaded. A tile near within the last two of what is shown opens the next batch (Embla notices
  // the new slides by itself).
  useEffect(() => {
    if (!embla || !active) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entered = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.index));
        if (entered.length === 0) return;
        setNear((previous) => {
          const next = new Set(previous);
          for (const i of entered) next.add(i);
          return next.size === previous.size ? previous : next;
        });
        if (Math.max(...entered) >= shown - 2) setShown((s) => Math.min(s + BATCH, count));
      },
      { root: embla.rootNode(), rootMargin: NEAR },
    );
    for (const tile of tiles.current.slice(0, shown)) if (tile) observer.observe(tile);
    return () => observer.disconnect();
  }, [embla, active, shown, count]);

  const step = (direction: 1 | -1) => setOpen((i) => (i === null ? i : (i + direction + count) % count));

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % count));
      if (event.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + count) % count));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, count]);

  return (
    <div role="region" aria-roledescription="carrossel" aria-labelledby="fotos-clientes-titulo">
      <ProductSectionHeading labelledBy="fotos-clientes-titulo" title="Quem usa, recomenda!" intro={intro} dark={false} viewAllLabel="">
        <div className="ml-auto flex shrink-0 gap-2">
          <Arrow dark={false} direction="prev" disabled={!canPrev} onClick={() => embla?.scrollPrev()} />
          <Arrow dark={false} direction="next" disabled={!canNext} onClick={() => embla?.scrollNext()} />
        </div>
      </ProductSectionHeading>
      <div ref={viewport} className="-mr-4 overflow-hidden sm:mr-0">
        <ul className="-ml-3 flex touch-pan-y sm:-ml-4 lg:-ml-6">
          {photos.slice(0, shown).map((photo, i) => (
            <li
              key={photo.thumb}
              ref={(el) => {
                tiles.current[i] = el;
              }}
              data-index={i}
              className="min-w-0 shrink-0 grow-0 basis-[46%] pl-3 sm:basis-[31%] sm:pl-4 md:basis-[23%] lg:basis-[19%] lg:pl-6 xl:basis-[16%]"
            >
              <button
                type="button"
                aria-label={`Abrir a foto ${i + 1} de ${count}`}
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setOpen(i);
                }}
                className="relative block aspect-[4/5] w-full overflow-hidden bg-ground"
              >
                {near.has(i) && (
                  <Image {...srcOf(photo)} alt="" fill sizes="(min-width: 1280px) 16vw, (min-width: 1024px) 19vw, (min-width: 768px) 23vw, (min-width: 640px) 31vw, 46vw" quality={70} loading="eager" className="object-cover" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <SheetDialog open={open !== null} onClose={() => setOpen(null)} labelledBy="foto-cliente-titulo" returnFocus={opener} wide>
        {open !== null && (
          <>
            <SheetHeader id="foto-cliente-titulo" title="Foto de cliente" onClose={() => setOpen(null)} />
            <ViewerPhoto key={photos[open].thumb} photo={photos[open]} />
            <div className="mt-4 flex items-center justify-between gap-4">
              <Arrow dark={false} direction="prev" disabled={false} onClick={() => step(-1)} />
              <span aria-live="polite" className="text-[0.9375rem] font-semibold">
                {open + 1} / {count}
              </span>
              <Arrow dark={false} direction="next" disabled={false} onClick={() => step(1)} />
            </div>
          </>
        )}
      </SheetDialog>
    </div>
  );
}
