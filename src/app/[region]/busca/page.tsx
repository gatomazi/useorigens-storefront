import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { TrackedInkLink } from "@/components/analytics/TrackedInkLink";
import { SOURCES } from "@/lib/analytics/sources";
import { regionSearchDocs } from "@/lib/catalog/search-docs";
import { formatPrice, numberPt } from "@/lib/format";
import { REGIONS, isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { cleanQuery, MAX_QUERY_CHARS, parsePage, searchDocs } from "@/lib/search/catalog-search";

// Every query is its own page: never prerendered nor ISR-cached (the region layout above is generateStaticParams/ISR, and reading `searchParams` alone
// makes a production render fail with DYNAMIC_SERVER_USAGE there).
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ region: string }>; searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionSlug(region)) return {};
  const q = cleanQuery((await searchParams).q);
  // Results pages are for people, not for the index: any query would otherwise become a crawlable URL.
  return { title: q ? `Busca por “${q}”` : "Buscar estampas", robots: { index: false, follow: true }, alternates: { canonical: `/${region}/busca` } };
}

/** `/busca?q=…&page=…` keeps the query encoded by URLSearchParams and omits `page` on the first page, so the URL is the whole state (back/forward just work). */
const pageHref = (region: string, q: string, page: number): string => {
  const params = new URLSearchParams({ q });
  if (page > 1) params.set("page", String(page));
  return `/${region}/busca?${params}`;
};

/** Page numbers to show: first, last, and a window around the current one, with gaps as `null`. */
function pageWindow(current: number, count: number): (number | null)[] {
  const wanted = new Set([1, count, current - 1, current, current + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - (pages[i - 1] ?? 0) > 1) out.push(null);
    out.push(p);
  });
  return out;
}

/**
 * Text search over the region's whole catalog (city designs, expressions, state lines, collections…). Distinct from the header's "Buscar cidade":
 * that one resolves a place, this one lists PRODUCTS. A plain GET form, so the URL is canonical, shareable and works without JavaScript; the INK
 * header sends people here with `?q=` (and, when they have a cart, `cart_ref`, which the layout's `CartRefCapture` handles independently of `q`).
 */
export default async function SearchPage({ params, searchParams }: Props) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) notFound();
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const result = q ? searchDocs(regionSearchDocs(region), q, { page: parsePage(sp.page) }) : null;
  const regionName = REGIONS[region].name;

  return (
    <div className="wrap py-10 lg:py-16">
      <h1 className="t-h2 max-w-2xl">Buscar estampas</h1>
      <p className="t-body mt-3 max-w-2xl text-ink-soft">Cidade, estado, expressão, estampa ou coleção: mostramos todos os produtos da Use {regionName} que combinam.</p>

      <form action={`/${region}/busca`} method="get" role="search" className="mt-6 flex max-w-2xl gap-2">
        <label htmlFor="busca-q" className="sr-only">
          Buscar estampas
        </label>
        <input
          id="busca-q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={MAX_QUERY_CHARS}
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Ex.: Florianópolis, chimarrão, Bah"
          className="min-h-12 min-w-0 flex-1 border-2 border-ink bg-white px-4 text-[1rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <button type="submit" className="btn min-h-12 px-5">
          Buscar
        </button>
      </form>

      {!result ? (
        <p className="t-body mt-10 text-ink-soft">Digite um termo para ver os produtos.</p>
      ) : result.total === 0 ? (
        <section className="mt-10 max-w-2xl" aria-live="polite">
          <h2 className="t-h3">Nenhum produto encontrado para “{q}”</h2>
          <p className="t-body mt-2 text-ink-soft">Confira a grafia, tente uma palavra só ou busque pelo nome da cidade ou do estado.</p>
          <p className="mt-4">
            <Link href={`/${region}`} className="link-line text-[0.9375rem] font-semibold">
              Ver a página inicial da Use {regionName}
            </Link>
          </p>
        </section>
      ) : (
        <>
          <p className="t-small mt-8 text-ink-soft" aria-live="polite">
            {numberPt.format(result.total)} {result.total === 1 ? "produto" : "produtos"} para “{q}”
            {result.pageCount > 1 ? ` · página ${numberPt.format(result.page)} de ${numberPt.format(result.pageCount)}` : ""}
          </p>
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
            {result.items.map((item, i) => (
              <li key={item.id}>
                <TrackedInkLink
                  href={item.href}
                  params={{ productId: item.id, sourceSection: SOURCES.search, state: item.uf ?? undefined, value: item.price ?? undefined, productName: item.title, destinationUrl: item.href }}
                  className="group block"
                >
                  <ProductPhoto src={item.imageUrl} alt={item.context ? `${item.title}, ${item.context}` : item.title} sizes="(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 46vw" priority={i < 4} />
                  <div className="mt-3">
                    <h2 className="t-h3 link-line inline">{item.title}</h2>
                    {item.context && <p className="t-place mt-1 text-[0.95rem] text-ink-mute">{item.context}</p>}
                    {formatPrice(item.price) && <p className="t-small mt-0.5 font-semibold">{formatPrice(item.price)}</p>}
                  </div>
                </TrackedInkLink>
              </li>
            ))}
          </ul>

          {result.pageCount > 1 && (
            <nav aria-label="Paginação dos resultados" className="mt-12 flex flex-wrap items-center gap-2">
              {result.page > 1 && (
                <Link href={pageHref(region, q, result.page - 1)} rel="prev" className="btn-ghost inline-flex min-h-11 items-center px-4">
                  Anterior
                </Link>
              )}
              {pageWindow(result.page, result.pageCount).map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} aria-hidden="true" className="px-1">
                    …
                  </span>
                ) : p === result.page ? (
                  <span key={p} aria-current="page" className="inline-flex min-h-11 min-w-11 items-center justify-center border-2 border-ink bg-ink px-3 font-semibold text-white">
                    {p}
                  </span>
                ) : (
                  <Link key={p} href={pageHref(region, q, p)} className="inline-flex min-h-11 min-w-11 items-center justify-center border-2 border-ink px-3 font-semibold hover:bg-ink hover:text-white">
                    {p}
                  </Link>
                ),
              )}
              {result.page < result.pageCount && (
                <Link href={pageHref(region, q, result.page + 1)} rel="next" className="btn-ghost inline-flex min-h-11 items-center px-4">
                  Próxima
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
