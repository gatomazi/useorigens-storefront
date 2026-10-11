import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PublicPage } from "@/components/pages/PublicPage";
import { landingPageHref, pagedGridPageCount, pageMetadata, resolveCollectionLanding } from "@/lib/pages/public";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ region: string; slug: string; pagina: string }> };

/** "2".."N" only: no leading zero, no sign, no "1" (the first page is the landing's own address). */
const pageNumber = (raw: string): number | null => (/^[1-9]\d{0,4}$/.test(raw) ? Number(raw) : null);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { region, slug, pagina } = await params;
  const n = pageNumber(pagina);
  if (!n || n < 2) return {};
  try {
    const { region: r, page, bundle } = resolveCollectionLanding(region, slug);
    return pageMetadata(r, page, bundle, n);
  } catch {
    return {};
  }
}

/** Page 2, 3… of a landing's paged grid (a collection page): the same page, the grid on that page. Past the last page, or no paged grid: 404. */
export default async function Page({ params }: Params) {
  const { region, slug, pagina } = await params;
  const n = pageNumber(pagina);
  if (!n) notFound();
  const { region: r, bundle, page } = resolveCollectionLanding(region, slug);
  if (n === 1) permanentRedirect(landingPageHref(r, page, 1));
  if (n > pagedGridPageCount(r, bundle, page)) notFound();
  return <PublicPage region={r} bundle={bundle} page={page} pageNumber={n} />;
}
