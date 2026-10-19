import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SOURCES } from "@/lib/analytics/sources";
import { ALL_REGIONS_PAGE_SIZE, allRegionsCatalog, allRegionsCollectionHref } from "@/lib/catalog/all-regions";
import { numberPt } from "@/lib/format";
import { collectionFacets } from "@/lib/search/collection-filter";
import { pageOpenGraph } from "@/lib/seo/open-graph";
import { storeCardButton } from "@/lib/site-config/cards";
import styles from "@/app/regioes/regioes.module.css";
import { CollectionBrowser } from "./CollectionBrowser";
import { Pagination } from "./Pagination";

export function allRegionsCollectionMetadata(slug: string, page = 1): Metadata {
  const collection = allRegionsCatalog().find(slug);
  if (!collection) return {};
  const title = `${collection.name}${page > 1 ? ` — Página ${page}` : ""}`;
  const description = `${collection.name}: explore os produtos desta coleção de todas as regiões na Use Origens.`;
  const path = allRegionsCollectionHref(slug, page);
  return { title, description, alternates: { canonical: path }, robots: { index: false, follow: true }, openGraph: pageOpenGraph({ title: `${title} | Use Origens`, description, path }) };
}

export function AllRegionsCollectionPage({ slug, page = 1 }: { slug: string; page?: number }) {
  const collection = allRegionsCatalog().find(slug);
  if (!collection) notFound();
  const pageCount = Math.ceil(collection.total / ALL_REGIONS_PAGE_SIZE);
  if (!Number.isSafeInteger(page) || page < 1 || page > pageCount) notFound();
  const start = (page - 1) * ALL_REGIONS_PAGE_SIZE;
  const items = collection.items.slice(start, start + ALL_REGIONS_PAGE_SIZE);
  return (
    <div className="wrap">
      <header className={styles.collectionIntro}>
        <nav aria-label="Navegação estrutural"><Link href="/regioes">Todas as regiões</Link><span aria-hidden="true"> / </span><span aria-current="page">{collection.name}</span></nav>
        <h1>{collection.name}</h1>
        <p>Todos os produtos desta coleção, de todas as regiões.</p>
      </header>
      <div className={styles.collectionGrid}>
        <CollectionBrowser region="regioes" slug={slug} items={items} facets={collectionFacets(collection.items, {})}
          grid={{ title: "Produtos", labelledBy: "produtos-title", sourceSection: SOURCES.collectionPage, compact: true, buy: storeCardButton() }}
          aside={<p className="text-sm text-ink-soft">{numberPt.format(start + 1)}–{numberPt.format(start + items.length)} de {numberPt.format(collection.total)} produtos</p>}
          footer={<Pagination page={page} pageCount={pageCount} hrefOf={(n) => allRegionsCollectionHref(slug, n)} label={`Páginas de ${collection.name}`} />}
        />
      </div>
    </div>
  );
}
