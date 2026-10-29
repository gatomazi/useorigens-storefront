import { isSameFill, SectionBackdrop } from "@/components/banners/SectionBackdrop";
import { productSalesUnits } from "@/lib/podio/server";
import { FamilyGrid } from "@/components/catalog/FamilyGrid";
import { ProductCarousel } from "@/components/catalog/ProductCarousel";
import { CollectionBrowser } from "@/components/catalog/CollectionBrowser";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { Campaign } from "@/components/home/Campaign";
import { PersonalizationLive } from "@/components/customization/PersonalizationLive";
import { CreateYourOwnCard } from "@/components/umapenca/CreateYourOwnCard";
import { personalizationCards } from "@/lib/customization/hub";
import { customizerHref } from "@/lib/site-config/pages";
import { ImageGrid, type GridTileView } from "@/components/home/ImageGrid";
import { PageHero } from "@/components/home/PageHero";
import { PageGround } from "@/components/pages/PageGround";
import { RegionHero } from "@/components/home/RegionHero";
import { Fragment } from "react";
import { StateCards } from "@/components/home/StateCards";
import { StateStrip } from "@/components/home/StateStrip";
import { cssColor } from "@/components/banners/SectionBackdrop";
import { colorTone, fillTone } from "@/lib/site-config/color";
import type { BannerAsset } from "@/lib/editorial/banners";
import { MundoBlocoHome } from "@/components/mundo/entrada/MundoEntradas";
import { mundoEntradasAtivas } from "@/lib/mundo/flag";
import { PodioTeaser } from "@/components/podio/PodioTeaser";
import { getPodiumLeaders } from "@/lib/podio/server";
import { SOURCES } from "@/lib/analytics/sources";
import { CityJourneyTrigger } from "@/components/city-journey/CityJourney";
import { heroCards, heroSlides } from "@/lib/hero-featured";
import type { RegionHome } from "@/lib/home";
import type { RegionSlug } from "@/lib/geo/regions";
import { storeForRegion } from "@/lib/catalog/commerce-mode";
import { customizerFigure, firstImageSectionId, focalToCss, hasImage, mediaFigure, renderableSections, resolveBackground, resolveCustomizerCard, resolveStateCovers } from "@/lib/site-config/resolve";
import { cardBuy, cardButtonOf, type CardBuy } from "@/lib/site-config/cards-schema";
import { carouselEndOf, carouselEndText, type CarouselEndConfig } from "@/lib/site-config/carousel-end-schema";
import { DEFAULT_TILE_CTA, type Color, type Fill, type MediaRef, type Page, type PublishedBundle, type Section } from "@/lib/site-config/schema";
import { Pagination } from "@/components/catalog/Pagination";
import { numberPt } from "@/lib/format";
import { collectionFacets } from "@/lib/search/collection-filter";
import type { ProductSort } from "@/lib/catalog/product-sort";
import { arrangementOf } from "@/lib/site-config/collections-enabled";
import { campaignLeadsNowhere, destinationHref, resolveSource, type CategoryLookup, type CollectionLinks, type CollectionPageLookup, type SourceResult, type UmaPencaLookup } from "@/lib/site-config/sources";

/** A collection page gets its mini search when it has more products than this (fewer fit on one screen anyway). */
const SEARCH_FROM = 12;

const NATIVE_FILL: Record<"paper" | "plain" | "region-primary", Fill> = {
  paper: { kind: "none" },
  plain: { kind: "none" },
  // The "Fala daqui" wrapper already paints the regional primary itself.
  "region-primary": { kind: "solid", color: "token:region-primary" },
};

/**
 * The home, rendered from configuration instead of hard-coded JSX (behind `SITE_CONFIG_HOME=on`, off by default). Sections
 * appear in configured order, inactive ones are skipped, and every template keeps the exact markup of the original home
 * (`src/app/[region]/page.tsx`). Product data still comes from the catalog snapshot through `getRegionHome`; the config only
 * decides copy, order, layout, appearance and which real source feeds each section. Never a free-form page builder.
 */
/** Which page of a paged grid is drawn, and the address of each page (absent in the panel's preview: the numbers are drawn without links). */
export type Paging = { page: number; hrefOf?: (page: number) => string };

export function HomeSections({
  region, home, bundle, categories, collectionPage, links, umapenca, page, paging, compactHero = false,
}: { region: RegionSlug; home: RegionHome; bundle: PublishedBundle; categories?: CategoryLookup; collectionPage?: CollectionPageLookup; links?: CollectionLinks; umapenca?: UmaPencaLookup; page?: Page; paging?: Paging; /** The automatic collection page: short header, product count next to the title. */ compactHero?: boolean }) {
  const doc = bundle.docs[region];
  // The store-wide buy button (Aparência, global): on every product card, unless a section set a text of its own.
  const cardButton = cardButtonOf(bundle);
  // The store-wide last card of the carousels (Aparência, global): "Ver todas as {n} peças dessa coleção", to the section's "Ver todos".
  const carouselEnd = carouselEndOf(bundle);
  // A page (hotpage / landing) is drawn by the very same renderer: its sections instead of the home's.
  const sections = page ? page.sections.filter((s) => s.active && s.template !== "footer") : renderableSections(doc);
  const media = bundle.media;
  const priorityId = firstImageSectionId(sections, media);
  const { showcase } = home;
  const cityPath = showcase ? `/${region}/${showcase.city.uf.toLowerCase()}/${showcase.city.slug}` : null;
  const editorial = { terra: home.terra, recreations: home.recreations, lenda: home.feitoParaVoce, dizeres: home.fala, ddd: home.ddd };
  // A page with a ground of its own (PageGround): text with no surface of its own follows that ground. On a DARK ground, a section that paints a light
  // surface goes back to dark text (`on-light`), and the two sections that have no dark version (city styles, states) sit on paper.
  const pageTone = page?.backdrop?.tone;
  // The hero's "explore by state" link points at the state chooser of THIS page, and only when there is one (never a dead anchor).
  const statesAnchor = sections.find((x) => x.template === "states")?.anchor ?? null;
  const darkPage = pageTone === "dark";
  const paperLayer = <div aria-hidden="true" className="paper absolute inset-0 -z-10" />;

  const rendered = (
    <>
      {sections.map((s, index) => {
        const bg = resolveBackground(s.appearance, media);
        switch (s.template) {
          case "hero": {
            // The "feature" opening: the colour paints the product half, and a picture takes the product's place there as a banner.
            const feature = s.variant === "feature";
            const panelColor = feature && bg.fill.kind !== "none" ? cssColor(bg.fill.kind === "solid" ? bg.fill.color : bg.fill.from) : undefined;
            return (
              <RegionHero
                key={s.id}
                region={region}
                cityCount={home.cityCount}
                trio={heroCards(region, s.featured, home.heroFamilies)}
                config={{}}
                copy={s.title && s.subtitle ? { title: s.title, body: s.subtitle } : undefined}
                backdrop={feature ? null : <SectionBackdrop bg={bg} priority={priorityId === s.id} />}
                variant={feature ? "feature" : undefined}
                buy={cardButton}
                statesAnchor={statesAnchor}
                panelColor={panelColor}
                panelImage={feature ? splitFigure(bg) : null}
                slides={feature ? heroSlides(region, s.featured, home.heroFamilies).map((sl) => ({ product: sl.card, image: mediaFigure(sl.image, media), ...(sl.pins ? { pins: sl.pins } : {}) })) : undefined}
                rotation={feature ? s.featuredRotation : undefined}
                colors={s.heroColors}
              />
            );
          }

          case "city-styles": {
            if (!showcase || !cityPath) return null;
            // Only the styles that really exist for the example city (never padded); the configured count is a ceiling.
            // Also only products of THIS region's own INK store, whatever the catalog holds (never a foreign product).
            const ownStore = storeForRegion(region);
            const entries = showcase.families.filter((f) => f.primary.commerceStoreKey === ownStore).slice(0, s.count ?? 8);
            if (entries.length === 0) return null;
            const split = s.variant === "split" || s.variant === "list";
            const content = split ? (
              // The heading in a column of its own beside the cards (split: three across from 768px, a row that scrolls on phones; list: the styles'
              // names with ONE card beside them, the style chosen).
              <div className="grid gap-6 md:gap-8 lg:grid-cols-12 lg:gap-10">
                <div className="lg:col-span-4 xl:col-span-3">
                  <h2 id={s.headingId} className="t-h2">
                    {s.title}
                  </h2>
                  {s.subtitle && <CitySubtitle text={s.subtitle} city={showcase.city.name} />}
                  <div className="mt-3">
                    <CityJourneyTrigger variant="link" />
                  </div>
                </div>
                <div className="min-w-0 lg:col-span-8 xl:col-span-9">
                  <FamilyGrid entries={entries} hrefBase={cityPath} cityName={showcase.city.name} stateUf={showcase.city.uf} sourceSection={SOURCES.homeStyles} directToInk buy={cardButton} layout={s.variant === "list" ? "pick" : "split"} />
                </div>
              </div>
            ) : (
              <>
                <div className="mb-8 max-w-2xl lg:mb-12">
                  <h2 id={s.headingId} className="t-h2">
                    {s.title}
                  </h2>
                  {s.subtitle && <CitySubtitle text={s.subtitle} city={showcase.city.name} />}
                  {/* The styles are shown on ONE example city: a quiet way to the visitor's own, through the same journey as the header's "Sua cidade". */}
                  <div className="mt-3">
                    <CityJourneyTrigger variant="link" />
                  </div>
                </div>
                <FamilyGrid entries={entries} hrefBase={cityPath} cityName={showcase.city.name} stateUf={showcase.city.uf} sourceSection={SOURCES.homeStyles} directToInk buy={cardButton} />
              </>
            );
            const visual = hasImage(bg) || bg.fill.kind !== "none";
            if (!visual && !darkPage) {
              return (
                <section key={s.id} id={s.anchor} aria-labelledby={s.headingId} className="wrap py-14 lg:py-24">
                  {content}
                </section>
              );
            }
            return (
              <section key={s.id} id={s.anchor} aria-labelledby={s.headingId} className={`relative isolate overflow-hidden ${darkPage ? "on-light" : ""}`}>
                {visual ? <SectionBackdrop bg={bg} priority={priorityId === s.id} /> : paperLayer}
                <div className="wrap py-14 lg:py-24">{content}</div>
              </section>
            );
          }

          case "states": {
            // A state with no covered city has nothing real to open: it is left out rather than linking to an empty page.
            const states = home.states.filter((st) => st.cityCount > 0);
            if (states.length === 0) return null;
            const visual = hasImage(bg) || bg.fill.kind !== "none";
            const backdrop = visual ? <SectionBackdrop bg={bg} priority={priorityId === s.id} /> : darkPage ? paperLayer : undefined;
            return (
              <Fragment key={s.id}>
                {s.variant === "strip" ? (
                  <StateStrip region={region} states={states} title={s.title ?? "Escolha o seu estado"} subtitle={s.subtitle} anchor={s.anchor} headingId={s.headingId} backdrop={backdrop} className={darkPage ? "on-light" : undefined} />
                ) : (
                <StateCards
                  region={region}
                  states={states}
                  title={s.title}
                  subtitle={s.subtitle}
                  anchor={s.anchor}
                  headingId={s.headingId}
                  backdrop={backdrop}
                  className={darkPage ? "on-light" : undefined}
                  covers={resolveStateCovers(s, media)}
                />
                )}
                {/* "Meu Pequeno Mundo" right after the state chooser, on the home only, when its entries are on (src/lib/mundo/flag.ts). */}
                {!page && mundoEntradasAtivas() && <MundoBlocoHome region={region} />}
                {/* "Quem está no pódio?" follows the state chooser on the home only (never on a hotpage), unless the region switched it off — docs/storefront/podio.md. */}
                {!page && <PodioTeaser region={region} leaders={getPodiumLeaders(region, states.map((st) => st.uf), doc)} spaced={s.variant === "strip"} />}
              </Fragment>
            );
          }

          case "page-hero": {
            const ctaHref = s.cta ? destinationHref(s.cta.dest, links, region) : null;
            const visual = hasImage(bg) || bg.fill.kind !== "none";
            // Without a background of its own the hero sits on the page's ground, so its text follows that ground.
            const tone = !visual && pageTone ? pageTone : s.layout?.tone ?? "dark";
            // The compact header says how many products the page's grid has, right next to the title.
            const grid = compactHero ? sections.find((g) => g.active && g.layout?.display === "paged" && g.source?.kind === "ink-category") : undefined;
            const gridResult = grid?.source?.kind === "ink-category" && collectionPage ? collectionPage(grid.source, 1) : null;
            const total = gridResult?.status === "ok" ? gridResult.total : null;
            return (
              <PageHero
                key={s.id}
                id={s.anchor}
                headingId={s.headingId}
                title={s.title ?? ""}
                subtitle={s.subtitle}
                cta={ctaHref && s.cta ? { label: s.cta.label, href: ctaHref } : undefined}
                tone={tone}
                compact={compactHero}
                aside={total !== null ? <p className={`t-small pb-1 ${tone === "dark" ? "text-white/85" : "text-ink-soft"}`}>{total === 1 ? "1 produto" : `${numberPt.format(total)} produtos`}</p> : undefined}
                className={darkPage && visual && tone === "light" ? "on-light" : undefined}
                backdrop={visual ? <SectionBackdrop bg={bg} priority={priorityId === s.id} /> : undefined}
              />
            );
          }

          case "product-carousel": {
            const source = s.source;
            const manual = source?.kind === "ink-category" && arrangementOf(doc, source.store, source.collectionId, source)?.productIds?.length;
            const configuredSort = manual ? "collection" : source?.sort ?? page?.defaultSort ?? "collection";
            const defaultSort = configuredSort === "best-selling" && productSalesUnits(region) === null ? "collection" : configuredSort;
            const effective = source ? { ...s, source: { ...source, sort: defaultSort } } : s;
            return <CarouselSection key={s.id} eager={index < 2} s={effective} defaultSort={defaultSort} bg={bg} priority={priorityId === s.id} editorial={editorial} editorialCatalog={home.editorialCatalog} categories={categories} collectionPage={collectionPage} paging={paging} umapenca={umapenca} links={links} region={region} card={resolveCustomizerCard(s, doc, media, region)} pageTone={pageTone} cardButton={cardButton} carouselEnd={carouselEnd} searchSlug={page?.kind === "categoryLanding" && paging?.hrefOf ? page.slug : undefined} compact={compactHero} />;
          }

          case "campaign": {
            if (campaignLeadsNowhere(s, links, region)) return null;
            const image = hasImage(bg);
            const useFill = !image && s.fallback === "fill" && bg.fill.kind !== "none";
            const ctaHref = s.cta ? destinationHref(s.cta.dest, links, region) : null;
            if (s.variant === "split") {
              // The picture becomes the figure half (its own crop and framing per screen); the fill paints the text half (the region's colour when none).
              // No picture of its own and a button to a personalisation model ("Localidade"): the model's own picture.
              const figure = splitFigure(bg) ?? (s.cta?.dest.kind === "customizer" ? customizerFigure(doc, media, s.cta.dest.customizerId) : null);
              const panelFill = bg.fill.kind === "none" ? null : <SectionBackdrop bg={{ ...bg, images: { mobile: null, desktop: null } }} />;
              // Without a picture, the shirts the button leads to stand in (the first two of its collection, real photos), else the home's own crops.
              const dest = s.cta?.dest;
              const found = !figure && dest && (dest.kind === "collection-page" || dest.kind === "ink-collection") && categories ? categories({ kind: "ink-category", store: dest.store, collectionId: dest.collectionId, order: "category", limit: 2 }) : null;
              const shirts = found?.status === "ok" && found.items.length >= 2 ? found.items.slice(0, 2).map((item) => ({ imageUrl: item.imageUrl, family: item.id })) : home.campaignCrops;
              return (
                <Campaign
                  key={s.id}
                  region={region}
                  crops={shirts}
                  config={{}}
                  copy={s.title ? { title: s.title, body: s.subtitle ?? "" } : undefined}
                  anchor={s.anchor}
                  headingId={s.headingId}
                  cta={ctaHref && s.cta ? { label: s.cta.label, href: ctaHref } : undefined}
                  split={{ figure, panel: panelFill, panelTone: fillTone(bg.fill) }}
                />
              );
            }
            return (
              <Campaign
                key={s.id}
                region={region}
                crops={home.campaignCrops}
                config={{}}
                copy={s.title ? { title: s.title, body: s.subtitle ?? "" } : undefined}
                anchor={s.anchor}
                headingId={s.headingId}
                cta={ctaHref && s.cta ? { label: s.cta.label, href: ctaHref } : undefined}
                backdrop={{
                  node: image || useFill ? <SectionBackdrop bg={bg} priority={priorityId === s.id} /> : null,
                  hasImage: image,
                  showCrops: !image && !useFill,
                }}
              />
            );
          }

          case "image-grid": {
            if (!s.title || !s.grid) return null;
            const tiles = gridTiles(s, media, links, region, categories);
            if (tiles.length === 0) return null;
            const visual = hasImage(bg) || bg.fill.kind !== "none";
            return (
              <ImageGrid
                key={s.id}
                anchor={s.anchor}
                headingId={s.headingId}
                title={s.title}
                subtitle={s.subtitle}
                tiles={tiles}
                layout={s.grid}
                className={darkPage && visual ? "on-light" : undefined}
                backdrop={visual ? <SectionBackdrop bg={bg} priority={priorityId === s.id} /> : undefined}
              />
            );
          }

          case "personalization-live": {
            // The region's own model (a followed page already points to it); without it, or without an art, the block is not shown.
            const model = s.live ? doc?.customizers?.find((m) => m.id === s.live!.customizerId && m.active) : undefined;
            const templateId = model?.studioArts?.[0]?.versions[0]?.templateId;
            if (!s.live || !model || !templateId) return null;
            const ref = model.cardImage ?? model.pageMockup;
            const info = ref ? media[ref.assetId] : undefined;
            const panelFill = bg.fill.kind === "none" ? null : <SectionBackdrop bg={{ ...bg, images: { mobile: null, desktop: null } }} />;
            return (
              <PersonalizationLive
                key={s.id}
                slug={model.slug}
                href={customizerHref(region, model)}
                baseUrl={`/api/personalizar/${region}/${model.slug}/base/${templateId}`}
                title={s.title ?? model.name}
                subtitle={s.subtitle}
                button={s.live.button}
                examples={s.live.examples}
                poster={ref && info ? { src: info.variants?.at(-1)?.src ?? info.src, width: info.width, height: info.height, alt: ref.decorative ? "" : ref.alt || model.name } : null}
                panel={panelFill}
                panelTone={fillTone(bg.fill)}
                anchor={s.anchor}
                headingId={s.headingId}
                opening={Boolean(page) && !sections.some((x) => x.template === "page-hero") && sections.find((x) => x.template === "personalization-live")?.id === s.id}
              />
            );
          }

          case "personalization-models": {
            const cards = personalizationCards(doc, media, region);
            if (cards.length === 0) return null;
            return (
              <section key={s.id} id={s.anchor} aria-labelledby={s.headingId} className="wrap py-12 lg:py-16">
                <h2 id={s.headingId} className={s.title ? "text-[1.5rem] font-extrabold tracking-tight lg:text-[1.875rem]" : "sr-only"}>{s.title ?? "Estampas personalizáveis"}</h2>
                {s.subtitle && <p className="t-body mt-2 max-w-[60ch] text-ink-soft">{s.subtitle}</p>}
                <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:mt-10 lg:grid-cols-4">
                  {cards.map((card) => (
                    <li key={card.id}><CreateYourOwnCard card={card} sizes="(min-width: 1024px) 25vw, 50vw" cta="Personalizar" /></li>
                  ))}
                </ul>
              </section>
            );
          }

          case "footer":
            return null; // rendered by the region layout, never as a home section
        }
      })}
    </>
  );
  return page?.backdrop ? <PageGround backdrop={page.backdrop} media={media}>{rendered}</PageGround> : rendered;
}

function CarouselSection({
  s,
  bg,
  priority,
  editorial,
  editorialCatalog,
  defaultSort = "collection",
  categories,
  collectionPage,
  paging,
  umapenca,
  links,
  region,
  card,
  pageTone,
  cardButton,
  carouselEnd,
  searchSlug,
  compact = false,
  eager,
}: {
  region: RegionSlug;
  /** The section is one of the page's first two: its first pictures load right away; below the fold, every picture waits (lazy). */
  eager: boolean;
  /** The automatic collection page: the grid's own heading is left out (the page header already names the collection and counts its products). */
  compact?: boolean;
  /** The store-wide buy button (global `cards`); the section's own button (text and style) wins. */
  cardButton?: CardBuy;
  /** The store-wide last card of the carousels (global `carouselEnd`); absent = the row ends at its last product. */
  carouselEnd?: CarouselEndConfig;
  /** The address of the collection page this paged grid is on, live (never in the panel's preview): it gets the mini search. */
  searchSlug?: string;
  /** The ground of the page the section is on, when that page has one of its own (PageGround). */
  pageTone?: "light" | "dark";
  /** The customizer card that takes the FIRST position (null: none, or it cannot be shown: then only products). */
  card: ReturnType<typeof resolveCustomizerCard>;
  s: Section;
  bg: ReturnType<typeof resolveBackground>;
  priority: boolean;
  editorial: Parameters<typeof resolveSource>[1];
  editorialCatalog?: Parameters<typeof resolveSource>[4];
  defaultSort?: ProductSort;
  categories?: CategoryLookup;
  collectionPage?: CollectionPageLookup;
  paging?: Paging;
  umapenca?: UmaPencaLookup;
  links?: CollectionLinks;
}) {
  if (!s.layout || !s.source || !s.analyticsSource || !s.title) return null;
  // A paged grid (a collection page) shows ONE page of every product of its collection; anything else, the section's first products.
  const paged = s.layout.display === "paged" && s.source.kind === "ink-category" ? (collectionPage ? collectionPage(s.source, paging?.page ?? 1) : ({ status: "unavailable", reason: "ink-collections-not-synced" } as const)) : null;
  const result: SourceResult = paged ?? resolveSource(s.source, editorial, categories, umapenca, editorialCatalog, productSalesUnits(region));
  // Empty or unavailable: the section is omitted, exactly as the original home does for a carousel with no items.
  if (result.status !== "ok" || result.items.length === 0) return null;
  // With a first card the section keeps its total: 1 customizer card + (total − 1) products, never one more (a paged grid has no first card).
  const total = s.source.kind === "editorial-module" ? result.items.length : s.source.limit;
  const items = card && !paged ? result.items.slice(0, Math.max(0, total - 1)) : result.items;

  const { variant, surface } = s.layout;
  // A section with a photo or a colour/gradient of its own is drawn as a self-contained block: the background is a layer INSIDE it (never a
  // band between sections) and the text colour follows the tone. Sections with no visual keep exactly the original markup.
  const visual = hasImage(bg) || bg.fill.kind !== "none";
  const ownSurface = visual || surface !== "plain";
  // With no surface of its own the text sits on the page's ground: on a page with a ground of its own it follows that ground, whatever the section says.
  const tone = !ownSurface && pageTone ? pageTone : s.layout.tone;
  // A light surface of its own on a dark page: back to dark text.
  const onLight = pageTone === "dark" && ownSurface && tone === "light" ? "on-light" : "";
  // A paged grid already IS every product: no "Ver todos" there.
  const href = s.cta && !paged ? destinationHref(s.cta.dest, links, region) : null;
  // The last card counts the products only where the "Ver todos" opens a collection page of the site: the very products that page lists (the same lookup).
  const carouselRow = s.layout.display !== "grid" && carouselEnd;
  const destination = carouselRow && href && s.cta?.dest.kind === "collection-page" && collectionPage ? collectionPage({ kind: "ink-category", store: s.cta.dest.store, collectionId: s.cta.dest.collectionId, order: "category", limit: 1 }, 1) : null;
  const endLabel = carouselRow && href ? carouselEndText(carouselRow.label, destination?.status === "ok" ? destination.total : null) : undefined;
  // Carousel (a row that scrolls) or grid (every card on the page): same heading, cards and click tracking.
  const Display = s.layout.display === "grid" ? ProductGrid : ProductCarousel;
  const pages = paged?.status === "ok" ? paged : null;
  const buy = cardBuy(s.layout.buyLabel, s.layout.buyStyle) ?? cardButton;
  const pagedGrid = pages && {
    poster: variant === "poster",
    tone,
    labelledBy: s.headingId,
    title: s.title,
    intro: s.subtitle,
    sourceSection: SOURCES[s.analyticsSource],
    buy,
    tags: s.layout.tags,
    solidCards: hasImage(bg),
  };
  // Both elements cross into the mini search (a client component), which renders them among its own children: each carries a key of its own.
  // The compact page already counts the products in its header: next to the grid only the page number remains.
  const pagedAside = pages && (compact ? pages.pageCount > 1 : true) && (
    <p key="count" className={`t-small ${tone === "dark" ? "text-white/85" : "text-ink-soft"}`}>
      {compact ? `página ${pages.page} de ${pages.pageCount}` : `${pages.total === 1 ? "1 produto" : `${numberPt.format(pages.total)} produtos`}${pages.pageCount > 1 ? ` · página ${pages.page} de ${pages.pageCount}` : ""}`}
    </p>
  );
  const pagedFooter = pages && <Pagination key="pages" page={pages.page} pageCount={pages.pageCount} hrefOf={paging?.hrefOf} label={`Páginas de ${s.title}`} dark={tone === "dark"} className="mt-10 justify-center lg:mt-14" />;
  // The facets of the WHOLE collection (every page), counted here on the server: what the filters offer before anything is chosen.
  const everyCard = pages && searchSlug && s.source.kind === "ink-category" && collectionPage ? collectionPage({ ...s.source, limit: Number.MAX_SAFE_INTEGER }, 1) : null;
  const facets = everyCard?.status === "ok" ? collectionFacets(everyCard.items, {}) : null;
  const carousel = pages && pagedGrid ? (
    // A collection with more than a screenful of products gets its own search and filters, over every page of it; so does a smaller one with products
    // of more than one state (a state page's "Ver todos" opens it filtered to that state).
    searchSlug && facets && (pages.total > SEARCH_FROM || facets.state.length > 1) ? (
      <CollectionBrowser key={`${searchSlug}-${defaultSort}`} defaultSort={defaultSort} region={region} slug={searchSlug} grid={{ ...pagedGrid, compact }} items={items} aside={pagedAside} footer={pagedFooter} facets={facets} bestSelling={productSalesUnits(region) !== null} />
    ) : (
      <ProductGrid {...pagedGrid} compact={compact} items={items} aside={pagedAside} footer={pagedFooter} />
    )
  ) : (
    <Display
      poster={variant === "poster"}
      tone={tone}
      items={items}
      leading={card ?? undefined}
      labelledBy={s.headingId}
      title={s.title}
      intro={s.subtitle}
      viewAllHref={href ?? undefined}
      viewAllLabel={s.cta?.label}
      endLabel={endLabel}
      sourceSection={SOURCES[s.analyticsSource]}
      buy={buy}
      tags={s.layout.tags}
      solidCards={hasImage(bg)}
      eager={eager}
    />
  );

  if (!visual && surface === "paper") {
    return (
      <section id={s.anchor} className={["paper [--card-fill:transparent]", onLight].filter(Boolean).join(" ")}>
        <div className="wrap py-14 lg:py-24">{carousel}</div>
      </section>
    );
  }
  if (!visual && surface === "plain") {
    return (
      <section id={s.anchor} className={compact ? "wrap pb-14 pt-6 lg:pb-24 lg:pt-8" : "wrap py-14 lg:py-24"}>
        {carousel}
      </section>
    );
  }
  const surfaceClass = surface === "region-primary" ? "bg-region-primary" : surface === "paper" ? "paper" : "";
  const toneClass = tone === "dark" ? "text-white" : "";
  return (
    <section id={s.anchor} className={["relative isolate overflow-hidden [--card-fill:transparent]", surfaceClass, toneClass, onLight].filter(Boolean).join(" ")}>
      {(hasImage(bg) || !isSameFill(bg.fill, NATIVE_FILL[surface])) && <SectionBackdrop bg={bg} priority={priority} nativeFill={NATIVE_FILL[surface]} />}
      <div className="wrap py-14 lg:py-24">{carousel}</div>
    </section>
  );
}

/**
 * The grid's tiles with a real link (a tile whose destination cannot be resolved here is left out, never a dead link); a picture the media table does
 * not know falls back to the plain block. A "product" tile shows the FIRST product of its destination collection, in the region's own order (the same
 * lookup the product sections use: this store's catalog snapshot, never a copy); none resolved = the card keeps its colour and text.
 */
function gridTiles(s: Section, media: PublishedBundle["media"], links: CollectionLinks | undefined, region: RegionSlug, categories?: CategoryLookup): GridTileView[] {
  const pictureOf = (ref: MediaRef | undefined) => {
    const info = ref ? media[ref.assetId] : undefined;
    return info ? { src: info.src, width: info.width, height: info.height, ...(info.variants ? { variants: info.variants } : {}) } : null;
  };
  return (s.tiles ?? []).flatMap((t) => {
    const href = destinationHref(t.dest, links, region);
    if (!href) return [];
    const picture = pictureOf(t.image);
    const styled = t.format === "product" || t.format === "banner";
    const view: GridTileView = {
      label: t.label,
      caption: t.caption,
      href,
      external: t.dest.kind === "external" || t.dest.kind === "ink-collection",
      image: null,
      ...(t.cta || styled ? { cta: t.cta ?? DEFAULT_TILE_CTA } : {}),
      ...(t.veil ? { veil: t.veil } : {}),
    };
    if (t.format === "banner") {
      const mobile = pictureOf(t.imageMobile) ?? picture;
      const desktop = picture ?? mobile;
      const focal = t.focal ?? { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } };
      return [{
        ...view,
        format: "banner",
        image: mobile && desktop ? { mobile, desktop, alt: t.image && !t.image.decorative ? t.image.alt : "", focal: focalToCss(focal.mobile), focalDesktop: focalToCss(focal.desktop) } : null,
        color: tileColor(t.color),
        tone: t.tone ?? colorTone(t.color),
      }];
    }
    if (t.format === "product") {
      const dest = t.dest;
      const found = (dest.kind === "collection-page" || dest.kind === "ink-collection") && categories ? categories({ kind: "ink-category", store: dest.store, collectionId: dest.collectionId, order: "category", limit: 1 }) : null;
      const first = found?.status === "ok" ? found.items[0] : undefined;
      return [{ ...view, format: "product", product: first ? { imageUrl: first.imageUrl } : null, color: tileColor(t.color), tone: t.tone ?? colorTone(t.color) }];
    }
    return [{ ...view, image: picture ? { mobile: picture, desktop: picture, alt: "" } : null }];
  });
}

/** A collection card's colour as CSS (the region's colour when none). */
const tileColor = (color: Color | undefined): string => cssColor(color ?? "token:region-primary");

/** The split campaign's figure: the section's picture, each screen with its own crop and framing (null: no picture, the shirts stand in). */
function splitFigure(bg: ReturnType<typeof resolveBackground>): BannerAsset | null {
  const mobile = bg.images.mobile ?? bg.images.desktop;
  const desktop = bg.images.desktop ?? bg.images.mobile;
  if (!mobile || !desktop) return null;
  const alt = !desktop.decorative ? desktop.alt : "";
  const pic = (i: NonNullable<typeof mobile>) => ({ src: i.src, width: i.width, height: i.height, ...(i.variants ? { variants: i.variants } : {}) });
  return { mobile: pic(mobile), desktop: pic(desktop), alt, focal: focalToCss(bg.focal.mobile), focalDesktop: focalToCss(bg.focal.desktop) };
}

/**
 * The subtitle with its `{city}` placeholder filled in. Rendered as separate text nodes around the name (like the original JSX
 * does), not one joined string: the browser shapes text per node, so a single node would shift glyph positions by a sub-pixel.
 */
function CitySubtitle({ text, city }: { text: string; city: string }) {
  const [before, ...rest] = text.split("{city}");
  return (
    <p className="t-body mt-3 text-ink-soft">
      {before}
      {rest.length > 0 && city}
      {rest.join("{city}")}
    </p>
  );
}
