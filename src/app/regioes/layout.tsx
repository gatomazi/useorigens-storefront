import Link from "next/link";
import { Suspense } from "react";
import { CampaignCarry } from "@/components/analytics/CampaignCarry";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { CartMirrorMenu } from "@/components/cart-mirror/CartMirrorMenu";
import { CartRefCapture } from "@/components/cart-mirror/CartRefCapture";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { PrivacyPreferencesLink } from "@/components/consent/PrivacyPreferencesLink";
import { HeaderDropdown } from "@/components/layout/HeaderDropdown";
import { HeaderShell } from "@/components/layout/HeaderShell";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { allRegionsCatalog } from "@/lib/catalog/all-regions";
import { commercePlan } from "@/lib/catalog/commerce-mode";
import { ConsentProvider } from "@/lib/consent/ConsentProvider";
import { publishedTracking } from "@/lib/site-config/tracking";
import { regionlessStyle } from "@/lib/site-config/chrome";
import neutralStyles from "@/components/layout/RegionlessSurface.module.css";
import styles from "./regioes.module.css";

// This static route reads the runtime Volume. Never bake an empty catalog into the build.
export const dynamic = "force-dynamic";

export default function AllRegionsLayout({ children }: { children: React.ReactNode }) {
  const { collections } = allRegionsCatalog();
  const categories = collections.map((c) => ({ label: c.name, href: c.href }));
  const singleStore = commercePlan().effective === "single-store";
  const tracking = publishedTracking("global");
  return (
    <ConsentProvider>
      <CampaignCarry />
      {/* Only the physical cart belongs to Sul; no geographic browsing context is set. */}
      {singleStore && <CartRefCapture region="sul" />}
      <div className={neutralStyles.surface} style={regionlessStyle()} data-regionless>
      <HeaderShell>
        <div className="wrap site-header-row flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <MobileMenu blocks={[{ kind: "primary", label: "Explorar", items: [{ label: "Todas as regiões", href: "/regioes" }, { label: "Escolher uma região", href: "/" }] }, { kind: "categories", label: "Coleções", items: categories }]} />
            <Link href="/regioes" translate="no" aria-label="Use Origens, todas as regiões" className={styles.wordmark}>Use Origens</Link>
          </div>
          <nav aria-label="Principal" className="hidden items-center gap-8 lg:flex">
            <Link href="/regioes" className="inline-flex min-h-11 items-center font-semibold">Todas as regiões</Link>
            {categories.length > 0 && (
              <HeaderDropdown className="relative">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
                  Coleções
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                </summary>
                <ul className={styles.dropdown}>
                  {categories.map((c) => <li key={c.href}><Link href={c.href}>{c.label}</Link></li>)}
                </ul>
              </HeaderDropdown>
            )}
            <Link href="/" className="inline-flex min-h-11 items-center font-semibold">Escolher uma região</Link>
          </nav>
          {singleStore && <CartMirrorMenu region="sul" />}
        </div>
      </HeaderShell>
      <main id="conteudo">{children}</main>
      <footer className={styles.footer}>
        <div className="wrap flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <Link href="/regioes" translate="no" className={styles.wordmark}>Use Origens</Link>
          <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <Link href="/">Escolher uma região</Link>
            <Link href="/sul/privacidade">Política de Privacidade</Link>
            <PrivacyPreferencesLink />
          </nav>
        </div>
      </footer>
      </div>
      <Suspense fallback={null}>
        <MetaPixel pixelId={tracking.metaPixelId} />
        <GoogleAnalytics measurementId={tracking.ga4MeasurementId} />
      </Suspense>
      <ConsentBanner privacyHref="/sul/privacidade" />
    </ConsentProvider>
  );
}
