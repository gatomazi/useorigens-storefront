import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegionalBanner } from "@/components/banners/RegionalBanner";
import { FamilyGrid } from "@/components/catalog/FamilyGrid";
import { ProductCarousel } from "@/components/catalog/ProductCarousel";
import { Campaign } from "@/components/home/Campaign";
import { LoreCities } from "@/components/home/LoreCities";
import { RegionHero } from "@/components/home/RegionHero";
import { StateCards } from "@/components/home/StateCards";
import { bannerFor } from "@/lib/editorial/banners";
import { getRegionHome } from "@/lib/home";
import { REGIONS, isRegionSlug } from "@/lib/geo/regions";
import { ENABLED_REGIONS } from "@/lib/site";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionSlug(region)) return {};
  const name = REGIONS[region].name;
  return {
    title: `Camisetas da sua cidade no ${name}`,
    description: `Camisetas com o nome, o mapa, o DDD e o jeito de falar da sua cidade no ${name}. Busque a sua.`,
    alternates: { canonical: `/${region}` },
    openGraph: { title: `Use Origens ${name}`, url: `/${region}` },
  };
}

export default async function RegionHome({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !ENABLED_REGIONS.includes(region)) notFound();

  const home = getRegionHome(region);
  const { showcase } = home;
  const cityPath = showcase ? `/${region}/${showcase.city.uf.toLowerCase()}/${showcase.city.slug}` : null;

  return (
    <>
      <RegionHero region={region} cityCount={home.cityCount} trio={home.heroDdd} config={bannerFor(region, "hero")} />

      {/* The product idea, shown on one real city. Only styles that exist for it. */}
      {showcase && cityPath && (
        <section id="estilos" aria-labelledby="styles-title" className="wrap py-14 lg:py-24">
          <div className="mb-8 max-w-2xl lg:mb-12">
            <h2 id="styles-title" className="t-h2">
              Escolha como vestir a sua cidade
            </h2>
            <p className="t-body mt-3 text-ink-soft">
              O exemplo aqui é {showcase.city.name}. Ao abrir a sua, você vê só os estilos que existem para ela.
            </p>
          </div>
          <FamilyGrid entries={showcase.families} hrefBase={cityPath} cityName={showcase.city.name} scroller />
        </section>
      )}

      {home.ddd.length > 0 && <RegionalBanner slot="collection" config={bannerFor(region, "collection", "ddd")} fallback={null} />}
      {home.ddd.length > 0 && (
        <section id="geografia" className="wrap py-14 lg:py-24">
          <ProductCarousel
            items={home.ddd}
            labelledBy="ddd-title"
            title="O número de cada região"
            intro="O DDD e o nome da região, do Paraná ao Rio Grande do Sul."
          />
        </section>
      )}

      {home.fala.length > 0 && <RegionalBanner slot="collection" config={bannerFor(region, "collection", "fala-daqui")} fallback={null} />}
      {home.fala.length > 0 && (
        <section id="fala" className="paper">
          <div className="wrap py-14 lg:py-24">
            <ProductCarousel
              items={home.fala}
              labelledBy="fala-title"
              title="Fala daqui"
              intro="Expressões dos três estados, sempre com o lugar de onde vêm."
            />
          </div>
        </section>
      )}

      <StateCards region={region} states={home.states} />

      <LoreCities region={region} cities={home.loreCities} totalCities={home.cityCount} />

      <Campaign region={region} crops={home.campaignCrops} config={bannerFor(region, "campaign")} />
    </>
  );
}
