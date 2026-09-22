import { getImageProps } from "next/image";
import type { BannerAsset } from "@/lib/editorial/banners";

/**
 * A decorative art-directed <picture> that fills its positioned parent (mobile crop first, desktop from 1024px, where
 * the hero changes layout: below it the box is close to portrait or square, above it a wide fixed-height band).
 * It carries no text and no meaning (empty alt; the caller hides it from assistive tech): whatever must be read or
 * clicked is drawn in code on top of it.
 */
export function BannerBackground({ asset, priority = false }: { asset: BannerAsset; priority?: boolean }) {
  const common = { alt: "", quality: 80 as const, priority, sizes: "100vw" };
  const desktop = getImageProps({ ...common, src: asset.desktop.src, width: asset.desktop.width, height: asset.desktop.height });
  const mobile = getImageProps({ ...common, src: asset.mobile.src, width: asset.mobile.width, height: asset.mobile.height });
  const { srcSet: desktopSrcSet, ...imgProps } = desktop.props;
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={desktopSrcSet} />
      <source srcSet={mobile.props.srcSet} />
      <img {...imgProps} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: asset.focal ?? "50% 50%" }} />
    </picture>
  );
}
