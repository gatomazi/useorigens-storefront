import Link from "next/link";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { SearchDialog } from "@/components/search/SearchDialog";
import { usableBannerAsset, type BannerConfig } from "@/lib/editorial/banners";
import { numberPt } from "@/lib/format";
import type { HeroFamilyCard } from "@/lib/home";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";

/**
 * Hero ("De qual Sul você é?"): headline, search and the three commercial families (Ponto de Origem, Feito em,
 * Coordenadas), one real product each. Everything is drawn in code.
 *
 * Left: headline, subtext, search, supporting line. Right: three product cards (name, city/UF, price). On phones the
 * cards are a horizontal snap row instead of three squeezed thumbnails.
 *
 * The regional background (config.asset), when set, is only a landscape behind the content, under one light, warm
 * wash (RegionalPhotoSection) so the banner sits close to the page. Text stays black. Without an image the hero is
 * the plain typographic one.
 *
 * Regional colour here is small on purpose: a gold rule (accent) above the headline and on each card, gold card
 * borders, an olive (primary) link and olive card hover. Cards keep a neutral surface: the INK photos are shot on an
 * opaque #e5e5e5, so the card surface IS that colour and the mockup disappears into it (no white frame, art untouched).
 */
export function RegionHero({ region, cityCount, trio, config }: { region: RegionSlug; cityCount: number; trio: HeroFamilyCard[]; config: BannerConfig }) {
  const r = REGIONS[region];
  const background = usableBannerAsset("hero", config);
  return (
    <section aria-labelledby="hero-title" className="relative isolate">
      {background && <RegionalPhotoSection asset={background} priority />}
      <div className="wrap pb-10 pt-6 lg:pb-16 lg:pt-12">
        <div className="grid gap-7 lg:grid-cols-12 lg:items-center lg:gap-8">
          <div className="lg:col-span-6">
            <span aria-hidden="true" className="mb-4 block h-[3px] w-12 bg-region-accent" />
            <h1 id="hero-title" className="t-display">
              O seu lugar,
              <br />
              do seu jeito.
            </h1>
            <p className="t-body mt-5 max-w-md text-ink">Encontre sua cidade e vista o lugar que faz parte de você.</p>
            <div className="mt-6 max-w-xl">
              <SearchDialog region={region} variant="hero" />
            </div>
            <p className="t-caption regional-caption mt-3">
              {numberPt.format(cityCount)} cidades do {r.name} em camiseta.{" "}
              <a href="#estados" className="link-static font-semibold text-ink decoration-region-primary decoration-2">
                Ou explore por estado.
              </a>
            </p>
          </div>

          {trio.length > 0 && (
            <ul className="no-scrollbar -mx-[var(--gutter)] flex snap-x snap-mandatory scroll-pl-[var(--gutter)] gap-3 overflow-x-auto px-[var(--gutter)] pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:col-span-6">
              {trio.map((d, i) => (
                <li key={d.familyId} className={`settle settle-${i + 1} w-[62%] max-w-[17rem] shrink-0 snap-start sm:w-[44%] md:w-auto md:max-w-none`}>
                  <Link
                    href={d.href}
                    className="group block overflow-hidden rounded-sm border border-region-accent bg-ground text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06),0_14px_30px_-18px_rgb(0_0_0/0.35)] transition-colors hover:border-region-primary focus-visible:border-region-primary"
                  >
                    <ProductPhoto src={d.imageUrl} alt={`Camiseta ${d.familyName} de ${d.cityName}`} sizes="(min-width: 1024px) 15vw, (min-width: 768px) 28vw, 62vw" priority={i < 2} />
                    <div className="px-3.5 pb-4 pt-0.5 sm:px-4">
                      <span aria-hidden="true" className="mb-2 block h-[3px] w-6 bg-region-accent transition-colors group-hover:bg-region-primary" />
                      <p className="text-[0.9375rem] font-bold leading-tight [overflow-wrap:anywhere] sm:text-[1.0625rem]">{d.familyName}</p>
                      {/* Not .t-place: that unlayered class would override the size utilities below. */}
                      <p className="mt-0.5 font-[family-name:var(--font-serif-stack)] text-[0.9375rem] font-medium leading-[1.15] text-ink-mute [overflow-wrap:anywhere] sm:text-[1.0625rem]">
                        {d.cityName} · {d.uf}
                      </p>
                      {d.price && <p className="mt-2 text-[0.9375rem] font-semibold sm:text-base">{d.price}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
