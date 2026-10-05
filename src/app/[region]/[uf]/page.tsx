import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StateOutline } from "@/components/brand/StateOutline";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { ProductCarousel } from "@/components/catalog/ProductCarousel";
import { StateCityBrowser, type BrowserCity, type BrowserGroup } from "@/components/city/StateCityBrowser";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { StatePodium } from "@/components/podio/StatePodium";
import { getStatePodium } from "@/lib/podio/server";
import { getCatalog } from "@/lib/catalog/repository";
import { bannerFor, usableBannerAsset } from "@/lib/editorial/banners";
import { stateShowcase } from "@/lib/editorial/state-showcase";
import { SOURCES } from "@/lib/analytics/sources";
import { numberPt } from "@/lib/format";
import { localitiesOfRegion, pluralLocalidades, stateLocalityCounts, stateLocalityGroups, stateLocalityLabel } from "@/lib/geo/localities";
import { REGIONS, STATE_CAPITAL_SLUG, STATE_NAMES, UF_TO_REGION, isRegionSlug, type RegionSlug } from "@/lib/geo/regions";
import { normalizeText, slugify } from "@/lib/geo/text";
import { isRegionLaunched } from "@/lib/regions/launched";
import { JsonLd } from "@/components/seo/JsonLd";
import { stateDescription, stateIntro, stateTitle } from "@/lib/seo/copy";
import { stateOf } from "@/lib/seo/state-copy";
import { breadcrumbList } from "@/lib/seo/jsonld";
import { pageOpenGraph } from "@/lib/seo/open-graph";
import { SITE_URL } from "@/lib/site";
import { pageShare } from "@/lib/share/server";
import { ShareButton } from "@/components/share/ShareButton";

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
  // Federal District: the administrative regions are the places, so no place (Brasília) is put first.
  const capital = cities.some((c) => c.type === "administrative_region") ? undefined : cities.find((c) => c.slug === STATE_CAPITAL_SLUG[uf]);
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
  // In the Federal District the administrative regions are the places: the showcase is THEIR products (one per region, by real sales signal
  // then A–Z), with no "capital" put first and no product of the municipality of Brasília among them.
  const showcase = stateShowcase({
    uf,
    cities: hasRegions ? cities.filter((c) => c.type === "administrative_region") : cities,
    catalog,
    merch: catalog.merch(region),
    capitalSlug: hasRegions ? undefined : STATE_CAPITAL_SLUG[uf],
  });

  // Editorial mesoregion grouping (ADR 0004), navigation only — not the current IBGE division. Cities
  // without one still appear in A–Z. A state with administrative regions groups them apart from its municipality.
  const groups: BrowserGroup[] = stateLocalityGroups(uf, cities).map((g) => ({
    name: g.name,
    slug: g.slug,
    cities: toBrowser(g.localities.sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))),
  }));

  const byLetter = new Map<string, { name: string; slug: string; type: "municipality" | "administrative_region" }[]>();
  for (const city of [...cities].sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))) {
    const letter = normalizeText(city.name).charAt(0).toUpperCase();
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), city]);
  }
  const letters: BrowserGroup[] = [...byLetter.entries()].map(([letter, list]) => ({
    name: letter,
    slug: `letra-${slugify(letter)}`,
    cities: toBrowser(list),
    ...(hasRegions ? { countLabel: pluralLocalidades(list.length) } : {}),
  }));

  // A real state photo ambients the identity header (name, count, map) — never the search below it: an open
  // results list needs a plain ground to stay legible, so it lives in its own quiet strip (docs/decisions/0003).
  const statePhoto = usableBannerAsset("state", bannerFor(region, "state", uf));
  const capital = hasRegions ? undefined : cities.find((c) => c.slug === STATE_CAPITAL_SLUG[uf]);
  const podium = getStatePodium(region, uf);

  // The state's canonical URL — the same path its metadata declares, never the visitor's current one.
  const share = pageShare(`/${region}/${uf.toLowerCase()}`, stateTitle(uf, counts.administrativeRegions));

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
                  {share && <ShareButton share={share} variant="inline" className="mt-3 -ml-0.5" />}
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
          <GlobalSearch region={region} source={SOURCES.stateSearch} />
        </div>
      </section>

      {/* Compact, real showcase — never "Mais vendidas" without a verified period (state-showcase.ts).
          Lives between the search (still the first thing anyone lands on) and the mesoregion browser below,
          so neither the search task nor "find my city" gets buried under a tall product strip. */}
      {showcase.length > 0 && (
        <section id="camisetas" className="wrap pb-10 lg:pb-14" aria-labelledby="showcase-title">
          <ProductCarousel
            items={showcase}
            labelledBy="showcase-title"
            title={`Destaques de ${STATE_NAMES[uf]}`}
            intro={hasRegions ? "Camisetas reais das localidades do Distrito Federal e da identidade do estado — a compra sempre continua na loja." : "Camisetas reais de cidades e da identidade do estado — a compra sempre continua na loja."}
            sourceSection={SOURCES.stateShowcase}
          />
        </section>
      )}

      {/* "O Pódio": right after the first product showcase, before the editorial context (docs/storefront/podio.md). Absent when there is
          no fresh snapshot or no eligible sale in this UF. Its CTA goes back up to the showcase, or down to the places list without one. */}
      {podium && <StatePodium podium={podium} productsAnchor={showcase.length > 0 ? "camisetas" : "lugares"} />}

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

      <div id="lugares" />
      <StateCityBrowser region={region} uf={uf.toLowerCase()} groups={groups} letters={letters} variant={hasRegions ? "localities" : "cities"} />
    </>
  );
}
