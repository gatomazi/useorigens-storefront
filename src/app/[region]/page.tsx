import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { FamilyGrid } from "@/components/catalog/FamilyGrid";
import { ProductCarousel } from "@/components/catalog/ProductCarousel";
import { Campaign } from "@/components/home/Campaign";
import { RegionHero } from "@/components/home/RegionHero";
import { StateCards } from "@/components/home/StateCards";
import { bannerFor, usableBannerAsset } from "@/lib/editorial/banners";
import { REAL_COLLECTIONS } from "@/lib/editorial/collections";
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

/**
 * Home section order (CLAUDE_HOME_LENDA_ORDER_VIEW_ALL.md — do not reorganize without another review):
 * Hero → 8 estilos → Da Nossa Terra → Estados → Redesenhos → Feito Para Você → Fala daqui → DDD → Campanha.
 * "Cidades para começar" stays removed: search already resolves city discovery.
 */
export default async function RegionHome({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !ENABLED_REGIONS.includes(region)) notFound();

  const home = getRegionHome(region);
  const { showcase } = home;
  const cityPath = showcase ? `/${region}/${showcase.city.uf.toLowerCase()}/${showcase.city.slug}` : null;
  const falaPhoto = usableBannerAsset("collection", bannerFor(region, "collection", "fala-daqui"));

  return (
    <>
      <RegionHero region={region} cityCount={home.cityCount} trio={home.heroFamilies} config={bannerFor(region, "hero")} />

      {/* The product idea, shown on one real city. Only styles that exist for it. */}
      {showcase && cityPath && (
        <section id="estilos" aria-labelledby="styles-title" className="wrap py-14 lg:py-24">
          <div className="mb-8 max-w-2xl lg:mb-12">
            <h2 id="styles-title" className="t-h2">
              Sua cidade, de 8 jeitos.
            </h2>
            <p className="t-body mt-3 text-ink-soft">
              Do mapa às coordenadas: escolha a estampa que mais combina com o seu lugar. O exemplo aqui é {showcase.city.name} —
              ao abrir a sua, você vê só os estilos que existem para ela.
            </p>
          </div>
          <FamilyGrid entries={showcase.families} hrefBase={cityPath} cityName={showcase.city.name} />
        </section>
      )}

      {/* Regionalism direct, not tied to one city: the state's own line + demonym products, balanced RS/SC/PR. */}
      {home.terra.length > 0 && (
        <section id="terra" className="paper">
          <div className="wrap py-14 lg:py-24">
            <ProductCarousel
              items={home.terra}
              labelledBy="terra-title"
              title="Da Nossa Terra"
              intro="O estado inteiro numa camiseta, não só uma cidade."
              viewAllHref={REAL_COLLECTIONS.terra}
            />
          </div>
        </section>
      )}

      <StateCards region={region} states={home.states} />

      {/*
        Editorial complementar: a parallel trail, never mixed with the eight city families nor with Da Nossa
        Terra above. Bigger, more editorial cards (poster frame); real INK products, curated in editorial/recreations.ts.
        "Ver todos" points to the real store collection "Do Nosso Jeito", verified to hold this same line
        (editorial/collections.ts) — the closest real match; the home's own name stays "Redesenhos do Sul".
      */}
      {home.recreations.length > 0 && (
        <section id="redesenhos" className="paper">
          <div className="wrap py-14 lg:py-24">
            <ProductCarousel
              poster
              items={home.recreations}
              labelledBy="redesenhos-title"
              title="Redesenhos do Sul"
              intro="Obras, referências e ícones reinterpretados com sotaque local."
              viewAllHref={REAL_COLLECTIONS.redesenhos}
            />
          </div>
        </section>
      )}

      {/* The real "Lenda" line — who wears it (Pai/Mãe/Marido/Esposa), never a city/map personalization. */}
      {home.feitoParaVoce.length > 0 && (
        <section id="feito-para-voce" className="wrap py-14 lg:py-24">
          <ProductCarousel
            items={home.feitoParaVoce}
            labelledBy="feito-para-voce-title"
            title="Feito Para Você"
            intro="Escolha a combinação que mais parece com quem vai vestir."
            viewAllHref={REAL_COLLECTIONS.feitoParaVoce}
          />
        </section>
      )}

      {home.fala.length > 0 && (
        // The one strong regional block of the home: the region's own photo, tinted with its primary colour
        // (regional-wash-primary), white text. The banner is this section's background, never a slice before it.
        <section id="fala" className="relative isolate overflow-hidden bg-region-primary text-white">
          {falaPhoto && <RegionalPhotoSection asset={falaPhoto} wash="regional-wash-primary" baseClassName="bg-region-primary" />}
          <div className="wrap py-14 lg:py-24">
            <ProductCarousel
              tone="dark"
              items={home.fala}
              labelledBy="fala-title"
              title="Fala daqui"
              intro="Expressões dos três estados, sempre com o lugar de onde vêm."
              viewAllHref={REAL_COLLECTIONS.fala}
            />
          </div>
        </section>
      )}

      {/*
        DDD keeps a plain ground on purpose: it is a carousel of small product photos, which need a calm, flat
        surface to read; a photo behind them would compete with the product rather than ambient it. A "ddd" banner
        is delivered and ready in banners.ts, but no page renders it right now (docs/decisions/0003).
        No "Ver todos" here: the live store has no separate DDD collection — the DDD-coded products live inside
        its "Fala Daqui" collection (verified, editorial/collections.ts), the same URL the section above already
        links to. Pointing this section at it too would just repeat that link, not add a real destination.
      */}
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

      <Campaign region={region} crops={home.campaignCrops} config={bannerFor(region, "campaign")} />
    </>
  );
}
