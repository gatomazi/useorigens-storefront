import Link from "next/link";
import type { ReactNode } from "react";
import { BannerBackground } from "@/components/banners/BannerBackground";
import type { BannerAsset } from "@/lib/editorial/banners";
import type { GridLayout } from "@/lib/site-config/schema";

/** A tile as the storefront draws it: a resolved link and, when its picture is in the media table, the picture. */
export type GridTileView = { label: string; caption?: string; href: string; external: boolean; image: BannerAsset | null };

const COLUMNS: Record<GridLayout["columns"], { grid: string; sizes: string }> = {
  2: { grid: "grid-cols-2", sizes: "(min-width: 1280px) 600px, 50vw" },
  3: { grid: "grid-cols-2 md:grid-cols-3", sizes: "(min-width: 1280px) 400px, (min-width: 768px) 33vw, 50vw" },
  4: { grid: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4", sizes: "(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" },
};
const ASPECT: Record<GridLayout["aspect"], string> = { square: "aspect-square", portrait: "aspect-[4/5]", landscape: "aspect-[4/3]" };

function TileLink({ tile, className, children }: { tile: GridTileView; className: string; children: ReactNode }) {
  // An INK collection or another Use store is a full navigation to another site; a page of this store stays in the app router.
  return tile.external ? <a href={tile.href} className={className}>{children}</a> : <Link href={tile.href} className={className}>{children}</Link>;
}

/**
 * Image grid section ("Compre por peça", "Coleções"…). Phones always show two tiles side by side; `columns` applies from tablet/desktop up. The
 * picture is decorative (the tile's name is the link text); a tile without one is a block in the region's colour. With `labels: "overlay"` the
 * name sits on a dark scrim over the lower edge of the picture, so it stays readable over any photo (the plain block needs no scrim).
 */
export function ImageGrid({
  anchor, headingId, title, subtitle, tiles, layout, backdrop, className,
}: {
  anchor: string;
  headingId: string;
  title: string;
  subtitle?: string;
  tiles: GridTileView[];
  layout: GridLayout;
  backdrop?: ReactNode;
  /** Extra classes of the `<section>` (on a CMS page with a dark ground, a grid with its own light background keeps dark text: `on-light`). */
  className?: string;
}) {
  const { grid, sizes } = COLUMNS[layout.columns];
  const overlay = layout.labels === "overlay";
  const content = (
    <>
      <div className="mb-8 max-w-2xl lg:mb-12">
        <h2 id={headingId} className="t-h2">{title}</h2>
        {subtitle && <p className="t-body mt-3 text-ink-soft">{subtitle}</p>}
      </div>
      <ul className={`grid gap-x-3 gap-y-6 sm:gap-x-5 lg:gap-y-8 ${grid}`}>
        {tiles.map((tile, i) => (
          <li key={`${i}-${tile.href}`}>
            <TileLink tile={tile} className="group block">
              <span className={`relative block overflow-hidden ${ASPECT[layout.aspect]} ${tile.image ? "bg-ground" : "bg-region-primary"}`}>
                {tile.image ? (
                  <span aria-hidden className="absolute inset-0 block transition-transform duration-500 motion-safe:group-hover:scale-[1.035]">
                    <BannerBackground asset={tile.image} sizes={sizes} />
                  </span>
                ) : (
                  <svg aria-hidden viewBox="0 0 24 24" className="absolute right-4 top-4 h-6 w-6 text-white/80 transition-transform motion-safe:group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
                {overlay && (
                  <span className={`absolute inset-x-0 bottom-0 block px-3 pb-3 pt-12 text-white sm:px-4 sm:pb-4 ${tile.image ? "bg-gradient-to-t from-black/75 via-black/35 to-transparent" : ""}`}>
                    <span className="block text-[1.0625rem] font-extrabold leading-tight tracking-tight sm:text-[1.25rem]">{tile.label}</span>
                    {tile.caption && <span className="mt-0.5 block text-[0.8125rem] leading-snug text-white/85 sm:text-[0.875rem]">{tile.caption}</span>}
                  </span>
                )}
              </span>
              {!overlay && (
                <>
                  <span aria-hidden className="mt-3 block h-[3px] w-6 bg-region-accent transition-colors group-hover:bg-region-primary" />
                  <span className="mt-2 block">
                    <span className="link-line inline text-[1.0625rem] font-bold leading-tight tracking-tight transition-colors group-hover:text-region-primary sm:text-[1.125rem]">{tile.label}</span>
                  </span>
                  {tile.caption && <span className="t-caption mt-1 block max-w-[34ch]">{tile.caption}</span>}
                </>
              )}
            </TileLink>
          </li>
        ))}
      </ul>
    </>
  );

  if (!backdrop) {
    return (
      <section id={anchor} aria-labelledby={headingId} className={["wrap py-14 lg:py-24", className].filter(Boolean).join(" ")}>
        {content}
      </section>
    );
  }
  return (
    <section id={anchor} aria-labelledby={headingId} className={["relative isolate overflow-hidden", className].filter(Boolean).join(" ")}>
      {backdrop}
      <div className="wrap py-14 lg:py-24">{content}</div>
    </section>
  );
}
