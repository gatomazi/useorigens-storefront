import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { PriceText } from "@/components/catalog/PriceText";
import { SearchDialog } from "@/components/search/SearchDialog";
import { usableBannerAsset, type BannerConfig } from "@/lib/editorial/banners";
import { numberPt } from "@/lib/format";
import type { HeroFamilyCard } from "@/lib/home";
import { DEFAULT_BUY_LABEL, type CardBuy } from "@/lib/site-config/cards-schema";
import { CardButton, CardCall, CardFab } from "@/components/catalog/CardButton";
import { CARD_PRICE } from "@/components/catalog/ProductCard";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";

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
}) {
  const r = REGIONS[region];
  const background = backdrop === undefined ? usableBannerAsset("hero", config) : null;
  const statesLink = statesAnchor ? (
    <a href={`#${statesAnchor}`} className="link-static font-semibold text-ink decoration-region-primary decoration-2">
      Ou explore por estado.
    </a>
  ) : null;
  if (variant === "feature") return <FeatureHero region={region} cityCount={cityCount} product={trio[0]} copy={copy} backdrop={backdrop !== undefined ? backdrop : background && <RegionalPhotoSection asset={background} priority />} buy={buy} statesLink={statesLink} />;
  return (
    <section aria-labelledby="hero-title" className="relative isolate">
      {backdrop !== undefined ? backdrop : background && <RegionalPhotoSection asset={background} priority />}
      <div className="wrap pb-8 pt-5 lg:pb-16 lg:pt-12">
        <div className="grid gap-5 lg:grid-cols-12 lg:items-center lg:gap-8">
          {/* Phones: headline, then the search, then the products; the supporting text comes AFTER the cards (`order-*`), so the first
              product enters the first screen. Desktop keeps the original composition: text on the left, the three cards on the right. */}
          <div className={`contents lg:block ${trio.length > 0 ? "lg:col-span-6" : "lg:col-span-8"}`}>
            <div className="order-1">
              <span aria-hidden="true" className="mb-3 block h-[3px] w-12 bg-region-accent lg:mb-4" />
              <h1 id="hero-title" className="t-display">
                {copy.title.split("\n").map((line, i) => (
                  <Fragment key={i}>
                    {i > 0 && <br />}
                    {line}
                  </Fragment>
                ))}
              </h1>
              <p className="t-body mt-4 hidden max-w-md text-ink lg:mt-5 lg:block">{copy.body}</p>
            </div>
            <div className="order-2 max-w-xl lg:mt-6">
              <SearchDialog region={region} variant="hero" />
            </div>
            <p className="t-caption regional-caption order-4 lg:order-3 lg:mt-3">
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
 * The "feature" opening (CMS `variant: "feature"`): the headline, its supporting line and the city search on a clean reading area, and ONE real product
 * as a large card beside them (the first eligible featured product; none = the text and the search alone, the layout holds). The photo behind is the
 * section's own background (CMS), under its wash; without one the hero stays on the page ground.
 *
 * The product card is one link (photo, name, place, price and the written call), to the same internal product page as the three-card hero. Phones:
 * headline, search, then the product as a short horizontal card (photo beside its text), so the search and the product both fit the first screen.
 */
function FeatureHero({
  region, cityCount, product, copy, backdrop, buy, statesLink,
}: {
  region: RegionSlug;
  cityCount: number;
  product: HeroFamilyCard | undefined;
  copy: { title: string; body: string };
  backdrop: ReactNode;
  buy?: CardBuy;
  statesLink: ReactNode;
}) {
  const r = REGIONS[region];
  const call = buy?.label ?? DEFAULT_BUY_LABEL;
  return (
    <section aria-labelledby="hero-title" className="relative isolate">
      {backdrop}
      <div className="wrap pb-10 pt-6 lg:pb-16 lg:pt-14">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-center lg:gap-10">
          <div className={product ? "lg:col-span-7" : "lg:col-span-8"}>
            <span aria-hidden="true" className="mb-3 block h-[3px] w-12 bg-region-accent lg:mb-4" />
            <h1 id="hero-title" className="t-display">
              {copy.title.split("\n").map((line, i) => (
                <Fragment key={i}>
                  {i > 0 && <br />}
                  {line}
                </Fragment>
              ))}
            </h1>
            {copy.body && <p className="t-body mt-3 max-w-md text-ink lg:mt-5">{copy.body}</p>}
            <div className="mt-5 max-w-xl lg:mt-7">
              <SearchDialog region={region} variant="hero" />
            </div>
            <p className="t-caption regional-caption mt-3">
              {numberPt.format(cityCount)} cidades do {r.name} em camiseta.{statesLink && " "}
              {statesLink}
            </p>
          </div>

          {product && (
            <div className="lg:col-span-5 lg:justify-self-end lg:w-full lg:max-w-[26rem]">
              <Link
                href={product.href}
                className="group grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] overflow-hidden rounded-lg border border-black/15 bg-ground text-ink transition-colors hover:border-black/40 active:border-black/60 lg:flex lg:flex-col"
              >
                <ProductPhoto src={product.imageUrl} alt={`Camiseta ${product.familyName} de ${product.cityName}`} sizes="(min-width: 1024px) 34vw, 42vw" priority className="photo-contain" />
                <div className="flex min-w-0 flex-col justify-center p-3 sm:p-4 lg:px-5 lg:pb-5 lg:pt-4">
                  <p className="text-[1.0625rem] font-semibold leading-tight lg:text-[1.25rem]">{product.familyName}</p>
                  <p className="mt-1 font-[family-name:var(--font-serif-stack)] text-[0.95rem] font-medium leading-[1.15] text-ink-mute [overflow-wrap:anywhere] lg:text-[1.0625rem]">
                    {product.cityName} · {product.uf}
                  </p>
                  <CardCall label={call} price={product.price ? <p className={CARD_PRICE}><PriceText price={product.price} listPrice={product.listPrice} /></p> : undefined} />
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
