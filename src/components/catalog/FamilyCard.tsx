import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { CityFamilyEntry } from "@/lib/catalog/repository";
import { ProductPhoto } from "./ProductPhoto";

/** One design family for one city: the primary real INK product represents it. */
export function FamilyCard({
  entry,
  href,
  cityName,
  sizes,
  priority = false,
  featured = false,
}: {
  entry: CityFamilyEntry;
  href: string;
  cityName: string;
  sizes: string;
  priority?: boolean;
  /** The one large card of the editorial grid: bigger name, description always visible. */
  featured?: boolean;
}) {
  const price = formatPrice(entry.primary.price);
  return (
    <Link href={href} className="group block">
      <ProductPhoto src={entry.primary.imageUrl} alt={`Camiseta ${entry.family.name} de ${cityName}`} sizes={sizes} priority={priority} />
      <div className={featured ? "mt-4" : "mt-3"}>
        <h3 className={`link-line inline ${featured ? "text-[1.5rem] font-extrabold leading-tight tracking-tight sm:text-[1.875rem]" : "t-h3"}`}>{entry.family.name}</h3>
        {price && <p className={`t-small mt-0.5 font-semibold ${featured ? "sm:text-[1.0625rem]" : ""}`}>{price}</p>}
      </div>
      <p className={`t-caption mt-1 ${featured ? "hidden max-w-[44ch] text-[0.9375rem] sm:block" : "hidden max-w-[30ch] sm:block"}`}>{entry.family.description}</p>
      {entry.variants.length > 0 && (
        <p className="t-caption mt-1 font-semibold text-ink">{entry.variants.length === 1 ? "Mais 1 versão" : `Mais ${entry.variants.length} versões`}</p>
      )}
    </Link>
  );
}
