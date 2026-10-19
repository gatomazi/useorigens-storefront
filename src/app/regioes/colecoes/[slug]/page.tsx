import { AllRegionsCollectionPage, allRegionsCollectionMetadata } from "@/components/catalog/AllRegionsCollectionPage";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return allRegionsCollectionMetadata((await params).slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <AllRegionsCollectionPage slug={(await params).slug} />;
}
