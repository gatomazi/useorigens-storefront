import { administrativeRegionByLabel, DF_MUNICIPALITY_ID } from "../geo/administrative-regions";
import type { Locality } from "../geo/cities";
import { localityById } from "../geo/localities";
import type { UnrankedBinding } from "./types";

type Located = Pick<UnrankedBinding, "cityId" | "localityId" | "localityLabel">;

/** The unit a product is ranked under: its administrative region when it has one, else the municipality. */
export const localityKeyOf = (binding: Located): string => binding.localityId ?? binding.cityId;

/**
 * A product about a place INSIDE a municipality (Torres · "Praia Paraíso"): shown as "Lugares de <cidade>", never the card that represents the
 * municipality. An administrative-region product is not this: it represents its own region.
 */
export const isSubLocality = (binding: Located): boolean => Boolean(binding.localityLabel) && !binding.localityId;

/** The place a product is about: its administrative region, else its municipality. */
export const localityOfBinding = (binding: Located): Locality | undefined => localityById(localityKeyOf(binding));

/**
 * Snapshots written before administrative regions existed carry the RA only as `localityLabel` ("Taguatinga"), bound to Brasília. Derives the
 * `localityId` from that label with the very same exact-match rule the indexer uses (`administrativeRegionByLabel`), so an old snapshot needs no
 * resync. Never touches a product outside the Federal District's one municipality, nor a title that is not in the official index.
 */
export function withLocality<T extends UnrankedBinding>(binding: T): T {
  if (binding.localityId || !binding.localityLabel || binding.cityId !== DF_MUNICIPALITY_ID) return binding;
  const region = administrativeRegionByLabel(binding.localityLabel);
  return region ? { ...binding, localityId: region.id } : binding;
}
