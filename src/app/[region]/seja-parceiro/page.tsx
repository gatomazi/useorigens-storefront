import type { Metadata } from "next";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { PartnerForm } from "@/components/partners/PartnerForm";
import { adminConfig } from "@/lib/admin/config";
import { citiesOfState, getCatalog } from "@/lib/catalog/repository";
import { bannerFor, usableBannerAsset } from "@/lib/editorial/banners";
import { numberPt } from "@/lib/format";
import { REGION_SLUGS, REGIONS, isRegionSlug, type RegionSlug } from "@/lib/geo/regions";
import { getRegionHome } from "@/lib/home";
import { PARTNER_PROFILES, PROFILE_SLUG, type PartnerProfile } from "@/lib/partners/application";
import { APPLY, BENEFITS, FAQ, HERO, PROFILES, PROFILES_INTRO, SOCIAL_PROOF, STEPS } from "@/lib/partners/copy";
import { isRegionLaunched } from "@/lib/regions/launched";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionSlug(region)) return {};
  return {
    title: "Seja parceiro",
    description: "Programa de parceiros da Use Origens: embaixadores, artistas e collabs. Cupom com o seu nome e comissão sobre as vendas.",
    alternates: { canonical: `/${region}/seja-parceiro` },
  };
}

type Shot = { src: string; alt: string };

/** The cities with a shirt and the states (and the DF) they are in, across every region the store sells: counted from the catalog, never typed. */
function storeReach() {
  const catalog = getCatalog();
  let cities = 0;
  let states = 0;
  let df = false;
  for (const region of REGION_SLUGS.filter(isRegionLaunched)) {
    const covered = catalog.coveredCityIds(region);
    cities += covered.size;
    for (const uf of REGIONS[region].ufs) {
      if (!citiesOfState(uf).some((c) => covered.has(c.id))) continue;
      if (uf === "DF") df = true;
      else states++;
    }
  }
  return { cities, states, df };
}

/** Real shirts of the region for the hero and the three profiles; a missing pick falls back to another real one, never to a placeholder. */
function shots(region: RegionSlug): { hero: Shot[]; profile: Record<PartnerProfile, Shot | null> } {
  const home = getRegionHome(region);
  const hero = home.heroFamilies.map((d) => ({ src: d.imageUrl, alt: `Camiseta ${d.familyName} de ${d.cityName}` }));
  const traco = home.showcase?.families.find((f) => f.family.id === "traco");
  const wanted: Record<PartnerProfile, (Shot | undefined)[]> = {
    ambassador: home.fala.slice(0, 2).map((p) => ({ src: p.imageUrl, alt: `Camiseta ${p.name}` })),
    artist: [traco && home.showcase ? { src: traco.primary.imageUrl, alt: `Camiseta ${traco.family.name} de ${home.showcase.city.name}` } : undefined, ...home.recreations.slice(0, 2).map((p) => ({ src: p.imageUrl, alt: `Camiseta ${p.name}` }))],
    collab: [...home.recreations.slice(1, 3), ...home.terra.slice(0, 2)].map((p) => ({ src: p.imageUrl, alt: `Camiseta ${p.name}` })),
  };
  const used = new Set(hero.map((s) => s.src));
  const pool = [...home.terra, ...home.feitoParaVoce, ...home.ddd].map((p) => ({ src: p.imageUrl, alt: `Camiseta ${p.name}` }));
  const pick = (list: (Shot | undefined)[]): Shot | null => {
    const found = [...list, ...pool].find((s): s is Shot => !!s && !used.has(s.src)) ?? null;
    if (found) used.add(found.src);
    return found;
  };
  return { hero, profile: { ambassador: pick(wanted.ambassador), artist: pick(wanted.artist), collab: pick(wanted.collab) } };
}

const formAvailable = (): boolean => {
  try {
    return adminConfig().mode !== "off";
  } catch {
    return false;
  }
};

const Eyebrow = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-[0.8125rem] font-bold uppercase tracking-[0.14em] ${className}`}>{children}</p>
);

/**
 * "Seja parceiro": the partner programme (embaixador, artista, collab) and its application form. A coded page, not a CMS hotpage: the form, the
 * FAQ and the numbers have no CMS section. The words live in src/lib/partners/copy.ts; the shirts are the region's own (home data), the cities and
 * states are counted from the catalog. Applications are kept by submitPartnerAction and read in the panel ("Parceiros").
 */
export default async function PartnerPage({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) notFound();
  const { hero, profile } = shots(region);
  const reach = storeReach();
  const heroPhoto = usableBannerAsset("hero", bannerFor(region, "hero"));
  const campaignPhoto = usableBannerAsset("campaign", bannerFor(region, "campaign"));
  const titleLines = HERO.title.split("\n");
  const numbers = [
    ...SOCIAL_PROOF,
    ...(reach.cities > 0 ? [{ value: numberPt.format(reach.cities), label: "cidades com camiseta própria na loja" }] : []),
    ...(reach.states > 0 ? [{ value: String(reach.states), label: reach.df ? "estados e o Distrito Federal, do Sul ao Norte" : "estados atendidos pela loja" }] : []),
  ];
  const blurbs = Object.fromEntries(PARTNER_PROFILES.map((p) => [p, PROFILES[p].teaser])) as Record<PartnerProfile, string>;

  return (
    <>
      <section aria-labelledby="partner-title" className="relative isolate">
        {heroPhoto && <RegionalPhotoSection asset={heroPhoto} priority />}
        <div className="wrap pb-12 pt-8 lg:pb-20 lg:pt-14">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-8">
            <div className="lg:col-span-7">
              <span aria-hidden="true" className="mb-3 block h-[3px] w-12 bg-region-accent lg:mb-4" />
              <Eyebrow className="regional-caption">{HERO.eyebrow}</Eyebrow>
              {/* The display face of .t-display, spelled out: that class is unlayered and would override the smaller desktop size this two-line title needs. */}
              <h1 id="partner-title" className="mt-3 font-display text-[clamp(3.4rem,14vw,7rem)] font-extrabold uppercase leading-[0.98] tracking-[0.004em] [overflow-wrap:break-word] [text-wrap:balance] lg:text-[clamp(4rem,6.6vw,6.25rem)]">
                {titleLines.map((line, i) => (
                  <Fragment key={i}>
                    {i > 0 && <br />}
                    {line}
                  </Fragment>
                ))}
              </h1>
              <p className="t-body mt-5 max-w-lg">{HERO.body}</p>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                <a href="#inscricao" className="btn">{HERO.cta}</a>
                <a href="#como-funciona" className="link-static font-semibold text-ink decoration-region-primary decoration-2">{HERO.secondary}</a>
              </div>
            </div>
            {hero.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:gap-3 lg:col-span-5" aria-label="Camisetas da Use Origens">
                {hero.map((s, i) => (
                  <li key={s.src} className={`settle settle-${i + 1} overflow-hidden rounded-lg border border-black/15 bg-ground`}>
                    <ProductPhoto src={s.src} alt={s.alt} sizes="(min-width: 1024px) 13vw, 31vw" priority={i < 2} className="photo-contain" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="perfis-title" className="paper">
        <div className="wrap py-14 lg:py-20">
          <div className="max-w-2xl">
            <h2 id="perfis-title" className="t-h2">{PROFILES_INTRO.title}</h2>
            <p className="t-body mt-3 text-ink-soft">{PROFILES_INTRO.body}</p>
          </div>
          <ul className="mt-8 grid gap-3 md:grid-cols-3 md:gap-4">
            {PARTNER_PROFILES.map((p, i) => (
              <li key={p}>
                <a href={`#${PROFILE_SLUG[p]}`} className="group flex h-full flex-col border-2 border-ink bg-ground p-5 transition-colors hover:bg-ink hover:text-white lg:p-6">
                  <span className="font-display text-[0.9375rem] font-extrabold tabular-nums">0{i + 1}</span>
                  <span className="mt-4 font-display text-[2.25rem] font-extrabold uppercase leading-none lg:mt-6 lg:text-[2.75rem]">{PROFILES[p].label}</span>
                  <span className="t-body mt-2">{PROFILES[p].teaser}</span>
                  <span className="mt-4 text-[0.875rem] font-bold uppercase tracking-[0.04em] lg:mt-6" aria-hidden="true">Saiba mais ↓</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {PARTNER_PROFILES.map((p, i) => {
        const copy = PROFILES[p];
        const shot = profile[p];
        return (
          <section key={p} id={PROFILE_SLUG[p]} aria-labelledby={`${PROFILE_SLUG[p]}-title`} className={i > 0 ? "border-t border-line" : undefined}>
            <div className="wrap py-14 lg:py-20">
              <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
                {shot && (
                  <div className={`mx-auto w-full max-w-[22rem] lg:col-span-5 lg:max-w-none ${i % 2 === 1 ? "lg:order-2 lg:col-start-8" : ""}`}>
                    <ProductPhoto src={shot.src} alt={shot.alt} sizes="(min-width: 1024px) 36vw, 22rem" className="photo-contain" />
                  </div>
                )}
                <div className={shot ? (i % 2 === 1 ? "lg:order-1 lg:col-span-6 lg:col-start-1 lg:row-start-1" : "lg:col-span-6 lg:col-start-7") : "lg:col-span-8"}>
                  <Eyebrow className="text-ink-mute">
                    0{i + 1} · {copy.label}
                  </Eyebrow>
                  <h2 id={`${PROFILE_SLUG[p]}-title`} className="t-h2 mt-3">{copy.title}</h2>
                  {copy.body.map((para, k) => (
                    <p key={k} className="t-body mt-4 max-w-xl text-ink-soft">{para}</p>
                  ))}
                  <a href={`#quero-${PROFILE_SLUG[p]}`} className="btn btn-ghost mt-7">{copy.cta}</a>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <section aria-labelledby="numeros-title" className="relative isolate overflow-hidden text-white">
        {campaignPhoto ? <RegionalPhotoSection asset={campaignPhoto} wash="regional-wash-dark" baseClassName="bg-[#0a0c0a]" /> : <div aria-hidden="true" className="on-ink absolute inset-0 -z-10" />}
        <div className="wrap py-14 lg:py-24">
          <h2 id="numeros-title" className="t-h2 max-w-2xl">A Use Origens em números.</h2>
          <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            {numbers.map((n) => (
              <li key={n.label} className="border-t border-white/30 pt-4">
                <p className="font-display text-[clamp(2.75rem,7vw,5rem)] font-extrabold uppercase leading-none tabular-nums">{n.value}</p>
                <p className="t-small mt-3 max-w-[16rem] text-white/80">{n.label}</p>
              </li>
            ))}
          </ul>
          <a href="#inscricao" className="btn btn-light mt-12">{HERO.cta}</a>
        </div>
      </section>

      <section id="como-funciona" aria-labelledby="como-funciona-title" className="paper">
        <div className="wrap py-14 lg:py-20">
          <h2 id="como-funciona-title" className="t-h2 max-w-2xl">{BENEFITS.title}</h2>
          <ul className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.items.map((b, i) => (
              <li key={b.title} className="border-t-2 border-ink pt-4">
                <span className="font-display text-[0.9375rem] font-extrabold tabular-nums text-ink-mute" aria-hidden="true">0{i + 1}</span>
                <h3 className="t-h3 mt-2 text-[1.25rem]">{b.title}</h3>
                <p className="t-body mt-2 text-ink-soft">{b.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="passos-title">
        <div className="wrap py-14 lg:py-20">
          <h2 id="passos-title" className="t-h2 max-w-2xl">{STEPS.title}</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STEPS.items.map((s, i) => (
              <li key={s.title}>
                <span aria-hidden="true" className="block h-[3px] w-12 bg-region-accent" />
                <span className="mt-4 block font-display text-[4rem] font-extrabold leading-none tabular-nums">{i + 1}</span>
                <h3 className="t-h3 mt-3 text-[1.25rem]">{s.title}</h3>
                <p className="t-body mt-2 text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
          <a href="#inscricao" className="btn mt-12">{HERO.cta}</a>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="paper">
        <div className="wrap grid gap-8 py-14 lg:grid-cols-12 lg:gap-12 lg:py-20">
          <h2 id="faq-title" className="t-h2 lg:col-span-4">{FAQ.title}</h2>
          <div className="divide-y divide-line border-y border-line lg:col-span-8">
            {FAQ.items.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[1.0625rem] font-bold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden="true" className="shrink-0 text-[1.5rem] font-normal leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="t-body max-w-2xl pb-5 text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="inscricao" aria-labelledby="inscricao-title" className="scroll-mt-[var(--header-h)]">
        <div className="wrap grid gap-10 py-14 lg:grid-cols-12 lg:gap-12 lg:py-24">
          <div className="lg:col-span-4">
            <h2 id="inscricao-title" className="t-h2">{APPLY.title}</h2>
            <p className="t-body mt-3 text-ink-soft">{APPLY.body}</p>
            <ul className="mt-6 space-y-3 border-t border-line pt-6">
              {APPLY.after.map((line) => (
                <li key={line} className="t-small flex gap-3">
                  <span aria-hidden="true" className="mt-[0.55rem] block h-[3px] w-4 shrink-0 bg-region-accent" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-8">
            <PartnerForm region={region} available={formAvailable()} blurbs={blurbs} />
          </div>
        </div>
      </section>
    </>
  );
}
