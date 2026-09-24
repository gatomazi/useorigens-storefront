import { isSameFill, SectionBackdrop } from "@/components/banners/SectionBackdrop";
import { FamilyGrid } from "@/components/catalog/FamilyGrid";
import { ProductCarousel } from "@/components/catalog/ProductCarousel";
import { Campaign } from "@/components/home/Campaign";
import { RegionHero } from "@/components/home/RegionHero";
import { StateCards } from "@/components/home/StateCards";
import { SOURCES } from "@/lib/analytics/sources";
import type { RegionHome } from "@/lib/home";
import type { RegionSlug } from "@/lib/geo/regions";
import { firstImageSectionId, hasImage, renderableSections, resolveBackground } from "@/lib/site-config/resolve";
import type { Fill, PublishedBundle, Section } from "@/lib/site-config/schema";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { destinationHref, resolveSource, type CategoryLookup } from "@/lib/site-config/sources";

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

export function HomeSections({ region, home, bundle, categories, slugOf }: { region: RegionSlug; home: RegionHome; bundle: PublishedBundle; categories?: CategoryLookup; slugOf?: SlugLookup }) {
  const doc = bundle.docs[region];
  const sections = renderableSections(doc);
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
                trio={home.heroFamilies}
                config={{}}
                copy={s.title && s.subtitle ? { title: s.title, body: s.subtitle } : undefined}
                backdrop={<SectionBackdrop bg={bg} priority={priorityId === s.id} />}
              />
            );

          case "city-styles":
            if (!showcase || !cityPath) return null;
            return (
              <section key={s.id} id={s.anchor} aria-labelledby={s.headingId} className="wrap py-14 lg:py-24">
                <div className="mb-8 max-w-2xl lg:mb-12">
                  <h2 id={s.headingId} className="t-h2">
                    {s.title}
                  </h2>
                  {s.subtitle && <CitySubtitle text={s.subtitle} city={showcase.city.name} />}
                </div>
                <FamilyGrid entries={showcase.families} hrefBase={cityPath} cityName={showcase.city.name} />
              </section>
            );

          case "states":
            return <StateCards key={s.id} region={region} states={home.states} title={s.title} />;

          case "product-carousel":
            return <CarouselSection key={s.id} s={s} bg={bg} priority={priorityId === s.id} editorial={editorial} categories={categories} slugOf={slugOf} />;

          case "campaign": {
            const image = hasImage(bg);
            const useFill = !image && s.fallback === "fill" && bg.fill.kind !== "none";
            return (
              <Campaign
                key={s.id}
                region={region}
                crops={home.campaignCrops}
                config={{}}
                copy={s.title && s.subtitle ? { title: s.title, body: s.subtitle } : undefined}
                backdrop={{
                  node: image || useFill ? <SectionBackdrop bg={bg} priority={priorityId === s.id} /> : null,
                  hasImage: image,
                  showCrops: !image && !useFill,
                }}
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
  slugOf,
}: {
  s: Section;
  bg: ReturnType<typeof resolveBackground>;
  priority: boolean;
  editorial: Parameters<typeof resolveSource>[1];
  categories?: CategoryLookup;
  slugOf?: SlugLookup;
}) {
  if (!s.layout || !s.source || !s.analyticsSource || !s.title) return null;
  const result = resolveSource(s.source, editorial, categories);
  // Empty or unavailable: the section is omitted, exactly as the original home does for a carousel with no items.
  if (result.status !== "ok" || result.items.length === 0) return null;

  const { variant, tone, surface } = s.layout;
  const href = s.cta ? destinationHref(s.cta.dest, slugOf) : null;
  const carousel = (
    <ProductCarousel
      poster={variant === "poster"}
      tone={tone}
      items={result.items}
      labelledBy={s.headingId}
      title={s.title}
      intro={s.subtitle}
      viewAllHref={href ?? undefined}
      viewAllLabel={s.cta?.label}
      sourceSection={SOURCES[s.analyticsSource]}
    />
  );

  if (surface === "paper") {
    return (
      <section id={s.anchor} className="paper">
        <div className="wrap py-14 lg:py-24">{carousel}</div>
      </section>
    );
  }
  if (surface === "region-primary") {
    // The regional block: its photo (when published) is this section's own background, never a slice before it.
    return (
      <section id={s.anchor} className="relative isolate overflow-hidden bg-region-primary text-white">
        {(hasImage(bg) || !isSameFill(bg.fill, NATIVE_FILL[surface])) && <SectionBackdrop bg={bg} priority={priority} nativeFill={NATIVE_FILL[surface]} />}
        <div className="wrap py-14 lg:py-24">{carousel}</div>
      </section>
    );
  }
  return (
    <section id={s.anchor} className="wrap py-14 lg:py-24">
      {carousel}
    </section>
  );
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
