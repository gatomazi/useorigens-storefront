import type { CityFamilyEntry } from "@/lib/catalog/repository";
import { FamilyCard } from "./FamilyCard";

/** Which family leads the grid: the brand's signature (Ponto de Origem) when it exists, else the first. */
function pickFeatured(entries: CityFamilyEntry[]): number {
  const signature = entries.findIndex((e) => e.family.id === "ponto-de-origem");
  return signature === -1 ? 0 : signature;
}

/**
 * Editorial grid for the families that really exist for a city (1 to 8).
 * With 5+ families: one featured card (2×2 cells) on a 4-column grid, every other card one cell, so no
 * card is ever larger than the featured one and nothing is invented to fill a slot.
 * `scroller`: on phones the cards become a horizontal snap row (used on the home, where the grid only
 * demonstrates the idea); on city pages the phone layout is a two-column grid so every style is visible.
 */
export function FamilyGrid({
  entries,
  hrefBase,
  cityName,
  scroller = false,
}: {
  entries: CityFamilyEntry[];
  hrefBase: string;
  cityName: string;
  scroller?: boolean;
}) {
  if (entries.length === 0) return null;

  const featuredAt = pickFeatured(entries);
  const ordered = [entries[featuredAt], ...entries.filter((_, i) => i !== featuredAt)];
  const editorial = ordered.length >= 5;

  const listClass = scroller
    ? "-mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-4 overflow-x-auto px-4 pb-2 no-scrollbar md:mx-0 md:grid md:overflow-visible md:px-0"
    : "grid grid-cols-2 gap-x-4 gap-y-8";
  const gridClass = editorial ? "md:grid-cols-4 md:gap-x-6 md:gap-y-12" : ["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3", "md:grid-cols-4"][ordered.length] + " md:gap-x-6 md:gap-y-12";

  return (
    <ul className={`${listClass} ${gridClass}`}>
      {ordered.map((entry, i) => {
        const featured = editorial && i === 0;
        const cell = scroller ? `w-[64%] shrink-0 snap-start sm:w-[44%] md:w-auto` : "";
        const span = featured ? (scroller ? "" : "col-span-2") + " md:col-span-2 md:row-span-2" : "";
        return (
          <li key={entry.family.id} className={`${cell} ${span}`}>
            <FamilyCard
              entry={entry}
              href={`${hrefBase}/${entry.family.id}`}
              cityName={cityName}
              featured={featured}
              priority={i < 2}
              sizes={featured ? "(min-width: 1024px) 46vw, 92vw" : "(min-width: 1024px) 23vw, (min-width: 768px) 30vw, 46vw"}
            />
          </li>
        );
      })}
    </ul>
  );
}
