import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityJourneyTrigger } from "@/components/city-journey/CityJourney";
import { getCatalog } from "@/lib/catalog/repository";
import { checkoutStoreFor } from "@/lib/catalog/commerce-mode";
import { numberPt } from "@/lib/format";
import { isRegionSlug } from "@/lib/geo/regions";
import { SOCIAL_PROOF } from "@/lib/partners/copy";
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

const STEPS = [
  { title: "Digite a sua cidade", body: "Pode ser a sua, a de onde você veio ou a de quem você quer presentear." },
  { title: "Escolha a estampa", body: "Cada cidade tem estilos próprios: do mapa às coordenadas. Você vê só os que existem para ela." },
  { title: "Escolha a peça e compre", body: "Camiseta, oversized, moletom e mais. O botão leva direto ao produto escolhido." },
];

/**
 * The page the ads point to (instead of the home): the city field first, the journey ("Sua cidade", CityJourney.tsx) one tap away, and three lines of
 * how it works. Only the Sul: Norte and Centro-Oeste follow the single store. Closing the journey leaves the visitor here, not on the home.
 */
export default async function CityLandingPage({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || region !== "sul" || !isRegionLaunched(region)) notFound();
  const cities = getCatalog().coveredCityIds(region).size;
  const rating = SOCIAL_PROOF.find((n) => n.value === "4,9");

  return (
    <>
      <section aria-labelledby="cidade-title" className="paper">
        <div className="wrap pb-12 pt-8 lg:pb-20 lg:pt-16">
          <div className="max-w-4xl">
            <span aria-hidden="true" className="mb-3 block h-[3px] w-12 bg-region-accent lg:mb-4" />
            <p className="text-[0.8125rem] font-bold uppercase tracking-[0.14em]">Camisetas por cidade</p>
            <h1 id="cidade-title" className="t-display mt-3">
              A camiseta
              <br />
              do seu lugar.
            </h1>
            <p className="t-body mt-5 max-w-lg">
              Digite o nome da sua cidade e veja as estampas feitas para ela.{cities > 0 ? ` São ${numberPt.format(cities)} cidades com camiseta própria.` : ""}
            </p>
            <div className="mt-7">
              <CityJourneyTrigger variant="landing" />
            </div>
            <p className="t-small mt-3 text-ink-mute">Você escolhe aqui e finaliza a compra {checkoutStoreFor(region).finishIn}.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="como-title" className="border-t border-line">
        <div className="wrap py-12 lg:py-20">
          <h2 id="como-title" className="t-h2 max-w-2xl">Como funciona.</h2>
          <ol className="mt-8 grid gap-x-8 gap-y-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="border-t-2 border-ink pt-4">
                <span className="font-display text-[0.9375rem] font-extrabold tabular-nums">0{i + 1}</span>
                <h3 className="font-display mt-3 text-[1.5rem] font-extrabold uppercase leading-none">{step.title}</h3>
                <p className="t-body mt-3 text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <CityJourneyTrigger variant="link" label="Encontrar a minha cidade" />
            {rating && (
              <p className="t-small text-ink-mute">
                <strong className="font-display text-[1.5rem] font-extrabold text-ink">{rating.value}</strong> {rating.label}
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
