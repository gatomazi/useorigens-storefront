import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CityFinder } from "@/components/city-finder/CityFinder";
import { finderStates } from "@/lib/catalog/city-finder";
import { minhaCidadeHref } from "@/lib/catalog/city-finder-shared";
import { isRegionSlug, REGIONS } from "@/lib/geo/regions";
import { isRegionLaunched, launchedRegions } from "@/lib/regions/launched";
import { storeCardButton } from "@/lib/site-config/cards";

export const revalidate = 3600;

type Props = { params: Promise<{ region: string }> };

// Not prebuilt: the catalog lives on the runtime Volume (see the region layout), so a build-time page would list no state at all.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionSlug(region)) return {};
  return {
    title: `Quero minha cidade · Use Origens ${REGIONS[region].name}`,
    description: "Escolha o estado e a cidade e veja os modelos de camiseta da sua cidade, entre mais de duas mil com estampa Use Origens.",
    alternates: { canonical: minhaCidadeHref(region) },
  };
}

/**
 * "Quero minha cidade": state, place, then the place's designs right under them (src/components/city-finder/CityFinder.tsx). Every launched region's
 * states are listed, the browsed region's first; a place of another region is shown and sold in its own region.
 */
export default async function MinhaCidadePage({ params }: Props) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) notFound();
  const regions = launchedRegions();
  const states = finderStates([region, ...regions.filter((r) => r !== region)]);
  if (states.length === 0) notFound();
  const total = states.reduce((sum, s) => sum + s.places, 0);
  return (
    // The answers live in the address, read in the browser: the page is the same for every step, and cached as one.
    <Suspense fallback={<div className="city-finder wrap" aria-busy="true" />}>
      <CityFinder region={region} states={states} total={total} buy={storeCardButton()} />
    </Suspense>
  );
}
