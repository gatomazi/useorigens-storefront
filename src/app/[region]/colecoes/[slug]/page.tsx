import type { Metadata } from "next";
import { PublicPage } from "@/components/pages/PublicPage";
import { pageMetadata, resolvePage } from "@/lib/pages/public";

export const revalidate = 3600;

// Rendered on first request, then cached (ISR) and invalidated by the publish of the page; a new URL never needs a rebuild.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ region: string; slug: string }> }): Promise<Metadata> {
  const { region, slug } = await params;
  try {
    const { region: r, page, bundle } = resolvePage(region, "categoryLanding", slug);
    return pageMetadata(r, page, bundle);
  } catch {
    return {};
  }
}

export default async function Page({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { region, slug } = await params;
  const { region: r, bundle, page } = resolvePage(region, "categoryLanding", slug);
  return <PublicPage region={r} bundle={bundle} page={page} />;
}
