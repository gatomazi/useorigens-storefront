import { notFound, permanentRedirect } from "next/navigation";
import { AllRegionsCollectionPage, allRegionsCollectionMetadata } from "@/components/catalog/AllRegionsCollectionPage";
import { allRegionsCollectionHref } from "@/lib/catalog/all-regions";

type Props = { params: Promise<{ slug: string; page: string }> };
const pageNumber = (page: string) => /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 0;

export async function generateMetadata({ params }: Props) {
  const { slug, page } = await params;
  return allRegionsCollectionMetadata(slug, pageNumber(page));
}

export default async function Page({ params }: Props) {
  const { slug, page } = await params;
  const n = pageNumber(page);
  if (!n) notFound();
  if (n === 1) permanentRedirect(allRegionsCollectionHref(slug));
  return <AllRegionsCollectionPage slug={slug} page={n} />;
}
