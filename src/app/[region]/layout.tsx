import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CartRefCapture } from "@/components/cart-mirror/CartRefCapture";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { ConsentProvider } from "@/lib/consent/ConsentProvider";
import { AnnouncementBar, Footer, Header } from "@/components/layout/SiteChrome";
import { getCatalog } from "@/lib/catalog/repository";
import { isRegionSlug } from "@/lib/geo/regions";
import { regionThemeStyle } from "@/lib/theme/region-theme";
import { regionChrome } from "@/lib/site-config/chrome";
import { isRegionLaunched } from "@/lib/regions/launched";
import { publishedTracking } from "@/lib/site-config/tracking";

// No region page is prebuilt: this layout reads the catalog snapshot (header count, footer sync date), and the
// snapshot lives on the runtime Volume, which does not exist at `next build` time. Prebuilding `/sul` baked an
// empty catalog ("0 cidades", no hero products) into the cached HTML until the next revalidation. Rendering on
// first request (then ISR-cached) is the same pattern the state, city and PDP routes already use.
export function generateStaticParams() {
  return [];
}

export default async function RegionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) notFound();

  const catalog = getCatalog();
  const tracking = publishedTracking(region);
  // The CMS palette (global or the region's own) as CSS variables over the region's; empty, and so a no-op, when nothing is configured.
  const { cssVars } = regionChrome(region);
  return (
    <ConsentProvider>
      <CartRefCapture region={region} />
      <div data-region={region} style={{ ...regionThemeStyle(region), ...cssVars, ...(cssVars["--ground"] ? { background: "var(--ground)" } : {}), ...(cssVars["--ink"] ? { color: "var(--ink)" } : {}) }} className="relative">
        <AnnouncementBar region={region} cityCount={catalog.coveredCityIds(region).size} />
        <Header region={region} />
        <main id="conteudo">{children}</main>
        <Footer region={region} syncedAt={catalog.syncedAt} />
      </div>
      {/* useSearchParams inside MetaPixel/GoogleAnalytics needs a Suspense boundary so the rest of the tree can still prerender. */}
      <Suspense fallback={null}>
        <MetaPixel pixelId={tracking?.metaPixelId} />
        <GoogleAnalytics measurementId={tracking?.ga4MeasurementId} />
      </Suspense>
      <ConsentBanner region={region} />
    </ConsentProvider>
  );
}
