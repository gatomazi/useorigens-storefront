import type { CityFamilyEntry } from "@/lib/catalog/repository";
import { FamilyCard } from "./FamilyCard";

/**
 * The families that really exist for a city (1 to 8), as one consistent collection: every card the same size,
 * in commercial order (families.ts) — never a bigger "featured" card (CLAUDE_STYLE_MODELS_LAYOUT_REFINEMENT.md).
 * Always a grid, on every width: 2 columns on phones, 3 from 768px, 4 from 1024px. Used on the home (one city's
 * example) and on a city page (its real families).
 */
export function FamilyGrid({
  entries,
  hrefBase,
  cityName,
}: {
  entries: CityFamilyEntry[];
  hrefBase: string;
  cityName: string;
}) {
  if (entries.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4">
      {entries.map((entry, i) => (
        <li key={entry.family.id}>
          <FamilyCard
            entry={entry}
            href={`${hrefBase}/${entry.family.id}`}
            cityName={cityName}
            priority={i < 2}
            sizes="(min-width: 1024px) 23vw, (min-width: 768px) 30vw, 46vw"
          />
        </li>
      ))}
    </ul>
  );
}
