import type { Metadata } from "next";
import { LockedCollection } from "@/components/pages/LockedCollection";
import { PublicPage } from "@/components/pages/PublicPage";
import { pageMetadata, resolveCollectionLanding } from "@/lib/pages/public";

// One minute (it was an hour): a collection of the Black calendar opens at Brasília midnight (src/lib/site-config/checkpoints.ts).
export const revalidate = 60;

// Rendered on first request, then cached (ISR) and invalidated by a publish or a catalog sync; a new URL never needs a rebuild.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ region: string; slug: string }> }): Promise<Metadata> {
  const { region, slug } = await params;
  try {
    const { region: r, page, bundle, locked } = resolveCollectionLanding(region, slug);
    // Closed by the calendar: nothing of the offer in the title or the preview, and never indexed.
    if (locked) return { title: "Em breve", robots: { index: false, follow: false } };
    return pageMetadata(r, page, bundle);
  } catch {
    return {};
  }
}

/** A parent-category landing of the CMS or, when there is none at this address, the page of the region's collection with that slug (page 1). */
export default async function Page({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { region, slug } = await params;
  const { region: r, bundle, page, compact, locked } = resolveCollectionLanding(region, slug);
  if (locked) return <LockedCollection region={r} opensAt={locked} />;
  return <PublicPage region={r} bundle={bundle} page={page} compactHero={compact} />;
}
