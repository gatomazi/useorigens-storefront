"use client";

import { useState } from "react";
import type { StateStyle } from "@/lib/editorial/state-styles";
import { ProductCarousel } from "./ProductCarousel";

/**
 * "Escolha o estilo" on a state page: one carousel, switched by a row of style buttons (never eight stacked carousels). The first style is
 * selected on load; the other rows are already in the page, so switching is instant and nothing is fetched.
 */
export function StateStyles({ stateName, styles, sourceSection }: { stateName: string; styles: StateStyle[]; sourceSection: string }) {
  const [selectedId, setSelectedId] = useState(styles[0]?.id);
  const selected = styles.find((s) => s.id === selectedId) ?? styles[0];
  if (!selected) return null;

  const chips = (
    <div role="group" aria-label="Estilos" className="-mr-4 flex gap-2 overflow-x-auto pb-1 pr-4 sm:mr-0 sm:flex-wrap sm:overflow-visible sm:pr-0">
      {styles.map((style) => (
        <button
          key={style.id}
          type="button"
          aria-pressed={style.id === selected.id}
          onClick={() => setSelectedId(style.id)}
          className="min-h-11 shrink-0 border-2 border-ink px-4 text-[0.9375rem] font-semibold transition-colors hover:bg-ink hover:text-white aria-pressed:border-region-primary aria-pressed:bg-region-primary aria-pressed:text-white"
        >
          {style.name}
        </button>
      ))}
    </div>
  );

  return (
    <ProductCarousel
      resetKey={selected.id}
      items={selected.items}
      labelledBy="styles-title"
      title="Escolha o estilo"
      intro={`As camisetas de ${stateName} em cada jeito. ${selected.name}: ${selected.description}`}
      viewAllHref={selected.viewAllHref ?? undefined}
      viewAllLabel={`Ver todas de ${selected.name}`}
      sourceSection={sourceSection}
      toolbar={chips}
    />
  );
}
