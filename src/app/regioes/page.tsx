import type { Metadata } from "next";
import Link from "next/link";
import { ProductCarousel } from "@/components/catalog/ProductCarousel";
import { SOURCES } from "@/lib/analytics/sources";
import { allRegionsCatalog } from "@/lib/catalog/all-regions";
import { numberPt } from "@/lib/format";
import { pageOpenGraph } from "@/lib/seo/open-graph";
import { storeCardButton } from "@/lib/site-config/cards";
import styles from "./regioes.module.css";

const description = "Explore as coleções da Use Origens com produtos de todas as regiões em um só lugar.";
export const metadata: Metadata = {
  title: "Todas as regiões",
  description,
  alternates: { canonical: "/regioes" },
  openGraph: pageOpenGraph({ title: "Todas as regiões | Use Origens", description, path: "/regioes" }),
};

export default function AllRegionsHome() {
  const { collections, featured } = allRegionsCatalog();
  const buy = storeCardButton();
  return (
    <>
      <section className={`wrap ${styles.intro}`}>
        <h1>Todas as suas origens.</h1>
        <p>Do Sul ao Norte, passando pelo Centro-Oeste. Explore nossas coleções com produtos de todas as regiões em um só lugar.</p>
        <a href="#colecoes" className="btn">Explorar coleções</a>
      </section>
      <section id="colecoes" aria-labelledby="colecoes-title" className={`wrap ${styles.collections}`}>
        <h2 id="colecoes-title">Encontre sua coleção</h2>
        {collections.length ? (
          <ul className={styles.collectionList}>
            {collections.map((c) => (
              <li key={c.slug}>
                <Link href={c.href}>
                  <span>{c.name}</span>
                  <span className={styles.count}>{numberPt.format(c.total)} {c.total === 1 ? "produto" : "produtos"}</span>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p>As coleções estão sendo atualizadas. Volte em instantes.</p>}
      </section>
      {featured.map((c, i) => (
        <section key={c.slug} className={`wrap ${styles.productSection}`}>
          <ProductCarousel items={c.items.slice(0, 8)} title={c.name} labelledBy={`colecao-${c.slug}`} viewAllHref={c.href} viewAllLabel={`Ver todos (${numberPt.format(c.total)})`} sourceSection={SOURCES.homeCollection} buy={buy} eager={i === 0} />
        </section>
      ))}
    </>
  );
}
