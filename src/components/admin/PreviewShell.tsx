import { AnnouncementBar, Footer, Header } from "@/components/layout/SiteChrome";
import { ConsentProvider } from "@/lib/consent/ConsentProvider";
import type { RegionSlug } from "@/lib/geo/regions";
import { regionThemeStyle } from "@/lib/theme/region-theme";
import { PreviewGuard } from "./PreviewGuard";

/**
 * The storefront's own chrome (announcement bar, header, footer) around the page under preview — the same components and theme as
 * `src/app/[region]/layout.tsx` — but WITHOUT MetaPixel, GoogleAnalytics or the consent banner, and with links and forms disabled.
 */
/** `cssVars` / `onBrand`: the palette and the home theme of the document under preview (the draft's), drawn like the region layout does. */
export function PreviewShell({ region, cityCount, syncedAt, label, cssVars = {}, onBrand = false, children }: { region: RegionSlug; cityCount: number; syncedAt: string | null; label: string; cssVars?: Record<string, string>; onBrand?: boolean; children: React.ReactNode }) {
  return (
    <ConsentProvider>
      <div data-region={region} style={{ ...regionThemeStyle(region), ...cssVars, ...(cssVars["--ground"] ? { background: "var(--ground)" } : {}), ...(cssVars["--ink"] ? { color: "var(--ink)" } : {}) }} className="relative">
        <AnnouncementBar region={region} cityCount={cityCount} />
        <Header region={region} />
        <main id="conteudo">{children}</main>
        <Footer region={region} syncedAt={syncedAt} onBrand={onBrand} />
      </div>
      <div className="pointer-events-none fixed bottom-3 left-3 z-50 bg-black px-3 py-1.5 text-[0.6875rem] font-extrabold uppercase tracking-[0.08em] text-white">{label}</div>
      <PreviewGuard />
    </ConsentProvider>
  );
}
