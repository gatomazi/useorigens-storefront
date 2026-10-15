"use client";

import { useEffect, useRef, useState } from "react";
import type { CardBuy } from "@/lib/site-config/cards-schema";
import type { FamilyCardModel } from "@/lib/catalog/family-card";
import type { GarmentTabOption } from "@/lib/catalog/repository";
import { FamilyGridView } from "./FamilyGridView";

/**
 * Garment-type selector of the city page (docs/storefront/city-garment-tabs-round.md): one compact rail of pieces under "Estilos", the grid
 * below switching to that piece's real product per family (image, price, href). Local navigation only — it never fires GoToInk/select_item
 * itself (that stays on the card click, inside each grid, which already carries the piece label).
 *
 * - The rail is ONE line on every width: it scrolls sideways (a fade at the edge says there is more) and never wraps into a wall of buttons.
 *   When the grid scrolls under it the rail sticks under the header as a thin band, so the piece can be changed from anywhere in the grid.
 * - A caption under the rail says what the whole grid is now ("7 estilos em Oversized"): the grid changes as one, never card by card.
 * - The selection lives in `?peca=` (shareable, bookmarkable) without a second indexable page: the URL is read after hydration and written with
 *   the History API, so the page stays one cached document, drawn on the server with the classic piece (no client-only fallback, no layout shift).
 * - `panels` are plain card models (src/lib/catalog/family-card.ts): a piece's grid is mounted the first time it is chosen and kept mounted
 *   afterwards (hidden), so switching back never re-fetches its images, and the HTML carries one grid instead of ten.
 */
export function CityGarmentTabs({ tabs, panels, buy }: { tabs: GarmentTabOption[]; panels: Record<number, FamilyCardModel[]>; buy?: CardBuy }) {
  const [selectedId, setSelectedId] = useState(tabs[0].id);
  const [mounted, setMounted] = useState<number[]>([tabs[0].id]);
  const [stuck, setStuck] = useState(false);
  const [more, setMore] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const selected = tabs.find((t) => t.id === selectedId) ?? tabs[0];

  function choose(tab: GarmentTabOption, writeUrl = true) {
    setSelectedId(tab.id);
    setMounted((list) => (list.includes(tab.id) ? list : [...list, tab.id]));
    if (writeUrl) {
      const params = new URLSearchParams(window.location.search);
      if (tab.id === tabs[0].id) params.delete("peca");
      else params.set("peca", tab.slug);
      const qs = params.toString();
      // Native History API: the URL updates at once and the server is never asked for anything.
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }
    // Keep the chosen chip in view inside the rail (horizontal only: the page itself must not jump).
    const list = listRef.current;
    const chip = list?.querySelector<HTMLElement>(`[data-tab="${tab.id}"]`);
    if (list && chip) {
      const left = chip.offsetLeft - list.clientWidth / 2 + chip.offsetWidth / 2;
      list.scrollTo({ left, behavior: "smooth" });
    }
  }

  // The piece carried by the URL (a shared or bookmarked link), applied once the page is interactive: the document is always drawn with the
  // classic piece, so the client's first paint matches the server's and the switch happens right after it.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("peca");
    const tab = slug ? tabs.find((t) => t.slug === slug) : undefined;
    if (!tab || tab.id === tabs[0].id) return;
    const frame = requestAnimationFrame(() => choose(tab, false));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read the URL on mount only
  }, []);

  // "Stuck" (the rail is sticking under the header): a sentinel just above it leaves the viewport.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The fade at the right edge: only while there are chips beyond it.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => setMore(list.scrollLeft + list.clientWidth < list.scrollWidth - 4);
    update();
    list.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    event.preventDefault();
    const next = event.key === "ArrowRight" ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
    buttons[next].focus();
    choose(tabs[next]);
  }

  const count = panels[selected.id]?.length ?? 0;

  return (
    <div>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {/* Sticks under the header once the page scrolls past it (the header is 52px / 60px tall when scrolled); the ground colour hides the
          cards passing under it. Full-bleed on phones so the first chip starts at the gutter and the last can scroll out of it. */}
      <div data-stuck={stuck} data-testid="garment-rail" className="garment-rail sticky top-[3.25rem] z-20 -mx-[var(--gutter)] bg-ground px-[var(--gutter)] py-2 transition-shadow md:top-[3.75rem] data-[stuck=true]:shadow-[0_1px_0_rgb(0_0_0/0.12)]">
        <div className="relative">
          <div
            ref={listRef}
            role="tablist"
            aria-label="Tipo de peça"
            onKeyDown={onKeyDown}
            className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth pr-8"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-tab={tab.id}
                id={`garment-tab-${tab.slug}`}
                aria-selected={tab.id === selected.id}
                aria-controls={`garment-panel-${tab.slug}`}
                tabIndex={tab.id === selected.id ? 0 : -1}
                onClick={() => choose(tab)}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-2 border-ink/70 px-3 text-[0.875rem] font-semibold leading-none transition-colors hover:border-ink aria-selected:border-region-primary aria-selected:bg-region-primary aria-selected:text-white"
              >
                {tab.label}
                {tab.count > 0 && <span className="text-[0.8125rem] font-normal opacity-70">{tab.count}</span>}
              </button>
            ))}
          </div>
          <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-ground to-transparent transition-opacity ${more ? "opacity-100" : "opacity-0"}`} />
        </div>
      </div>
      {/* What the whole grid is now. Polite: a screen reader hears the change after the click, without interrupting it. */}
      <p aria-live="polite" data-testid="garment-caption" className="t-small mb-4 mt-1 text-ink-soft sm:mb-5">
        {count === 1 ? "1 estilo" : `${count} estilos`} em <strong className="font-semibold text-ink">{selected.label}</strong>
        {selected.id !== tabs[0].id && <span className="hidden sm:inline">. Toda a grade mudou para essa peça.</span>}
      </p>
      {tabs
        .filter((tab) => mounted.includes(tab.id))
        .map((tab) => (
          <div key={tab.id} role="tabpanel" id={`garment-panel-${tab.slug}`} aria-labelledby={`garment-tab-${tab.slug}`} hidden={tab.id !== selected.id}>
            <FamilyGridView cards={panels[tab.id] ?? []} buy={buy} />
          </div>
        ))}
    </div>
  );
}
