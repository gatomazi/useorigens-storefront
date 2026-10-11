import { HomeSections } from "@/components/home/HomeSections";
import { categoryProps } from "@/lib/catalog/collection-source";
import { getCatalog } from "@/lib/catalog/repository";
import { getRegionHome } from "@/lib/home";
import type { RegionSlug } from "@/lib/geo/regions";
import { landingPageHref } from "@/lib/pages/public";
import type { Page, PublishedBundle } from "@/lib/site-config/schema";

/** A published page drawn with the home's own components (sections come from the page instead of the home). `pageNumber`: the page of its paged grid. */
export function PublicPage({ region, bundle, page, pageNumber = 1 }: { region: RegionSlug; bundle: PublishedBundle; page: Page; pageNumber?: number }) {
  const catalog = getCatalog();
  const home = getRegionHome(region);
  const paging = { page: pageNumber, hrefOf: (n: number) => landingPageHref(region, page, n) };
  return <HomeSections region={region} home={home} bundle={bundle} page={page} paging={paging} {...categoryProps((store) => catalog.productsOfStore(store), bundle.docs[region])} />;
}
