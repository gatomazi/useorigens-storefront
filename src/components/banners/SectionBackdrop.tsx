import type { CSSProperties, ReactNode } from "react";
import { BannerBackground } from "@/components/banners/BannerBackground";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import type { BannerAsset } from "@/lib/editorial/banners";
import { focalToCss, type ResolvedBackground, type ResolvedImage } from "@/lib/site-config/resolve";
import type { Color, Fill, Overlay } from "@/lib/site-config/schema";

/**
 * Turns a resolved section background (docs/admin/cms-v1-plan.md §6.1) into the DOM the home already uses. It only ever draws
 * an absolutely positioned layer INSIDE the section that owns it (ADR 0003) — there is no mode that renders a standalone
 * band between sections.
 *
 * The seed's backgrounds (both images, one focal point, a preset overlay, a named colour) take the exact same path as the
 * original home (`RegionalPhotoSection`), so the markup is identical. Anything else (one breakpoint only, different focal points,
 * custom overlay/fill) uses the layered path below.
 */

const TOKEN_CLASS: Record<string, string> = {
  "token:ground": "bg-ground",
  "token:region-primary": "bg-region-primary",
  "token:near-black": "bg-[#0a0c0a]",
};
const TOKEN_VAR: Record<string, string> = {
  "token:ground": "var(--ground)",
  "token:region-primary": "var(--region-primary)",
  "token:near-black": "#0a0c0a",
};
const cssColor = (c: Color): string => TOKEN_VAR[c] ?? c;

/** Class for named colours (static, so Tailwind emits it), inline style for everything else. */
function fillProps(fill: Fill): { className: string; style?: CSSProperties } {
  if (fill.kind === "solid") {
    const cls = TOKEN_CLASS[fill.color];
    return cls ? { className: cls } : { className: "", style: { backgroundColor: fill.color } };
  }
  if (fill.kind === "gradient") return { className: "", style: { backgroundImage: `linear-gradient(${fill.angle}deg, ${cssColor(fill.from)}, ${cssColor(fill.to)})` } };
  return { className: "" };
}

function washProps(overlay: Overlay): { wash: "regional-wash" | "regional-wash-primary" | "regional-wash-dark" | "none"; washStyle?: CSSProperties } {
  if ("preset" in overlay) return { wash: overlay.preset };
  const r = Number.parseInt(overlay.color.slice(1, 3), 16);
  const g = Number.parseInt(overlay.color.slice(3, 5), 16);
  const b = Number.parseInt(overlay.color.slice(5, 7), 16);
  return { wash: "none", washStyle: { background: `rgb(${r} ${g} ${b} / ${overlay.opacity})` } };
}

const toAsset = (mobile: ResolvedImage, desktop: ResolvedImage, focal: string): BannerAsset => ({
  mobile: { src: mobile.src, width: mobile.width, height: mobile.height },
  desktop: { src: desktop.src, width: desktop.width, height: desktop.height },
  alt: "",
  focal,
});

export function isSameFill(a: Fill, b: Fill): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A section's background layer, or `null` when there is nothing to draw (no image and a fill that is the page's own). */
export function SectionBackdrop({ bg, priority = false, nativeFill = { kind: "none" } }: { bg: ResolvedBackground; priority?: boolean; nativeFill?: Fill }): ReactNode {
  const { mobile, desktop } = bg.images;
  const base = fillProps(bg.fill);

  if (!mobile && !desktop) {
    // No image: the fill, unless the section already paints exactly that itself.
    if (bg.fill.kind === "none" || isSameFill(bg.fill, nativeFill)) return null;
    return <div aria-hidden="true" className={`absolute inset-0 -z-10 ${base.className}`} style={base.style} />;
  }

  const overlay = washProps(bg.overlay);
  const sameFocal = bg.focal.mobile.x === bg.focal.desktop.x && bg.focal.mobile.y === bg.focal.desktop.y;

  if (mobile && desktop && sameFocal) {
    return (
      <RegionalPhotoSection
        asset={toAsset(mobile, desktop, focalToCss(bg.focal.mobile))}
        wash={overlay.wash}
        washStyle={overlay.washStyle}
        baseClassName={base.className}
        baseStyle={base.style}
        priority={priority}
      />
    );
  }

  // Layered path: each breakpoint has its own picture (and focal point); a breakpoint without an image shows the fill.
  const layer = (img: ResolvedImage, focal: string, visibility: string) => (
    <div className={`absolute inset-0 ${visibility}`}>
      <BannerBackground asset={toAsset(img, img, focal)} priority={priority} />
      {overlay.washStyle ? <div className="absolute inset-0" style={overlay.washStyle} /> : overlay.wash !== "none" && <div className={`${overlay.wash} absolute inset-0`} />}
    </div>
  );
  return (
    <div aria-hidden="true" className={`absolute inset-0 -z-10 overflow-hidden ${base.className}`} style={base.style}>
      {mobile && layer(mobile, focalToCss(bg.focal.mobile), "lg:hidden")}
      {desktop && layer(desktop, focalToCss(bg.focal.desktop), "hidden lg:block")}
    </div>
  );
}
