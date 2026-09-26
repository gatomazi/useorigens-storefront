import Image from "next/image";
import Link from "next/link";
import { REGIONS, STATE_NAMES, type RegionSlug } from "@/lib/geo/regions";
import { launchedRegions } from "@/lib/regions/launched";
import { INSTAGRAM_URLS, LEGACY_STORE_URLS } from "@/lib/site";
import { homeBundle, siteConfigHomeEnabled } from "@/lib/site-config/flag";
import { hasStatesSection, headerLinks } from "@/lib/site-config/nav";

/** Another region: this site's own page once that region is publicly launched, otherwise the legacy INK store it has always linked to. */
const otherRegionHref = (slug: RegionSlug, launched: readonly RegionSlug[]): string => (launched.includes(slug) ? `/${slug}` : LEGACY_STORE_URLS[slug]);
import { numberPt } from "@/lib/format";
import { SOURCES } from "@/lib/analytics/sources";
import { PrivacyPreferencesLink } from "../consent/PrivacyPreferencesLink";
import { TrackedStateLink } from "../analytics/TrackedStateLink";
import { HeaderDropdown } from "./HeaderDropdown";
import { HeaderShell } from "./HeaderShell";
import { MobileMenu, type NavItem } from "./MobileMenu";
import { CartMirrorMenu } from "../cart-mirror/CartMirrorMenu";
import { SearchDialog } from "../search/SearchDialog";

export function AnnouncementBar({ region, cityCount }: { region: RegionSlug; cityCount: number }) {
  return (
    <div className="on-ink">
      <p className="wrap py-2 text-center text-[0.8125rem] font-medium leading-snug sm:text-[0.875rem]">
        {numberPt.format(cityCount)} cidades do {REGIONS[region].name} em camiseta.<span className="hidden sm:inline"> Você escolhe aqui e finaliza a compra na loja Use {REGIONS[region].name}.</span>
      </p>
    </div>
  );
}

/** The section links of the header, from the region's published home (see site-config/nav.ts); the original three when the config-driven home is off. */
function headerDoc(region: RegionSlug) {
  return siteConfigHomeEnabled() ? homeBundle().docs[region] : undefined;
}

function navItems(region: RegionSlug): NavItem[] {
  return headerLinks(headerDoc(region)).map((l) => ({ label: l.label, href: `/${region}#${l.anchor}` }));
}

export function Header({ region }: { region: RegionSlug }) {
  const items = navItems(region);
  const ufs = REGIONS[region].ufs;
  const others = (Object.values(REGIONS) as (typeof REGIONS)[RegionSlug][]).filter((r) => r.slug !== region);
  const launched = launchedRegions();
  // "Regiões" used to point at a product category (#geografia, the DDD carousel) — semantically wrong: it
  // reads as geographic navigation, so it must actually be one. Real navigation, not a category shortcut: a
  // direct link per state plus "Ver estados" (the home's own chooser). Mobile gets the same three state links
  // inlined in its flat list (see mobileItems below) since MobileMenu has no nested-dropdown affordance —
  // never a second, conflicting "Regiões" control.
  const stateLinks = ufs.map((uf) => ({ label: STATE_NAMES[uf], href: `/${region}/${uf.toLowerCase()}`, uf }));
  // The state links go after the first section link (as before: Estilos, states…, Fala daqui, Estados).
  const stateItems: NavItem[] = stateLinks.map(({ label, href, uf }) => ({ label, href, trackState: { state: uf, region } }));
  const mobileItems: NavItem[] = [
    ...items.slice(0, 1),
    ...stateItems,
    ...items.slice(1),
    ...others.map((r) => ({ label: r.name, href: otherRegionHref(r.slug, launched), external: !launched.includes(r.slug) })),
  ];

  return (
    <HeaderShell>
      <div className="wrap site-header-row flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <MobileMenu items={mobileItems} />
          <Link href={`/${region}`} className="flex min-h-11 items-center gap-2.5" aria-label={`Use Origens ${REGIONS[region].name}, página inicial`}>
            <Image src={`/brand/logo-${region === "centro-oeste" ? "centro" : region}.png`} alt="" width={40} height={40} className="h-9 w-9" priority unoptimized />
            <span translate="no" className="font-display text-[1.6rem] font-black uppercase leading-none tracking-[0.02em]">Use Origens</span>
          </Link>
        </div>

        <nav aria-label="Principal" className="hidden items-center gap-8 lg:flex">
          <HeaderDropdown className="relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-1 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
              Regiões
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <ul className="absolute left-0 top-full z-50 mt-1 min-w-52 border-2 border-ink bg-white py-1 text-ink">
              {stateLinks.map((s) => (
                <li key={s.href}>
                  <TrackedStateLink href={s.href} params={{ state: s.uf, region, source: SOURCES.stateSelector }} className="flex min-h-11 items-center px-4 text-[0.9375rem] font-semibold hover:bg-ink hover:text-white">
                    {s.label}
                  </TrackedStateLink>
                </li>
              ))}
              {hasStatesSection(headerDoc(region)) && (
                <li className="border-t border-line">
                  <Link href={`/${region}#estados`} className="flex min-h-11 items-center px-4 text-[0.9375rem] font-semibold hover:bg-ink hover:text-white">
                    Ver estados
                  </Link>
                </li>
              )}
            </ul>
          </HeaderDropdown>
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="link-line py-1 text-[0.9375rem] font-semibold">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-3">
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
                <li key={r.slug}>
                  <a href={otherRegionHref(r.slug, launched)} className="flex min-h-11 items-center px-4 text-[0.9375rem] font-semibold hover:bg-ink hover:text-white">
                    {r.name}
                  </a>
                </li>
              ))}
            </ul>
          </HeaderDropdown>
          <CartMirrorMenu />
          <SearchDialog region={region} />
        </div>
      </div>
    </HeaderShell>
  );
}

export function Footer({ region, syncedAt }: { region: RegionSlug; syncedAt: string | null }) {
  const r = REGIONS[region];
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
              <a href={LEGACY_STORE_URLS[region]} className="link-line inline-flex min-h-11 min-w-11 items-center text-[0.9375rem]">
                Loja Use {r.name}
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
            <li>
              <PrivacyPreferencesLink />
            </li>
          </ul>
        </nav>
      </div>

      <div className="wrap border-t border-line py-6">
        <p className="t-small max-w-xl text-ink-soft">A experiência regional da Use {r.name}, agora dentro da Use Origens.</p>
        <p className="t-caption mt-3 max-w-3xl">
          Você escolhe a cidade e o estilo aqui e finaliza a compra na loja Use {r.name}, onde ficam tamanho, cor, frete e pagamento.
          {updated ? ` Preços e disponibilidade atualizados em ${updated}.` : ""}
        </p>
      </div>
    </footer>
  );
}
