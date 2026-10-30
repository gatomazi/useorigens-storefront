import { familyCardModel } from "@/lib/catalog/family-card";
import type { CityFamilyEntry } from "@/lib/catalog/repository";
import type { CardBuy } from "@/lib/site-config/cards-schema";
import { FamilyGridView } from "./FamilyGridView";

/**
 * The families that really exist for a city (one card per family, never a fixed number), as one consistent collection: every card the same size,
 * in commercial order (families.ts) — never a bigger "featured" card (CLAUDE_STYLE_MODELS_LAYOUT_REFINEMENT.md).
 * Used on the home (one city's example), on a city's own page (the classic piece) and on a design's page ("Outros estilos"),
 * all with `directToInk` (see family-card.ts for the exact rule). A Server Component: it verifies the purchase URLs and builds the
 * share payloads here, and hands plain card models to `FamilyGridView`.
 */
export function FamilyGrid({
  entries,
  hrefBase,
  cityName,
  stateUf,
  sourceSection,
  directToInk = false,
  pieceLabel,
  garmentTypeId,
  buy,
  layout,
}: {
  entries: CityFamilyEntry[];
  hrefBase: string;
  cityName: string;
  stateUf?: string;
  sourceSection?: string;
  directToInk?: boolean;
  /** Set only by the city page's garment-type tabs, for a piece that is not the classic one. */
  pieceLabel?: string;
  /** With `pieceLabel`: the tab's INK `product_type.id`. */
  garmentTypeId?: number;
  /** The store-wide buy button (global `cards`) on every card. */
  buy?: CardBuy;
  /** "split": the home's composition with the heading beside the cards (FamilyGridView); "pick": the names in a list, one card beside it (FamilyPickView). */
  layout?: "grid" | "split" | "pick";
}) {
  if (entries.length === 0) return null;
  const cards = entries.map((entry) => familyCardModel(entry, { href: `${hrefBase}/${entry.family.id}`, cityName, stateUf, sourceSection, directToInk, pieceLabel, garmentTypeId }));
  return <FamilyGridView cards={cards} buy={buy} layout={layout} />;
}
