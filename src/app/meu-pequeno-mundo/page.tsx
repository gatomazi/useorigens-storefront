import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { MundoApp } from "@/components/mundo/MundoApp";
import { isRegionSlug, type RegionSlug } from "@/lib/geo/regions";
import { MUNDO_CAMINHO, modoMundo, mundoPaginaAtiva } from "@/lib/mundo/flag";
import { isRegionLaunched } from "@/lib/regions/launched";
import { pageOpenGraph } from "@/lib/seo/open-graph";
import { publishedTracking } from "@/lib/site-config/tracking";

// Full-screen experience: the panels follow the on-screen keyboard (resizes-content) and the model reaches the phone's edges (cover).
export const viewport: Viewport = { themeColor: "#ece6db", width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

// The flag is a runtime switch (src/lib/mundo/flag.ts) and `loja` picks the store to return to: rendered per request.
export const dynamic = "force-dynamic";

const TITULO = "Meu Pequeno Mundo";
const DESCRICAO = "Monte um pequeno mundo com sua origem, seu presente e seu lugar do coração, e encontre as camisetas de cada lugar.";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  if (!mundoPaginaAtiva()) return {};
  return {
    title: TITULO,
    description: DESCRICAO,
    // A shared world lives in the query string; the canonical page never carries one.
    alternates: { canonical: MUNDO_CAMINHO },
    // While only the page is on (no entries in the store), it stays out of search results.
    ...(modoMundo() === "on" ? {} : { robots: { index: false, follow: true } }),
    openGraph: pageOpenGraph({ title: `${TITULO} | Use Origens`, description: DESCRICAO, path: MUNDO_CAMINHO }),
  };
}

/** The store the visitor came from (?loja=…, set by the entries), when it is a launched region; otherwise Sul, the store's home. */
function lojaDe(valor: string | string[] | undefined): RegionSlug {
  return typeof valor === "string" && isRegionSlug(valor) && isRegionLaunched(valor) ? valor : "sul";
}

export default async function MeuPequenoMundoPage({ searchParams }: Props) {
  if (!mundoPaginaAtiva()) notFound();
  const loja = lojaDe((await searchParams).loja);
  const tracking = publishedTracking(loja);
  return (
    <>
      <main id="conteudo">
        <MundoApp lojaHref={`/${loja}`} />
        <noscript>
          <p style={{ position: "fixed", inset: "auto 16px 16px", padding: 16, background: "#fff", border: "2px solid #000", zIndex: 50 }}>
            O Meu Pequeno Mundo precisa de JavaScript. As camisetas estão em <a href={`/${loja}`}>useorigens.com.br</a>.
          </p>
        </noscript>
      </main>
      {/* useSearchParams inside GoogleAnalytics needs a Suspense boundary. Path only: a shared world's query never reaches analytics. */}
      <Suspense fallback={null}>
        <GoogleAnalytics measurementId={tracking.ga4MeasurementId} semConsulta />
      </Suspense>
      <ConsentBanner region={loja} />
    </>
  );
}
