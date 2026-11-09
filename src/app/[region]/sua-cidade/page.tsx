import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityJourneyAutoOpen, CityJourneyTrigger } from "@/components/city-journey/CityJourney";
import { checkoutStoreFor } from "@/lib/catalog/commerce-mode";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const { region } = await params;
  if (region !== "sul") return {};
  return {
    title: "Encontre a camiseta da sua cidade",
    description: "Digite o nome da sua cidade, escolha a estampa e a peça. Em três passos você chega na camiseta do seu lugar.",
    alternates: { canonical: `/${region}/sua-cidade` },
  };
}

/**
 * The page the ads point to (instead of the home): the "Sua cidade" journey itself, open on arrival and ready to type in. Its field is a normal
 * search here (designs and pages too, not only places). Only the Sul: Norte and Centro-Oeste follow the single store. Closing the journey leaves
 * the visitor on this page, which holds just the field to open it again, never the home.
 */
export default async function CityLandingPage({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || region !== "sul" || !isRegionLaunched(region)) notFound();

  return (
    <section aria-labelledby="cidade-title" className="paper">
      <CityJourneyAutoOpen />
      <div className="wrap py-16 lg:py-28">
        <h1 id="cidade-title" className="t-h2 max-w-2xl">
          Qual é a sua cidade?
        </h1>
        <div className="mt-6">
          <CityJourneyTrigger variant="landing" />
        </div>
        <p className="t-small mt-3 text-ink-mute">Você escolhe aqui e finaliza a compra {checkoutStoreFor(region).finishIn}.</p>
      </div>
    </section>
  );
}
