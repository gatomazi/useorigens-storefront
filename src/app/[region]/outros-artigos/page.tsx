import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/umapenca/ArticleCard";
import { CreateYourOwnCard } from "@/components/umapenca/CreateYourOwnCard";
import { isRegionSlug } from "@/lib/geo/regions";
import { publishedFor } from "@/lib/pages/public";
import { isRegionLaunched } from "@/lib/regions/launched";
import { createYourOwnCards } from "@/lib/umapenca/customizer-cards";
import { umaPencaHoverPhotos } from "@/lib/umapenca/hover";
import { readUmaPencaSnapshot } from "@/lib/umapenca/snapshot";
import { ARTICLE_KIND_LABELS, ARTICLE_KINDS } from "@/lib/umapenca/types";

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
    title: "Outros artigos",
    description: "Canecas e ecobags Use Origens, vendidas pela Uma Penca.",
    alternates: { canonical: `/${region}/outros-artigos` },
  };
}

/**
 * "Outros artigos": canecas and ecobags from the Uma Penca feed (src/lib/umapenca). The same articles in every region — they
 * are not tied to a city. Each kind opens with the region's published Uma Penca personalization models ("Crie a sua", leading
 * to /personalizar/<slug>), then the feed's articles (each opening the Uma Penca product page). A kind with neither is left out,
 * and with nothing at all the page is a 404, so no link ever lands on an empty shelf.
 */
export default async function OutrosArtigosPage({ params }: Props) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) notFound();
  const articles = readUmaPencaSnapshot()?.articles ?? [];
  const hover = umaPencaHoverPhotos();
  const published = publishedFor(region);
  const groups = ARTICLE_KINDS.map((kind) => ({
    kind,
    cards: published ? createYourOwnCards(published.bundle.docs[region], published.bundle.media, region, kind) : [],
    articles: articles.filter((a) => a.kind === kind),
  })).filter((g) => g.cards.length + g.articles.length > 0);
  if (groups.length === 0) notFound();

  return (
    <div className="wrap py-10 lg:py-16">
      <header className="max-w-[60ch]">
        <h1 className="t-h1">Outros artigos</h1>
        <p className="t-body mt-3">Canecas e ecobags com as nossas estampas. A compra é feita na loja da Uma Penca.</p>
        {groups.length > 1 && (
          <nav aria-label="Tipos de artigo" className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
            {groups.map(({ kind }) => (
              <a key={kind} href={`#${kind}`} className="link-line t-small font-semibold">
                {ARTICLE_KIND_LABELS[kind].plural}
              </a>
            ))}
          </nav>
        )}
      </header>

      {groups.map(({ kind, cards, articles }, groupIndex) => (
        <section key={kind} id={kind} aria-labelledby={`${kind}-title`} className="mt-12 scroll-mt-24 lg:mt-16">
          <h2 id={`${kind}-title`} className="mb-6 text-[1.5rem] font-extrabold tracking-tight lg:mb-10 lg:text-[1.875rem]">
            {ARTICLE_KIND_LABELS[kind].plural}
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
            {cards.map((card, i) => (
              <li key={card.id} data-create-your-own>
                <CreateYourOwnCard card={card} sizes={SIZES} priority={groupIndex === 0 && i < 2} />
              </li>
            ))}
            {articles.map((article, i) => (
              <li key={article.id}>
                <ArticleCard article={article} region={region} sizes={SIZES} hoverImageUrl={hover[article.id]} priority={groupIndex === 0 && cards.length + i < 2} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
