import type { RegionSlug } from "../geo/regions";

/**
 * Banner slots. Regional banners (photography + art direction) are the main tool that will give each region
 * its face, so every slot is defined here with final proportions and behavior, and stays EMPTY until a real
 * asset exists. An empty slot renders the typographic/product composition already designed for it.
 * Mobile is the primary asset: ~90% of the traffic. Desktop is its expansion.
 *
 * A banner is ALWAYS a decorative background of the section that owns it (RegionalPhotoSection), drawn behind
 * content the page already renders in code — never a standalone image section between two unrelated blocks.
 * See docs/decisions/0003-banners-as-section-backgrounds.md. That is also why BannerConfig carries only an asset:
 * heading/body/CTA text belongs to the section's own component (RegionHero, Campaign, ...), not to this config.
 */

/** Source formats a banner asset may use. Next re-encodes them to AVIF/WebP for the browser (next.config.ts). */
export const BANNER_IMAGE_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg"] as const;

/** True when `src` (a path or URL, query string ignored) ends in one of the accepted banner formats. */
export function isSupportedBannerImage(src: string): boolean {
  const path = src.split(/[?#]/)[0].toLowerCase();
  return BANNER_IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export type BannerImage = {
  /** Path under /public (e.g. "/banners/sul/hero-mobile.webp" or ".png") or an allowed remote URL. See BANNER_IMAGE_EXTENSIONS. */
  src: string;
  width: number;
  height: number;
  /** Pre-sized WebP widths of a CMS upload (served from the media origin): used as a `srcset` directly, never through the image optimizer. */
  variants?: { w: number; src: string }[];
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
};

export type BannerSlot = "hero" | "campaign" | "state" | "collection" | "city";

/**
 * Aspect ratio and minimum pixel size for the mobile (portrait-first) and desktop assets of each slot: the
 * production brief in docs/design/regional-banner-production-plan.md. Reference only — no component reads this at
 * runtime. Every slot is a section BACKGROUND (object-cover), so the box each photo actually fills is whatever its
 * owning section measures out to be (RegionHero documents the hero's own measured boxes as an example); these
 * ratios are the target composition to shoot or generate for, not a frame the code enforces.
 */
export const SLOT_FRAMES: Readonly<
  Record<BannerSlot, { mobile: { ratio: string; min: string }; desktop: { ratio: string; min: string } }>
> = {
  // Hero: a background, not a frame. Measured hero box: 360x576 to 1023x907 below 1024px (portrait to almost square),
  // then a fixed ~522px band from 1.6:1 (1024) to 4.9:1 (2560). Mobile asset serves < 1024px, desktop asset >= 1024px.
  hero: { mobile: { ratio: "4/5", min: "1440x1800" }, desktop: { ratio: "8/3", min: "2880x1080" } },
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
  sul: {
    hero: {
      // The hero is a BACKGROUND: the headline, search, caption and the three family shirts stay in code (RegionHero),
      // and the wash that keeps them legible is drawn by <RegionalPhotoSection>. The image carries no text and no
      // product. Real dimensions of the delivered files; object-cover crops them to whatever height the hero has,
      // and the focal point picks what survives the crop. `alt` is empty on purpose: the picture is decorative.
      asset: {
        // Re-delivered at 1122x1402 (was 1440x1800 briefly); keep this in sync with the real file whenever it changes.
        mobile: { src: "/banners/sul/hero-mobile.png", width: 1122, height: 1402 },
        desktop: { src: "/banners/sul/hero-desktop.png", width: 2048, height: 768 },
        alt: "",
        focal: "30% 35%",
      },
    },
    // Desktop file (1122x1402, 4:5) is the same ratio as mobile, not the slot's 16:9: object-cover crops the sides
    // off a portrait image instead of showing a true landscape composition. Works, but ask for a real 16:9 desktop
    // crop when there is time; until then the focal point keeps the centre.
    campaign: {
      asset: {
        mobile: { src: "/banners/sul/campaign-mobile.png", width: 1122, height: 1402 },
        desktop: { src: "/banners/sul/campaign-desktop.png", width: 1122, height: 1402 },
        alt: "",
      },
    },
    // Single master per state (1122x1402, 4:5): the production plan's "one file serves mobile and desktop" state
    // banner. Slightly under the desktop minimum (1200x1500) but usable; see docs/design/regional-banner-production-plan.md.
    states: {
      PR: { asset: { mobile: { src: "/banners/sul/state-pr.png", width: 1122, height: 1402 }, desktop: { src: "/banners/sul/state-pr.png", width: 1122, height: 1402 }, alt: "" } },
      RS: { asset: { mobile: { src: "/banners/sul/state-rs.png", width: 1122, height: 1402 }, desktop: { src: "/banners/sul/state-rs.png", width: 1122, height: 1402 }, alt: "" } },
      SC: { asset: { mobile: { src: "/banners/sul/state-sc.png", width: 1122, height: 1402 }, desktop: { src: "/banners/sul/state-sc.png", width: 1122, height: 1402 }, alt: "" } },
    },
    collections: {
      // Delivered, but no page renders it: the DDD section is a plain carousel of small product photos with no
      // header/intro block to hang a background on, and those photos need a calm, flat ground to read (the same
      // reason product cards elsewhere stay neutral). Forcing an image behind them would compete with the product,
      // not ambient it — so, per docs/decisions/0003-banners-as-section-backgrounds.md, it stays unused for now
      // rather than becoming a standalone slice again. Revisit if a good in-section placement is found.
      ddd: {
        asset: {
          mobile: { src: "/banners/sul/ddd-mobile.png", width: 1254, height: 1254 },
          desktop: { src: "/banners/sul/ddd-desktop.png", width: 1916, height: 821 },
          alt: "",
        },
      },
      "fala-daqui": {
        asset: {
          mobile: { src: "/banners/sul/fala-daqui-mobile.png", width: 1254, height: 1254 },
          desktop: { src: "/banners/sul/fala-daqui-desktop.png", width: 1916, height: 821 },
          alt: "",
        },
      },
    },
    city: {
      asset: {
        mobile: { src: "/banners/sul/city-mobile.png", width: 1448, height: 1086 },
        desktop: { src: "/banners/sul/city-desktop.png", width: 1916, height: 821 },
        alt: "",
      },
    },
  },
  norte: { hero: {}, campaign: {}, states: {}, collections: {}, city: {} },
  "centro-oeste": { hero: {}, campaign: {}, states: {}, collections: {}, city: {} },
};

/**
 * The asset of a banner config, or null when there is none or one of its files has an unsupported format
 * (logged, so a bad file shows the designed fallback instead of a broken image).
 */
export function usableBannerAsset(slot: BannerSlot, config: BannerConfig): BannerAsset | null {
  const asset = config.asset;
  if (!asset) return null;
  if (!isSupportedBannerImage(asset.mobile.src) || !isSupportedBannerImage(asset.desktop.src)) {
    console.error(`Banner "${slot}" ignored: unsupported image format (${asset.mobile.src}, ${asset.desktop.src}).`);
    return null;
  }
  return asset;
}

export function bannerFor(region: RegionSlug, slot: BannerSlot, key?: string): BannerConfig {
  const set = REGION_BANNERS[region];
  if (slot === "state") return (key && set.states[key]) || {};
  if (slot === "collection") return (key && set.collections[key]) || {};
  return set[slot];
}
