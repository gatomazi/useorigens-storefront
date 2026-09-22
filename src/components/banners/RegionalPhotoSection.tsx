import { BannerBackground } from "@/components/banners/BannerBackground";
import type { BannerAsset } from "@/lib/editorial/banners";

/**
 * The shared "photo as section background" layer: an absolutely positioned, decorative picture plus a code-drawn
 * wash (globals.css: .regional-wash, .regional-wash-primary, .regional-wash-dark), sitting behind whatever content
 * the caller's own `relative isolate` section renders on top.
 *
 * This is the ONLY way a regional photo appears on the site — never as its own standalone banner section between
 * two unrelated blocks (docs/decisions/0003-banners-as-section-backgrounds.md). It ambientes the section that owns
 * it: hero, a state or city page header, the "Fala daqui" block, the closing campaign block.
 */
export function RegionalPhotoSection({
  asset,
  wash = "regional-wash",
  baseClassName = "bg-ground",
  priority = false,
}: {
  asset: BannerAsset;
  /** Which globals.css wash to draw on top: light/warm (default), the region's primary tint, or near-black. */
  wash?: "regional-wash" | "regional-wash-primary" | "regional-wash-dark";
  /** Colour shown for an instant before the photo paints (and if it ever fails to load). Match the wash's tone. */
  baseClassName?: string;
  priority?: boolean;
}) {
  return (
    <div aria-hidden="true" className={`absolute inset-0 -z-10 overflow-hidden ${baseClassName}`}>
      <BannerBackground asset={asset} priority={priority} />
      <div className={`${wash} absolute inset-0`} />
    </div>
  );
}
