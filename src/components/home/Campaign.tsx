import Image from "next/image";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { SearchDialog } from "@/components/search/SearchDialog";
import { usableBannerAsset, type BannerConfig } from "@/lib/editorial/banners";
import type { RegionSlug } from "@/lib/geo/regions";

/**
 * Editorial campaign block: one sentence, one action. It is the home's own closing module (hero → styles → DDD →
 * Fala daqui → estados → cidades → campaign → footer), never a banner slice standing in front of it. A real campaign
 * photo becomes this section's background, under a near-black wash (regional-wash-dark); the headline, body and CTA
 * are always drawn in code on top of it. Without a photo, macro crops of real shirts carry the same message instead.
 * It stays the only near-black block of the home.
 */
export function Campaign({ region, crops, config }: { region: RegionSlug; crops: { imageUrl: string; family: string }[]; config: BannerConfig }) {
  const photo = usableBannerAsset("campaign", config);
  return (
    <section id="origem" aria-labelledby="origin-title" className="relative isolate overflow-hidden text-white">
      {photo ? <RegionalPhotoSection asset={photo} wash="regional-wash-dark" baseClassName="bg-[#0a0c0a]" /> : <div aria-hidden="true" className="on-ink absolute inset-0 -z-10" />}
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
          {!photo && crops.length > 0 && (
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
  );
}
