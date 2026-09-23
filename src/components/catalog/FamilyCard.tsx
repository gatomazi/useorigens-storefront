import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { purchaseUrl } from "@/lib/catalog/commerce";
import type { CityFamilyEntry } from "@/lib/catalog/repository";
import { TrackedInkLink } from "@/components/analytics/TrackedInkLink";
import { SOURCES } from "@/lib/analytics/sources";
import { ProductPhoto } from "./ProductPhoto";

/**
 * One design family for one city: the primary real INK product represents it. Every card is the same size —
 * commercial priority comes from order (see families.ts), never from a bigger card (CLAUDE_STYLE_MODELS_LAYOUT_REFINEMENT.md).
 * The card exists through alignment and spacing, not a heavy border or shadow.
 *
 * `directToInk` (CLAUDE_USE_ORIGENS_META_PIXEL_INK_ESTADOS.md §2): when the person has already explicitly
 * chosen this exact city (the city page itself, or "Outros estilos" on that city's own PDPs — never the
 * home's example-city showcase, where no real city was chosen yet), the card skips the intermediate storefront
 * PDP and opens the real INK product directly. Only when there is nothing to choose: a family with design
 * variants (`entry.variants.length > 0`) keeps the internal PDP, since that is exactly where the variant
 * picker lets the person choose between them — skipping it would silently hide a real choice, not remove an
 * unnecessary step. Falls back to the internal PDP link (never a broken link) whenever `purchaseUrl` can't
 * verify a usable INK URL. The direct-to-INK case fires GoToInk (CLAUDE_ADENDO_4_EVENTOS_META_STOREFRONT.md).
 */
export function FamilyCard({
  entry,
  href,
  cityName,
  stateUf,
  sourceSection,
  sizes,
  priority = false,
  directToInk = false,
}: {
  entry: CityFamilyEntry;
  href: string;
  cityName: string;
  /** Required when `directToInk` — the GoToInk `state` param. */
  stateUf?: string;
  /** GoToInk `source_section`, e.g. "city_styles" or "pdp_other_styles". Required when `directToInk`. */
  sourceSection?: string;
  sizes: string;
  priority?: boolean;
  directToInk?: boolean;
}) {
  const price = formatPrice(entry.primary.price);
  const inkHref = directToInk && entry.variants.length === 0 ? purchaseUrl(entry.primary) : null;
  const finalHref = inkHref ?? href;

  const content = (
    <>
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
    </>
  );

  // A plain <a> (via TrackedInkLink), not next/link, for the INK case: it's a real cross-origin navigation,
  // same tab (matches the rest of the site's purchase links — VariantPicker's own CTA is also a same-tab <a>,
  // no new-tab popup).
  return inkHref ? (
    <TrackedInkLink
      href={inkHref}
      params={{
        productId: entry.primary.inkProductId,
        sourceSection: sourceSection ?? SOURCES.cityStyles,
        city: cityName,
        state: stateUf,
        family: entry.family.id,
        value: entry.primary.price ?? undefined,
        productName: entry.family.name,
        destinationUrl: inkHref,
      }}
      className="group block"
      ariaLabel={`Comprar ${entry.family.name} de ${cityName} na loja`}
    >
      {content}
    </TrackedInkLink>
  ) : (
    <Link href={finalHref} className="group block">
      {content}
    </Link>
  );
}
