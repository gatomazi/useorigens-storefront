import { notFound } from "next/navigation";
import { AnnouncementBar, Footer, Header } from "@/components/layout/SiteChrome";
import { getCatalog } from "@/lib/catalog/repository";
import { isRegionSlug } from "@/lib/geo/regions";
import { regionThemeStyle } from "@/lib/theme/region-theme";
import { ENABLED_REGIONS } from "@/lib/site";

export function generateStaticParams() {
  return ENABLED_REGIONS.map((region) => ({ region }));
}

export default async function RegionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !ENABLED_REGIONS.includes(region)) notFound();

  const catalog = getCatalog();
  return (
    <div data-region={region} style={regionThemeStyle(region)} className="relative">
      <AnnouncementBar region={region} cityCount={catalog.coveredCityIds(region).size} />
      <Header region={region} />
      <main id="conteudo">{children}</main>
      <Footer region={region} syncedAt={catalog.syncedAt} />
    </div>
  );
}
