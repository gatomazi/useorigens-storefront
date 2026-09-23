import { getImageProps } from "next/image";
import type { BannerAsset } from "@/lib/editorial/banners";

/**
 * A decorative art-directed <picture> that fills its positioned parent (mobile crop first, desktop from 1024px, where
 * the hero changes layout: below it the box is close to portrait or square, above it a wide fixed-height band).
 * It carries no text and no meaning (empty alt; the caller hides it from assistive tech): whatever must be read or
 * clicked is drawn in code on top of it.
 */
export function BannerBackground({ asset, priority = false }: { asset: BannerAsset; priority?: boolean }) {
  // Not `priority` on the `getImageProps()` calls below: Next.js 16 deprecated that prop in favour of
  // `preload`, and — unlike the full `<Image>` component, which still honours `priority` for back-compat —
  // `getImageProps()` (a pure prop generator, no side effects) silently drops it: it returns `loading: "lazy"`
  // and no `fetchPriority` at all, confirmed empirically against the rendered HTML (nightly QA round,
  // CLAUDE_RODADA_NOTURNA_STOREFRONT.md P2 — the hero background, the actual LCP element, was loading lazy
  // with no high-priority hint and no preload link). Fixed the same way `ProductPhoto.tsx` already does for
  // product photos: set `loading`/`fetchPriority` explicitly on the rendered element instead of relying on
  // either deprecated prop's automatic behaviour.
  const common = { alt: "", quality: 80 as const, sizes: "100vw" };
  const desktop = getImageProps({ ...common, src: asset.desktop.src, width: asset.desktop.width, height: asset.desktop.height });
  const mobile = getImageProps({ ...common, src: asset.mobile.src, width: asset.mobile.width, height: asset.mobile.height });
  const { srcSet: desktopSrcSet, ...imgProps } = desktop.props;
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={desktopSrcSet} />
      <source srcSet={mobile.props.srcSet} />
      <img
        {...imgProps}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: asset.focal ?? "50% 50%" }}
      />
    </picture>
  );
}
