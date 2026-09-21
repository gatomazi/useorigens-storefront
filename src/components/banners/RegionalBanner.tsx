import { getImageProps } from "next/image";
import Link from "next/link";
import { SLOT_FRAMES, type BannerConfig, type BannerSlot } from "@/lib/editorial/banners";

/**
 * One banner slot. With a real asset it renders an art-directed <picture> (mobile crop first, desktop from
 * 768px), an optional overlay, heading, body and CTA. Without an asset it renders `fallback`: the designed
 * typographic/product composition. There is never a generic placeholder.
 */
export function RegionalBanner({
  slot,
  config,
  fallback,
  priority = false,
  className = "",
  children,
}: {
  slot: BannerSlot;
  config: BannerConfig;
  fallback: React.ReactNode;
  priority?: boolean;
  className?: string;
  /** Anchored on top of the image (the hero puts the city search here, so it stays in the first screen). */
  children?: React.ReactNode;
}) {
  const asset = config.asset;
  if (!asset) return <>{fallback}</>;

  const frame = SLOT_FRAMES[slot];
  const common = { alt: asset.alt, quality: 80 as const, priority, sizes: "100vw" };
  const desktop = getImageProps({ ...common, src: asset.desktop.src, width: asset.desktop.width, height: asset.desktop.height });
  const mobile = getImageProps({ ...common, src: asset.mobile.src, width: asset.mobile.width, height: asset.mobile.height });
  const align = config.align ?? "left";
  const overlay = config.overlay ?? "none";
  const { srcSet: desktopSrcSet, ...imgProps } = desktop.props;
  // The hero carries the page's only <h1>.
  const Heading = slot === "hero" ? "h1" : "h2";

  return (
    <section
      className={`relative isolate overflow-hidden ${className}`}
      // Mobile ratio first; desktop ratio from 768px, both taken from the slot's final frame.
      style={{ ["--ratio-mobile" as string]: frame.mobile.ratio, ["--ratio-desktop" as string]: frame.desktop.ratio }}
    >
      <div className="relative aspect-[var(--ratio-mobile)] w-full md:aspect-[var(--ratio-desktop)]">
        <picture>
          <source media="(min-width: 768px)" srcSet={desktopSrcSet} />
          <source srcSet={mobile.props.srcSet} />
          <img {...imgProps} alt={asset.alt} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: asset.focal ?? "50% 50%" }} />
        </picture>
        {overlay !== "none" && <div aria-hidden="true" className={`absolute inset-0 ${overlay === "dark" ? "bg-black/35" : "bg-white/30"}`} />}
        {(config.heading || config.body || config.cta) && (
          <div className={`absolute inset-0 flex items-end p-5 sm:p-10 lg:p-16 ${align === "center" ? "justify-center text-center" : align === "right" ? "justify-end text-right" : ""} ${overlay === "light" ? "text-ink" : "text-white"}`}>
            <div className="max-w-xl">
              {config.heading && <Heading id={slot === "hero" ? "hero-title" : undefined} className="t-h2">{config.heading}</Heading>}
              {config.body && <p className="t-body mt-3">{config.body}</p>}
              {config.cta && (
                <Link href={config.cta.href} className="btn btn-light mt-6 inline-flex">
                  {config.cta.label}
                </Link>
              )}
              {children && <div className="mt-6 w-full max-w-xl">{children}</div>}
            </div>
          </div>
        )}
        {!(config.heading || config.body || config.cta) && children && (
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-10 lg:p-16">
            <div className="max-w-xl">{children}</div>
          </div>
        )}
      </div>
    </section>
  );
}
