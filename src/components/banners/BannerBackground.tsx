import { getImageProps } from "next/image";
import { BANNER_VARIANTS } from "@/lib/editorial/banner-variants.generated";
import type { BannerAsset, BannerImage } from "@/lib/editorial/banners";

/**
 * A decorative art-directed <picture> that fills its positioned parent (mobile crop first, desktop from 1024px, where
 * the hero changes layout: below it the box is close to portrait or square, above it a wide fixed-height band).
 * It carries no text and no meaning (empty alt; the caller hides it from assistive tech): whatever must be read or
 * clicked is drawn in code on top of it.
 *
 * LOCAL banners (paths under /public, e.g. /banners/sul/city-desktop.png) are served as pre-sized static WebP files
 * (scripts/build-banner-variants.mts) and NEVER go through /_next/image: on Next 16.3.5 an aborted first request for a cold
 * optimizer entry leaves every later request for that URL hanging until the process restarts (scripts/repro-image-optimizer-hang.mts).
 * Remote images (an allowed https host) still use the optimizer.
 */
function localSet(image: BannerImage): { srcSet: string; src: string } {
  if (image.variants && image.variants.length > 0) {
    // A CMS upload: pre-sized WebP files on the media origin (validated at publish and by the tolerant reader), used as they are.
    const mid = image.variants[Math.min(1, image.variants.length - 1)];
    return { srcSet: image.variants.map((v) => `${v.src} ${v.w}w`).join(", "), src: mid.src };
  }
  const entry = BANNER_VARIANTS[image.src];
  if (!entry || entry.variants.length === 0) return { srcSet: image.src, src: image.src }; // unknown file: the original, still no optimizer
  const mid = entry.variants[Math.min(1, entry.variants.length - 1)];
  return { srcSet: entry.variants.map((v) => `${v.src} ${v.w}w`).join(", "), src: mid.src };
}

export function BannerBackground({ asset, priority = false }: { asset: BannerAsset; priority?: boolean }) {
  const isLocal = (i: BannerImage) => i.src.startsWith("/") || (i.variants?.length ?? 0) > 0; // "local" = never the optimizer
  const imgClass = "absolute inset-0 h-full w-full object-cover";
  const style = { objectPosition: asset.focal ?? "50% 50%" };
  const loading = priority ? ("eager" as const) : ("lazy" as const);
  const fetchPriority = priority ? ("high" as const) : undefined;

  if (isLocal(asset.mobile) && isLocal(asset.desktop)) {
    const desktop = localSet(asset.desktop);
    const mobile = localSet(asset.mobile);
    return (
      <picture>
        <source media="(min-width: 1024px)" srcSet={desktop.srcSet} sizes="100vw" />
        <source srcSet={mobile.srcSet} sizes="100vw" />
        <img src={mobile.src} width={asset.mobile.width} height={asset.mobile.height} alt="" loading={loading} fetchPriority={fetchPriority} decoding="async" className={imgClass} style={style} />
      </picture>
    );
  }

  // Not `priority` on the `getImageProps()` calls below: Next.js 16 deprecated that prop in favour of `preload`, and — unlike the
  // full `<Image>` component — `getImageProps()` silently drops it (no `fetchPriority`, `loading: "lazy"`). Set `loading`/
  // `fetchPriority` explicitly on the rendered element instead (same as ProductPhoto.tsx).
  const common = { alt: "", quality: 80 as const, sizes: "100vw" };
  const desktop = getImageProps({ ...common, src: asset.desktop.src, width: asset.desktop.width, height: asset.desktop.height });
  const mobile = getImageProps({ ...common, src: asset.mobile.src, width: asset.mobile.width, height: asset.mobile.height });
  const { srcSet: desktopSrcSet, ...imgProps } = desktop.props;
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={desktopSrcSet} />
      <source srcSet={mobile.props.srcSet} />
      <img {...imgProps} alt="" loading={loading} fetchPriority={fetchPriority} className={imgClass} style={style} />
    </picture>
  );
}
