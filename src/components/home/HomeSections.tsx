import { isSameFill, SectionBackdrop } from "@/components/banners/SectionBackdrop";
import { FamilyGrid } from "@/components/catalog/FamilyGrid";
import { ProductCarousel } from "@/components/catalog/ProductCarousel";
import { Campaign } from "@/components/home/Campaign";
import { ImageGrid, type GridTileView } from "@/components/home/ImageGrid";
import { PageHero } from "@/components/home/PageHero";
import { RegionHero } from "@/components/home/RegionHero";
import { Fragment } from "react";
import { StateCards } from "@/components/home/StateCards";
import { PodioTeaser } from "@/components/podio/PodioTeaser";
import { getPodiumLeaders } from "@/lib/podio/server";
import { SOURCES } from "@/lib/analytics/sources";
import { heroCards } from "@/lib/hero-featured";
import type { RegionHome } from "@/lib/home";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import { firstImageSectionId, hasImage, renderableSections, resolveBackground, resolveCustomizerCard, resolveStateCovers } from "@/lib/site-config/resolve";
import type { Fill, Page, PublishedBundle, Section } from "@/lib/site-config/schema";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { destinationHref, resolveSource, type CategoryLookup, type UmaPencaLookup } from "@/lib/site-config/sources";

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
type SlugLookup = (store: CommerceStoreKey, collectionId: number) => string | null;

export function HomeSections({ region, home, bundle, categories, slugOf, umapenca, page }: { region: RegionSlug; home: RegionHome; bundle: PublishedBundle; categories?: CategoryLookup; slugOf?: SlugLookup; umapenca?: UmaPencaLookup; page?: Page }) {
  const doc = bundle.docs[region];
  // A page (hotpage / landing) is drawn by the very same renderer: its sections instead of the home's.
  const sections = page ? page.sections.filter((s) => s.active && s.template !== "footer") : renderableSections(doc);
  const media = bundle.media;
  const priorityId = firstImageSectionId(sections, media);
  const { showcase } = home;
  const cityPath = showcase ? `/${region}/${showcase.city.uf.toLowerCase()}/${showcase.city.slug}` : null;
  const editorial = { terra: home.terra, recreations: home.recreations, lenda: home.feitoParaVoce, dizeres: home.fala, ddd: home.ddd };

  return (
    <>
      {sections.map((s) => {
        const bg = resolveBackground(s.appearance, media);
        switch (s.template) {
          case "hero":
            return (
              <RegionHero
                key={s.id}
                region={region}
                cityCount={home.cityCount}
                trio={heroCards(region, s.featured, home.heroFamilies)}
                config={{}}
                copy={s.title && s.subtitle ? { title: s.title, body: s.subtitle } : undefined}
                backdrop={<SectionBackdrop bg={bg} priority={priorityId === s.id} />}
              />
            );

          case "city-styles": {
            if (!showcase || !cityPath) return null;
            // Only the styles that really exist for the example city (never padded); the configured count is a ceiling.
            // Also only products of THIS region's own INK store, whatever the catalog holds (never a foreign product).
            const ownStore = REGIONS[region].storeKey;
            const entries = showcase.families.filter((f) => f.primary.commerceStoreKey === ownStore).slice(0, s.count ?? 8);
            if (entries.length === 0) return null;
            const content = (
              <>
                <div className="mb-8 max-w-2xl lg:mb-12">
                  <h2 id={s.headingId} className="t-h2">
                    {s.title}
                  </h2>
                  {s.subtitle && <CitySubtitle text={s.subtitle} city={showcase.city.name} />}
                </div>
                <FamilyGrid entries={entries} hrefBase={cityPath} cityName={showcase.city.name} stateUf={showcase.city.uf} sourceSection={SOURCES.homeStyles} directToInk />
              </>
            );
            if (!hasImage(bg) && bg.fill.kind === "none") {
              return (
                <section key={s.id} id={s.anchor} aria-labelledby={s.headingId} className="wrap py-14 lg:py-24">
                  {content}
                </section>
              );
            }
            return (
              <section key={s.id} id={s.anchor} aria-labelledby={s.headingId} className="relative isolate overflow-hidden">
                <SectionBackdrop bg={bg} priority={priorityId === s.id} />
                <div className="wrap py-14 lg:py-24">{content}</div>
              </section>
            );
          }

          case "states": {
            // A state with no covered city has nothing real to open: it is left out rather than linking to an empty page.
            const states = home.states.filter((st) => st.cityCount > 0);
            if (states.length === 0) return null;
            const visual = hasImage(bg) || bg.fill.kind !== "none";
            return (
              <Fragment key={s.id}>
                <StateCards
                  region={region}
                  states={states}
                  title={s.title}
                  subtitle={s.subtitle}
                  anchor={s.anchor}
                  headingId={s.headingId}
                  backdrop={visual ? <SectionBackdrop bg={bg} priority={priorityId === s.id} /> : undefined}
                  covers={resolveStateCovers(s, media)}
                />
                {/* "Quem está no pódio?" follows the state chooser on the home only (never on a hotpage) — docs/storefront/podio.md. */}
                {!page && <PodioTeaser region={region} leaders={getPodiumLeaders(region, states.map((st) => st.uf))} />}
              </Fragment>
            );
          }

          case "page-hero": {
            const ctaHref = s.cta ? destinationHref(s.cta.dest, slugOf, region) : null;
            const visual = hasImage(bg) || bg.fill.kind !== "none";
            return (
              <PageHero
                key={s.id}
                id={s.anchor}
                headingId={s.headingId}
                title={s.title ?? ""}
                subtitle={s.subtitle}
                cta={ctaHref && s.cta ? { label: s.cta.label, href: ctaHref } : undefined}
                tone={s.layout?.tone ?? "dark"}
                backdrop={visual ? <SectionBackdrop bg={bg} priority={priorityId === s.id} /> : undefined}
              />
            );
          }

          case "product-carousel":
            return <CarouselSection key={s.id} s={s} bg={bg} priority={priorityId === s.id} editorial={editorial} categories={categories} umapenca={umapenca} slugOf={slugOf} region={region} card={resolveCustomizerCard(s, doc, media, region)} />;

          case "campaign": {
            const image = hasImage(bg);
            const useFill = !image && s.fallback === "fill" && bg.fill.kind !== "none";
            const ctaHref = s.cta ? destinationHref(s.cta.dest, slugOf, region) : null;
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
            const tiles = gridTiles(s, media, slugOf, region);
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
                backdrop={visual ? <SectionBackdrop bg={bg} priority={priorityId === s.id} /> : undefined}
              />
            );
          }

          case "footer":
            return null; // rendered by the region layout, never as a home section
        }
      })}
    </>
  );
}

function CarouselSection({
  s,
  bg,
  priority,
  editorial,
  categories,
  umapenca,
  slugOf,
  region,
  card,
}: {
  region: RegionSlug;
  /** The customizer card that takes the FIRST position (null: none, or it cannot be shown: then only products). */
  card: ReturnType<typeof resolveCustomizerCard>;
  s: Section;
  bg: ReturnType<typeof resolveBackground>;
  priority: boolean;
  editorial: Parameters<typeof resolveSource>[1];
  categories?: CategoryLookup;
  umapenca?: UmaPencaLookup;
  slugOf?: SlugLookup;
}) {
  if (!s.layout || !s.source || !s.analyticsSource || !s.title) return null;
  const result = resolveSource(s.source, editorial, categories, umapenca);
  // Empty or unavailable: the section is omitted, exactly as the original home does for a carousel with no items.
  if (result.status !== "ok" || result.items.length === 0) return null;
  // With a first card the section keeps its total: 1 customizer card + (total − 1) products, never one more.
  const total = s.source.kind === "editorial-module" ? result.items.length : s.source.limit;
  const items = card ? result.items.slice(0, Math.max(0, total - 1)) : result.items;

  const { variant, tone, surface } = s.layout;
  const href = s.cta ? destinationHref(s.cta.dest, slugOf, region) : null;
  const carousel = (
    <ProductCarousel
      poster={variant === "poster"}
      tone={tone}
      items={items}
      leading={card ?? undefined}
      labelledBy={s.headingId}
      title={s.title}
      intro={s.subtitle}
      viewAllHref={href ?? undefined}
      viewAllLabel={s.cta?.label}
      sourceSection={SOURCES[s.analyticsSource]}
    />
  );

  // A section with a photo or a colour/gradient of its own is drawn as a self-contained block: the background is a layer INSIDE it (never a
  // band between sections) and the text colour follows the tone. Sections with no visual keep exactly the original markup.
  const visual = hasImage(bg) || bg.fill.kind !== "none";
  if (!visual && surface === "paper") {
    return (
      <section id={s.anchor} className="paper">
        <div className="wrap py-14 lg:py-24">{carousel}</div>
      </section>
    );
  }
  if (!visual && surface === "plain") {
    return (
      <section id={s.anchor} className="wrap py-14 lg:py-24">
        {carousel}
      </section>
    );
  }
  const surfaceClass = surface === "region-primary" ? "bg-region-primary" : surface === "paper" ? "paper" : "";
  const toneClass = tone === "dark" ? "text-white" : "";
  return (
    <section id={s.anchor} className={["relative isolate overflow-hidden", surfaceClass, toneClass].filter(Boolean).join(" ")}>
      {(hasImage(bg) || !isSameFill(bg.fill, NATIVE_FILL[surface])) && <SectionBackdrop bg={bg} priority={priority} nativeFill={NATIVE_FILL[surface]} />}
      <div className="wrap py-14 lg:py-24">{carousel}</div>
    </section>
  );
}

/** The grid's tiles with a real link (a tile whose destination cannot be resolved here is left out, never a dead link); a picture the media table does not know falls back to the plain block. */
function gridTiles(s: Section, media: PublishedBundle["media"], slugOf: SlugLookup | undefined, region: RegionSlug): GridTileView[] {
  return (s.tiles ?? []).flatMap((t) => {
    const href = destinationHref(t.dest, slugOf, region);
    if (!href) return [];
    const info = t.image ? media[t.image.assetId] : undefined;
    const picture = info ? { src: info.src, width: info.width, height: info.height, ...(info.variants ? { variants: info.variants } : {}) } : null;
    return [{
      label: t.label,
      caption: t.caption,
      href,
      external: t.dest.kind === "external" || t.dest.kind === "ink-collection",
      image: picture ? { mobile: picture, desktop: picture, alt: "" } : null,
    }];
  });
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
