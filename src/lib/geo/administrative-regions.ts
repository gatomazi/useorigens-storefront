import type { Locality } from "./cities";
import { normalizeText, slugify } from "./text";

/**
 * The Federal District has ONE municipality (Brasília, IBGE 5300108) and is administratively divided into Regiões Administrativas (RAs).
 * An RA is not a city: it is modelled as a `Locality` of type "administrative_region", whose parent is the Federal District, never as a
 * "fake municipality" (docs/storefront/df-administrative-regions-round.md).
 *
 * This is the curated OFFICIAL index (the 35 RAs, numbered I–XXXV by the GDF). It is reference data, not a commercial claim: an RA only
 * appears in the storefront when the catalog really has products for it (`Catalog.coveredLocalityIds`), so listing all 35 here does not
 * create empty pages. INK has no structured RA field (no collection, tag or metadata per RA reaches the snapshot): the link between a
 * product and its RA is the place name INK itself puts in the product title ("Taguatinga | Origem DF"), matched EXACTLY (accent- and
 * case-insensitive) against this index. A title that is not in the index is never bound to an RA by guess.
 */
export type AdministrativeRegionEntry = {
  /** Official RA number, as the GDF numbers them ("XX"). */
  code: string;
  name: string;
  /** Other names the SAME RA is officially or commonly known by, exactly as INK titles may spell them. */
  aliases?: readonly string[];
};

export const DF_UF = "DF";
export const DF_MUNICIPALITY_ID = "5300108";
export const DF_LABEL = "Distrito Federal";

export const ADMINISTRATIVE_REGIONS: readonly AdministrativeRegionEntry[] = [
  { code: "I", name: "Plano Piloto" },
  { code: "II", name: "Gama" },
  { code: "III", name: "Taguatinga" },
  { code: "IV", name: "Brazlândia" },
  { code: "V", name: "Sobradinho" },
  { code: "VI", name: "Planaltina" },
  { code: "VII", name: "Paranoá" },
  { code: "VIII", name: "Núcleo Bandeirante" },
  { code: "IX", name: "Ceilândia" },
  { code: "X", name: "Guará" },
  { code: "XI", name: "Cruzeiro" },
  { code: "XII", name: "Samambaia" },
  { code: "XIII", name: "Santa Maria" },
  { code: "XIV", name: "São Sebastião" },
  { code: "XV", name: "Recanto das Emas" },
  { code: "XVI", name: "Lago Sul" },
  { code: "XVII", name: "Riacho Fundo" },
  { code: "XVIII", name: "Lago Norte" },
  { code: "XIX", name: "Candangolândia" },
  { code: "XX", name: "Águas Claras" },
  { code: "XXI", name: "Riacho Fundo II" },
  { code: "XXII", name: "Sudoeste/Octogonal" },
  { code: "XXIII", name: "Varjão" },
  { code: "XXIV", name: "Park Way" },
  // RA XXV is officially "SCIA/Estrutural": INK titles it both ways ("SCIA", "Estrutural"), and both are this one RA.
  { code: "XXV", name: "SCIA/Estrutural", aliases: ["SCIA", "Estrutural"] },
  { code: "XXVI", name: "Sobradinho II" },
  { code: "XXVII", name: "Jardim Botânico" },
  { code: "XXVIII", name: "Itapoã" },
  { code: "XXIX", name: "SIA" },
  { code: "XXX", name: "Vicente Pires" },
  { code: "XXXI", name: "Fercal" },
  { code: "XXXII", name: "Sol Nascente/Pôr do Sol" },
  { code: "XXXIII", name: "Arniqueira" },
  { code: "XXXIV", name: "Arapoanga" },
  { code: "XXXV", name: "Água Quente" },
];

/** A locality id no municipality can collide with (IBGE ids are 7 digits). */
export const raLocalityId = (slug: string): string => `df-ra:${slug}`;

function toLocality(entry: AdministrativeRegionEntry): Locality {
  const slug = slugify(entry.name);
  return {
    id: raLocalityId(slug),
    slug,
    name: entry.name,
    uf: DF_UF,
    regionSlug: "centro-oeste",
    type: "administrative_region",
    parentLabel: DF_LABEL,
    parentCityId: DF_MUNICIPALITY_ID,
    area: "",
    areaSlug: "",
    meso: "",
    mesoSlug: "",
    aliases: entry.aliases ?? [],
    officialCode: entry.code,
  };
}

const regions: readonly Locality[] = ADMINISTRATIVE_REGIONS.map(toLocality);
const byLabel = new Map<string, Locality>();
for (const region of regions) {
  byLabel.set(normalizeText(region.name), region);
  for (const alias of region.aliases) byLabel.set(normalizeText(alias), region);
}

export function allAdministrativeRegions(): readonly Locality[] {
  return regions;
}

/**
 * The RA a product title names, or `undefined`. Exact match on the normalised name (or one of its declared aliases): "Aguas Claras" and
 * "Águas Claras" are the same RA, "Sudoeste Octogonal" is "Sudoeste/Octogonal", "Brasília" is NOT an RA (it is the municipality).
 */
export function administrativeRegionByLabel(label: string): Locality | undefined {
  return byLabel.get(normalizeText(label));
}
