import Image from "next/image";
import type { ReactNode } from "react";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { SearchDialog } from "@/components/search/SearchDialog";
import { usableBannerAsset, type BannerConfig } from "@/lib/editorial/banners";
import type { RegionSlug } from "@/lib/geo/regions";

/**
 * Editorial campaign block: one sentence, one action. It is the home's own closing module — the last section
 * before the footer (see the order comment on `src/app/[region]/page.tsx`) — never a banner slice standing in
 * front of it. A real campaign
 * photo becomes this section's background, under a near-black wash (regional-wash-dark); the headline, body and CTA
 * are always drawn in code on top of it. Without a photo, macro crops of real shirts carry the same message instead.
 * It stays the only near-black block of the home.
 */
const CAMPAIGN_COPY = {
  title: "Nome, número e jeito de falar: cada cidade do Sul tem os seus.",
  body: "O nome da cidade, o mapa, o DDD, a expressão de cada canto. A gente põe isso na camiseta.",
};

export function Campaign({
  region,
  crops,
  config,
  copy = CAMPAIGN_COPY,
  backdrop,
  anchor = "origem",
  headingId = "origin-title",
  cta,
}: {
  region: RegionSlug;
  crops: { imageUrl: string; family: string }[];
  config: BannerConfig;
  copy?: { title: string; body: string };
  /**
   * Config-driven background (CMS). `node` is the layer to draw (`null` = the block's own near-black surface),
   * `hasImage` whether a photo is published, `showCrops` whether the macro crops stand in for a missing photo.
   */
  backdrop?: { node: ReactNode; hasImage: boolean; showCrops: boolean };
  /** DOM ids of the section and its heading (several campaigns may exist on one home; the defaults are the original ones). */
  anchor?: string;
  headingId?: string;
  /** A configured button. Absent = the original "Encontrar minha cidade" search. */
  cta?: { label: string; href: string };
}) {
  const legacyPhoto = backdrop ? null : usableBannerAsset("campaign", config);
  const photo = backdrop ? backdrop.hasImage : legacyPhoto !== null;
  const showCrops = backdrop ? backdrop.showCrops : !photo;
  return (
    <section id={anchor} aria-labelledby={headingId} className="relative isolate overflow-hidden text-white">
      {backdrop ? (
        (backdrop.node ?? <div aria-hidden="true" className="on-ink absolute inset-0 -z-10" />)
      ) : legacyPhoto ? (
        <RegionalPhotoSection asset={legacyPhoto} wash="regional-wash-dark" baseClassName="bg-[#0a0c0a]" />
      ) : (
        <div aria-hidden="true" className="on-ink absolute inset-0 -z-10" />
      )}
      <div className="wrap py-14 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-6">
            <h2 id={headingId} className="t-h2 [text-wrap:balance]">
              {copy.title}
            </h2>
            {copy.body && <p className="t-body mt-5 max-w-md text-white/80">{copy.body}</p>}
            <div className="mt-8">
              {cta ? (
                <a href={cta.href} className="btn btn-light">
                  {cta.label}
                </a>
              ) : (
                <SearchDialog region={region} variant="cta" />
              )}
            </div>
          </div>
          {showCrops && crops.length > 0 && (
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
