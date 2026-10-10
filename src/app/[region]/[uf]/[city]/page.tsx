import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StateOutline } from "@/components/brand/StateOutline";
import { CityGarmentTabs } from "@/components/catalog/CityGarmentTabs";
import { FamilyGrid } from "@/components/catalog/FamilyGrid";
import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { SearchDialog } from "@/components/search/SearchDialog";
import { TrackedCityLink } from "@/components/analytics/TrackedCityLink";
import { TrackedInkLink } from "@/components/analytics/TrackedInkLink";
import { SOURCES } from "@/lib/analytics/sources";
import { purchaseUrl } from "@/lib/catalog/commerce";
import { getCatalog } from "@/lib/catalog/repository";
import { resolveCity } from "@/lib/catalog/resolver";
import { bannerFor, usableBannerAsset } from "@/lib/editorial/banners";
import { formatPrice } from "@/lib/format";
import { citiesOfSameMeso } from "@/lib/geo/cities";
import { compareLocalityNames, localitiesOfRegion, localityById, localitySubtitle } from "@/lib/geo/localities";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { JsonLd } from "@/components/seo/JsonLd";
import { cityDescription, cityIntro, cityTitle } from "@/lib/seo/copy";
import { breadcrumbList } from "@/lib/seo/jsonld";
import { stateOf } from "@/lib/seo/state-copy";
import { pageOpenGraph } from "@/lib/seo/open-graph";
import { SITE_URL } from "@/lib/site";
import { pageShare } from "@/lib/share/server";
import { ShareButton } from "@/components/share/ShareButton";
import { SizeGuideButton } from "@/components/catalog/SizeGuide";
import { CLASSIC_GARMENT_TYPE_ID } from "@/lib/catalog/garments";

export const revalidate = 3600;

// No pages are prebuilt: each one is rendered on first request, then cached and revalidated (ISR).
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ region: string; uf: string; city: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { region, uf, city } = await params;
  const resolved = resolveCity(region, uf, city);
  if (!resolved) return {};
  const title = cityTitle(resolved.city);
  const description = cityDescription(resolved.city, resolved.families.map((entry) => entry.family.name));
  const path = `/${region}/${uf}/${city}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: pageOpenGraph({ title: `${title} | Use Origens`, description, path, imageUrl: resolved.families[0]?.primary.imageUrl }),
  };
}

export default async function CityPage({ params }: { params: Params }) {
  const { region, uf, city: citySlug } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) notFound();
  const resolved = resolveCity(region, uf, citySlug);
  if (!resolved) notFound();

  const { city, stateName, families, localities } = resolved;
  const base = `/${region}/${uf}/${city.slug}`;
  const catalog = getCatalog();
  const garment = catalog.garmentTabsForCity(city.id);

  // Local voice: real expression / patron-saint products of this municipality. No content, no section.
  const lore = (catalog.lore(city.regionSlug).byCity.get(city.id) ?? []).flatMap((item) => {
    const href = purchaseUrl(item.product);
    return href ? [{ ...item, href }] : [];
  });

  // Same editorial mesoregion (ADR 0004), alphabetical neighbours of this city.
  const covered = catalog.coveredCityIds(city.regionSlug);
  const sameMeso = citiesOfSameMeso(city)
    .filter((c) => covered.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const at = sameMeso.findIndex((c) => c.name.localeCompare(city.name, "pt-BR") > 0);
  const start = Math.max(0, (at === -1 ? sameMeso.length : at) - 5);
  const neighbours = sameMeso.slice(start, start + 10);

  // Federal District: Brasília and every administrative region link to the OTHER administrative regions that really have products (an RA is a
  // place of its own, not a "city of the same region"). Empty everywhere else, so no other page changes.
  const isRegion = city.type === "administrative_region";
  const coveredPlaces = catalog.coveredLocalityIds(city.regionSlug);
  const regionsOfState = localitiesOfRegion(city.regionSlug)
    .filter((l) => l.uf === city.uf && l.type === "administrative_region" && l.id !== city.id && coveredPlaces.has(l.id))
    .sort(compareLocalityNames);
  const ownsRegions = isRegion || regionsOfState.some((r) => r.parentCityId === city.id);
  const otherRegions = ownsRegions ? (isRegion ? regionsOfState.slice(0, 12) : regionsOfState) : [];
  // The municipality that contains this administrative region (Brasília), when it has a page of its own.
  const parentPlace = isRegion && city.parentCityId && coveredPlaces.has(city.parentCityId) ? localityById(city.parentCityId) : undefined;

  // A real city photo (never one that names the city — the H1 already does that) ambients the header itself,
  // instead of sitting as its own banner slice between the header and "Estilos" (docs/decisions/0003).
  const cityPhoto = usableBannerAsset("city", bannerFor(city.regionSlug, "city"));

  // The canonical city URL (never the current one: `?peca=` and anything else the visitor carries stays out).
  const share = pageShare(base, cityTitle(city));

  const intro = cityIntro(city, city.regionSlug, families.map((entry) => entry.family.name));

  return (
    <>
      <JsonLd
        data={breadcrumbList(SITE_URL, [
          { name: resolved.region.name, path: `/${region}` },
          { name: stateName, path: `/${region}/${uf}` },
          { name: city.name, path: base },
        ])}
      />
      <section className="relative isolate">
        {cityPhoto && <RegionalPhotoSection asset={cityPhoto} priority />}
        <div className={`wrap pb-8 pt-5 lg:pb-12 lg:pt-6 ${cityPhoto ? "pb-14 lg:pb-20" : ""}`}>
          <nav aria-label="Você está em" className="t-caption regional-caption">
            <Link href={`/${region}`} className="link-static">
              {resolved.region.name}
            </Link>
            <span aria-hidden="true"> / </span>
            <Link href={`/${region}/${uf}`} className="link-static">
              {stateName}
            </Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{city.name}</span>
          </nav>

          <div className="mt-6 flex items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="t-city">{city.name}</h1>
              <p className="t-place mt-4 text-[1.125rem] sm:text-[1.5rem]">{localitySubtitle(city)}</p>
              {share && <ShareButton share={share} variant="inline" className="mt-3 -ml-0.5" />}
            </div>
            <StateOutline uf={city.uf} className="hidden h-44 w-56 shrink-0 text-ink lg:block" strokeWidth={2} />
          </div>
        </div>
      </section>

      <section aria-labelledby="styles-title" className="wrap pb-14 lg:pb-20">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 lg:mb-10">
          <h2 id="styles-title" className="text-[1.5rem] font-extrabold tracking-tight lg:text-[1.875rem]">
            Estilos
          </h2>
          {/* Without piece tabs every card is the classic tee; with tabs, the guide lives next to them (CityGarmentTabs). */}
          {families.length > 0 && garment.tabs.length === 0 && (
            <SizeGuideButton garmentTypeIds={[CLASSIC_GARMENT_TYPE_ID]} initialGarmentTypeId={CLASSIC_GARMENT_TYPE_ID} source={SOURCES.cityStyles} />
          )}
        </div>
        {families.length > 0 ? (
          garment.tabs.length > 0 ? (
            <Suspense fallback={<FamilyGrid entries={families} hrefBase={base} cityName={city.name} stateUf={city.uf} sourceSection={SOURCES.cityStyles} directToInk />}>
              <CityGarmentTabs
                tabs={garment.tabs}
                guideSource={SOURCES.cityStyles}
                panels={Object.fromEntries(
                  garment.tabs.map((tab) => [
                    tab.id,
                    <FamilyGrid
                      key={tab.id}
                      entries={garment.entriesByGarment[tab.id] ?? []}
                      hrefBase={base}
                      cityName={city.name}
                      stateUf={city.uf}
                      sourceSection={SOURCES.cityStyles}
                      directToInk
                      pieceLabel={tab.id === garment.tabs[0].id ? undefined : tab.label}
                      garmentTypeId={tab.id === garment.tabs[0].id ? undefined : tab.id}
                    />,
                  ]),
                )}
              />
            </Suspense>
          ) : (
            <FamilyGrid entries={families} hrefBase={base} cityName={city.name} stateUf={city.uf} sourceSection={SOURCES.cityStyles} directToInk />
          )
        ) : (
          <p className="t-body max-w-xl">Ainda não temos camisetas de {city.name} na loja. Volte em breve ou escolha outra cidade da região.</p>
        )}
        {/* Right where the products end, since the header icon alone goes unnoticed once a place is chosen. It opens the search sheet
            instead of searching inline: this low on a phone, the keyboard would cover the results. */}
        <div className="mt-10 max-w-2xl lg:mt-14">
          <h2 className="mb-4 text-[1.25rem] font-extrabold tracking-tight">{isRegion ? "Busque outra localidade" : "Busque outra cidade"}</h2>
          <SearchDialog region={city.regionSlug} variant="field" source={SOURCES.citySearch} />
        </div>
        {/* Short, real text UNDER the products (never above them): the styles this page actually lists, nothing else. */}
        {intro && <p className="t-body mt-8 max-w-2xl text-ink-soft lg:mt-12">{intro}</p>}
      </section>

      {lore.length > 0 && (
        <section aria-labelledby="lore-title" className="paper">
          <div className="wrap py-12 lg:py-16">
            <h2 id="lore-title" className="text-[1.5rem] font-extrabold tracking-tight lg:text-[1.875rem]">
              Fala de {city.name}
            </h2>
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 lg:gap-x-6">
              {lore.map((item) => (
                <li key={item.product.inkProductId}>
                  <TrackedInkLink
                    href={item.href}
                    params={{
                      productId: item.product.inkProductId,
                      sourceSection: SOURCES.cityFala,
                      city: city.name,
                      state: city.uf,
                      value: item.product.price ?? undefined,
                      productName: item.text,
                      destinationUrl: item.href,
                    }}
                    className="group block"
                  >
                    <ProductPhoto src={item.product.imageUrl} alt={`${item.text}, ${city.name}`} sizes="(min-width: 768px) 22vw, 46vw" />
                    <p className="t-h3 link-line mt-3 inline">{item.text}</p>
                    <p className="t-place mt-0.5 text-[0.95rem] text-ink-mute">{item.kind === "padroeiro" ? "Padroeiro" : "Expressão"} · {city.name}</p>
                    {formatPrice(item.product.price) && <p className="t-small mt-0.5 font-semibold">{formatPrice(item.product.price)}</p>}
                  </TrackedInkLink>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {localities.length > 0 && (
        <section aria-labelledby="also-title" className="wrap py-12 lg:py-16">
          <h2 id="also-title" className="text-[1.25rem] font-extrabold tracking-tight">
            Lugares de {city.name}
          </h2>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-5">
            {localities.map((item) => {
              const href = purchaseUrl(item);
              const price = formatPrice(item.price);
              const content = (
                <>
                  <span className="photo relative block h-24 w-24 shrink-0 sm:h-28 sm:w-28">
                    <ProductPhoto src={item.imageUrl} alt={`Camiseta de ${item.localityLabel}, em ${city.name}`} sizes="112px" />
                  </span>
                  <span className="self-center">
                    <span className="t-place block text-[1.125rem]">{item.localityLabel}</span>
                    {price && <span className="t-small block font-semibold">{price}</span>}
                  </span>
                </>
              );
              return (
                <li key={item.inkProductId}>
                  {href ? (
                    <TrackedInkLink
                      href={href}
                      params={{
                        productId: item.inkProductId,
                        sourceSection: SOURCES.cityLocalities,
                        city: city.name,
                        state: city.uf,
                        value: item.price ?? undefined,
                        productName: item.localityLabel,
                        destinationUrl: href,
                      }}
                      className="group flex items-center gap-4"
                    >
                      {content}
                    </TrackedInkLink>
                  ) : (
                    <div className="flex items-center gap-4">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {otherRegions.length > 0 && (
        <section aria-labelledby="regions-title" className="wrap pb-10 pt-4 lg:pb-14">
          <div className="border-t border-line pt-8">
            <h2 id="regions-title" className="text-[1.25rem] font-extrabold tracking-tight">
              {isRegion ? "Outras Regiões Administrativas" : `Regiões Administrativas ${stateOf(city.uf)}`}
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {parentPlace && (
                <li>
                  <TrackedCityLink
                    href={`/${region}/${uf}/${parentPlace.slug}`}
                    params={{ city: parentPlace.name, state: parentPlace.uf, region, source: SOURCES.cityNeighbours }}
                    className="inline-flex min-h-11 items-center border border-ink/40 px-3 text-[0.9375rem] font-medium transition-colors hover:border-ink hover:bg-ink hover:text-white"
                  >
                    {parentPlace.name}
                  </TrackedCityLink>
                </li>
              )}
              {otherRegions.map((c) => (
                <li key={c.id}>
                  <TrackedCityLink
                    href={`/${region}/${uf}/${c.slug}`}
                    params={{ city: c.name, state: c.uf, region, source: SOURCES.cityNeighbours, localityType: "administrative_region" }}
                    className="inline-flex min-h-11 items-center border border-ink/40 px-3 text-[0.9375rem] font-medium transition-colors hover:border-ink hover:bg-ink hover:text-white"
                  >
                    {c.name}
                  </TrackedCityLink>
                </li>
              ))}
              <li>
                <Link href={`/${region}/${uf}`} className="link-static inline-flex min-h-11 items-center px-2 text-[0.9375rem] font-semibold">
                  Ver todas as localidades
                </Link>
              </li>
            </ul>
          </div>
        </section>
      )}

      {neighbours.length > 0 && (
        <section aria-labelledby="more-title" className="wrap pb-16 pt-4 lg:pb-24">
          <div className="border-t border-line pt-8">
            <h2 id="more-title" className="text-[1.25rem] font-extrabold tracking-tight">
              Mais de {city.meso}
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {neighbours.map((c) => (
                <li key={c.id}>
                  <TrackedCityLink
                    href={`/${region}/${uf}/${c.slug}`}
                    params={{ city: c.name, state: c.uf, region, source: SOURCES.cityNeighbours }}
                    className="inline-flex min-h-11 items-center border border-ink/40 px-3 text-[0.9375rem] font-medium transition-colors hover:border-ink hover:bg-ink hover:text-white"
                  >
                    {c.name}
                  </TrackedCityLink>
                </li>
              ))}
              <li>
                <Link href={`/${region}/${uf}#${city.mesoSlug}`} className="link-static inline-flex min-h-11 items-center px-2 text-[0.9375rem] font-semibold">
                  Ver toda a região
                </Link>
              </li>
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
