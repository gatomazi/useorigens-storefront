import type { Metadata } from "next";
import { PublicPage } from "@/components/pages/PublicPage";
import { pageMetadata, resolveCollectionLanding } from "@/lib/pages/public";

export const revalidate = 3600;

// Rendered on first request, then cached (ISR) and invalidated by a publish or a catalog sync; a new URL never needs a rebuild.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ region: string; slug: string }> }): Promise<Metadata> {
  const { region, slug } = await params;
  try {
    const { region: r, page, bundle } = resolveCollectionLanding(region, slug);
    return pageMetadata(r, page, bundle);
  } catch {
    return {};
  }
}

/** A parent-category landing of the CMS or, when there is none at this address, the page of the region's collection with that slug (page 1). */
export default async function Page({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { region, slug } = await params;
  const { region: r, bundle, page } = resolveCollectionLanding(region, slug);
  return <PublicPage region={r} bundle={bundle} page={page} />;
}
