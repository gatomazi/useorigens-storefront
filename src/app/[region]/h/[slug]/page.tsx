import type { Metadata } from "next";
import { PublicPage } from "@/components/pages/PublicPage";
import { permanentRedirect } from "next/navigation";
import { HUB_PAGE_SLUG, personalizationHubHref } from "@/lib/customization/hub";
import { isRegionSlug } from "@/lib/geo/regions";
import { pageMetadata, resolvePage } from "@/lib/pages/public";

export const revalidate = 3600;

// Rendered on first request, then cached (ISR) and invalidated by the publish of the page; a new URL never needs a rebuild.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ region: string; slug: string }> }): Promise<Metadata> {
  const { region, slug } = await params;
  try {
    const { region: r, page, bundle } = resolvePage(region, "hotpage", slug);
    return pageMetadata(r, page, bundle);
  } catch {
    return {};
  }
}

export default async function Page({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { region, slug } = await params;
  // The personalization page lives at its own address (src/app/[region]/personalizar).
  if (slug === HUB_PAGE_SLUG && isRegionSlug(region)) permanentRedirect(personalizationHubHref(region));
  const { region: r, bundle, page } = resolvePage(region, "hotpage", slug);
  return <PublicPage region={r} bundle={bundle} page={page} />;
}
