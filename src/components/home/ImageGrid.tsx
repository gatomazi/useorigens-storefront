import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { BannerBackground } from "@/components/banners/BannerBackground";
import type { BannerAsset } from "@/lib/editorial/banners";
import type { GridLayout } from "@/lib/site-config/schema";

/**
 * A tile as the storefront draws it: a resolved link and, when its picture is in the media table, the picture. The two formats of a collection
 * card (`format`, CMS) also carry their colour (any CSS colour), the tone of their text, the written call and, for "product", the real shirt.
 */
export type GridTileView = {
  label: string;
  caption?: string;
  href: string;
  external: boolean;
  image: BannerAsset | null;
  format?: "product" | "banner";
  color?: string;
  tone?: "light" | "dark";
  cta?: string;
  /** "product": the first product of the destination collection (null: none resolved, the card keeps its colour and text). */
  product?: { imageUrl: string } | null;
};

const COLUMNS: Record<GridLayout["columns"], { grid: string; sizes: string }> = {
  2: { grid: "grid-cols-2", sizes: "(min-width: 1280px) 600px, 50vw" },
  3: { grid: "grid-cols-2 md:grid-cols-3", sizes: "(min-width: 1280px) 400px, (min-width: 768px) 33vw, 50vw" },
  4: { grid: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4", sizes: "(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" },
};
const ASPECT: Record<GridLayout["aspect"], string> = { square: "aspect-square", portrait: "aspect-[4/5]", landscape: "aspect-[4/3]" };
/** A banner card's shape from 768px (phones: always a wide 16:10 card). Literal classes, so Tailwind emits them. */
const ASPECT_MD: Record<GridLayout["aspect"], string> = { square: "md:aspect-square", portrait: "md:aspect-[4/5]", landscape: "md:aspect-[4/3]" };
/** Collection cards: one per row on phones, then the grid's columns (two stay two; three and four become three on tablets). */
const CARD_COLUMNS: Record<GridLayout["columns"], string> = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-3 lg:grid-cols-4" };
const CARD_SIZES: Record<GridLayout["columns"], string> = {
  2: "(min-width: 1280px) 640px, (min-width: 768px) 50vw, 100vw",
  3: "(min-width: 1280px) 440px, (min-width: 768px) 33vw, 100vw",
  4: "(min-width: 1280px) 330px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 100vw",
};

function TileLink({ tile, className, style, children }: { tile: GridTileView; className: string; style?: CSSProperties; children: ReactNode }) {
  // An INK collection or another Use store is a full navigation to another site; a page of this store stays in the app router.
  return tile.external ? <a href={tile.href} className={className} style={style}>{children}</a> : <Link href={tile.href} className={className} style={style}>{children}</Link>;
}

/**
 * Image grid section ("Compre por peça", "Coleções"…). Phones always show two tiles side by side; `columns` applies from tablet/desktop up. The
 * picture is decorative (the tile's name is the link text); a tile without one is a block in the region's colour. With `labels: "overlay"` the
 * name sits on a dark scrim over the lower edge of the picture, so it stays readable over any photo (the plain block needs no scrim).
 */
const ARROW = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** Name, caption and call of a collection card, in its tone (white text over a dark colour or the banner's scrim, ink over a light one). */
function TileText({ tile, size }: { tile: GridTileView; size: "card" | "banner" }) {
  const light = tile.tone === "light";
  return (
    <>
      <span className={`block font-display font-extrabold uppercase leading-[0.95] tracking-[0.005em] [overflow-wrap:anywhere] ${size === "banner" ? "text-[1.875rem] sm:text-[2.25rem]" : "text-[1.75rem] md:text-[2.25rem]"}`}>{tile.label}</span>
      {tile.caption && <span className={`mt-2 block max-w-[32ch] text-[0.9375rem] leading-snug ${light ? "text-white/90" : "text-ink-soft"}`}>{tile.caption}</span>}
      {tile.cta && (
        <span className={`mt-3 inline-flex min-h-6 items-center gap-1 text-[0.9375rem] font-semibold leading-tight underline decoration-2 underline-offset-4 transition-colors ${light ? "decoration-white/60 group-hover:decoration-white" : "decoration-region-accent group-hover:decoration-current"}`}>
          {tile.cta}
          {ARROW}
        </span>
      )}
    </>
  );
}

/**
 * Format A ("product"): a REAL shirt of the collection, in the store's photo frame, on the card's colour, with the name, the caption and the call
 * under it. Phones: the photo beside the text (three cards fit one screen); from 768px, the photo on top. The whole card is the link.
 */
function ProductTile({ tile, sizes }: { tile: GridTileView; sizes: string }) {
  return (
    <TileLink
      tile={tile}
      className={`group grid h-full grid-cols-[minmax(0,40%)_minmax(0,1fr)] items-center gap-4 rounded-lg p-3 transition-[filter] duration-200 hover:brightness-[0.97] active:brightness-[0.93] md:flex md:flex-col md:items-stretch md:gap-0 md:p-5 ${tile.tone === "light" ? "text-white" : "text-ink"}`}
      style={{ background: tile.color }}
    >
      {tile.product ? (
        <span className="photo photo-contain block overflow-hidden rounded-md">
          <Image src={tile.product.imageUrl} alt="" fill sizes={sizes} quality={80} />
        </span>
      ) : (
        <span aria-hidden="true" className="block aspect-[800/820] rounded-md bg-black/[0.06]" />
      )}
      <span className="flex min-w-0 flex-col items-start md:mt-5 md:flex-1">
        <TileText tile={tile} size="card" />
      </span>
    </TileLink>
  );
}

/**
 * Format B ("banner"): the picture fills the card (its own crop and framing on phones), under a scrim on the lower part only, so the name and the call
 * stay readable without covering the upper part of the picture (the owner frames what matters with the focal point). Phones: a wide card; from 768px,
 * the grid's shape. The whole card is the link; the picture is decorative unless the owner described it.
 */
function BannerTile({ tile, aspect, sizes }: { tile: GridTileView; aspect: string; sizes: string }) {
  const light = tile.tone !== "dark";
  return (
    <TileLink tile={tile} className={`group relative flex h-full flex-col overflow-hidden rounded-lg ${light ? "text-white" : "text-ink"}`} style={{ background: tile.color }}>
      <span aria-hidden="true" className={`block aspect-[16/10] w-full ${aspect}`} />
      {tile.image && (
        <span className="absolute inset-0 block transition-transform duration-500 motion-safe:group-hover:scale-[1.035]">
          <BannerBackground asset={tile.image} sizes={sizes} />
        </span>
      )}
      <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 block h-3/4 ${light ? "bg-gradient-to-t from-black/75 via-black/35 to-transparent" : "bg-gradient-to-t from-white/90 via-white/55 to-transparent"}`} />
      <span className="absolute inset-x-0 bottom-0 flex flex-col items-start p-4 sm:p-5">
        <TileText tile={tile} size="banner" />
      </span>
    </TileLink>
  );
}

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
  // Collection cards (product / banner): one per row on phones (a photo beside its text, a wide banner), the grid's columns from 768px.
  const cards = tiles.some((t) => t.format);
  const heading = (
    <div className="mb-8 max-w-2xl lg:mb-12">
      <h2 id={headingId} className="t-h2">{title}</h2>
      {subtitle && <p className="t-body mt-3 text-ink-soft">{subtitle}</p>}
    </div>
  );
  const content = cards ? (
    <>
      {heading}
      <ul className={`grid gap-3 sm:gap-4 lg:gap-5 ${CARD_COLUMNS[layout.columns]}`}>
        {tiles.map((tile, i) => (
          <li key={`${i}-${tile.href}`} className="min-w-0">
            {tile.format === "banner" ? (
              <BannerTile tile={tile} aspect={ASPECT_MD[layout.aspect]} sizes={CARD_SIZES[layout.columns]} />
            ) : tile.format === "product" ? (
              <ProductTile tile={tile} sizes={CARD_SIZES[layout.columns]} />
            ) : (
              // A classic tile in a grid of collection cards takes the banner's shape (its picture, or the region's colour), so the row stays one family.
              <BannerTile tile={{ ...tile, color: tile.color ?? "var(--region-primary)", tone: "light" }} aspect={ASPECT_MD[layout.aspect]} sizes={CARD_SIZES[layout.columns]} />
            )}
          </li>
        ))}
      </ul>
    </>
  ) : (
    <>
      {heading}
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
