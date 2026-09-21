import Image from "next/image";
import { RegionalBanner } from "@/components/banners/RegionalBanner";
import { SearchDialog } from "@/components/search/SearchDialog";
import type { BannerConfig } from "@/lib/editorial/banners";
import type { RegionSlug } from "@/lib/geo/regions";

/**
 * Editorial campaign block: one sentence, one action. Real campaign photography fills this slot when it
 * exists; until then macro crops of real shirts carry it. It is the only black block of the home.
 */
export function Campaign({ region, crops, config }: { region: RegionSlug; crops: { imageUrl: string; family: string }[]; config: BannerConfig }) {
  return (
    <RegionalBanner
      slot="campaign"
      config={config}
      fallback={
        <section id="origem" aria-labelledby="origin-title" className="on-ink overflow-hidden">
          <div className="wrap py-14 lg:py-24">
            <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
              <div className="lg:col-span-6">
                <h2 id="origin-title" className="t-h2 [text-wrap:balance]">
                  Nome, número e jeito de falar: cada cidade do Sul tem os seus.
                </h2>
                <p className="t-body mt-5 max-w-md text-white/80">O nome da cidade, o mapa, o DDD, a expressão de cada canto. A gente põe isso na camiseta.</p>
                <div className="mt-8">
                  <SearchDialog region={region} variant="cta" />
                </div>
              </div>
              {crops.length > 0 && (
                <div className="grid grid-cols-2 gap-3 lg:col-span-6 lg:gap-6" aria-hidden="true">
                  {crops.map((crop, i) => (
                    <span key={crop.family} className={`relative block aspect-[4/5] overflow-hidden bg-[#141414] ${i === 1 ? "mt-8 lg:mt-14" : ""}`}>
                      <Image
                        src={crop.imageUrl}
                        alt=""
                        fill
                        // Large variant on purpose: the crop is scaled up in CSS, so a small srcset entry would blur.
                        sizes="(min-width: 1024px) 60vw, 100vw"
                        quality={80}
                        className={`origin-[50%_50%] object-cover ${crop.family === "feito-em" ? "scale-[1.2]" : "scale-[1.7]"}`}
                      />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      }
    />
  );
}
