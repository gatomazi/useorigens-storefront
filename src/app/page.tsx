import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { REGIONS, REGION_SLUGS, STATE_NAMES } from "@/lib/geo/regions";
import { launchedRegions } from "@/lib/regions/launched";
import { pageOpenGraph } from "@/lib/seo/open-graph";
import { LEGACY_STORE_URLS } from "@/lib/site";
import { regionThemeStyle } from "@/lib/theme/region-theme";
import styles from "./page.module.css";

const description = "Camisetas com o nome, o mapa e as coordenadas da sua cidade. Escolha sua região: Sul, Norte ou Centro-Oeste.";

export const metadata: Metadata = {
  title: "Escolha sua região",
  description,
  alternates: { canonical: "/" },
  openGraph: pageOpenGraph({ title: "Use Origens | Escolha sua região", description, path: "/" }),
};

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Keep the landing query (including repeated values) when a visitor chooses a store, just as the old redirect did.
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) for (const v of [value ?? []].flat()) query.append(name, v);
  const search = query.toString();
  const launched = launchedRegions();

  return (
    <div className={styles.page}>
      <header className={`wrap ${styles.header}`}>
        <Link href="/" translate="no" className={styles.wordmark} aria-label="Use Origens, página inicial">Use Origens</Link>
      </header>

      <main id="conteudo" className={styles.main}>
        <div className={`wrap ${styles.intro}`}>
          <h1>Seu lugar começa aqui.</h1>
          <p>Camisetas que carregam suas origens. Escolha sua região e encontre o seu lugar.</p>
        </div>

        <div className={`wrap ${styles.regions}`}>
          {REGION_SLUGS.map((slug) => {
            const region = REGIONS[slug];
            // Regions still awaiting publication keep their existing storefront destination, never a local 404.
            const destination = launched.includes(slug) ? `/${slug}` : LEGACY_STORE_URLS[slug];
            const href = search ? `${destination}?${search}` : destination;
            const logo = slug === "centro-oeste" ? "centro" : slug;

            return (
              <section key={slug} aria-labelledby={`region-${slug}`} style={regionThemeStyle(slug)}>
                <a href={href} className={styles.region} aria-label={`Explorar ${region.name}`}>
                  <Image src={`/brand/logo-${logo}.png`} alt="" width={166} height={192} className={styles.logo} unoptimized />
                  <div className={styles.regionCopy}>
                    <h2 id={`region-${slug}`}>{region.name}</h2>
                    <p className={styles.states}>{region.ufs.map((uf) => STATE_NAMES[uf]).join(" · ")}</p>
                  </div>
                  <span className={styles.enter}>
                    Explorar {region.name}
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12h16m-6-6 6 6-6 6" />
                    </svg>
                  </span>
                </a>
              </section>
            );
          })}
        </div>
      </main>

      <footer className={`wrap ${styles.footer}`}>
        <p translate="no">Use Origens</p>
        <p>O seu lugar, do seu jeito.</p>
      </footer>
    </div>
  );
}
