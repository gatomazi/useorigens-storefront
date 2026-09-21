import type { RegionSlug } from "./geo/regions";

/** Regions with a finished storefront. Others 404 until their editorial experience exists. */
export const ENABLED_REGIONS: readonly RegionSlug[] = ["sul"];

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.useorigens.com.br";

/** Where the Norte and Centro-Oeste storefronts live until they are built here. */
export const LEGACY_STORE_URLS = {
  sul: "https://www.usesul.com.br",
  norte: "https://www.usenorte.com.br",
  "centro-oeste": "https://www.usecentro.com.br",
} as const;

export const INSTAGRAM_URL = "https://www.instagram.com/usesul.oficial";

/** Curated, deterministic showcase per region. Every entry is validated against real data at render time. */
export const SHOWCASE: Readonly<Record<RegionSlug, { hero: [uf: string, slug: string]; wall: [uf: string, slug: string][] }>> = {
  sul: {
    hero: ["sc", "florianopolis"],
    wall: [
      ["pr", "curitiba"], ["sc", "florianopolis"], ["rs", "porto-alegre"], ["sc", "joinville"],
      ["sc", "blumenau"], ["rs", "gramado"], ["rs", "torres"], ["sc", "balneario-camboriu"],
      ["pr", "foz-do-iguacu"], ["rs", "caxias-do-sul"], ["pr", "londrina"], ["sc", "urubici"],
      ["rs", "pelotas"], ["sc", "bombinhas"], ["pr", "paranagua"], ["sc", "tijucas"],
      ["rs", "bento-goncalves"], ["pr", "pato-branco"], ["sc", "garopaba"], ["pr", "ponta-grossa"],
      ["sc", "pomerode"], ["rs", "santa-maria"], ["sc", "itajai"], ["pr", "maringa"],
    ],
  },
  norte: { hero: ["pa", "belem"], wall: [] },
  "centro-oeste": { hero: ["go", "goiania"], wall: [] },
};
