/** Supplied original PNGs. Colour refers to the logo, not the garment. */
export const LOGO_REGIONS = [
  { id: "sul", name: "Sul" },
  { id: "norte", name: "Norte" },
  { id: "centro", name: "Centro-Oeste" },
] as const;
export type LogoRegion = typeof LOGO_REGIONS[number]["id"];
export type LogoVariant = "clara" | "escura";
export type BrandLogo = { id: string; region: LogoRegion; variant: LogoVariant; name: string; width: number; height: number };

export const BRAND_LOGOS: readonly BrandLogo[] = LOGO_REGIONS.flatMap((region) => (["clara", "escura"] as const).map((variant) => ({
  id: `${region.id}-${variant}`, region: region.id, variant, name: `Use ${region.name} · ${variant}`, width: 2135, height: region.id === "norte" ? 1775 : 2450,
})));

export function findBrandLogo(id: string): BrandLogo | null { return BRAND_LOGOS.find((logo) => logo.id === id) ?? null; }
