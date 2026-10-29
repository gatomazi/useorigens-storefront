import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreateYourOwnCard } from "@/components/umapenca/CreateYourOwnCard";
import { personalizationCards, personalizationHubHref } from "@/lib/customization/hub";
import { isRegionSlug, REGIONS } from "@/lib/geo/regions";
import { publishedFor } from "@/lib/pages/public";
import { isRegionLaunched } from "@/lib/regions/launched";

export const revalidate = 3600;

type Props = { params: Promise<{ region: string }> };

const SIZES = "(min-width: 1024px) 25vw, 50vw";

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionSlug(region)) return {};
  return {
    title: `Estampas personalizáveis · Use Origens ${REGIONS[region].name}`,
    description: "Coloque o sobrenome da família, a sua cidade ou a sua placa numa estampa Use Origens e veja na camiseta antes de comprar.",
    alternates: { canonical: personalizationHubHref(region) },
    robots: { index: false, follow: true }, // like the models it lists (src/app/sitemap.ts leaves /personalizar out)
  };
}

/**
 * Every personalized print of the region in one place (the surname, the plate…), each card leading to its own page. The models come from the
 * published CMS (src/lib/customization/hub.ts); with none, the page is a 404, so a menu link never lands on an empty shelf.
 */
export default async function PersonalizationHubPage({ params }: Props) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) notFound();
  const published = publishedFor(region);
  const cards = published ? personalizationCards(published.bundle.docs[region], published.bundle.media, region) : [];
  if (cards.length === 0) notFound();
  const instant = cards.some((c) => c.price);

  return (
    <div className="wrap py-10 lg:py-16">
      <header>
        <h1 className="t-h1">Personalize a sua</h1>
        <p className="t-body mt-3 max-w-[60ch]">
          Escolha a estampa e coloque o que é seu: o sobrenome da família, a sua cidade, a sua placa. Você vê na camiseta antes de comprar{instant ? " e compra na hora, na loja Use Origens" : ""}.
        </p>
      </header>
      <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:mt-14 lg:grid-cols-4">
        {cards.map((card, i) => (
          <li key={card.id}>
            <CreateYourOwnCard card={card} sizes={SIZES} priority={i < 2} cta="Personalizar" />
          </li>
        ))}
      </ul>
    </div>
  );
}
