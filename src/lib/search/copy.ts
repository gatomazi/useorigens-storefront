import { allAdministrativeRegions } from "../geo/administrative-regions";
import type { RegionSlug } from "../geo/regions";

/**
 * Wording of the storefront search, which finds places, designs and editorial pages (src/lib/search/global.ts). A region whose places are not
 * all cities (the Centro-Oeste has the Federal District's administrative regions) names "região" too; the hero keeps the place first, since
 * finding one's own place is still the main way in.
 */
export type PlaceSearchCopy = {
  /** Header trigger (visible text and accessible name). */
  trigger: string;
  /** Dialog name. */
  dialog: string;
  /** Hero field. */
  hero: string;
  /** A boxed field with the search icon, or under its own heading ("Busque outra cidade"): the verb is already said, and it fits a phone. */
  field: string;
  label: string;
  placeholder: string;
  loading: string;
  failed: string;
  empty: string;
  emptyHint: string;
  /** Heading of the places group. */
  placesGroup: string;
};

const hasAdministrativeRegions = (region: RegionSlug): boolean => allAdministrativeRegions().some((r) => r.regionSlug === region);

export function placeSearchCopy(region: RegionSlug): PlaceSearchCopy {
  const ra = hasAdministrativeRegions(region);
  return {
    trigger: "Buscar",
    dialog: "Buscar na Use Origens",
    hero: ra ? "Busque sua cidade, região ou estampa…" : "Busque sua cidade, estampa ou coleção…",
    field: ra ? "Cidade, região ou estampa…" : "Cidade, estampa ou coleção…",
    label: ra ? "Busque uma cidade, região, estampa ou coleção" : "Busque uma cidade, estampa ou coleção",
    placeholder: ra ? "Busque uma cidade, região ou estampa…" : "Busque uma cidade, estampa ou coleção…",
    loading: "Buscando…",
    failed: "Não conseguimos buscar agora. Tente de novo em instantes.",
    empty: "Não encontramos nada com esse nome.",
    emptyHint: ra
      ? "Tente o nome de uma cidade, de uma região ou de uma estampa, ou escolha o estado."
      : "Tente o nome de uma cidade, de uma estampa ou de uma coleção, ou escolha o estado.",
    placesGroup: ra ? "Cidades, regiões e localidades" : "Cidades e localidades",
  };
}
