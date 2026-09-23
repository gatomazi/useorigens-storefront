import type { CityFamilyEntry } from "@/lib/catalog/repository";
import { FamilyCard } from "./FamilyCard";

/**
 * The families that really exist for a city (1 to 8), as one consistent collection: every card the same size,
 * in commercial order (families.ts) — never a bigger "featured" card (CLAUDE_STYLE_MODELS_LAYOUT_REFINEMENT.md).
 * Always a grid, on every width: 2 columns on phones, 3 from 768px, 4 from 1024px. Used on the home (one city's
 * example, `directToInk` left false — no real city was explicitly chosen there yet) and on a city's own pages
 * (`directToInk={true}` — see FamilyCard for the exact rule).
 */
export function FamilyGrid({
  entries,
  hrefBase,
  cityName,
  stateUf,
  sourceSection,
  directToInk = false,
}: {
  entries: CityFamilyEntry[];
  hrefBase: string;
  cityName: string;
  stateUf?: string;
  sourceSection?: string;
  directToInk?: boolean;
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
            stateUf={stateUf}
            sourceSection={sourceSection}
            priority={i < 2}
            sizes="(min-width: 1024px) 23vw, (min-width: 768px) 30vw, 46vw"
            directToInk={directToInk}
          />
        </li>
      ))}
    </ul>
  );
}
