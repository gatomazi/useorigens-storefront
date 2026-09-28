import { allAdministrativeRegions } from "../geo/administrative-regions";
import type { RegionSlug } from "../geo/regions";

/**
 * Wording of the place search. A region whose places are not all cities (the Centro-Oeste has the Federal District's administrative regions)
 * says "cidade ou região"; every other region keeps the original "cidade" copy, character for character.
 */
export type PlaceSearchCopy = {
  /** Header trigger and dialog name. */
  trigger: string;
  /** Hero field. */
  hero: string;
  label: string;
  placeholder: string;
  loading: string;
  failed: string;
  empty: string;
  emptyHint: string;
};

const hasAdministrativeRegions = (region: RegionSlug): boolean => allAdministrativeRegions().some((r) => r.regionSlug === region);

export function placeSearchCopy(region: RegionSlug): PlaceSearchCopy {
  if (hasAdministrativeRegions(region)) {
    return {
      trigger: "Buscar cidade ou região",
      hero: "Busque sua cidade ou região…",
      label: "Busque sua cidade ou região",
      placeholder: "Busque sua cidade ou região…",
      loading: "Carregando cidades e regiões…",
      failed: "Não conseguimos carregar as cidades e regiões agora. Tente de novo em instantes.",
      empty: "Ainda não encontramos essa cidade ou região.",
      emptyHint: "Tente buscar pelo nome completo ou escolha o estado.",
    };
  }
  return {
    trigger: "Buscar cidade",
    hero: "Busque sua cidade…",
    label: "Busque sua cidade",
    placeholder: "Busque sua cidade…",
    loading: "Carregando cidades…",
    failed: "Não conseguimos carregar as cidades agora. Tente de novo em instantes.",
    empty: "Ainda não encontramos essa cidade.",
    emptyHint: "Tente buscar pelo nome completo ou escolha o estado.",
  };
}
