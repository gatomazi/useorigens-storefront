import type { RegionSlug } from "../geo/regions";

/**
 * Banner slots. Regional banners (photography + art direction) are the main tool that will give each region
 * its face, so every slot is defined here with final proportions and behavior, and stays EMPTY until a real
 * asset exists. An empty slot renders the typographic/product composition already designed for it.
 * Mobile is the primary asset: ~90% of the traffic. Desktop is its expansion.
 */

export type BannerImage = {
  /** Path under /public (e.g. "/banners/sul/hero-mobile.jpg") or an allowed remote URL. */
  src: string;
  width: number;
  height: number;
};

export type BannerAsset = {
  mobile: BannerImage;
  desktop: BannerImage;
  alt: string;
  /** CSS object-position for the crop ("50% 30%"). Keeps the subject when the frame changes. */
  focal?: string;
};

export type BannerConfig = {
  asset?: BannerAsset;
  heading?: string;
  body?: string;
  cta?: { label: string; href: string };
  align?: "left" | "center" | "right";
  overlay?: "none" | "dark" | "light";
  /** Where the banner leads when it is clickable and has no CTA. */
  href?: string;
};

export type BannerSlot = "hero" | "campaign" | "state" | "collection" | "city";

/**
 * Final frame per slot: aspect ratio and minimum pixel size for the mobile (portrait-first) and desktop assets.
 * These same numbers are the production brief in docs/design/regional-banner-production-plan.md.
 */
export const SLOT_FRAMES: Readonly<
  Record<BannerSlot, { mobile: { ratio: string; min: string }; desktop: { ratio: string; min: string } }>
> = {
  hero: { mobile: { ratio: "4/5", min: "1440x1800" }, desktop: { ratio: "3/2", min: "2880x1920" } },
  campaign: { mobile: { ratio: "4/5", min: "1440x1800" }, desktop: { ratio: "16/9", min: "2880x1620" } },
  state: { mobile: { ratio: "4/5", min: "1080x1350" }, desktop: { ratio: "4/5", min: "1200x1500" } },
  collection: { mobile: { ratio: "1/1", min: "1440x1440" }, desktop: { ratio: "21/9", min: "2880x1234" } },
  city: { mobile: { ratio: "4/3", min: "1440x1080" }, desktop: { ratio: "21/9", min: "2880x1234" } },
};

export type RegionBanners = {
  hero: BannerConfig;
  campaign: BannerConfig;
  /** By UF. */
  states: Readonly<Record<string, BannerConfig>>;
  /** By collection key ("fala-daqui", "ddd"). */
  collections: Readonly<Record<string, BannerConfig>>;
  /** Reusable city editorial banner (one template, optionally overridden per city slug). */
  city: BannerConfig;
};

/** Empty on purpose: no real photography exists yet. Filling a slot needs no layout change. */
export const REGION_BANNERS: Readonly<Record<RegionSlug, RegionBanners>> = {
  sul: { hero: {}, campaign: {}, states: {}, collections: {}, city: {} },
  norte: { hero: {}, campaign: {}, states: {}, collections: {}, city: {} },
  "centro-oeste": { hero: {}, campaign: {}, states: {}, collections: {}, city: {} },
};

export function bannerFor(region: RegionSlug, slot: BannerSlot, key?: string): BannerConfig {
  const set = REGION_BANNERS[region];
  if (slot === "state") return (key && set.states[key]) || {};
  if (slot === "collection") return (key && set.collections[key]) || {};
  return set[slot];
}
