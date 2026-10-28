"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PriceText } from "@/components/catalog/PriceText";

/** A product marked on the picture, ready to draw: where it sits (% of the picture) and what its card shows. */
export type HeroPinView = { id: string; x: number; y: number; name: string; place: string | null; price: string | null; listPrice?: string; imageUrl: string; href: string };

/** "50% 30%" → [0.5, 0.3] (the object-position the picture is drawn with). */
function focalOf(value: string | undefined): [number, number] {
  const [x, y] = (value ?? "50% 50%").split(/\s+/).map((v) => Number.parseFloat(v) / 100);
  return [Number.isFinite(x) ? x : 0.5, Number.isFinite(y) ? y : 0.5];
}

/** Keep a pin this far from the box's edges to draw it (a pin cut by the crop is not drawn at all). */
const EDGE = 18;
const LG = "(min-width: 1024px)";

/**
 * The "+" over each product marked on a hero picture ("compre o look"). The picture is drawn with `object-fit: cover` and its framing
 * (object-position), so a point of the picture moves with the crop of each screen: the same sums place every "+" on its shirt. One card open at a
 * time, next to its "+", turned towards the middle of the picture so it never leaves it; a click outside or Escape closes it.
 */
export function HeroPins({ pins, width, height, focal, focalDesktop, call }: { pins: HeroPinView[]; width: number; height: number; focal?: string; focalDesktop?: string; call: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ w: number; h: number; lg: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight, lg: window.matchMedia(LG).matches });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const close = useCallback(() => setOpen(null), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);

  const placed = frame
    ? pins.flatMap((pin) => {
        const [fx, fy] = focalOf(frame.lg ? (focalDesktop ?? focal) : focal);
        const scale = Math.max(frame.w / width, frame.h / height);
        const [dw, dh] = [width * scale, height * scale];
        const left = (frame.w - dw) * fx + (pin.x / 100) * dw;
        const top = (frame.h - dh) * fy + (pin.y / 100) * dh;
        return left < EDGE || left > frame.w - EDGE || top < EDGE || top > frame.h - EDGE ? [] : [{ pin, left, top, right: left > frame.w / 2, below: top < frame.h / 2 }];
      })
    : [];

  return (
    <div ref={box} className="absolute inset-0 z-[1]">
      {placed.map(({ pin, left, top, right, below }) => {
        const isOpen = open === pin.id;
        const cardId = `hero-pin-${pin.id}`;
        return (
          // The open one above the other "+" (its card must never sit under another pin).
          <div key={pin.id} className={`absolute ${isOpen ? "z-10" : ""}`} style={{ left, top }}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={cardId}
              aria-label={`${isOpen ? "Fechar" : "Ver"} ${pin.name}${pin.place ? `, ${pin.place}` : ""}`}
              onClick={() => {
                setSeen(true);
                setOpen(isOpen ? null : pin.id);
              }}
              className="relative -ml-[1.125rem] -mt-[1.125rem] grid h-9 w-9 place-items-center rounded-full bg-white text-ink shadow-[0_2px_10px_rgb(0_0_0/0.35)] ring-1 ring-black/10 transition-transform duration-200 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {/* A soft pulse until the visitor opens one: it tells the picture can be touched. */}
              {!seen && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-white/70 motion-safe:animate-ping" />}
              <svg aria-hidden="true" viewBox="0 0 24 24" className={`relative h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            {isOpen && (
              <div id={cardId} role="group" aria-label={pin.name} className={`absolute w-[15rem] ${right ? "right-6" : "left-6"} ${below ? "top-2" : "bottom-2"}`}>
                <Link href={pin.href} className="group flex items-center gap-3 rounded-lg bg-white p-2.5 pr-3 text-ink shadow-[0_8px_28px_rgb(0_0_0/0.28)] ring-1 ring-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small catalog thumbnail already public on the store */}
                  <img src={pin.imageUrl} alt="" className="h-16 w-14 shrink-0 rounded-md bg-[#e5e5e5] object-contain" loading="lazy" />
                  <span className="min-w-0">
                    <span className="block text-[0.9375rem] font-semibold leading-tight">{pin.name}</span>
                    {pin.place && <span className="mt-0.5 block font-[family-name:var(--font-serif-stack)] text-[0.875rem] leading-tight text-ink-mute">{pin.place}</span>}
                    {pin.price && (
                      <span className="mt-1 block text-[0.9375rem] font-semibold">
                        <PriceText price={pin.price} listPrice={pin.listPrice} />
                      </span>
                    )}
                    <span className="mt-1 inline-flex items-center gap-1 text-[0.8125rem] font-semibold underline decoration-region-accent decoration-2 underline-offset-4">
                      {call}
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  </span>
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
