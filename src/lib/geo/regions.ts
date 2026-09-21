export type RegionSlug = "sul" | "norte" | "centro-oeste";

export type Region = {
  slug: RegionSlug;
  name: string;
  /** Regional INK store that currently sells this region's products. */
  storeKey: CommerceStoreKey;
  ufs: readonly string[];
};

export type CommerceStoreKey = "use-sul" | "use-norte" | "use-centro" | "use-origens";

export const REGIONS: Readonly<Record<RegionSlug, Region>> = {
  sul: { slug: "sul", name: "Sul", storeKey: "use-sul", ufs: ["PR", "SC", "RS"] },
  norte: {
    slug: "norte",
    name: "Norte",
    storeKey: "use-norte",
    ufs: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"],
  },
  "centro-oeste": {
    slug: "centro-oeste",
    name: "Centro-Oeste",
    storeKey: "use-centro",
    ufs: ["DF", "GO", "MS", "MT"],
  },
};

export const REGION_SLUGS = Object.keys(REGIONS) as RegionSlug[];

export const UF_TO_REGION: Readonly<Record<string, RegionSlug>> = Object.fromEntries(
  Object.values(REGIONS).flatMap((r) => r.ufs.map((uf) => [uf, r.slug] as const)),
);

export const STATE_NAMES: Readonly<Record<string, string>> = {
  AC: "Acre",
  AM: "Amazonas",
  AP: "Amapá",
  DF: "Distrito Federal",
  GO: "Goiás",
  MS: "Mato Grosso do Sul",
  MT: "Mato Grosso",
  PA: "Pará",
  PR: "Paraná",
  RO: "Rondônia",
  RR: "Roraima",
  RS: "Rio Grande do Sul",
  SC: "Santa Catarina",
  TO: "Tocantins",
};

export function isRegionSlug(value: string): value is RegionSlug {
  return value in REGIONS;
}

/** State capitals (official). Used to put the capital's IBGE region first among the shortcuts. */
export const STATE_CAPITAL_SLUG: Readonly<Record<string, string>> = {
  RS: "porto-alegre",
  SC: "florianopolis",
  PR: "curitiba",
  AC: "rio-branco",
  AM: "manaus",
  AP: "macapa",
  PA: "belem",
  RO: "porto-velho",
  RR: "boa-vista",
  TO: "palmas",
  DF: "brasilia",
  GO: "goiania",
  MS: "campo-grande",
  MT: "cuiaba",
};
