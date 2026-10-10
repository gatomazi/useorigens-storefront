import type { CSSProperties, ReactNode } from "react";
import type { MediaAssetInfo, PageBackdrop } from "@/lib/site-config/schema";

/** A path safe to drop into `url("…")` (the media table already only holds same-origin paths; this also keeps quotes and parentheses out). */
const CSS_URL_SAFE = /^\/[A-Za-z0-9/_.:-]+$/;

/** The smallest pre-sized width that still covers one repeat on a 2x screen; the original when there are no variants (or none is big enough). */
export function patternSrc(info: MediaAssetInfo, size: number): string {
  const enough = (info.variants ?? []).filter((v) => v.w >= size * 2).sort((a, b) => a.w - b.w)[0];
  return enough?.src ?? info.src;
}

/**
 * The ground of a page with a backdrop of its own ("Fundo da página" in the CMS, for a themed page such as Black Friday): the colour, and the pattern
 * repeated over it as a decorative layer UNDER every section (sections with a surface of their own still paint it). On a dark ground (`tone: "dark"`)
 * the page's text turns light (`.page-dark`, globals.css). A pattern whose picture is missing from the media table is simply not drawn.
 */
export function PageGround({ backdrop, media, children }: { backdrop: PageBackdrop; media: Record<string, MediaAssetInfo>; children: ReactNode }) {
  const { pattern } = backdrop;
  const info = pattern ? media[pattern.image.assetId] : undefined;
  const src = pattern && info ? patternSrc(info, pattern.size) : null;
  const layer: CSSProperties | null =
    pattern && src && CSS_URL_SAFE.test(src) ? { backgroundImage: `url("${src}")`, backgroundSize: `${pattern.size}px auto`, backgroundRepeat: "repeat", opacity: pattern.opacity } : null;
  return (
    // `--card-fill`: product cards take the page colour, so the pattern runs between them and never under a name or a price.
    <div data-page-ground={backdrop.tone} className={`relative isolate ${backdrop.tone === "dark" ? "page-dark" : ""}`} style={{ backgroundColor: backdrop.color, ["--card-fill" as string]: backdrop.color }}>
      {layer && <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={layer} />}
      {children}
    </div>
  );
}
