import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StateOutline } from "@/components/brand/StateOutline";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { StateCityBrowser, type BrowserGroup } from "@/components/city/StateCityBrowser";
import { CitySearch } from "@/components/search/CitySearch";
import { getCatalog } from "@/lib/catalog/repository";
import { bannerFor, usableBannerAsset } from "@/lib/editorial/banners";
import { numberPt } from "@/lib/format";
import { citiesOfRegion, mesoGroupsOfState } from "@/lib/geo/cities";
import { REGIONS, STATE_NAMES, UF_TO_REGION, isRegionSlug } from "@/lib/geo/regions";
import { normalizeText, slugify } from "@/lib/geo/text";
import { ENABLED_REGIONS } from "@/lib/site";

export const revalidate = 3600;

// No pages are prebuilt: each one is rendered on first request, then cached and revalidated (ISR).
export function generateStaticParams() {
  return [];
}

function resolveState(regionSlug: string, ufParam: string) {
  const uf = ufParam.toUpperCase();
  if (!isRegionSlug(regionSlug) || !ENABLED_REGIONS.includes(regionSlug)) return null;
  return UF_TO_REGION[uf] === regionSlug ? uf : null;
}

export async function generateMetadata({ params }: { params: Promise<{ region: string; uf: string }> }): Promise<Metadata> {
  const { region, uf: ufParam } = await params;
  const uf = resolveState(region, ufParam);
  if (!uf) return {};
  return {
    title: `Camisetas de ${STATE_NAMES[uf]}`,
    description: `Encontre a camiseta da sua cidade em ${STATE_NAMES[uf]}, por região ou em ordem alfabética.`,
    alternates: { canonical: `/${region}/${uf.toLowerCase()}` },
  };
}

export default async function StatePage({ params }: { params: Promise<{ region: string; uf: string }> }) {
  const { region, uf: ufParam } = await params;
  const uf = resolveState(region, ufParam);
  if (!uf || !isRegionSlug(region)) notFound();

  const covered = getCatalog().coveredCityIds(region);
  const cities = citiesOfRegion(region).filter((c) => c.uf === uf && covered.has(c.id));
  const toBrowser = (list: { name: string; slug: string }[]) => list.map((c) => ({ n: c.name, s: c.slug }));

  // Editorial mesoregion grouping (ADR 0004), navigation only — not the current IBGE division. Cities
  // without one still appear in A–Z.
  const groups: BrowserGroup[] = mesoGroupsOfState(uf, new Set(cities.map((c) => c.id))).map((g) => ({
    name: g.name,
    slug: g.slug,
    cities: toBrowser(g.cities.sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))),
  }));

  const byLetter = new Map<string, { name: string; slug: string }[]>();
  for (const city of [...cities].sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))) {
    const letter = normalizeText(city.name).charAt(0).toUpperCase();
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), city]);
  }
  const letters: BrowserGroup[] = [...byLetter.entries()].map(([letter, list]) => ({ name: letter, slug: `letra-${slugify(letter)}`, cities: toBrowser(list) }));

  // A real state photo ambients the identity header (name, count, map) — never the search below it: an open
  // results list needs a plain ground to stay legible, so it lives in its own quiet strip (docs/decisions/0003).
  const statePhoto = usableBannerAsset("state", bannerFor(region, "state", uf));

  return (
    <>
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
                    {numberPt.format(cities.length)} cidades · {groups.length} regiões
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
          <CitySearch region={region} />
        </div>
      </section>

      <StateCityBrowser region={region} uf={uf.toLowerCase()} groups={groups} letters={letters} />
    </>
  );
}
