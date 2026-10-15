import "server-only";
import type { GoToInkParams } from "@/lib/analytics/track";
import { SOURCES } from "@/lib/analytics/sources";
import type { FavoriteItem } from "@/lib/favorites/types";
import { discountPercent, formatListPrice, formatPrice } from "@/lib/format";
import { designShare, inkProductShare } from "@/lib/share/server";
import type { SharePayload } from "@/lib/share/url";
import { purchaseUrl } from "./commerce";
import type { CityFamilyEntry } from "./repository";

/**
 * Everything a style card of a city shows and does, as PLAIN DATA: computed here on the server (purchase URL verified, share payload built,
 * tracking params assembled) and drawn by `FamilyCardView` (a client component). The split lets the city page send the other pieces' grids
 * as a few hundred bytes of data per card instead of ten pre-rendered trees, and lets a tab mount its grid only when it is chosen.
 *
 * Rules kept exactly as the card has always had them (CLAUDE_USE_ORIGENS_META_PIXEL_INK_ESTADOS.md §2): with `directToInk` the card opens the
 * real INK product, unless the family has design variants (`entry.variants.length > 0`), where the internal family page is the real choice
 * between them; whenever `purchaseUrl` cannot verify the INK URL the card falls back to the internal page, never a broken link.
 */
export type FamilyCardModel = {
  familyId: string;
  familyName: string;
  cityName: string;
  /** One line under the name (the family's description, or the piece shown on a garment tab). */
  description: string;
  /** "Ponto de Origem" or "Ponto de Origem Oversized" (the piece label appended on the city page's garment tabs). */
  displayName: string;
  pieceLabel?: string;
  href: string;
  /** The card opens the INK product straight away (plain `<a>`, GoToInk on the click); false = the storefront family page. */
  direct: boolean;
  imageUrl: string;
  alt: string;
  price: string | null;
  listPrice?: string;
  discount?: number;
  variantsCount: number;
  favorite: Omit<FavoriteItem, "addedAt">;
  share: SharePayload | null;
  /** Set only with `direct`. */
  track?: GoToInkParams;
};

export function familyCardModel(
  entry: CityFamilyEntry,
  { href, cityName, stateUf, sourceSection, directToInk = false, pieceLabel, garmentTypeId }: { href: string; cityName: string; stateUf?: string; sourceSection?: string; directToInk?: boolean; pieceLabel?: string; garmentTypeId?: number },
): FamilyCardModel {
  const inkHref = directToInk && entry.variants.length === 0 ? purchaseUrl(entry.primary) : null;
  const displayName = pieceLabel ? `${entry.family.name} ${pieceLabel}` : entry.family.name;
  // Same destination the card opens: the real INK product when the card goes straight there; otherwise the family page, which groups
  // the design's versions — so it is shared as "Compartilhar estampa", never as if it were one variant.
  const share = inkHref
    ? inkProductShare(entry.primary, `${displayName} – ${cityName}`, garmentTypeId)
    : entry.variants.length > 0
      ? designShare(href, `${entry.family.name} – ${cityName}`)
      : null;
  return {
    familyId: entry.family.id,
    familyName: entry.family.name,
    cityName,
    description: pieceLabel ?? entry.family.description,
    displayName,
    pieceLabel,
    href: inkHref ?? href,
    direct: inkHref !== null,
    imageUrl: entry.primary.imageUrl,
    alt: `Camiseta ${displayName} de ${cityName}`,
    price: formatPrice(entry.primary.price),
    listPrice: formatListPrice(entry.primary),
    discount: discountPercent(entry.primary),
    variantsCount: entry.variants.length,
    favorite: {
      inkProductId: entry.primary.inkProductId,
      commerceStoreKey: entry.primary.commerceStoreKey,
      title: entry.family.name,
      context: `${cityName}${stateUf ? ` · ${stateUf}` : ""}`,
      imageUrl: entry.primary.imageUrl,
      price: entry.primary.price,
    },
    share,
    ...(inkHref
      ? {
          track: {
            productId: entry.primary.inkProductId,
            sourceSection: sourceSection ?? SOURCES.cityStyles,
            city: cityName,
            state: stateUf,
            family: entry.family.id,
            value: entry.primary.price ?? undefined,
            productName: displayName,
            destinationUrl: inkHref,
            garmentType: pieceLabel,
          },
        }
      : {}),
  };
}
