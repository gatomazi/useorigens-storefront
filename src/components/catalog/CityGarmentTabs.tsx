"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import type { GarmentTabOption } from "@/lib/catalog/repository";

/**
 * Garment-type selector for the city page (MD "seletor de peças na página da cidade"): tabs directly under
 * "Estilos", the panel below switching to that piece's real image/price/href per family. Local navigation
 * only — never fires GoToInk/select_item itself (that stays on the card click, inside each panel, which
 * already carries the piece label — see `garments.ts`/`FamilyCard`/`track.ts`). Selection lives in `?peca=`
 * so a tab is shareable/bookmarkable, without creating a second indexable page: the city URL stays canonical
 * (this component never touches metadata).
 *
 * `panels` are pre-rendered by the page (a Server Component) using the SAME `FamilyGrid`/`FamilyCard` every
 * other listing uses, unchanged — a Client Component must never import them directly, since `FamilyCard`
 * pulls in `commerce.ts` → `ink/config.ts` → `config/env.ts`, which is `server-only`-tainted (confirmed by a
 * real Turbopack build error during this round). Passing already-rendered Server Component output down as
 * plain React nodes is the supported RSC pattern for exactly this case. All panels are always mounted (never
 * remounted on tab switch, so images never re-fetch); only the inactive ones get the `hidden` attribute.
 */
export function CityGarmentTabs({ tabs, panels }: { tabs: GarmentTabOption[]; panels: Record<number, ReactNode> }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);

  const bySlug = new Map(tabs.map((t) => [t.slug, t.id]));
  const fromUrl = bySlug.get(searchParams.get("peca") ?? "");
  const [selectedId, setSelectedId] = useState(fromUrl ?? tabs[0].id);
  const selected = tabs.find((t) => t.id === selectedId) ?? tabs[0];

  function select(tab: GarmentTabOption) {
    setSelectedId(tab.id);
    const params = new URLSearchParams(searchParams.toString());
    if (tab.id === tabs[0].id) params.delete("peca");
    else params.set("peca", tab.slug);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    event.preventDefault();
    const next = event.key === "ArrowRight" ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
    buttons[next].focus();
    select(tabs[next]);
  }

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Tipo de peça"
        onKeyDown={onKeyDown}
        className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`garment-tab-${tab.slug}`}
            aria-selected={tab.id === selected.id}
            aria-controls={`garment-panel-${tab.slug}`}
            tabIndex={tab.id === selected.id ? 0 : -1}
            onClick={() => select(tab)}
            className="min-h-11 shrink-0 whitespace-nowrap border-2 border-ink px-4 text-[0.9375rem] font-semibold transition-colors aria-selected:border-region-primary aria-selected:bg-region-primary aria-selected:text-white"
          >
            {tab.label}
            {tab.count > 0 && <span className="ml-1 font-normal opacity-70">· {tab.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`garment-panel-${tab.slug}`} aria-labelledby={`garment-tab-${tab.slug}`} hidden={tab.id !== selected.id}>
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
