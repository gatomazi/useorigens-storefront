import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { CityFamilyEntry } from "@/lib/catalog/repository";
import { ProductPhoto } from "./ProductPhoto";

/**
 * One design family for one city: the primary real INK product represents it. Every card is the same size —
 * commercial priority comes from order (see families.ts), never from a bigger card (CLAUDE_STYLE_MODELS_LAYOUT_REFINEMENT.md).
 * The card exists through alignment and spacing, not a heavy border or shadow.
 */
export function FamilyCard({
  entry,
  href,
  cityName,
  sizes,
  priority = false,
}: {
  entry: CityFamilyEntry;
  href: string;
  cityName: string;
  sizes: string;
  priority?: boolean;
}) {
  const price = formatPrice(entry.primary.price);
  return (
    <Link href={href} className="group block">
      <ProductPhoto src={entry.primary.imageUrl} alt={`Camiseta ${entry.family.name} de ${cityName}`} sizes={sizes} priority={priority} />
      <span aria-hidden="true" className="mt-3 block h-[3px] w-6 bg-region-accent transition-colors group-hover:bg-region-primary" />
      <div className="mt-2">
        <h3 className="link-line inline text-[1.0625rem] font-bold leading-tight tracking-tight transition-colors group-hover:text-region-primary sm:text-[1.125rem]">{entry.family.name}</h3>
        {price && <p className="t-small mt-0.5 font-semibold">{price}</p>}
      </div>
      <p className="t-caption mt-1 hidden max-w-[30ch] sm:block">{entry.family.description}</p>
      {entry.variants.length > 0 && (
        <p className="t-caption mt-1 font-semibold text-ink">{entry.variants.length === 1 ? "Mais 1 versão" : `Mais ${entry.variants.length} versões`}</p>
      )}
    </Link>
  );
}
