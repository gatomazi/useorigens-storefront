import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { MeusLugaresView } from "@/components/favorites/MeusLugaresView";
import { commercePlan, storeForRegion } from "@/lib/catalog/commerce-mode";
import { REGIONS } from "@/lib/geo/regions";

type Props = { params: Promise<{ region: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionSlug(region)) return {};
  // A personal, per-device list has nothing for a crawler to index (see /busca's own robots handling).
  return { title: "Meus Lugares", robots: { index: false, follow: true }, alternates: { canonical: `/${region}/meus-lugares` } };
}

/**
 * "Meus Lugares": the estampas the visitor saved (heart icon), read entirely from this browser's own storage —
 * there is nothing to render on the server (see src/lib/favorites/store.ts), so the page is a thin client shell.
 */
export default async function MeusLugaresPage({ params }: Props) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) notFound();
  return (
    <div className="wrap py-10 lg:py-16">
      {/* Single-store mode: the single store sells, but the list is shown under the region being browsed (navigation ≠ supplying store). */}
      <MeusLugaresView region={region} storeLabels={commercePlan().effective === "single-store" ? { [storeForRegion(region)]: REGIONS[region].name } : {}} />
    </div>
  );
}
