import Image from "next/image";
import { MundoLinkRodape } from "@/components/mundo/entrada/MundoEntradas";
import { mundoEntradasAtivas } from "@/lib/mundo/flag";
import Link from "next/link";
import { REGIONS, STATE_NAMES, type RegionSlug } from "@/lib/geo/regions";
import { launchedRegions } from "@/lib/regions/launched";
import { INSTAGRAM_URLS, LEGACY_STORE_URLS } from "@/lib/site";
import { homeBundle, siteConfigHomeEnabled } from "@/lib/site-config/flag";
import { regionChrome } from "@/lib/site-config/chrome";
import { hasStatesSection } from "@/lib/site-config/nav";
import { regionPath } from "@/lib/site-config/navigation";

/** Another region: this site's own page once that region is publicly launched, otherwise the legacy INK store it has always linked to. */
const otherRegionHref = (slug: RegionSlug, launched: readonly RegionSlug[]): string => (launched.includes(slug) ? `/${slug}` : LEGACY_STORE_URLS[slug]);
import { numberPt } from "@/lib/format";
import { SOURCES } from "@/lib/analytics/sources";
import { PrivacyPreferencesLink } from "../consent/PrivacyPreferencesLink";
import { TrackedStateLink } from "../analytics/TrackedStateLink";
import { HeaderDropdown } from "./HeaderDropdown";
import { HeaderShell } from "./HeaderShell";
import { MobileMenu } from "./MobileMenu";
import { PriorityLinks } from "./PriorityLinks";
import { CartMirrorMenu } from "../cart-mirror/CartMirrorMenu";
import { cartRegionFor, checkoutStoreFor } from "@/lib/catalog/commerce-mode";
import { FavoritesMenu } from "../favorites/FavoritesMenu";
import { SearchDialog } from "../search/SearchDialog";

export function AnnouncementBar({ region, cityCount }: { region: RegionSlug; cityCount: number }) {
  return (
    <div className="on-ink">
      <p className="wrap py-2 text-center text-[0.8125rem] font-medium leading-snug sm:text-[0.875rem]">
        {numberPt.format(cityCount)} cidades do {REGIONS[region].name} em camiseta.<span className="hidden sm:inline"> Você escolhe aqui e finaliza a compra {checkoutStoreFor(region).finishIn}.</span>
      </p>
    </div>
  );
}

/** The section links of the header, from the region's published home (see site-config/nav.ts); the original three when the config-driven home is off. */
function headerDoc(region: RegionSlug) {
  return siteConfigHomeEnabled() ? homeBundle().docs[region] : undefined;
}

export function Header({ region }: { region: RegionSlug }) {
  // One source for mobile and desktop (site-config/navigation.ts): the region's links, its launched states and the other LAUNCHED regions, with the
  // labels / order / visibility the CMS published. Nothing here lists a state or a region by hand.
  const { navigation } = regionChrome(region);
  // The home's links first, then the collections the owner put on the bar: when the row is too short for all of them, the last ones step out (they are
  // all in "Categorias" anyway).
  const states = navigation.states;
  // The "Estados" dropdown already leads to the home's state chooser ("Ver estados"): the home's own "Estados" link would say it twice.
  const items = [...navigation.primary, ...navigation.collections]
    .filter((item) => !(states.length > 0 && item.href.endsWith("#estados")))
    .filter((item, i, all) => all.findIndex((o) => o.href === item.href) === i);
  const categories = navigation.categories;
  const others = navigation.regions;
  // Long lists read down the columns, never one endless column.
  const columns = categories.length > 16 ? 3 : categories.length > 8 ? 2 : 1;

  return (
    <HeaderShell>
      <div className="wrap site-header-row flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <MobileMenu blocks={navigation.blocks} />
          <Link href={regionPath(region)} className="flex min-h-11 items-center gap-2.5" aria-label={`Use Origens ${REGIONS[region].name}, página inicial`}>
            <Image src={`/brand/logo-${region === "centro-oeste" ? "centro" : region}.png`} alt="" width={40} height={40} className="h-9 w-9" priority unoptimized />
            <span translate="no" className="font-display text-[1.6rem] font-black uppercase leading-none tracking-[0.02em]">Use Origens</span>
          </Link>
        </div>

        <nav aria-label="Principal" className="hidden min-w-0 flex-1 items-center justify-center gap-6 px-4 lg:flex xl:gap-8 xl:px-8">
          {states.length > 0 && (
            <HeaderDropdown className="relative">
              {/* Named after what it lists (the region's states): "Regiões" next to the "Sul ▾" region switcher read as two menus of the same thing. */}
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 whitespace-nowrap py-1 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden" data-testid="header-states">
                Estados
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <ul className="absolute left-0 top-full z-50 mt-1 min-w-52 border-2 border-ink bg-white py-1 text-ink">
                {states.map((s) => (
                  <li key={s.href}>
                    <TrackedStateLink href={s.href} params={{ state: s.trackState!.state, region, source: SOURCES.stateSelector }} className="flex min-h-11 items-center px-4 text-[0.9375rem] font-semibold hover:bg-ink hover:text-white">
                      {s.label}
                    </TrackedStateLink>
                  </li>
                ))}
                {hasStatesSection(headerDoc(region)) && (
                  <li className="border-t border-line">
                    <Link href={`${regionPath(region)}#estados`} className="flex min-h-11 items-center px-4 text-[0.9375rem] font-semibold hover:bg-ink hover:text-white">
                      Ver estados
                    </Link>
                  </li>
                )}
              </ul>
            </HeaderDropdown>
          )}
          {categories.length > 0 && (
            <HeaderDropdown className="relative">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 whitespace-nowrap py-1 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden" data-testid="header-categories">
                {navigation.categoriesLabel}
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <ul
                className="absolute left-1/2 top-full z-50 mt-1 grid max-h-[calc(100dvh-6rem)] w-max min-w-52 max-w-[calc(100vw-2rem)] -translate-x-1/2 grid-flow-col overflow-y-auto border-2 border-ink bg-white py-1 text-ink"
                style={{ gridTemplateRows: `repeat(${Math.ceil(categories.length / columns)}, auto)` }}
              >
                {categories.map((c) => (
                  <li key={c.href}>
                    <Link href={c.href} className="flex min-h-11 items-center whitespace-nowrap px-4 text-[0.9375rem] font-semibold hover:bg-ink hover:text-white">
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </HeaderDropdown>
          )}
          {items.length > 0 && (
            <PriorityLinks className="flex h-11 min-w-0 flex-wrap items-center gap-x-6 overflow-hidden xl:gap-x-8">
              {items.map((item) => (
                <li key={item.href} className="flex h-11 items-center data-[overflow]:invisible">
                  <Link href={item.href} className="link-line whitespace-nowrap py-1 text-[0.9375rem] font-semibold">
                    {item.label}
                  </Link>
                </li>
              ))}
            </PriorityLinks>
          )}
        </nav>

        <div className="flex items-center gap-1 sm:gap-3">
          {others.length > 0 && (
            <HeaderDropdown className="relative hidden lg:block">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
                {REGIONS[region].name}
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              {/* Its own white surface: reset text colour explicitly, the header above it is on a coloured background. */}
              <ul className="absolute right-0 top-full z-50 mt-1 min-w-52 border-2 border-ink bg-white py-1 text-ink">
                {others.map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="flex min-h-11 items-center px-4 text-[0.9375rem] font-semibold hover:bg-ink hover:text-white">
                      {r.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </HeaderDropdown>
          )}
          <FavoritesMenu region={region} />
          <CartMirrorMenu region={cartRegionFor(region)} navRegion={region} />
          <SearchDialog region={region} />
        </div>
      </div>
    </HeaderShell>
  );
}

export function Footer({ region, syncedAt }: { region: RegionSlug; syncedAt: string | null }) {
  const r = REGIONS[region];
  const checkout = checkoutStoreFor(region);
  const others = (Object.values(REGIONS) as (typeof REGIONS)[RegionSlug][]).filter((x) => x.slug !== region);
  const launched = launchedRegions();
  const updated = syncedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(syncedAt)) : null;

  return (
    <footer className="border-t border-line">
      <div className="wrap grid grid-cols-2 gap-x-6 gap-y-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-12 md:py-14">
        <div className="col-span-2 md:col-span-1">
          <p translate="no" className="font-display text-[2rem] font-extrabold uppercase leading-none">Use Origens</p>
          <p className="t-small mt-4 max-w-xs text-ink-soft">Camisetas com o nome, o mapa e as coordenadas da sua cidade.</p>
        </div>

        <nav aria-label="Estados">
          <p className="t-label mb-3">Estados</p>
          <ul className="space-y-0">
            {r.ufs.map((uf) => (
              <li key={uf}>
                <TrackedStateLink href={`/${region}/${uf.toLowerCase()}`} params={{ state: uf, region, source: SOURCES.stateSelector }} className="link-line inline-flex min-h-11 min-w-11 items-center text-[0.9375rem]">
                  {STATE_NAMES[uf]}
                </TrackedStateLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Outras regiões">
          <p className="t-label mb-3">Outras regiões</p>
          <ul className="space-y-0">
            {others.map((o) => (
              <li key={o.slug}>
                <a href={otherRegionHref(o.slug, launched)} className="link-line inline-flex min-h-11 min-w-11 items-center text-[0.9375rem]">
                  {o.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Loja e redes">
          <p className="t-label mb-3">Loja</p>
          <ul className="space-y-0">
            <li>
              <a href={checkout.url} className="link-line inline-flex min-h-11 min-w-11 items-center text-[0.9375rem]">
                {checkout.linkLabel}
              </a>
            </li>
            <li>
              <a href={INSTAGRAM_URLS[region]} className="link-line inline-flex min-h-11 min-w-11 items-center text-[0.9375rem]" rel="noopener">
                Instagram
              </a>
            </li>
            <li>
              <Link href={`/${region}/privacidade`} className="link-line inline-flex min-h-11 min-w-11 items-center text-[0.9375rem]">
                Política de privacidade
              </Link>
            </li>
            {mundoEntradasAtivas() && (
              <li>
                <MundoLinkRodape region={region} />
              </li>
            )}
            <li>
              <PrivacyPreferencesLink />
            </li>
          </ul>
        </nav>
      </div>

      <div className="wrap border-t border-line py-6">
        <p className="t-small max-w-xl text-ink-soft">A experiência regional da Use {r.name}, agora dentro da Use Origens.</p>
        <p className="t-caption mt-3 max-w-3xl">
          Você escolhe a cidade e o estilo aqui e finaliza a compra {checkout.finishIn}, onde ficam tamanho, cor, frete e pagamento.
          {updated ? ` Preços e disponibilidade atualizados em ${updated}.` : ""}
        </p>
      </div>
    </footer>
  );
}
