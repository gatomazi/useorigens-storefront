import { AnnouncementBar, Footer, Header } from "@/components/layout/SiteChrome";
import { ConsentProvider } from "@/lib/consent/ConsentProvider";
import type { RegionSlug } from "@/lib/geo/regions";
import { regionThemeStyle } from "@/lib/theme/region-theme";
import { PreviewGuard } from "./PreviewGuard";

/**
 * The storefront's own chrome (announcement bar, header, footer) around the page under preview — the same components and theme as
 * `src/app/[region]/layout.tsx` — but WITHOUT MetaPixel, GoogleAnalytics or the consent banner, and with links and forms disabled.
 */
export function PreviewShell({ region, cityCount, syncedAt, label, children }: { region: RegionSlug; cityCount: number; syncedAt: string | null; label: string; children: React.ReactNode }) {
  return (
    <ConsentProvider>
      <div data-region={region} style={regionThemeStyle(region)} className="relative">
        <AnnouncementBar region={region} cityCount={cityCount} />
        <Header region={region} />
        <main id="conteudo">{children}</main>
        <Footer region={region} syncedAt={syncedAt} />
      </div>
      <div className="pointer-events-none fixed bottom-3 left-3 z-50 bg-black px-3 py-1.5 text-[0.6875rem] font-extrabold uppercase tracking-[0.08em] text-white">{label}</div>
      <PreviewGuard />
    </ConsentProvider>
  );
}
