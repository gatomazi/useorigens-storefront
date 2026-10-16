import Image from "next/image";
import type { ReactNode } from "react";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { SearchDialog } from "@/components/search/SearchDialog";
import { BannerBackground } from "@/components/banners/BannerBackground";
import { usableBannerAsset, type BannerAsset, type BannerConfig } from "@/lib/editorial/banners";
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
  split,
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
  /**
   * "split" (CMS `variant`): the picture on one half and the text on the other, both edge to edge. `figure` = the section's picture (null: the crops
   * of real shirts stand in), `panel` = the text half's colour layer (null: the region's colour), `panelTone` = its text ("light" = white).
   */
  split?: { figure: BannerAsset | null; panel: ReactNode; panelTone: "light" | "dark" };
}) {
  if (split) return <SplitCampaign region={region} crops={crops} copy={copy} anchor={anchor} headingId={headingId} cta={cta} split={split} />;
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

/**
 * The split campaign: the picture (or two crops of real shirts) fills one half, the text sits on a colour of its own on the other, and both halves run
 * to the edges of the window; only the text keeps to a reading width. Phones: the picture on top, a wide band, then the text. The one action is the
 * configured button (a real destination) or the city search; nothing else in the block looks clickable.
 */
function SplitCampaign({
  region, crops, copy, anchor, headingId, cta, split,
}: {
  region: RegionSlug;
  crops: { imageUrl: string; family: string }[];
  copy: { title: string; body: string };
  anchor: string;
  headingId: string;
  cta?: { label: string; href: string };
  split: NonNullable<Parameters<typeof Campaign>[0]["split"]>;
}) {
  const light = split.panelTone === "light";
  return (
    <section id={anchor} aria-labelledby={headingId} className="grid lg:grid-cols-2">
      <div className="relative aspect-[16/10] overflow-hidden bg-[#141414] sm:aspect-[16/8] lg:aspect-auto lg:min-h-[36rem]">
        {split.figure ? (
          <BannerBackground asset={split.figure} sizes="(min-width: 1024px) 50vw, 100vw" alt={split.figure.alt} />
        ) : (
          <div className="absolute inset-0 grid grid-cols-2" aria-hidden="true">
            {crops.map((crop) => (
              <span key={crop.family} className="relative block overflow-hidden">
                <Image src={crop.imageUrl} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" quality={80} className={`origin-[50%_50%] object-cover ${crop.family === "feito-em" ? "scale-[1.2]" : "scale-[1.7]"}`} />
              </span>
            ))}
          </div>
        )}
      </div>
      <div className={`relative isolate flex items-center ${light ? "text-white" : "text-ink"}`}>
        {split.panel ?? <div aria-hidden="true" className="absolute inset-0 -z-10 bg-region-primary" />}
        <div className="w-full px-[var(--gutter)] py-12 sm:py-14 lg:max-w-[40rem] lg:px-14 lg:py-20 xl:px-20">
          <span aria-hidden="true" className="mb-5 block h-[3px] w-12 bg-region-accent" />
          <h2 id={headingId} className="font-display text-[clamp(2.5rem,5.2vw,4.75rem)] font-extrabold uppercase leading-[0.95] tracking-[0.004em] [text-wrap:balance]">
            {copy.title}
          </h2>
          {copy.body && <p className={`t-body mt-5 max-w-md ${light ? "text-white/85" : "text-ink-soft"}`}>{copy.body}</p>}
          <div className="mt-8">
            {cta ? (
              <a href={cta.href} className={`btn ${light ? "btn-light" : ""}`}>
                {cta.label}
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            ) : (
              <SearchDialog region={region} variant="cta" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
