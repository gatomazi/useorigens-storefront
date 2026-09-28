import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StateOutline } from "@/components/brand/StateOutline";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { ProductCarousel } from "@/components/catalog/ProductCarousel";
import { StateCityBrowser, type BrowserCity, type BrowserGroup } from "@/components/city/StateCityBrowser";
import { CitySearch } from "@/components/search/CitySearch";
import { getCatalog } from "@/lib/catalog/repository";
import { bannerFor, usableBannerAsset } from "@/lib/editorial/banners";
import { stateShowcase } from "@/lib/editorial/state-showcase";
import { SOURCES } from "@/lib/analytics/sources";
import { numberPt } from "@/lib/format";
import { localitiesOfRegion, pluralRegioesAdministrativas, stateLocalityCounts, stateLocalityGroups, stateLocalityLabel } from "@/lib/geo/localities";
import { REGIONS, STATE_CAPITAL_SLUG, STATE_NAMES, UF_TO_REGION, isRegionSlug, type RegionSlug } from "@/lib/geo/regions";
import { normalizeText, slugify } from "@/lib/geo/text";
import { isRegionLaunched } from "@/lib/regions/launched";
import { JsonLd } from "@/components/seo/JsonLd";
import { stateDescription, stateIntro, stateTitle } from "@/lib/seo/copy";
import { stateOf } from "@/lib/seo/state-copy";
import { breadcrumbList } from "@/lib/seo/jsonld";
import { pageOpenGraph } from "@/lib/seo/open-graph";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

// No pages are prebuilt: each one is rendered on first request, then cached and revalidated (ISR).
export function generateStaticParams() {
  return [];
}

function resolveState(regionSlug: string, ufParam: string) {
  const uf = ufParam.toUpperCase();
  if (!isRegionSlug(regionSlug) || !isRegionLaunched(regionSlug)) return null;
  return UF_TO_REGION[uf] === regionSlug ? uf : null;
}

/**
 * The state's places that really have products (the same set the page lists): municipalities AND, in the Federal District, administrative
 * regions. The name `cities` in this file is historic: an administrative region is never called a city in what the page shows.
 */
function coveredCitiesOfState(region: RegionSlug, uf: string) {
  const covered = getCatalog().coveredLocalityIds(region);
  return localitiesOfRegion(region).filter((c) => c.uf === uf && covered.has(c.id));
}

/** One real product photo for sharing: the capital's first style, else the first covered city that has one. */
function shareImage(region: RegionSlug, uf: string, cities: ReturnType<typeof coveredCitiesOfState>): string | undefined {
  const catalog = getCatalog();
  const capital = cities.find((c) => c.slug === STATE_CAPITAL_SLUG[uf]);
  for (const city of capital ? [capital, ...cities] : cities.slice(0, 5)) {
    const image = catalog.cityFamilies(city.id)[0]?.primary.imageUrl;
    if (image) return image;
  }
  return undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ region: string; uf: string }> }): Promise<Metadata> {
  const { region, uf: ufParam } = await params;
  const uf = resolveState(region, ufParam);
  if (!uf || !isRegionSlug(region)) return {};
  const cities = coveredCitiesOfState(region, uf);
  const counts = stateLocalityCounts(cities);
  const title = stateTitle(uf, counts.administrativeRegions);
  const description = stateDescription(uf, counts.cities, counts.administrativeRegions);
  const path = `/${region}/${uf.toLowerCase()}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: pageOpenGraph({ title: `${title} | Use Origens`, description, path, imageUrl: shareImage(region, uf, cities) }),
  };
}

export default async function StatePage({ params }: { params: Promise<{ region: string; uf: string }> }) {
  const { region, uf: ufParam } = await params;
  const uf = resolveState(region, ufParam);
  if (!uf || !isRegionSlug(region)) notFound();

  const catalog = getCatalog();
  const cities = coveredCitiesOfState(region, uf);
  const counts = stateLocalityCounts(cities);
  const hasRegions = counts.administrativeRegions > 0;
  const toBrowser = (list: { name: string; slug: string; type: "municipality" | "administrative_region" }[]): BrowserCity[] =>
    list.map((c) => ({ n: c.name, s: c.slug, ...(c.type === "administrative_region" ? { t: "administrative_region" as const } : {}) }));

  // "Destaques de {estado}": real products only, never "Mais vendidas" (no verified period on INK's sales
  // count — see state-showcase.ts). Hidden entirely when there's nothing real to show, never a placeholder.
  const showcase = stateShowcase({ uf, cities, catalog, merch: catalog.merch(region), capitalSlug: STATE_CAPITAL_SLUG[uf] });

  // Editorial mesoregion grouping (ADR 0004), navigation only — not the current IBGE division. Cities
  // without one still appear in A–Z. A state with administrative regions groups them apart from its municipality.
  const groups: BrowserGroup[] = stateLocalityGroups(uf, cities).map((g) => ({
    name: g.name,
    slug: g.slug,
    cities: toBrowser(g.localities.sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))),
    ...(hasRegions && g.slug === "regioes-administrativas" ? { countLabel: pluralRegioesAdministrativas(g.localities.length) } : {}),
  }));

  const byLetter = new Map<string, { name: string; slug: string; type: "municipality" | "administrative_region" }[]>();
  for (const city of [...cities].sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))) {
    const letter = normalizeText(city.name).charAt(0).toUpperCase();
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), city]);
  }
  const letters: BrowserGroup[] = [...byLetter.entries()].map(([letter, list]) => ({ name: letter, slug: `letra-${slugify(letter)}`, cities: toBrowser(list) }));

  // A real state photo ambients the identity header (name, count, map) — never the search below it: an open
  // results list needs a plain ground to stay legible, so it lives in its own quiet strip (docs/decisions/0003).
  const statePhoto = usableBannerAsset("state", bannerFor(region, "state", uf));
  const capital = cities.find((c) => c.slug === STATE_CAPITAL_SLUG[uf]);

  return (
    <>
      <JsonLd data={breadcrumbList(SITE_URL, [{ name: REGIONS[region].name, path: `/${region}` }, { name: STATE_NAMES[uf], path: `/${region}/${uf.toLowerCase()}` }])} />
      <section className="relative isolate">
        {statePhoto && <RegionalPhotoSection asset={statePhoto} priority />}
        <div className={`wrap pb-6 pt-5 lg:pb-8 lg:pt-6 ${statePhoto ? "pb-12 lg:pb-16" : ""}`}>
          <nav aria-label="Você está em" className="t-caption regional-caption">
            <Link href={`/${region}`} className="link-static">
              {REGIONS[region].name}
            </Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{STATE_NAMES[uf]}</span>
          </nav>
          <div className="mt-6 grid items-center gap-6 md:grid-cols-12 md:gap-10">
            <div className="md:col-span-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="t-h1">{STATE_NAMES[uf]}</h1>
                  <p className="t-place mt-3 text-[1.125rem]">
                    {hasRegions ? stateLocalityLabel(counts) : `${numberPt.format(cities.length)} cidades · ${groups.length} regiões`}
                  </p>
                </div>
                <StateOutline uf={uf} className="h-20 w-24 shrink-0 text-ink md:hidden" strokeWidth={2} />
              </div>
            </div>
            <StateOutline uf={uf} className="hidden h-64 w-full max-w-sm justify-self-end text-ink md:col-span-4 md:block" strokeWidth={2} />
          </div>
        </div>
      </section>

      <section className="wrap pb-8 pt-6 lg:pb-12">
        <div className="max-w-2xl">
          <CitySearch region={region} source={SOURCES.stateSearch} />
        </div>
      </section>

      {/* Compact, real showcase — never "Mais vendidas" without a verified period (state-showcase.ts).
          Lives between the search (still the first thing anyone lands on) and the mesoregion browser below,
          so neither the search task nor "find my city" gets buried under a tall product strip. */}
      {showcase.length > 0 && (
        <section className="wrap pb-10 lg:pb-14" aria-labelledby="showcase-title">
          <ProductCarousel
            items={showcase}
            labelledBy="showcase-title"
            title={`Destaques de ${STATE_NAMES[uf]}`}
            intro={hasRegions ? "Camisetas reais de Brasília, das Regiões Administrativas e da identidade do estado — a compra sempre continua na loja." : "Camisetas reais de cidades e da identidade do estado — a compra sempre continua na loja."}
            sourceSection={SOURCES.stateShowcase}
          />
        </section>
      )}

      {/* Short, real context right where the region/A–Z selection starts, with plain links (the region home and the capital when it has products). */}
      <section className="wrap pb-6 lg:pb-8" aria-label={`Sobre as camisetas ${stateOf(uf)}`}>
        <p className="t-body max-w-2xl text-ink-soft">
          {stateIntro(uf, counts.cities, counts.administrativeRegions)}
          {capital && (
            <>
              {" "}
              Comece por{" "}
              <Link href={`/${region}/${uf.toLowerCase()}/${capital.slug}`} className="link-line">
                {capital.name}
              </Link>
              , ou volte ao{" "}
              <Link href={`/${region}`} className="link-line">
                início do {REGIONS[region].name}
              </Link>
              .
            </>
          )}
        </p>
      </section>

      <StateCityBrowser region={region} uf={uf.toLowerCase()} groups={groups} letters={letters} variant={hasRegions ? "localities" : "cities"} />
    </>
  );
}
