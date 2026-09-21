import Link from "next/link";
import { RegionalBanner } from "@/components/banners/RegionalBanner";
import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { SearchDialog } from "@/components/search/SearchDialog";
import type { BannerConfig } from "@/lib/editorial/banners";
import { numberPt } from "@/lib/format";
import type { DddCard } from "@/lib/home";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";

/**
 * Hero, direction A ("De qual Sul você é?"): headline, search and one real DDD shirt per state, all inside the
 * first screen of a phone. When a real hero photograph exists (direction B) the same slot renders it instead.
 */
export function RegionHero({ region, cityCount, trio, config }: { region: RegionSlug; cityCount: number; trio: DddCard[]; config: BannerConfig }) {
  const r = REGIONS[region];
  return (
    <RegionalBanner
      slot="hero"
      config={config}
      priority
      fallback={
        <section aria-labelledby="hero-title" className="wrap pb-10 pt-5 lg:pb-16 lg:pt-10">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-8">
            <div className="lg:col-span-6">
              <h1 id="hero-title" className="t-display">
                De qual Sul
                <br />
                você é?
              </h1>
              <p className="t-body mt-5 max-w-md text-ink-soft">Cidades, DDDs e o jeito de falar de cada canto, em camiseta.</p>
              <div className="mt-6 max-w-xl">
                <SearchDialog region={region} variant="hero" />
              </div>
              <p className="t-caption mt-3">
                {numberPt.format(cityCount)} cidades em {r.ufs.length} estados.{" "}
                <a href="#estados" className="link-static font-semibold text-ink">
                  Ou comece pelo estado.
                </a>
              </p>
            </div>

            {trio.length > 0 && (
              <ul className="grid grid-cols-3 items-start gap-3 sm:gap-5 lg:col-span-6">
                {trio.map((d, i) => (
                  <li key={`${d.code}-${d.regionName}`} className={`settle settle-${i + 1} ${i === 1 ? "mt-6 sm:mt-10" : ""}`}>
                    <Link href="#geografia" className="group block">
                      <ProductPhoto src={d.imageUrl} alt={`Camiseta com o DDD ${d.code}, ${d.regionName}, ${d.stateName}`} sizes="(min-width: 768px) 16vw, 30vw" priority />
                      <p className="mt-2 font-display text-[1.5rem] font-extrabold leading-none sm:text-[2rem]">{d.code}</p>
                      <p className="mt-1 text-[0.8125rem] font-semibold leading-tight sm:text-[0.9375rem]">{d.regionName}</p>
                      <p className="t-place text-[0.8125rem] text-ink-mute sm:text-[0.9375rem]">{d.uf}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      }
    >
      {/* With a real hero photograph (direction B) the search sits on the image, inside the first screen. */}
      <SearchDialog region={region} variant="hero" />
    </RegionalBanner>
  );
}
