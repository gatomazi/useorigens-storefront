"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FamilyCardModel } from "@/lib/catalog/family-card";
import type { CardBuy } from "@/lib/site-config/cards-schema";
import { FamilyCardView } from "./FamilyCardView";

/** The card beside the list: 22rem from 768px, 26rem from 1280px; the full width on phones. */
const PICK_SIZES = "(min-width: 1280px) 26rem, (min-width: 768px) 22rem, 92vw";
/** How long the pointer rests on a name before its card shows (a pass on the way to the card never switches it). */
const REST_MS = 140;

/**
 * The home's "list" composition of the city styles (CMS `variant: "list"`): every style of the example city by NAME, and ONE card beside the list,
 * the style chosen. All the styles within reach without one card per style on screen; every style gets the same card when chosen (the order is still the
 * commercial one, families.ts).
 *
 * Tabs, as the city page's garment rail (CityGarmentTabs): the names are tabs, each card a tab panel. A click, a tap, the keyboard (arrows, Home,
 * End) or the pointer resting on a name chooses it. Choosing is local only: GoToInk / select_item stay on the card's own click. From 768px the names
 * are a column between hairlines with the card beside it; on phones a row of chips that scrolls sideways, the card under it.
 */
export function FamilyPickView({ cards, buy }: { cards: FamilyCardModel[]; buy?: CardBuy }) {
  const [selected, setSelected] = useState(0);
  const base = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const rest = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(rest.current), []);

  function choose(i: number) {
    window.clearTimeout(rest.current);
    setSelected(i);
    // Phones: keep the chosen chip in view inside the row (horizontal only: the page itself must not jump).
    const list = listRef.current;
    const chip = list?.querySelectorAll<HTMLElement>('[role="tab"]')[i];
    if (list && chip && list.scrollWidth > list.clientWidth) list.scrollTo({ left: chip.offsetLeft - list.clientWidth / 2 + chip.offsetWidth / 2, behavior: "smooth" });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const last = cards.length - 1;
    const at = selected;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight" ? (at === last ? 0 : at + 1)
      : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (at === 0 ? last : at - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    choose(next);
  }

  if (cards.length === 0) return null;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start md:gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:gap-10">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Estilos"
        onKeyDown={onKeyDown}
        className="no-scrollbar -mx-[var(--gutter)] flex gap-2 overflow-x-auto scroll-smooth px-[var(--gutter)] md:mx-0 md:block md:overflow-visible md:border-t md:border-line md:px-0"
      >
        {cards.map((card, i) => (
          <button
            key={card.familyId}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={i === selected}
            aria-controls={`${base}-panel-${i}`}
            tabIndex={i === selected ? 0 : -1}
            onClick={() => choose(i)}
            onPointerEnter={(e) => {
              // The column only (from 768px): the phones' row scrolls to the chosen chip, and a resting mouse would pick whatever slid under it.
              if (e.pointerType !== "mouse" || i === selected || !window.matchMedia("(min-width: 768px)").matches) return;
              window.clearTimeout(rest.current);
              rest.current = window.setTimeout(() => choose(i), REST_MS);
            }}
            onPointerLeave={() => window.clearTimeout(rest.current)}
            className="group inline-flex h-10 shrink-0 items-center whitespace-nowrap border-2 border-ink/70 px-3 text-[0.875rem] font-semibold leading-none transition-colors hover:border-ink aria-selected:border-region-primary aria-selected:bg-region-primary aria-selected:text-white md:flex md:h-auto md:min-h-14 md:w-full md:justify-between md:gap-4 md:border-0 md:border-b md:border-line md:px-0 md:py-3 md:text-left md:text-[1.1875rem] md:font-bold md:leading-tight md:hover:border-line md:aria-selected:border-line md:aria-selected:bg-transparent md:aria-selected:text-[var(--region-accent-ink,var(--region-primary))] xl:text-[1.3125rem]"
          >
            <span className="md:transition-transform md:duration-200 md:group-hover:translate-x-1 md:group-aria-selected:translate-x-1">{card.familyName}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="hidden h-5 w-5 shrink-0 opacity-0 transition-opacity md:block md:group-aria-selected:opacity-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        ))}
      </div>
      <div className="mx-auto w-full max-w-[24rem] md:mx-0 md:max-w-none">
        {cards.map((card, i) => (
          // Every card is in the HTML; a hidden one loads its picture only when it is chosen (lazy, never the first thing on the page).
          <div key={card.familyId} role="tabpanel" id={`${base}-panel-${i}`} aria-labelledby={`${base}-tab-${i}`} hidden={i !== selected}>
            <FamilyCardView card={card} sizes={PICK_SIZES} buy={buy} />
          </div>
        ))}
      </div>
    </div>
  );
}
