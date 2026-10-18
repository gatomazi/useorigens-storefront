import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { PriceText } from "@/components/catalog/PriceText";
import { SearchDialog } from "@/components/search/SearchDialog";
import { usableBannerAsset, type BannerAsset, type BannerConfig } from "@/lib/editorial/banners";
import { BannerBackground } from "@/components/banners/BannerBackground";
import { numberPt } from "@/lib/format";
import type { HeroFamilyCard } from "@/lib/home";
import { DEFAULT_BUY_LABEL, type CardBuy } from "@/lib/site-config/cards-schema";
import { CardButton, CardCall, CardFab } from "@/components/catalog/CardButton";
import { CARD_PRICE } from "@/components/catalog/ProductCard";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import type { Color, FeaturedRotation, HeroColorKey, HeroColors } from "@/lib/site-config/schema";
import { cssColor } from "@/components/banners/SectionBackdrop";
import { HEX_COLOR, relativeLuminance } from "@/lib/site-config/color";
import { HeroSlides } from "./HeroSlides";

const HERO_COPY = { title: "O seu lugar,\ndo seu jeito.", body: "Encontre sua cidade e vista o lugar que faz parte de você." };

/**
 * Hero ("O seu lugar, do seu jeito."): headline, search and the three commercial families (Ponto de Origem, Feito em,
 * Coordenadas), one real product each. Everything is drawn in code.
 *
 * Left: headline, subtext, search, supporting line. Right: three product cards (name, city/UF, price). On phones the
 * cards are a horizontal snap row instead of three squeezed thumbnails.
 *
 * The regional background (config.asset), when set, is only a landscape behind the content, under one light, warm
 * wash (RegionalPhotoSection) so the banner sits close to the page. Text stays black. Without an image the hero is
 * the plain typographic one.
 *
 * Regional colour here is small on purpose: a gold rule (accent) above the headline and an olive (primary) link. The cards are the
 * store's one product card (ProductCard.tsx: bordered block, picture, name, place, price) on the INK grey, so the mockup disappears
 * into the surface (no white frame, art untouched) and the hero's products look like every other product of the store.
 */
export function RegionHero({
  region,
  cityCount,
  trio,
  config,
  copy = HERO_COPY,
  backdrop,
  variant,
  buy,
  statesAnchor = "estados",
  panelColor,
  panelImage,
  slides,
  rotation,
  colors,
}: {
  region: RegionSlug;
  cityCount: number;
  trio: HeroFamilyCard[];
  config: BannerConfig;
  /** Config-driven copy (CMS). `\n` in the title is a line break. Defaults to the original text. */
  copy?: { title: string; body: string };
  /** Config-driven background layer (CMS). When given (even `null`), it replaces `config`'s banner. */
  backdrop?: ReactNode;
  /** "feature": ONE large featured product (the first of `trio`) instead of three small cards (CMS `variant`). */
  variant?: "feature";
  /** The store-wide buy button of the product cards (global `cards`): the hero's cards carry it like every other product card. */
  buy?: CardBuy;
  /** The DOM id of the home's state chooser, or null when the home has none: then the "explore by state" link is left out (never a dead anchor). */
  statesAnchor?: string | null;
  /** "feature" only: the product half's colour (the section's own fill, CMS); absent = a tint of the region's colour. */
  panelColor?: string;
  /** "feature" only: the section's picture (CMS), a banner in the product's place (the product's bar stays over it when there is one). */
  panelImage?: BannerAsset | null;
  /** "feature" only: the products it goes through, each with its own banner (null = the section's picture); absent = the first of `trio`. */
  slides?: { product: HeroFamilyCard; image: BannerAsset | null }[];
  /** "feature" only: how it goes through `slides` (CMS `featuredRotation`); absent = always the first. */
  rotation?: FeaturedRotation;
  /** "feature" only: the colours of the reading half (CMS `heroColors`); absent = the theme's own. */
  colors?: HeroColors;
}) {
  const r = REGIONS[region];
  const background = backdrop === undefined ? usableBannerAsset("hero", config) : null;
  const statesLink = statesAnchor ? (
    <a href={`#${statesAnchor}`} className="link-static font-semibold text-ink decoration-region-primary decoration-2">
      Ou explore por estado.
    </a>
  ) : null;
  const { tone, ink, captionClass, captionStyle, field } = heroTone(colors);
  const classicLines = copy.title.split("\n");
  if (variant === "feature") return <FeatureHero region={region} cityCount={cityCount} slides={slides ?? trio.slice(0, 1).map((product) => ({ product, image: null }))} rotation={rotation} colors={colors} copy={copy} backdrop={backdrop !== undefined ? backdrop : background && <RegionalPhotoSection asset={background} priority />} buy={buy} statesLink={statesLink} panelColor={panelColor} panelImage={panelImage ?? null} />;
  return (
    <section aria-labelledby="hero-title" className="relative isolate">
      {backdrop !== undefined ? backdrop : background && <RegionalPhotoSection asset={background} priority />}
      <div className="wrap pb-8 pt-5 lg:pb-16 lg:pt-12">
        <div className="grid gap-5 lg:grid-cols-12 lg:items-center lg:gap-8">
          {/* Phones: headline, then the search, then the products; the supporting text comes AFTER the cards (`order-*`), so the first
              product enters the first screen. Desktop keeps the original composition: text on the left, the three cards on the right. */}
          <div className={`contents lg:block ${trio.length > 0 ? "lg:col-span-6" : "lg:col-span-8"}`}>
            <div className="order-1">
              <span aria-hidden="true" className="mb-3 block h-[3px] w-12 bg-region-accent lg:mb-4" style={tone("rule") ? { background: tone("rule") } : undefined} />
              <h1 id="hero-title" className="t-display" style={ink("title")}>
                {classicLines.map((line, i) => (
                  <Fragment key={i}>
                    {i > 0 && <br />}
                    {/* This composition has no coloured last line of its own: only when the owner gives the highlight a colour. */}
                    {tone("highlight") && classicLines.length > 1 && i === classicLines.length - 1 ? <span style={ink("highlight")}>{line}</span> : line}
                  </Fragment>
                ))}
              </h1>
              <p className="t-body mt-4 hidden max-w-md text-ink lg:mt-5 lg:block" style={ink("text")}>{copy.body}</p>
            </div>
            <div className="order-2 max-w-xl lg:mt-6">
              <SearchDialog region={region} variant="hero" tone={field} />
            </div>
            <p className={`t-caption regional-caption order-4 lg:order-3 lg:mt-3 ${captionClass}`} style={captionStyle}>
              <span className="lg:hidden">{copy.body} </span>
              {numberPt.format(cityCount)} cidades do {r.name} em camiseta.{statesLink && " "}
              {statesLink}
            </p>
          </div>

          {trio.length > 0 && (
            <ul className={`no-scrollbar order-3 -mx-[var(--gutter)] flex snap-x snap-mandatory scroll-pl-[var(--gutter)] gap-3 overflow-x-auto px-[var(--gutter)] pb-2 md:mx-0 md:grid ${trio.length === 1 ? "md:max-w-[17rem] md:grid-cols-1" : trio.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"} md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:order-none lg:col-span-6`}>
              {trio.map((d, i) => (
                <li key={d.familyId} className={`settle settle-${i + 1} w-[62%] max-w-[17rem] shrink-0 snap-start sm:w-[44%] md:w-auto md:max-w-none`}>
                  {/* The store's one card frame (ProductCard.tsx), on its own ground: the hero sits on a photo. */}
                  <Link
                    href={d.href}
                    className="group flex h-full flex-col overflow-hidden rounded-lg border border-black/15 bg-ground text-ink transition-colors hover:border-black/35 focus-visible:border-region-primary"
                  >
                    <ProductPhoto src={d.imageUrl} alt={`Camiseta ${d.familyName} de ${d.cityName}`} sizes="(min-width: 1024px) 15vw, (min-width: 768px) 28vw, 62vw" priority={i < 2} className="photo-contain">
                      {buy?.style === "fab" && <CardFab label={buy.label} />}
                    </ProductPhoto>
                    <div className="flex grow flex-col p-3 md:p-4">
                      <p className="line-clamp-2 text-[0.9375rem] font-medium leading-[1.3] md:text-base">{d.familyName}</p>
                      {/* Not .t-place: that unlayered class would override the size utilities below. */}
                      <p className="mt-1 font-[family-name:var(--font-serif-stack)] text-[0.95rem] font-medium leading-[1.15] text-ink-mute [overflow-wrap:anywhere]">
                        {d.cityName} · {d.uf}
                      </p>
                      <div className="mt-auto pt-1">
                        {buy?.style === "link" ? (
                          <CardCall label={buy.label} price={d.price ? <p className={CARD_PRICE}><PriceText price={d.price} listPrice={d.listPrice} /></p> : undefined} />
                        ) : (
                          d.price && <p className={CARD_PRICE}><PriceText price={d.price} listPrice={d.listPrice} /></p>
                        )}
                        {buy?.style === "button" && <CardButton label={buy.label} />}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Padding that lines a half-width column up with the page container: on a wide screen the content of a half that runs to the window's edge starts
 * (or ends) exactly where every other section's content does. `100%` is the half's own width (a grid area), so this is (window − container) / 2 + gutter.
 */
const ALIGN_START = "lg:pl-[max(var(--gutter),calc(100%-var(--content-max)/2+var(--gutter)))]";
const ALIGN_END = "lg:pr-[max(var(--gutter),calc(100%-var(--content-max)/2+var(--gutter)))]";

/**
 * The "feature" opening (CMS `variant: "feature"`), the approved editorial direction: the headline (its last line in the region's accent, when the
 * accent reads on the page), its supporting line and the city search on a clean reading half; on the other half, edge to edge, ONE real product on a
 * tint of the region's colour, with its name, place, price and "Ver produto →" on a bar at the foot. The whole half is one link to the same internal
 * product page as the three-card hero. The section's own colour (CMS fill) paints the product half; its picture (CMS image) takes the product's place
 * there as a banner, with the product's bar under it when there is a product.
 *
 * Phones and tablets: the reading area, then the product as ONE compact row on the same tint (a thumbnail beside its name, place, price and call),
 * so it never takes a screen of its own under the search; a picture keeps its band with the product's bar under it. Neither a product nor a picture:
 * the reading area alone.
 */
function FeatureHero({
  region, cityCount, slides, rotation, colors, copy, backdrop, buy, statesLink, panelColor, panelImage,
}: {
  region: RegionSlug;
  cityCount: number;
  slides: { product: HeroFamilyCard; image: BannerAsset | null }[];
  rotation?: FeaturedRotation;
  colors?: HeroColors;
  copy: { title: string; body: string };
  backdrop: ReactNode;
  buy?: CardBuy;
  statesLink: ReactNode;
  panelColor?: string;
  panelImage: BannerAsset | null;
}) {
  const r = REGIONS[region];
  const call = buy?.label ?? DEFAULT_BUY_LABEL;
  const lines = copy.title.split("\n");
  const product = slides[0]?.product;
  const { tone, ink, captionClass, captionStyle, field } = heroTone(colors);
  // One product (or none, or "always the first"): one half, as before. Several, drawn or sliding: one half per product, its own banner or the section's.
  const several = rotation !== undefined && slides.length > 1;
  const panel = several ? (
    <HeroSlides mode={rotation} labels={slides.map((sl) => `${sl.product.familyName}, ${sl.product.cityName} · ${sl.product.uf}`)}>
      {/* A drawn product is not known on the server, so no picture is loaded first; a sliding one, only the first. */}
      {slides.map((sl, i) => <FeaturePanel key={sl.product.familyId} product={sl.product} image={sl.image ?? panelImage} color={panelColor} call={call} priority={rotation === "slide" && i === 0} />)}
    </HeroSlides>
  ) : (
    (product || panelImage) && <FeaturePanel product={product} image={slides[0]?.image ?? panelImage} color={panelColor} call={call} priority />
  );
  return (
    <section aria-labelledby="hero-title" className="relative isolate border-y border-line">
      {backdrop}
      {/* Columns that never grow with their content (minmax(0, 1fr)): the row of sliding products is wider than the screen by design. */}
      <div className={`grid grid-cols-1 ${product || panelImage ? "lg:grid-cols-2" : ""}`}>
        <div className={`flex items-center px-[var(--gutter)] pb-10 pt-8 lg:py-20 lg:pr-14 ${product ? ALIGN_START : "wrap"}`} style={tone("background") ? { background: tone("background") } : undefined}>
          <div className="w-full max-w-[40rem]">
            <span aria-hidden="true" className="mb-4 block h-[3px] w-12 bg-region-accent lg:mb-5" style={tone("rule") ? { background: tone("rule") } : undefined} />
            <h1 id="hero-title" className="t-display" style={ink("title")}>
              {lines.map((line, i) => (
                <Fragment key={i}>
                  {i > 0 && <br />}
                  {/* The last line in the accent: one coloured beat in the headline, never the whole of it. */}
                  {lines.length > 1 && i === lines.length - 1 ? <span className="text-[var(--region-accent-ink,var(--region-primary))]" style={ink("highlight")}>{line}</span> : line}
                </Fragment>
              ))}
            </h1>
            {copy.body && <p className="t-body mt-4 max-w-md text-ink-soft lg:mt-6" style={ink("text")}>{copy.body}</p>}
            <div className="mt-6 max-w-xl lg:mt-8">
              <SearchDialog region={region} variant="hero" arrow tone={field} />
            </div>
            <p className={`t-caption regional-caption mt-3 ${captionClass}`} style={captionStyle}>
              {numberPt.format(cityCount)} cidades do {r.name} em camiseta.{statesLink && " "}
              {statesLink}
            </p>
          </div>
        </div>

        {panel}
      </div>
    </section>
  );
}

/**
 * The owner's colours of the opening's text side (CMS `heroColors`), each only where it was set (the theme's own everywhere else): style per element,
 * the caption's link (it follows the text unless it has a colour of its own) and the search field's frame and arrow.
 */
function heroTone(colors: HeroColors | undefined) {
  const tone = (key: HeroColorKey) => (colors?.[key] ? cssColor(colors[key]!) : undefined);
  const ink = (key: HeroColorKey): CSSProperties | undefined => (tone(key) ? { color: tone(key) } : undefined);
  const link = tone("link") ?? tone("text");
  return {
    tone,
    ink,
    captionClass: link ? "[&_a]:text-[color:var(--hero-link)] [&_a]:decoration-[color:var(--hero-link)]" : "",
    captionStyle: { ...ink("text"), ...(link ? { "--hero-link": link } : {}) } as CSSProperties,
    field: colors?.field ? { frame: cssColor(colors.field), arrow: inkOn(colors.field) } : undefined,
  };
}

/** A legible mark on a colour of the owner's (the search field's arrow on its button): ink on a light colour, white on a dark one. */
function inkOn(color: Color): string {
  if (color === "token:ground") return "var(--ink)";
  if (!HEX_COLOR.test(color)) return "#ffffff"; // the region's primary and the campaign black are dark
  return relativeLuminance(color) > 0.35 ? "#000000" : "#ffffff";
}

/**
 * The product half of the "feature" opening, for one product: its banner (the owner's picture, its own crop and framing per screen) with the product's
 * bar under it, or the product's photo on the tint (a compact row below 1024px); a banner alone when there is no product. `priority`: its picture is
 * the first thing the page loads (false for a product that may not be the one shown).
 */
function FeaturePanel({ product, image, color, call, priority }: { product: HeroFamilyCard | undefined; image: BannerAsset | null; color?: string; call: string; priority: boolean }) {
  return (
    <HeroPanel href={product?.href} color={color} row={!image}>
      {image ? (
        // A banner in the product's place (the owner's picture, its own crop and framing per screen); the product's bar stays under it.
        <span className="relative block min-h-[20rem] flex-1 sm:min-h-[24rem] lg:min-h-0">
          <BannerBackground asset={image} priority={priority} sizes="(min-width: 1024px) 50vw, 100vw" alt={image.alt} />
        </span>
      ) : (
        product && (
          // One picture for every width: a thumbnail in the phone's row, the large photo from 1024px.
          <span className={`flex shrink-0 items-center justify-center py-4 pl-[var(--gutter)] lg:flex-1 lg:py-14 ${ALIGN_END} lg:pl-14`}>
            <span className="block w-24 overflow-hidden rounded-md sm:w-28 lg:w-full lg:max-w-[26rem]">
              <ProductPhoto src={product.imageUrl} alt={`Camiseta ${product.familyName} de ${product.cityName}`} sizes="(min-width: 1024px) 26rem, 7rem" priority={priority} className="photo-contain" />
            </span>
          </span>
        )
      )}
      {product && (
        <span
          className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-2 ${
            image ? "border-t px-[var(--gutter)]" : "min-w-0 flex-1 py-4 pl-4 pr-[var(--gutter)] lg:flex-none lg:border-t lg:pl-14"
          } border-[rgb(var(--region-primary-rgb)/0.18)] py-4 lg:bg-[rgb(var(--region-primary-rgb)/0.07)] ${image ? "bg-[rgb(var(--region-primary-rgb)/0.07)]" : ""} ${ALIGN_END} lg:pl-14 lg:py-5`}
        >
          <span className="min-w-0">
            <span className="block text-[1.0625rem] font-semibold leading-tight lg:text-[1.1875rem]">{product.familyName}</span>
            <span className="mt-1 block font-[family-name:var(--font-serif-stack)] text-[0.95rem] font-medium leading-[1.15] text-ink-mute [overflow-wrap:anywhere]">
              {product.cityName} · {product.uf}
            </span>
          </span>
          <span className="flex items-baseline gap-4">
            {product.price && <span className={CARD_PRICE}><PriceText price={product.price} listPrice={product.listPrice} /></span>}
            <span className="inline-flex min-h-6 items-center gap-1 whitespace-nowrap text-[0.9375rem] font-semibold underline decoration-region-accent decoration-2 underline-offset-4 transition-colors group-hover:decoration-current">
              {call}
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </span>
        </span>
      )}
    </HeroPanel>
  );
}

/**
 * The product half: ONE link to the product page when there is a product (the whole half answers the pointer), a plain block for a banner alone.
 * `row`: the product without a picture, a single row below 1024px (thumbnail beside its bar) and the column of the large photo from there.
 */
function HeroPanel({ href, color, row = false, children }: { href?: string; color?: string; row?: boolean; children: ReactNode }) {
  const className = `group relative isolate flex min-h-full flex-1 ${row ? "flex-row items-center lg:flex-col lg:items-stretch" : "flex-col"} text-ink ${color ? "" : "bg-[rgb(var(--region-primary-rgb)/0.13)]"}`;
  const style = color ? { background: color } : undefined;
  if (!href) return <div className={className} style={style}>{children}</div>;
  return (
    <Link href={href} className={className} style={style}>
      {/* A quiet answer to the pointer over the whole half (the colour is the owner's, so it is darkened, never replaced). */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-black/0 transition-colors group-hover:bg-black/[0.03] group-active:bg-black/[0.06]" />
      {children}
    </Link>
  );
}
