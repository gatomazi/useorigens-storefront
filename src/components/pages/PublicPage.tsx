import { HomeSections } from "@/components/home/HomeSections";
import { categoryProps } from "@/lib/catalog/collection-source";
import { getCatalog } from "@/lib/catalog/repository";
import { getRegionHome } from "@/lib/home";
import type { RegionSlug } from "@/lib/geo/regions";
import type { Page, PublishedBundle } from "@/lib/site-config/schema";

/** A published page drawn with the home's own components (sections come from the page instead of the home). */
export function PublicPage({ region, bundle, page }: { region: RegionSlug; bundle: PublishedBundle; page: Page }) {
  const catalog = getCatalog();
  const home = getRegionHome(region);
  return <HomeSections region={region} home={home} bundle={bundle} page={page} {...categoryProps((store) => catalog.productsOfStore(store), bundle.docs[region])} />;
}
